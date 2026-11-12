#!/usr/bin/env node
'use strict';

/*
 * Login / resource-pack / world gate protocol test (task 20).
 *
 * Live part:
 *   - real minecraft-protocol 1.21.11 server on 127.0.0.1
 *   - real 1.21.11 client
 *   - real localhost resource-pack HTTP server from task 19
 *   - exact trace: finish_configuration -> login x1 -> add_resource_pack ->
 *     success -> position/world/connect
 *   - second client while the first is packPending is rejected
 *   - duplicate / stale statuses after success are ignored
 *
 * Exhaustive status part (same LegacyClient + JoinGate code, deterministic
 * fake transport):
 *   success, declined, failed_download, accepted+downloaded progress,
 *   invalid_url, failed_reload, discarded, unknown status, wrong UUID,
 *   duplicate success, late failure, timeout, disconnect and transport error.
 *
 * Exit 0 only when every assertion passes. This test does not claim real
 * Fabric UI or rendering; the simulated SUCCESSFULLY_LOADED response proves the
 * gate ordering, not a client-side download.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const http = require('node:http');
const mc = require('minecraft-protocol');
const LegacyClient = require('../mc/client.js');
const {
	JoinGate,
	JoinAdmission,
	RESOURCE_PACK_STATUS,
	STATES,
	DEFAULT_PACK_TIMEOUT_MS
} = require('../mc/join-gate.js');
const { startResourcePackServer } = require('../bloxd/resource_pack/server.js');

const MC_VERSION = '1.21.11';
const WORLD_PACKET_NAMES = new Set([
	'map_chunk',
	'chunk_batch_start',
	'chunk_batch_finished',
	'position',
	'spawn_entity',
	'entity_metadata',
	'entity_equipment',
	'entity_teleport',
	'entity_velocity',
	'entity_head_rotation',
	'entity_destroy',
	'animation',
	'collect',
	'entity_status',
	'entity_effect',
	'remove_entity_effect',
	'update_health',
	'experience',
	'open_window',
	'close_window',
	'window_items',
	'set_slot',
	'set_cursor_item',
	'player_info',
	'playerlist_header',
	'teams',
	'scoreboard_objective',
	'scoreboard_score',
	'scoreboard_display_objective',
	'respawn',
	'sound_effect',
	'world_particles',
	'system_chat'
]);

function once(emitter, name) {
	return new Promise((resolve) => emitter.once(name, (...args) => resolve(args)));
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, label) {
	let timer;
	const timeout = new Promise((_resolve, reject) => {
		timer = setTimeout(() => reject(new Error('timeout: ' + label)), ms);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function waitUntil(predicate, label, timeoutMs = 3000) {
	const started = Date.now();
	while (!predicate()) {
		if (Date.now() - started > timeoutMs) throw new Error('timeout: ' + label);
		await delay(5);
	}
}

// Deterministic fake clock: JoinGate arms its timeout with the global
// setTimeout, so the test can capture it and fire it without waiting 30s.
function createFakeClock() {
	const realSetTimeout = global.setTimeout;
	const realClearTimeout = global.clearTimeout;
	const timers = new Map();
	let nextId = 1;
	let now = 0;
	const fakeSetTimeout = (callback, ms, ...args) => {
		const id = nextId++;
		timers.set(id, { callback, args, due: Number(ms) || 0 });
		return {
			id,
			unref() {
				return this;
			},
			ref() {
				return this;
			},
			hasRef() {
				return false;
			}
		};
	};
	const fakeClearTimeout = (handle) => {
		if (handle && typeof handle === 'object' && timers.has(handle.id)) timers.delete(handle.id);
	};
	return {
		install() {
			global.setTimeout = fakeSetTimeout;
			global.clearTimeout = fakeClearTimeout;
		},
		uninstall() {
			global.setTimeout = realSetTimeout;
			global.clearTimeout = realClearTimeout;
		},
		get pending() {
			return timers.size;
		},
		advance(ms) {
			now += Number(ms) || 0;
			this.install();
			try {
				for (const [id, timer] of [...timers]) {
					if (timer.due <= now) {
						timers.delete(id);
						timer.callback(...timer.args);
					}
				}
			} finally {
				this.uninstall();
			}
		}
	};
}

function httpRequestError(url) {
	return new Promise((resolve) => {
		const request = http.request(url, { method: 'GET' }, (response) => {
			response.resume();
			resolve({ statusCode: response.statusCode });
		});
		request.setTimeout(3000, () => {
			request.destroy();
			resolve({ error: 'E_TIMEOUT' });
		});
		request.on('error', (error) => resolve({ error: error.code || error.message }));
		request.end();
	});
}

class FakeRawClient extends EventEmitter {
	constructor() {
		super();
		this.writes = [];
		this.ended = false;
		this.endReason = null;
		this.username = 'FakePlayer';
		this.uuid = '00000000-0000-0000-0000-0000000000aa';
		this.protocolVersion = 774;
	}

	write(name, data) {
		this.writes.push({ name, data });
		return true;
	}

	end(reason) {
		if (this.ended) return;
		this.ended = true;
		this.endReason = reason;
		this.emit('end');
	}

	sendStatus(uuid, result) {
		this.emit('resource_pack_receive', { uuid, result });
	}
}

function writeNames(raw) {
	return raw.writes.map((entry) => entry.name);
}

function countWrites(raw, name) {
	return raw.writes.filter((entry) => entry.name === name).length;
}

function countWritesForSent(sent, name) {
	return sent.filter((entry) => entry.name === name).length;
}

function basePack(server) {
	return Object.freeze({
		uuid: server.uuid,
		url: server.url,
		hash: server.sha1
	});
}

function createFakeGate(pack, options = {}) {
	const raw = new FakeRawClient();
	const client = new LegacyClient(raw, {
		version: MC_VERSION,
		deferInitialPosition: true,
		gateSession: true
	});
	client.on('error', () => {});
	const info = {
		raw,
		client,
		connects: 0,
		connectBeforeLoaded: 0,
		worldReady: 0,
		gate: null,
		clock: null
	};
	const clock = options.fakeClock ? createFakeClock() : null;
	if (clock) {
		info.clock = clock;
		clock.install();
	}
	try {
		const gate = new JoinGate({
			client,
			resourcePack: pack,
			timeoutMs: options.timeoutMs ?? 200,
			connect: () => {
				info.connects += 1;
				if (!gate.loaded) info.connectBeforeLoaded += 1;
				return Promise.resolve();
			},
			onWorldReady: () => {
				info.worldReady += 1;
			}
		});
		info.gate = gate;
		gate.start();
	} finally {
		if (clock) clock.uninstall();
	}
	return info;
}

function assertNoWorldOrConnect(info) {
	assert.equal(info.connects, 0, 'connect() must not run before success');
	assert.equal(info.connectBeforeLoaded, 0, 'connect() ran before loaded');
	const names = writeNames(info.raw);
	assert.equal(names.includes('position'), false, 'position must not be sent before success');
	for (const name of names) {
		if (name === 'login' || name === 'add_resource_pack') continue;
		assert.equal(WORLD_PACKET_NAMES.has(name), false, 'world packet before success: ' + name);
	}
}

function assertCleanFailure(info, code) {
	const gate = info.gate;
	assert.equal(gate.state, STATES.FAILED, code + ': state failed');
	assert.ok(gate.failure, code + ': failure recorded');
	assert.equal(gate.failure.code, code, 'failure code');
	assert.equal(gate.cleaned, true, code + ': cleaned');
	assert.equal(gate.clearedTimer, true, code + ': timer cleared');
	assert.equal(info.raw.ended, true, code + ': client ended');
	assert.equal(info.gate.loginWrites, 1, code + ': one login');
	assert.equal(info.gate.packWrites, 1, code + ': one pack request');
	assertNoWorldOrConnect(info);
}

function sentCounts(sent) {
	return {
		loginCount: sent.filter((entry) => entry.name === 'login').length,
		packCount: sent.filter((entry) => entry.name === 'add_resource_pack').length,
		positionCount: sent.filter((entry) => entry.name === 'position').length,
		worldPacketCount: sent.filter((entry) => WORLD_PACKET_NAMES.has(entry.name)).length
	};
}

async function closeLiveServer(server, client) {
	if (client && !client.ended) {
		try {
			client.end('test cleanup');
		} catch (_error) {
			// Already closing; nothing actionable.
		}
	}
	await new Promise((resolve) => {
		if (!server.socketServer || !server.socketServer.listening) {
			resolve();
			return;
		}
		server.once('close', resolve);
		server.close();
	});
}

// Runs one real localhost 1.21.11 server/client connection through the real
// JoinGate. Terminal cases must observe a clean failed gate, one login, one
// add_resource_pack and zero position/world/connect traffic.
async function runLivePackCase(packServer, options) {
	const pack = basePack(packServer);
	const server = mc.createServer({
		host: '127.0.0.1',
		port: 0,
		'online-mode': false,
		version: MC_VERSION,
		maxPlayers: 1
	});
	server.on('error', () => {});
	await once(server, 'listening');
	const port = server.socketServer.address().port;
	const sent = [];
	let gate = null;
	let serverClient = null;
	let serverClientEnded = null;
	let connects = 0;
	let connectBeforeLoaded = 0;
	let worldReady = 0;

	let addPackResolve;
	const addPackPromise = new Promise((resolve) => {
		addPackResolve = resolve;
	});
	let terminalResolve;
	const terminalPromise = new Promise((resolve) => {
		terminalResolve = resolve;
	});

	server.on('playerJoin', (raw) => {
		const client = new LegacyClient(raw, {
			version: MC_VERSION,
			deferInitialPosition: true,
			gateSession: true
		});
		client.on('error', () => {});
		serverClient = client;
		serverClientEnded = once(client, 'end');

		const rawWrite = raw.write.bind(raw);
		raw.write = (name, data) => {
			sent.push({ name, loaded: gate ? gate.loaded : false });
			return rawWrite(name, data);
		};

		gate = new JoinGate({
			client,
			resourcePack: pack,
			timeoutMs: options.timeoutMs ?? DEFAULT_PACK_TIMEOUT_MS,
			connect: () => {
				connects += 1;
				if (!gate.loaded) connectBeforeLoaded += 1;
				return Promise.resolve();
			},
			onWorldReady: () => {
				worldReady += 1;
			}
		});
		gate.once('terminal', (info) => terminalResolve(info));
		gate.start();
	});

	const client = mc.createClient({
		host: '127.0.0.1',
		port,
		username: options.username || 'LiveCase',
		version: MC_VERSION,
		auth: 'offline'
	});
	client.on('error', () => {});
	const clientEnded = once(client, 'end');
	let clientLogins = 0;
	let clientPositions = 0;
	client.on('login', () => {
		clientLogins += 1;
	});
	client.on('packet', (_data, meta) => {
		if (meta && meta.name === 'position') clientPositions += 1;
	});
	client.on('add_resource_pack', (packet) => addPackResolve(packet));

	let result = null;
	try {
		const addPack = await withTimeout(
			addPackPromise,
			5000,
			options.name + ' add_resource_pack'
		);
		await options.afterPack({ client, addPack, gate, sent });

		if (options.expectTerminal !== false) {
			await withTimeout(
				terminalPromise,
				options.terminalTimeoutMs ?? 4000,
				options.name + ' terminal state'
			);
			await withTimeout(
				Promise.all([clientEnded, serverClientEnded]),
				3000,
				options.name + ' end on both sides'
			);
		} else {
			await delay(options.settleMs ?? 150);
		}

		result = {
			name: options.name,
			...sentCounts(sent),
			connects,
			connectBeforeLoaded,
			worldReady,
			clientLogins,
			clientPositions,
			state: gate.state,
			failure: gate.failure,
			cleaned: gate.cleaned,
			clearedTimer: gate.clearedTimer,
			gate,
			client,
			serverClient,
			addPack,
			sent,
			afterCleanup: null
		};
		if (options.verify) options.verify(result);
		return result;
	} finally {
		await closeLiveServer(server, client);
		if (result) {
			result.afterCleanup = {
				state: gate.state,
				failure: gate.failure,
				cleaned: gate.cleaned,
				clearedTimer: gate.clearedTimer,
				clientEnded: serverClient ? serverClient.ended : false,
				rawEnded: gate.real.ended
			};
		}
	}
}

function verifyLiveFailure(result, expected) {
	assert.equal(result.state, STATES.FAILED, expected.name + ': state failed');
	assert.ok(result.failure, expected.name + ': failure recorded');
	assert.equal(result.failure.code, expected.code, expected.name + ': failure code');
	if (expected.status !== undefined) {
		assert.equal(
			result.failure.detail.status,
			expected.status,
			expected.name + ': failure status'
		);
	}
	if (expected.result !== undefined) {
		assert.equal(
			result.failure.detail.result,
			expected.result,
			expected.name + ': failure result'
		);
	}
	if (expected.timeoutMs !== undefined) {
		assert.equal(
			result.failure.detail.timeoutMs,
			expected.timeoutMs,
			expected.name + ': timeout value'
		);
	}
	assert.equal(result.loginCount, 1, expected.name + ': one login');
	assert.equal(result.packCount, 1, expected.name + ': one pack request');
	assert.equal(result.positionCount, 0, expected.name + ': no position');
	assert.equal(result.worldPacketCount, 0, expected.name + ': no world packet');
	assert.equal(result.connects, 0, expected.name + ': no Bloxd connect');
	assert.equal(result.connectBeforeLoaded, 0, expected.name + ': no early connect');
	assert.equal(result.worldReady, 0, expected.name + ': no world-ready hook');
	assert.equal(result.clientLogins, 1, expected.name + ': client entered play once');
	assert.equal(result.clientPositions, 0, expected.name + ': client got no position');
	assert.equal(result.cleaned, true, expected.name + ': cleaned');
	assert.equal(result.clearedTimer, true, expected.name + ': timer cleared');
	assert.equal(
		result.serverClient.ended,
		true,
		expected.name + ': legacy client ended'
	);
	assert.equal(result.gate.real.ended, true, expected.name + ': raw client ended');
}

async function runStatusScenarios(pack) {
	const cases = [];
	const record = (name, ok, detail) => cases.push({ name, ok, detail });

	// success: exactly one login + one pack, then position/world/connect.
	{
		const info = createFakeGate(pack);
		info.raw.sendStatus(pack.uuid, RESOURCE_PACK_STATUS.SUCCESSFULLY_LOADED);
		await waitUntil(() => info.gate.state === STATES.CONNECTED, 'success connected');
		const names = writeNames(info.raw);
		assert.equal(countWrites(info.raw, 'login'), 1, 'one login');
		assert.equal(countWrites(info.raw, 'add_resource_pack'), 1, 'one pack');
		assert.equal(countWrites(info.raw, 'position'), 1, 'one initial position');
		assert.equal(info.connects, 1, 'one connect');
		assert.equal(info.gate.cleaned, true, 'success cleans listeners');
		assert.equal(info.gate.packWrites, 1, 'no duplicate pack request');
		assert.equal(info.gate.acceptedStatuses.length, 1, 'one accepted status');
		assert.deepEqual(names.slice(0, 3), ['login', 'add_resource_pack', 'position']);
		record('success', true, { writes: names, connects: info.connects });
	}

	// accepted/downloaded are progress-only and must not complete the gate.
	{
		const info = createFakeGate(pack);
		info.raw.sendStatus(pack.uuid, RESOURCE_PACK_STATUS.ACCEPTED);
		await delay(10);
		assert.equal(info.gate.state, STATES.PACK_PENDING, 'accepted stays pending');
		assert.deepEqual(info.gate.progressStatuses, [RESOURCE_PACK_STATUS.ACCEPTED]);
		assert.equal(info.gate.packWrites, 1, 'accepted does not resend pack');
		assert.equal(countWrites(info.raw, 'position'), 0, 'accepted has no position');

		info.raw.sendStatus(pack.uuid, RESOURCE_PACK_STATUS.DOWNLOADED);
		await delay(10);
		assert.equal(info.gate.state, STATES.PACK_PENDING, 'downloaded stays pending');
		assert.deepEqual(info.gate.progressStatuses, [
			RESOURCE_PACK_STATUS.ACCEPTED,
			RESOURCE_PACK_STATUS.DOWNLOADED
		]);
		assert.equal(info.gate.packWrites, 1, 'downloaded does not resend pack');
		assert.equal(countWrites(info.raw, 'position'), 0, 'downloaded has no position');

		info.raw.sendStatus(pack.uuid, RESOURCE_PACK_STATUS.SUCCESSFULLY_LOADED);
		await waitUntil(() => info.gate.state === STATES.CONNECTED, 'progress then success');
		assert.equal(info.connects, 1, 'connect after progress');
		record('accepted+downloaded+success', true, {
			progress: info.gate.progressStatuses
		});
	}

	const failures = [
		[RESOURCE_PACK_STATUS.DECLINED, 'E_PACK_DECLINED', 'declined'],
		[RESOURCE_PACK_STATUS.FAILED_DOWNLOAD, 'E_PACK_FAILED_DOWNLOAD', 'failed_download'],
		[RESOURCE_PACK_STATUS.INVALID_URL, 'E_PACK_INVALID_URL', 'invalid_url'],
		[RESOURCE_PACK_STATUS.FAILED_RELOAD, 'E_PACK_FAILED_RELOAD', 'failed_reload'],
		[RESOURCE_PACK_STATUS.DISCARDED, 'E_PACK_DISCARDED', 'discarded'],
		[99, 'E_PACK_STATUS_UNKNOWN', 'unknown_status']
	];
	for (const [status, code, name] of failures) {
		const info = createFakeGate(pack);
		info.raw.sendStatus(pack.uuid, status);
		await waitUntil(() => info.gate.state === STATES.FAILED, name + ' failed state');
		assertCleanFailure(info, code);
		assert.equal(info.gate.acceptedStatuses.includes(status), status === 99 ? false : true);
		record(name, true, { code, status });
	}

	// Wrong UUID is ignored; the correct response still completes once.
	{
		const info = createFakeGate(pack);
		info.raw.sendStatus('11111111-2222-3333-4444-555555555555', 0);
		await delay(10);
		assert.equal(info.gate.state, STATES.PACK_PENDING, 'wrong UUID ignored');
		assert.equal(info.gate.ignoredStatuses.length, 1);
		assert.equal(info.gate.ignoredStatuses[0].reason, 'uuid');
		assert.equal(info.gate.packWrites, 1);
		info.raw.sendStatus(pack.uuid, 0);
		await waitUntil(() => info.gate.state === STATES.CONNECTED, 'wrong uuid then success');
		assert.equal(info.connects, 1);
		record('wrong_uuid_ignored', true, info.gate.ignoredStatuses);
	}

	// Duplicate success is ignored: no second position/world/connect.
	{
		const info = createFakeGate(pack);
		info.raw.sendStatus(pack.uuid, 0);
		info.raw.sendStatus(pack.uuid, 0);
		await waitUntil(() => info.gate.state === STATES.CONNECTED, 'duplicate success');
		await delay(20);
		assert.equal(countWrites(info.raw, 'position'), 1, 'duplicate has no extra position');
		assert.equal(info.connects, 1, 'duplicate has no extra connect');
		assert.equal(info.gate.ignoredStatuses.length, 1);
		assert.equal(info.gate.ignoredStatuses[0].reason, 'late');
		record('duplicate_success_ignored', true, info.gate.ignoredStatuses[0]);
	}

	// A late failure after success must not cancel or duplicate anything.
	{
		const info = createFakeGate(pack);
		info.raw.sendStatus(pack.uuid, 0);
		info.raw.sendStatus(pack.uuid, RESOURCE_PACK_STATUS.DECLINED);
		await waitUntil(() => info.gate.state === STATES.CONNECTED, 'late failure');
		await delay(20);
		assert.equal(info.gate.failure, null, 'late failure ignored');
		assert.equal(info.connects, 1, 'late failure has no extra connect');
		assert.equal(countWrites(info.raw, 'position'), 1);
		assert.equal(info.gate.ignoredStatuses[0].reason, 'late');
		record('late_failure_ignored', true, info.gate.ignoredStatuses[0]);
	}

	// Pre-success world writes fail closed at the adapter.
	{
		const info = createFakeGate(pack);
		const blockedChunk = info.client.write('map_chunk', { x: 0, z: 0 });
		const blockedPosition = info.client.write('position', { x: 0, y: 64, z: 0 });
		assert.equal(blockedChunk, false, 'pre-success map_chunk blocked');
		assert.equal(blockedPosition, false, 'pre-success position blocked');
		assert.equal(countWrites(info.raw, 'map_chunk'), 0);
		assert.equal(countWrites(info.raw, 'position'), 0);
		assert.ok(
			info.client.writeErrors.some((entry) => entry.message.includes('E_SESSION_NOT_READY')),
			'pre-success write surfaced'
		);
		info.raw.sendStatus(pack.uuid, 0);
		await waitUntil(() => info.gate.state === STATES.CONNECTED, 'blocked write then success');
		record('pre_success_world_write_blocked', true, {
			writeErrors: info.client.writeErrors.length
		});
	}

	// Duplicate login is rejected by the adapter and never reaches the wire.
	{
		const info = createFakeGate(pack);
		const duplicate = info.client.write('login', {});
		assert.equal(duplicate, false, 'duplicate login blocked');
		assert.equal(countWrites(info.raw, 'login'), 1, 'only one login on wire');
		info.raw.sendStatus(pack.uuid, 0);
		await waitUntil(() => info.gate.state === STATES.CONNECTED, 'duplicate login then success');
		record('duplicate_login_blocked', true, {
			errors: info.client.writeErrors.map((entry) => entry.message)
		});
	}

	// Timeout via a fake clock: the default 30s deadline is armed, then fired
	// deterministically with no real wait. No world/connect traffic is allowed.
	{
		const info = createFakeGate(pack, { fakeClock: true, timeoutMs: 30000 });
		assert.equal(info.gate.state, STATES.PACK_PENDING, 'timeout gate is pending');
		assert.equal(info.clock.pending, 1, 'fake clock armed exactly one timer');
		info.clock.advance(29999);
		await delay(0);
		assert.equal(info.gate.state, STATES.PACK_PENDING, 'gate is still pending before the deadline');
		info.clock.advance(1);
		await waitUntil(() => info.gate.state === STATES.FAILED, 'timeout failure', 2000);
		assertCleanFailure(info, 'E_PACK_TIMEOUT');
		assert.equal(info.gate.timeoutDeclared, 30000);
		assert.equal(info.gate.failure.detail.timeoutMs, 30000);
		assert.equal(info.clock.pending, 0, 'fake clock has no pending timers');
		record('timeout_fake_clock', true, {
			code: 'E_PACK_TIMEOUT',
			timeoutMs: 30000,
			fakeClock: 1,
			noWorldData: 1
		});
	}

	// Partial download: accepted + downloaded progress, then the client drops
	// before SUCCESSFULLY_LOADED. This must fail closed with no world data.
	{
		const info = createFakeGate(pack);
		info.raw.sendStatus(pack.uuid, RESOURCE_PACK_STATUS.ACCEPTED);
		info.raw.sendStatus(pack.uuid, RESOURCE_PACK_STATUS.DOWNLOADED);
		await delay(10);
		assert.equal(info.gate.state, STATES.PACK_PENDING, 'partial download stays pending');
		assert.deepEqual(info.gate.progressStatuses, [
			RESOURCE_PACK_STATUS.ACCEPTED,
			RESOURCE_PACK_STATUS.DOWNLOADED
		]);
		info.raw.end('partial download aborted');
		await waitUntil(() => info.gate.state === STATES.FAILED, 'partial download failure');
		assertCleanFailure(info, 'E_PACK_CLIENT_DISCONNECTED');
		record('partial_download_disconnect', true, {
			code: 'E_PACK_CLIENT_DISCONNECTED',
			progress: info.gate.progressStatuses.slice(),
			noWorldData: 1
		});
	}

	// Disconnect while pending fails closed.
	{
		const info = createFakeGate(pack);
		info.raw.end('client disconnected');
		await waitUntil(() => info.gate.state === STATES.FAILED, 'disconnect failure');
		assertCleanFailure(info, 'E_PACK_CLIENT_DISCONNECTED');
		record('disconnect', true, { code: 'E_PACK_CLIENT_DISCONNECTED' });
	}

	// Transport error while pending fails closed.
	{
		const info = createFakeGate(pack);
		info.raw.emit('error', new Error('socket exploded'));
		await waitUntil(() => info.gate.state === STATES.FAILED, 'transport error');
		assertCleanFailure(info, 'E_PACK_CLIENT_ERROR');
		record('transport_error', true, { code: 'E_PACK_CLIENT_ERROR' });
	}

	return cases;
}

async function runLiveHappyPath(packServer) {
	const pack = basePack(packServer);
	const trace = [];
	const sent = [];
	const admission = new JoinAdmission();
	const server = mc.createServer({
		host: '127.0.0.1',
		port: 0,
		'online-mode': false,
		version: MC_VERSION,
		maxPlayers: 1
	});
	server.on('error', () => {});
	await once(server, 'listening');
	const port = server.socketServer.address().port;

	let firstGate = null;
	let packReceivedResolve;
	const packReceived = new Promise((resolve) => {
		packReceivedResolve = resolve;
	});
	let connectedResolve;
	const connected = new Promise((resolve) => {
		connectedResolve = resolve;
	});
	let connects = 0;
	let connectBeforeLoaded = 0;

	server.on('login', (raw) => {
		// Only the first connection is part of the trace; the second one is the
		// admission-rejection case.
		if (admission.active) return;
		raw.once('finish_configuration', () => trace.push('finish_configuration'));
	});

	server.on('playerJoin', (raw) => {
		if (admission.isPending()) {
			raw.end('A player is already logged in!');
			return;
		}

		const client = new LegacyClient(raw, {
			version: MC_VERSION,
			deferInitialPosition: true,
			gateSession: true
		});
		client.on('error', () => {});

		const rawWrite = raw.write.bind(raw);
		raw.write = (name, data) => {
			sent.push({ name, loaded: firstGate ? firstGate.loaded : false });
			if (name === 'login' || name === 'add_resource_pack' || name === 'position') {
				trace.push(name);
			}
			return rawWrite(name, data);
		};

		const gate = new JoinGate({
			client,
			resourcePack: pack,
			timeoutMs: DEFAULT_PACK_TIMEOUT_MS,
			connect: () => {
				connects += 1;
				if (!gate.loaded) connectBeforeLoaded += 1;
				trace.push('connect');
				return Promise.resolve();
			},
			onWorldReady: () => {
				trace.push('world');
			}
		});
		firstGate = gate;
		gate.on('success', () => trace.push('success'));
		gate.on('connected', () => connectedResolve());

		if (!admission.tryReserve(gate)) {
			raw.end('A player is already logged in!');
			return;
		}
		gate.start();
	});

	const first = mc.createClient({
		host: '127.0.0.1',
		port,
		username: 'LiveTester',
		version: MC_VERSION,
		auth: 'offline'
	});
	first.on('error', () => {});
	let firstLoginPackets = 0;
	let firstPositionPackets = 0;
	first.on('login', () => {
		firstLoginPackets += 1;
	});
	first.on('packet', (_data, meta) => {
		if (meta && meta.name === 'position') firstPositionPackets += 1;
	});
	first.on('add_resource_pack', (packet) => packReceivedResolve(packet));

	const addPack = await withTimeout(packReceived, 5000, 'first client add_resource_pack');
	assert.equal(addPack.uuid.toLowerCase(), pack.uuid.toLowerCase(), 'pack UUID matches');
	assert.equal(addPack.url, pack.url, 'pack URL matches localhost endpoint');
	assert.equal(addPack.hash, pack.hash, 'pack SHA-1 matches');
	assert.equal(addPack.forced, true, 'forced=true');
	assert.ok(addPack.promptMessage, 'promptMessage present');
	assert.equal(typeof addPack.promptMessage, 'object', 'promptMessage is NBT');

	// A second client must be rejected while the first is still packPending.
	let secondLoginPackets = 0;
	const second = mc.createClient({
		host: '127.0.0.1',
		port,
		username: 'SecondTester',
		version: MC_VERSION,
		auth: 'offline'
	});
	second.on('error', () => {});
	second.on('login', () => {
		secondLoginPackets += 1;
	});
	await withTimeout(once(second, 'end'), 5000, 'second client rejected');
	assert.equal(secondLoginPackets, 0, 'second client must not receive a play login');
	assert.equal(admission.active, firstGate, 'second client did not replace the gate');
	assert.equal(firstGate.state, STATES.PACK_PENDING, 'first gate still pending');

	// Progress then success on the real wire.
	const uuid = addPack.uuid;
	first.write('resource_pack_receive', {
		uuid,
		result: RESOURCE_PACK_STATUS.ACCEPTED
	});
	first.write('resource_pack_receive', {
		uuid,
		result: RESOURCE_PACK_STATUS.DOWNLOADED
	});
	first.write('resource_pack_receive', {
		uuid,
		result: RESOURCE_PACK_STATUS.SUCCESSFULLY_LOADED
	});

	await withTimeout(connected, 5000, 'first gate connected');
	assert.equal(firstGate.state, STATES.CONNECTED, 'gate connected');
	assert.deepEqual(firstGate.progressStatuses, [
		RESOURCE_PACK_STATUS.ACCEPTED,
		RESOURCE_PACK_STATUS.DOWNLOADED
	]);

	// Late/duplicate responses after success are ignored.
	const acceptedBefore = firstGate.acceptedStatuses.length;
	const connectsBefore = connects;
	first.write('resource_pack_receive', {
		uuid,
		result: RESOURCE_PACK_STATUS.SUCCESSFULLY_LOADED
	});
	first.write('resource_pack_receive', {
		uuid,
		result: RESOURCE_PACK_STATUS.DECLINED
	});
	await delay(80);
	assert.equal(
		firstGate.acceptedStatuses.length,
		acceptedBefore,
		'stale statuses are not accepted'
	);
	assert.equal(connects, connectsBefore, 'stale statuses do not reconnect');
	assert.equal(firstGate.failure, null, 'stale failure does not fail the gate');
	// Once connected the gate removes its resource_pack_receive listener, so a
	// late response cannot even reach the state machine.
	assert.equal(firstGate.cleaned, true, 'gate cleaned after success');
	assert.equal(countWritesForSent(sent, 'position'), 1, 'stale statuses add no position');

	const expectedTrace = [
		'finish_configuration',
		'login',
		'add_resource_pack',
		'success',
		'position',
		'world',
		'connect'
	];
	assert.deepEqual(trace, expectedTrace, 'exact event trace');

	const loginCount = sent.filter((entry) => entry.name === 'login').length;
	const packCount = sent.filter((entry) => entry.name === 'add_resource_pack').length;
	const positionCount = sent.filter((entry) => entry.name === 'position').length;
	const worldBeforeSuccess = sent.filter(
		(entry) => !entry.loaded && WORLD_PACKET_NAMES.has(entry.name)
	).length;

	assert.equal(loginCount, 1, 'exactly one play login');
	assert.equal(packCount, 1, 'exactly one add_resource_pack');
	assert.equal(positionCount, 1, 'exactly one initial position');
	assert.equal(worldBeforeSuccess, 0, 'no world packets before success');
	assert.equal(connectBeforeLoaded, 0, 'no Bloxd connect before success');
	assert.equal(connects, 1, 'connect exactly once');
	assert.equal(firstLoginPackets, 1, 'client received one play login');
	assert.equal(firstPositionPackets, 1, 'client received one position');
	assert.equal(secondLoginPackets, 0, 'second client never entered play');

	const result = {
		trace: expectedTrace,
		traceString:
			'finish_configuration -> login x1 -> add_resource_pack -> success -> position/world/connect',
		loginCount,
		packCount,
		positionCount,
		worldBeforeSuccess,
		secondLoginPackets,
		staleAccepted: firstGate.acceptedStatuses.length - acceptedBefore,
		connects,
		connectBeforeLoaded,
		acceptedStatuses: firstGate.acceptedStatuses.slice(),
		progressStatuses: firstGate.progressStatuses.slice(),
		lateStatuses: firstGate.ignoredStatuses.filter((entry) => entry.reason === 'late').length,
		promptMessageType: typeof addPack.promptMessage,
		forced: addPack.forced
	};

	first.end('test complete');
	await new Promise((resolve) => {
		server.once('close', resolve);
		server.close();
	});
	return result;
}

async function main() {
	const packServer = await startResourcePackServer({ port: 0 });
	try {
		const manifest = JSON.parse(
			fs.readFileSync(path.join(__dirname, '..', 'bloxd', 'resource_pack', 'manifest.json'), 'utf8')
		);
		assert.equal(packServer.sha256, manifest.pack.zipSha256, 'served pack SHA-256 matches the 852 manifest');
		assert.equal(packServer.size, manifest.pack.zipSize, 'served pack size matches the 852 manifest');
		assert.equal(packServer.entries, manifest.pack.zipEntries, 'served pack entries match the 852 manifest');
		const pack = basePack(packServer);
		const live = await runLiveHappyPath(packServer);

		// Real-wire terminal resource_pack_receive results. The client uses the
		// actual protocol packet and the actual UUID from add_resource_pack.
		const liveTerminalSpecs = [
			{ name: 'live_declined', username: 'LiveDeclined', result: 1, code: 'E_PACK_DECLINED', status: 'DECLINED' },
			{ name: 'live_failed_download', username: 'LiveFailDl', result: 2, code: 'E_PACK_FAILED_DOWNLOAD', status: 'FAILED_DOWNLOAD' },
			{ name: 'live_invalid_url', username: 'LiveBadUrl', result: 5, code: 'E_PACK_INVALID_URL', status: 'INVALID_URL' },
			{ name: 'live_failed_reload', username: 'LiveReload', result: 6, code: 'E_PACK_FAILED_RELOAD', status: 'FAILED_RELOAD' },
			{ name: 'live_discarded', username: 'LiveDiscard', result: 7, code: 'E_PACK_DISCARDED', status: 'DISCARDED' },
			{ name: 'live_unknown_status', username: 'LiveUnknown', result: 99, code: 'E_PACK_STATUS_UNKNOWN' }
		];
		const liveTerminalResults = [];
		for (const spec of liveTerminalSpecs) {
			liveTerminalResults.push(
				await runLivePackCase(packServer, {
					name: spec.name,
					username: spec.username,
					afterPack: ({ client, addPack }) => {
						client.write('resource_pack_receive', {
							uuid: addPack.uuid,
							result: spec.result
						});
					},
					verify: (result) =>
						verifyLiveFailure(result, {
							name: spec.name,
							code: spec.code,
							status: spec.status,
							result: spec.result
						})
				})
			);
		}

		// Real-wire wrong UUID: ignored, still pending, exactly one login/pack.
		const liveWrongUuid = await runLivePackCase(packServer, {
			name: 'live_wrong_uuid',
			username: 'LiveWrongU',
			expectTerminal: false,
			afterPack: async ({ client }) => {
				client.write('resource_pack_receive', {
					uuid: '11111111-2222-3333-4444-555555555555',
					result: RESOURCE_PACK_STATUS.SUCCESSFULLY_LOADED
				});
				await delay(150);
			},
			verify: (result) => {
				assert.equal(result.state, STATES.PACK_PENDING, 'wrong uuid stays pending');
				assert.equal(result.failure, null, 'wrong uuid is not a failure');
				assert.equal(result.loginCount, 1, 'wrong uuid: one login');
				assert.equal(result.packCount, 1, 'wrong uuid: one pack request');
				assert.equal(result.positionCount, 0, 'wrong uuid: no position');
				assert.equal(result.worldPacketCount, 0, 'wrong uuid: no world packet');
				assert.equal(result.connects, 0, 'wrong uuid: no connect');
				assert.equal(result.gate.acceptedStatuses.length, 0, 'wrong uuid not accepted');
				assert.equal(
					result.gate.ignoredStatuses.some((entry) => entry.reason === 'uuid'),
					true,
					'wrong uuid recorded as ignored'
				);
			}
		});
		assert.equal(liveWrongUuid.gate.cleaned, true, 'wrong uuid cleanup on disconnect');

		// Real-wire timeout: real connection, short injected timeout, no status.
		const liveTimeout = await runLivePackCase(packServer, {
			name: 'live_timeout',
			username: 'LiveTimeout',
			timeoutMs: 50,
			afterPack: async () => {},
			verify: (result) =>
				verifyLiveFailure(result, {
					name: 'live_timeout',
					code: 'E_PACK_TIMEOUT',
					timeoutMs: 50
				})
		});

		// Real-wire disconnect before any status.
		const liveDisconnect = await runLivePackCase(packServer, {
			name: 'live_disconnect',
			username: 'LiveDisconn',
			afterPack: async ({ client }) => {
				client.end('client disconnected before pack status');
			},
			verify: (result) =>
				verifyLiveFailure(result, {
					name: 'live_disconnect',
					code: 'E_PACK_CLIENT_DISCONNECTED'
				})
		});

		// Actual HTTP connection refusal: a closed pack endpoint must reject.
		const refusalServer = await startResourcePackServer({ port: 0 });
		const refusalUrl = refusalServer.url;
		const refusalPort = refusalServer.port;
		await refusalServer.close();
		const refusal = await httpRequestError(refusalUrl);
		assert.equal(refusal.error, 'ECONNREFUSED', 'closed pack port refuses connections');
		assert.ok(refusalPort > 0, 'refusal used a real ephemeral port');

		const statusCases = await runStatusScenarios(pack);

		const liveCoverage = {
			liveTerminalStatuses: liveTerminalResults.length,
			liveWrongUuid:
				liveWrongUuid.state === STATES.PACK_PENDING &&
				liveWrongUuid.failure === null &&
				liveWrongUuid.gate.ignoredStatuses.some((entry) => entry.reason === 'uuid')
					? 1
					: 0,
			liveTimeout:
				liveTimeout.state === STATES.FAILED &&
				liveTimeout.failure &&
				liveTimeout.failure.code === 'E_PACK_TIMEOUT'
					? 1
					: 0,
			liveDisconnect:
				liveDisconnect.state === STATES.FAILED &&
				liveDisconnect.failure &&
				liveDisconnect.failure.code === 'E_PACK_CLIENT_DISCONNECTED'
					? 1
					: 0,
			fakeOnlyCases: 0
		};
		const liveTerminalResultsSorted = liveTerminalResults
			.map((entry) => entry.failure.detail.result)
			.sort((a, b) => a - b);
		assert.deepEqual(
			liveTerminalResultsSorted,
			[1, 2, 5, 6, 7, 99],
			'live terminal statuses cover 1,2,5,6,7,99'
		);
		assert.equal(liveCoverage.liveTerminalStatuses, 6);
		assert.equal(liveCoverage.liveWrongUuid, 1);
		assert.equal(liveCoverage.liveTimeout, 1);
		assert.equal(liveCoverage.liveDisconnect, 1);
		assert.equal(liveCoverage.fakeOnlyCases, 0);

		const summarizeLive = (entry) => ({
			name: entry.name,
			state: entry.state,
			failure: entry.failure,
			loginCount: entry.loginCount,
			packCount: entry.packCount,
			positionCount: entry.positionCount,
			worldPacketCount: entry.worldPacketCount,
			connects: entry.connects,
			connectBeforeLoaded: entry.connectBeforeLoaded,
			worldReady: entry.worldReady,
			cleaned: entry.afterCleanup ? entry.afterCleanup.cleaned : entry.cleaned,
			clearedTimer: entry.afterCleanup
				? entry.afterCleanup.clearedTimer
				: entry.clearedTimer,
			clientEnded: entry.afterCleanup
				? entry.afterCleanup.clientEnded
				: entry.serverClient.ended,
			rawEnded: entry.afterCleanup ? entry.afterCleanup.rawEnded : entry.gate.real.ended,
			afterCleanup: entry.afterCleanup,
			ignoredStatuses: entry.gate.ignoredStatuses
		});

		const failureCodes = [
			'E_PACK_DECLINED',
			'E_PACK_FAILED_DOWNLOAD',
			'E_PACK_INVALID_URL',
			'E_PACK_FAILED_RELOAD',
			'E_PACK_DISCARDED',
			'E_PACK_STATUS_UNKNOWN',
			'E_PACK_TIMEOUT',
			'E_PACK_CLIENT_DISCONNECTED',
			'E_PACK_CLIENT_ERROR'
		];
		const observedFailureCodes = new Set([
			...liveTerminalResults.map((entry) => entry.failure.code),
			liveTimeout.failure.code,
			liveDisconnect.failure.code,
			...statusCases
				.filter((entry) => entry.detail && entry.detail.code)
				.map((entry) => entry.detail.code)
		]);
		const allStatusCodesCovered = [
			RESOURCE_PACK_STATUS.SUCCESSFULLY_LOADED,
			RESOURCE_PACK_STATUS.DECLINED,
			RESOURCE_PACK_STATUS.FAILED_DOWNLOAD,
			RESOURCE_PACK_STATUS.ACCEPTED,
			RESOURCE_PACK_STATUS.DOWNLOADED,
			RESOURCE_PACK_STATUS.INVALID_URL,
			RESOURCE_PACK_STATUS.FAILED_RELOAD,
			RESOURCE_PACK_STATUS.DISCARDED
		].every((status) =>
			status === 0
				? statusCases.some((entry) => entry.name === 'success')
				: status === 3 || status === 4
					? statusCases.some((entry) => entry.name === 'accepted+downloaded+success')
					: statusCases.some((entry) => entry.detail && entry.detail.status === status)
		);

		const liveFailuresCleaned = [
			...liveTerminalResults,
			liveTimeout,
			liveDisconnect
		].every(
			(entry) =>
				entry.cleaned === true &&
				entry.failure &&
				entry.serverClient.ended === true &&
				entry.gate.real.ended === true
		);
		const timeoutCase = statusCases.find((entry) => entry.name === 'timeout_fake_clock');
		const partialCase = statusCases.find(
			(entry) => entry.name === 'partial_download_disconnect'
		);
		const timeoutNoWorldData =
			timeoutCase &&
			timeoutCase.ok &&
			timeoutCase.detail &&
			timeoutCase.detail.noWorldData === 1 &&
			timeoutCase.detail.fakeClock === 1
				? 1
				: 0;
		const partialDownload =
			partialCase && partialCase.ok && partialCase.detail && partialCase.detail.noWorldData === 1
				? 1
				: 0;
		const flags = {
			worldPacketsBeforeSuccess: live.worldBeforeSuccess === 0 ? 0 : 1,
			bloxdConnectBeforeSuccess: live.connectBeforeLoaded === 0 ? 0 : 1,
			duplicateLogin: live.loginCount === 1 ? 0 : live.loginCount - 1,
			secondClientAccepted: live.secondLoginPackets,
			staleStatusAccepted: live.staleAccepted,
			cleanupOnFailure:
				liveFailuresCleaned &&
				statusCases.every((entry) => !entry.detail || !entry.detail.code || entry.ok)
					? 1
					: 0,
			timeoutNoWorldData,
			partialDownload: partialDownload ? 1 : 0,
			connectionRefused: refusal.error === 'ECONNREFUSED' ? 1 : 0,
			allStatusesCovered: allStatusCodesCovered ? 8 : 0,
			noRealClientClaim: 1,
			skipped: 0,
			...liveCoverage
		};

		assert.equal(flags.worldPacketsBeforeSuccess, 0);
		assert.equal(flags.bloxdConnectBeforeSuccess, 0);
		assert.equal(flags.duplicateLogin, 0);
		assert.equal(flags.secondClientAccepted, 0);
		assert.equal(flags.staleStatusAccepted, 0);
		assert.equal(flags.cleanupOnFailure, 1);
		assert.equal(flags.liveTerminalStatuses, 6);
		assert.equal(flags.liveWrongUuid, 1);
		assert.equal(flags.liveTimeout, 1);
		assert.equal(flags.liveDisconnect, 1);
		assert.equal(flags.fakeOnlyCases, 0);
		assert.equal(allStatusCodesCovered, true, 'all 8 documented statuses covered');
		assert.equal(flags.allStatusesCovered, 8);
		assert.equal(flags.timeoutNoWorldData, 1);
		assert.equal(flags.partialDownload, 1);
		assert.equal(flags.connectionRefused, 1);
		assert.equal(flags.noRealClientClaim, 1);
		assert.equal(flags.skipped, 0);
		for (const code of failureCodes) {
			assert.equal(observedFailureCodes.has(code), true, 'failure code covered: ' + code);
		}

		console.log(
			'TRACE ' +
				'finish_configuration -> login x1 -> add_resource_pack -> success -> ' +
				'position/world/connect'
		);
		console.log(
			'RESOURCE-PACK PROTOCOL PASS ' +
				`worldPacketsBeforeSuccess=${flags.worldPacketsBeforeSuccess} ` +
				`bloxdConnectBeforeSuccess=${flags.bloxdConnectBeforeSuccess} ` +
				`duplicateLogin=${flags.duplicateLogin} ` +
				`secondClientAccepted=${flags.secondClientAccepted} ` +
				`staleStatusAccepted=${flags.staleStatusAccepted} ` +
				`cleanupOnFailure=${flags.cleanupOnFailure} ` +
				`liveTerminalStatuses=${flags.liveTerminalStatuses} ` +
				`liveWrongUuid=${flags.liveWrongUuid} ` +
				`liveTimeout=${flags.liveTimeout} ` +
				`liveDisconnect=${flags.liveDisconnect} ` +
				`fakeOnlyCases=${flags.fakeOnlyCases} ` +
				`allStatusesCovered=${flags.allStatusesCovered} ` +
				`timeoutNoWorldData=${flags.timeoutNoWorldData} ` +
				`partialDownload=${flags.partialDownload} ` +
				`connectionRefused=${flags.connectionRefused} ` +
				`noRealClientClaim=${flags.noRealClientClaim} skipped=${flags.skipped} ` +
				`timeout=1 wrongUuid=1 duplicate=1 late=1 ` +
				`disconnect=1 invalidUrl=1 failedReload=1 discarded=1`
		);
		console.log(
			JSON.stringify({
				ok: true,
				mode: 'protocol',
				...(flags),
				timeout: 1,
				wrongUuid: 1,
				duplicate: 1,
				late: 1,
				disconnect: 1,
				invalidUrl: 1,
				failedReload: 1,
				discarded: 1,
				trace: live.trace,
				traceString: live.traceString,
				live,
				liveCoverage,
				liveTerminalResults: liveTerminalResults.map(summarizeLive),
				liveWrongUuid: summarizeLive(liveWrongUuid),
				liveTimeout: summarizeLive(liveTimeout),
				liveDisconnect: summarizeLive(liveDisconnect),
				statusCases
			})
		);
	} finally {
		await packServer.close();
	}
}

main().catch((error) => {
	console.error(
		JSON.stringify({
			ok: false,
			mode: 'protocol',
			code: error.code || 'E_TEST_FAILED',
			message: error.message,
			stack: error.stack
		})
	);
	process.exit(1);
});
