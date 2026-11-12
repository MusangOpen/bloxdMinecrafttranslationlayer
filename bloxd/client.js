'use strict';

const { Client, getStateCallbacks } = require('colyseus.js');
const { browser, metrics, version, matchmaking, gen3PSIDMCPP, languages } = require('./types/browser_info.js');
const { EventEmitter } = require('ws');
const protocol = require('./protocol/live.js');
const TARGET = require('./protocol/target.js');
const { PACKET_SEND_EXP_KEY, PACKET_SEND_VER_KEY } = require('./types/anticheat_constants.js');
const { playSessionId, visitSessionId } = require('./types/session_ids.js');
const KICKS = require('./types/kicks.js');

function isView(obj) {
	return ArrayBuffer.isView(obj) && !(obj instanceof DataView);
}

function transformView(obj) {
	if (isView(obj)) return [...obj];
	if (typeof obj === 'object' && obj !== null) for (const key in obj) obj[key] = transformView(obj[key]);
	return obj;
}

/** legacy semantic name -> numeric id, both directions */
const INBOUND_BY_ID = new Map([
	...Object.entries(protocol.INBOUND_IDS).map(([name, id]) => [id, name]),
	...Object.entries(protocol.INBOUND_JSON).map(([name, spec]) => [spec.id, name])
].filter(([id]) => typeof id === 'number'));
const INBOUND_LEDGER_BY_ID = new Map();
for (const row of protocol.PROTOCOL_LEDGER.inbound) {
	if (typeof row.id !== 'number') continue;
	const existing = INBOUND_LEDGER_BY_ID.get(row.id);
	if (!existing || (existing.disposition === 'ignored' && row.disposition === 'implemented')) {
		INBOUND_LEDGER_BY_ID.set(row.id, row);
	}
}
const OUTBOUND_IDS = protocol.OUTBOUND_IDS;
const SETTINGS_PACKET = protocol.PROTOCOL_SETTINGS;
const JOIN_PACKET_ID = protocol.INBOUND_IDS.SPacketJoinGame;

function createProtocolCounters() {
	return {
		unknownInbound: 0,
		decodeFailed: 0,
		unsupportedInbound: 0,
		ignoredInbound: 0,
		unknownOutbound: 0,
		unsupportedOutbound: 0,
		encodeFailed: 0,
		settingsApplied: 0,
		settingsInvalid: 0,
		settingsUnrouted: 0
	};
}

module.exports = class BloxClient {
	room = false
	connected = true
	packetEvent = new EventEmitter()
	settings = {
		canPickUpItems: true,
		walkingSpeed: 4,
		runningSpeed: 7,
		crouchingSpeed: 2,
		jumpAmount: 8,
		secsToRespawn: 5,
		auraPerLevel: 100,
		speedMultiplier: 1,
		_health: null,
		_shield: 0,
		_aura: 0
	}
	settingsEvent = new EventEmitter()
	pass = undefined
	lastPacketId = 0
	localPlayerId = null
	protocolErrors = createProtocolCounters()
	lastProtocolError = null

	constructor(fetched, callback) {
		const gameServerHost = fetched && fetched.gameServerHost;
		if (typeof gameServerHost !== 'string' || gameServerHost.length === 0) {
			return callback(
				'Matchmaking response is missing gameServerHost. Bloxd changed the matchmake payload; refresh the build pin before connecting.'
			);
		}
		if (matchmaking.trafficCode == '') {
			return callback('Please open up the tampermonkey script on the browser, refresh and try again.');
		}

		const gameServerUrl = `wss://${gameServerHost}`;
		const wsClient = new Client(gameServerUrl);
		wsClient.http.headers = {
			'Origin': 'https://bloxd.io',
			'Referer': 'https://bloxd.io/',
			'User-Agent': browser.ua,
			'sec-fetch-dest': 'empty',
			'sec-fetch-mode': 'websocket',
			'sec-fetch-site': 'same-site'
		};

		const lobbyName = fetched.gameNameWithVariation.includes('classic_playerSchematic')
			? fetched.gameNameWithVariation.split('|')[1] + '|' + fetched.lobbyName
			: fetched.lobbyName;

		const matchMakingResult = wsClient.joinOrCreate(fetched.gameNameWithVariation, {
			cookies: { origin: 'classic' },
			isMobile: false,
			isUsingCustomGameTexturePack: false,
			generalCookies: {
				joinDiscord: false,
				newGo: 'c',
				...metrics,
				...matchmaking
			},
			browserInfo: browser,
			isLoggedIn: false,
			lobbyName,
			languages: languages,
			version: TARGET.version,
			siteUsed: 'bloxd',
			subsiteUsed: 'bloxd',
			playSessionId: playSessionId(fetched.gameNameWithVariation),
			visitSessionId: visitSessionId()
		});

		this.ip = gameServerHost;
		this.gameServerUrl = gameServerUrl;
		this.gameName = fetched.gameNameWithVariation;
		this.lobbyName = lobbyName;

		matchMakingResult.then(result => {
			this.room = result;
			this.state = result.state;
			this.stateCallbacks = getStateCallbacks(result);
			if (process.env.BLOXD_DEBUG_PACKETS) {
				const state = result.state;
				console.log("\x1b[90m[state] " + (state ? Object.keys(state).join(",") : "null") + "\x1b[0m");
			}

			if (!this.connected) {
				result.leave(true);
				return;
			}

			result.onMessage('*', (rawId, data) => this._handleInbound(rawId, data));

			result.onLeave((code) => {
				if (this.connected) {
					callback(KICKS[code] ?? `Either your internet isn't working or this is a bug.\nCode: ${code}`);
				}
			});
		}).catch((err) => {
			if (/secure TLS connection/i.test(String(err && err.message))) {
				console.log('\x1b[33m[*] TLS handshake failed before the game server answered. The local DNS may be returning proxy fake-ip; set *.bloxd.io to DIRECT in your proxy, and keep BLOXD_DNS_OVERRIDE enabled.\x1b[0m');
			}
			callback(KICKS[err.code] ?? (err.message != '' ? err.message : `Either your internet isn't working or this is a bug.\nCode: ${err.code}`));
			if (err.code == 4047 || err.code == 4049) {
				gen3PSIDMCPP(true);
			}
		});
	}

	_ensureProtocolState() {
		if (!this.protocolErrors) this.protocolErrors = createProtocolCounters();
		if (this.localPlayerId === undefined) this.localPlayerId = null;
	}

	_recordProtocolError(code, message, details) {
		const err = new Error(message);
		err.name = 'ProtocolError';
		err.code = code;
		if (details !== undefined) err.details = details;
		this.lastProtocolError = err;
		this.packetEvent.emit('protocol-error', err);
		return err;
	}

	_handleInbound(rawId, data) {
		if (!this.connected) return;
		this._ensureProtocolState();
		const id = Number(rawId);
		const name = INBOUND_BY_ID.get(id);
		if (process.env.BLOXD_DEBUG_PACKETS) {
			const size = data && typeof data === 'object' && typeof data.byteLength === 'number'
				? data.byteLength
				: typeof data;
			console.log(`\x1b[90m[in] ${id} ${name === undefined ? '<unknown>' : name} (${size})\x1b[0m`);
		}
		if (name === undefined) {
			this.protocolErrors.unknownInbound++;
			const err = this._recordProtocolError(
				'E_PROTOCOL_UNKNOWN_INBOUND',
				`unknown inbound packet id ${id}`,
				{ id, data }
			);
			this.packetEvent.emit('unknown', { id, data, error: err });
			return;
		}

		const ledgerRow = INBOUND_LEDGER_BY_ID.get(id);
		if (ledgerRow && ledgerRow.disposition === 'unsupported') {
			this.protocolErrors.unsupportedInbound++;
			this._recordProtocolError(
				'E_PROTOCOL_UNSUPPORTED_INBOUND',
				`inbound packet ${name} (id ${id}) is explicitly unsupported by the 846 ledger`,
				{ id, name }
			);
			return;
		}
		if (ledgerRow && ledgerRow.disposition === 'ignored') this.protocolErrors.ignoredInbound++;

		if (protocol.isInboundBinary(name)) {
			const isBytes = data instanceof Uint8Array || Buffer.isBuffer(data) || data instanceof ArrayBuffer;
			if (!isBytes) {
				this.protocolErrors.decodeFailed++;
				const err = this._recordProtocolError(
					'E_PROTOCOL_DECODE_FAILED',
					`binary packet ${name} (id ${id}) arrived without a byte payload`,
					{ id, name, dataType: typeof data }
				);
				this.packetEvent.emit('decode-error', { name, id, data, err });
				return;
			}
		}

		try {
			this.lastPacketId = id;
			const decoded = protocol.decodeInbound(name, data);
			if (id === JOIN_PACKET_ID && decoded && typeof decoded.eId === 'string') {
				this.localPlayerId = decoded.eId;
			}
			if (SETTINGS_PACKET && id === SETTINGS_PACKET.id) {
				const settings = this._applySettingsPacket(decoded);
				if (settings !== null) this.packetEvent.emit('SPacketServerSetting', settings);
				return;
			}
			this.packetEvent.emit(name, decoded);
		} catch (err) {
			this.protocolErrors.decodeFailed++;
			console.error(`[protocol] failed to decode ${name} (id ${id}):`, err.message);
			this.packetEvent.emit('decode-error', { name, id, data, err });
			this._recordProtocolError(
				'E_PROTOCOL_DECODE_FAILED',
				`failed to decode ${name} (id ${id}): ${err.message}`,
				{ id, name, cause: err.message }
			);
		}
	}

	_applySettingsPacket(decoded) {
		this._ensureProtocolState();
		const fields = SETTINGS_PACKET && SETTINGS_PACKET.fields;
		if (!fields) {
			this.protocolErrors.settingsUnrouted++;
			this._recordProtocolError(
				'E_PROTOCOL_SETTINGS_PACKET_MISSING',
				'no evidence-backed 846 settings packet is available',
				{}
			);
			return null;
		}
		if (!decoded || !Array.isArray(decoded[fields.entries])) {
			this.protocolErrors.settingsInvalid++;
			this._recordProtocolError(
				'E_PROTOCOL_SETTINGS_INVALID',
				'settings packet does not contain the evidence-backed entry list',
				{ decoded }
			);
			return null;
		}
		if (this.localPlayerId === null || this.localPlayerId === undefined) {
			this.protocolErrors.settingsUnrouted++;
			this._recordProtocolError(
				'E_PROTOCOL_SETTINGS_UNROUTED',
				'settings packet arrived before the local player id from SPacketJoinGame.iL was known',
				{ id: SETTINGS_PACKET.id }
			);
			return null;
		}

		let localEntry = null;
		const changes = Object.create(null);
		for (const entry of decoded[fields.entries]) {
			if (!entry || typeof entry[fields.playerId] !== 'string') {
				this.protocolErrors.settingsInvalid++;
				this._recordProtocolError(
					'E_PROTOCOL_SETTINGS_INVALID',
					'settings entry is missing its evidence-backed player id',
					{ entry }
				);
				return null;
			}
			if (entry[fields.playerId] !== this.localPlayerId) continue;
			localEntry = entry;
			const serialized = entry[fields.settingsJson];
			if (serialized !== null && serialized !== undefined) {
				let parsed;
				try {
					parsed = JSON.parse(serialized);
				} catch (err) {
					this.protocolErrors.settingsInvalid++;
					this._recordProtocolError(
						'E_PROTOCOL_SETTINGS_INVALID',
						'settings entry contains invalid JSON: ' + err.message,
						{ playerId: entry[fields.playerId] }
					);
					return null;
				}
				if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
					this.protocolErrors.settingsInvalid++;
					this._recordProtocolError(
						'E_PROTOCOL_SETTINGS_INVALID',
						'settings entry JSON is not an object',
						{ playerId: entry[fields.playerId] }
					);
					return null;
				}
				Object.assign(changes, parsed);
			}
			const removed = entry[fields.removedKeys];
			if (removed !== null && removed !== undefined) {
				if (!Array.isArray(removed)) {
					this.protocolErrors.settingsInvalid++;
					this._recordProtocolError(
						'E_PROTOCOL_SETTINGS_INVALID',
						'settings removed-key list is not an array',
						{ playerId: entry[fields.playerId] }
					);
					return null;
				}
				for (const key of removed) {
					if (typeof key === 'string') changes[key] = undefined;
				}
			}
		}

		if (!localEntry) return null;
		let emitted = null;
		for (const [key, value] of Object.entries(changes)) {
			if (value === undefined) delete this.settings[key];
			else this.settings[key] = value;
			if (!emitted) emitted = {};
			emitted[key] = value;
			this.settingsEvent.emit(key, value);
		}
		if (!emitted) return null;
		this.protocolErrors.settingsApplied++;
		return emitted;
	}

	on(name, callback) {
		return this.packetEvent.on(name, callback);
	}

	send(name, data) {
		this._ensureProtocolState();
		const unsupported = protocol.OUTBOUND_UNSUPPORTED && protocol.OUTBOUND_UNSUPPORTED[name];
		if (unsupported) {
			this.protocolErrors.unsupportedOutbound++;
			this._recordProtocolError(
				'E_PROTOCOL_UNSUPPORTED_OUTBOUND',
				`outbound packet ${name} is explicitly unsupported by the 846 ledger: ${unsupported}`,
				{ name }
			);
			return;
		}
		const id0 = OUTBOUND_IDS[name];
		if (typeof id0 !== 'number') {
			this.protocolErrors.unknownOutbound++;
			this._recordProtocolError(
				'E_PROTOCOL_UNKNOWN_OUTBOUND',
				`unknown outbound packet ${name}`,
				{ name }
			);
			return;
		}
		if (!this.pass || !this.room || !this.connected) return;

		try {
			let payload;
			if (name === 'CPacketMovePlayer' && data && typeof data === 'object') {
				data = { ...data, ackPacketId: data.ackPacketId ?? this.lastPacketId };
			}
			if (protocol.isOutboundBinary(name)) {
				payload = protocol.encodeOutbound(name, transformView(data));
			} else {
				payload = protocol.encodeOutbound(name, data);
			}

			let id = id0;
			if (isView(payload)) {
				for (let i = 0; i < payload.length; i++) {
					const a = this.pass[i % this.pass.length];
					const b = this.pass[(i + 5) % this.pass.length];
					payload[i] ^= a ^ PACKET_SEND_EXP_KEY ^ (i + payload.length * 3) ^ b ^ PACKET_SEND_VER_KEY;
				}
				id ^= this.pass[2] ^ this.pass.length ^ PACKET_SEND_EXP_KEY ^ this.pass[6] ^ PACKET_SEND_VER_KEY;
			} else {
				id ^= this.pass[2] ^ this.pass.length ^ PACKET_SEND_EXP_KEY ^ this.pass[6] ^ PACKET_SEND_VER_KEY;
			}

			isView(payload) ? this.room.sendBytes(id, payload) : this.room.send(id, payload);
		} catch (err) {
			this.protocolErrors.encodeFailed++;
			console.error(`[protocol] failed to encode ${name}:`, err.message);
			this._recordProtocolError(
				'E_PROTOCOL_ENCODE_FAILED',
				`failed to encode ${name}: ${err.message}`,
				{ name, cause: err.message }
			);
		}
	}

	emitInitialSettings() {
		for (const [key, val] of Object.entries(this.settings)) this.settingsEvent.emit(key, val);
	}

	disconnect() {
		this.connected = false;
		if (this.room) {
			this.room.leave(true);
			this.room = false;
		}
	}
};
