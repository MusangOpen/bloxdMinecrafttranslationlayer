'use strict';

/**
 * Login / resource-pack / world gate.
 *
 * The 1.21.11 client is put into the play state by minecraft-protocol, then
 * this gate sends exactly one play login and one forced resource-pack request.
 * Nothing else is allowed to reach the client - and Bloxd connect() is not
 * called - until the client reports SUCCESSFULLY_LOADED.
 *
 * States: idle -> packPending -> connecting -> connected
 * Terminal failure states: failed (any error), closed (client ended after it
 * was connected).
 */

const { EventEmitter } = require('node:events');
const nbt = require('prismarine-nbt');

const STATES = Object.freeze({
	IDLE: 'idle',
	PACK_PENDING: 'packPending',
	CONNECTING: 'connecting',
	CONNECTED: 'connected',
	FAILED: 'failed',
	CLOSED: 'closed'
});

// Values documented for minecraft:resource_pack_receive.result (1.21.11).
const RESOURCE_PACK_STATUS = Object.freeze({
	SUCCESSFULLY_LOADED: 0,
	DECLINED: 1,
	FAILED_DOWNLOAD: 2,
	ACCEPTED: 3,
	DOWNLOADED: 4,
	INVALID_URL: 5,
	FAILED_RELOAD: 6,
	DISCARDED: 7
});

const STATUS_NAMES = Object.freeze({
	0: 'SUCCESSFULLY_LOADED',
	1: 'DECLINED',
	2: 'FAILED_DOWNLOAD',
	3: 'ACCEPTED',
	4: 'DOWNLOADED',
	5: 'INVALID_URL',
	6: 'FAILED_RELOAD',
	7: 'DISCARDED'
});

// accepted/downloaded are progress notifications only; they must neither
// complete the gate nor cause another add_resource_pack.
const PROGRESS_STATUSES = Object.freeze([3, 4]);
const FAILURE_CODES = Object.freeze({
	1: 'E_PACK_DECLINED',
	2: 'E_PACK_FAILED_DOWNLOAD',
	5: 'E_PACK_INVALID_URL',
	6: 'E_PACK_FAILED_RELOAD',
	7: 'E_PACK_DISCARDED'
});

const DEFAULT_PACK_TIMEOUT_MS = 30000;
const DEFAULT_PROMPT = 'This server requires the Bloxd resource pack.';

function normalizeUuid(value) {
	if (value === undefined || value === null) return '';
	return String(value).toLowerCase().replace(/-/g, '');
}

function packPrompt(text) {
	return nbt.comp({ text: nbt.string(String(text)) });
}

function errorDetail(error) {
	if (!error) return undefined;
	return {
		message: error.message ? String(error.message) : String(error),
		code: error.code
	};
}

class JoinGate extends EventEmitter {
	constructor(options = {}) {
		super();
		if (!options.client) throw new Error('E_JOIN_GATE_CLIENT_REQUIRED');
		const pack = options.resourcePack;
		if (
			!pack ||
			typeof pack.uuid !== 'string' ||
			typeof pack.url !== 'string' ||
			typeof pack.hash !== 'string'
		) {
			throw new Error('E_JOIN_GATE_RESOURCE_PACK_REQUIRED');
		}
		if (typeof options.connect !== 'function') {
			throw new Error('E_JOIN_GATE_CONNECT_REQUIRED');
		}

		this.client = options.client;
		this.real = options.client.real || options.client;
		this.resourcePack = Object.freeze({
			uuid: pack.uuid,
			url: pack.url,
			hash: pack.hash
		});
		this.packUuid = normalizeUuid(pack.uuid);
		this.timeoutMs =
			Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
				? options.timeoutMs
				: DEFAULT_PACK_TIMEOUT_MS;
		this.timeoutDeclared = this.timeoutMs;
		this.promptText =
			typeof options.promptMessage === 'string'
				? options.promptMessage
				: DEFAULT_PROMPT;
		this.promptMessage = packPrompt(this.promptText);
		this.connect = options.connect;
		this.onWorldReady =
			typeof options.onWorldReady === 'function' ? options.onWorldReady : null;

		this.state = STATES.IDLE;
		this.failure = null;
		this.loaded = false;
		this.cleaned = false;
		this.loginWrites = 0;
		this.packWrites = 0;
		this.acceptedStatuses = [];
		this.progressStatuses = [];
		this.ignoredStatuses = [];
		this.clearedTimer = false;
		this._started = false;
		this._timer = null;

		this._onStatus = this._onStatus.bind(this);
		this._onEnd = this._onEnd.bind(this);
		this._onError = this._onError.bind(this);
	}

	isPending() {
		return (
			this.state === STATES.IDLE ||
			this.state === STATES.PACK_PENDING ||
			this.state === STATES.CONNECTING
		);
	}

	isTerminal() {
		return (
			this.state === STATES.CONNECTED ||
			this.state === STATES.FAILED ||
			this.state === STATES.CLOSED
		);
	}

	_setState(state) {
		this.state = state;
		this.emit('state', state);
	}

	_attach() {
		this.real.on('resource_pack_receive', this._onStatus);
		this.real.on('end', this._onEnd);
		this.real.on('error', this._onError);
	}

	_detach() {
		this.real.removeListener('resource_pack_receive', this._onStatus);
		this.real.removeListener('end', this._onEnd);
		this.real.removeListener('error', this._onError);
	}

	_armTimer() {
		if (this._timer) return;
		this._timer = setTimeout(() => {
			this._timer = null;
			this.clearedTimer = true;
			this._fail('E_PACK_TIMEOUT', { timeoutMs: this.timeoutMs });
		}, this.timeoutMs);
		if (typeof this._timer.unref === 'function') this._timer.unref();
	}

	_clearTimer() {
		if (!this._timer) return;
		clearTimeout(this._timer);
		this._timer = null;
		this.clearedTimer = true;
	}

	start() {
		if (this._started) throw new Error('E_JOIN_GATE_ALREADY_STARTED');
		this._started = true;
		if (this.state !== STATES.IDLE) throw new Error('E_JOIN_GATE_NOT_IDLE');

		this._attach();
		this._setState(STATES.PACK_PENDING);

		try {
			this.client.write('login', {});
			if (!this.client.loginSent) throw new Error('E_LOGIN_NOT_SENT');
			this.loginWrites = 1;

			this.real.write('add_resource_pack', {
				uuid: this.resourcePack.uuid,
				url: this.resourcePack.url,
				hash: this.resourcePack.hash,
				forced: true,
				promptMessage: this.promptMessage
			});
			this.packWrites = 1;
		} catch (error) {
			this._fail('E_PACK_SEND_FAILED', errorDetail(error));
			return this;
		}

		this._armTimer();
		return this;
	}

	_onStatus(packet) {
		if (!packet) return;
		const uuid = normalizeUuid(packet.uuid);
		const result = packet.result;

		if (this.state !== STATES.PACK_PENDING) {
			this.ignoredStatuses.push({
				reason: 'late',
				uuid,
				result,
				state: this.state
			});
			return;
		}

		if (uuid !== this.packUuid) {
			this.ignoredStatuses.push({ reason: 'uuid', uuid, result });
			return;
		}

		if (!Number.isInteger(result) || result < 0 || result > 7) {
			this._fail('E_PACK_STATUS_UNKNOWN', { result });
			return;
		}

		this.acceptedStatuses.push(result);

		if (result === RESOURCE_PACK_STATUS.SUCCESSFULLY_LOADED) {
			this._onLoaded();
			return;
		}

		if (PROGRESS_STATUSES.includes(result)) {
			this.progressStatuses.push(result);
			return;
		}

		this._fail(FAILURE_CODES[result], {
			result,
			status: STATUS_NAMES[result]
		});
	}

	_onLoaded() {
		if (this.state !== STATES.PACK_PENDING) return;

		this._clearTimer();
		this.loaded = true;
		this._setState(STATES.CONNECTING);
		this.emit('success', { status: RESOURCE_PACK_STATUS.SUCCESSFULLY_LOADED });

		try {
			if (typeof this.client.openSession === 'function') {
				this.client.openSession();
			}
			if (typeof this.client.sendInitialPosition === 'function') {
				this.client.sendInitialPosition();
			}
			if (this.onWorldReady) this.onWorldReady();
			this.emit('world');
		} catch (error) {
			this._fail('E_PACK_SUCCESS_HANDLER_FAILED', errorDetail(error));
			return;
		}

		Promise.resolve()
			.then(() => this.connect(this.client))
			.then(() => {
				if (this.state !== STATES.CONNECTING) return;
				if (this.client.ended) {
					this._fail('E_PACK_CLIENT_DISCONNECTED');
					return;
				}
				this._cleanup();
				this._setState(STATES.CONNECTED);
				this.emit('connected');
				this.emit('terminal', { state: STATES.CONNECTED });
			})
			.catch((error) => {
				this._fail('E_PACK_CONNECT_FAILED', errorDetail(error));
			});
	}

	_onEnd() {
		if (this.state === STATES.FAILED || this.state === STATES.CLOSED) return;
		this._fail('E_PACK_CLIENT_DISCONNECTED');
	}

	_onError(error) {
		if (this.state === STATES.FAILED || this.state === STATES.CLOSED) return;
		this._fail('E_PACK_CLIENT_ERROR', errorDetail(error));
	}

	_cleanup() {
		this._clearTimer();
		this._detach();
		this.cleaned = true;
	}

	_fail(code, detail) {
		if (
			this.state === STATES.FAILED ||
			this.state === STATES.CLOSED ||
			this.state === STATES.CONNECTED
		) {
			return;
		}
		this._cleanup();
		this.failure = Object.freeze({ code, detail });
		this._setState(STATES.FAILED);
		this.emit('failure', this.failure);
		this.emit('cleanup', { code, cleaned: this.cleaned });
		this.emit('terminal', { state: STATES.FAILED, code });

		try {
			if (!this.real.ended && typeof this.real.end === 'function') {
				this.real.end('Resource pack load failed: ' + code);
			}
		} catch (_error) {
			// The connection is already terminal; a failed end is not actionable.
		}
	}
}

class JoinAdmission {
	constructor() {
		this.active = null;
	}

	isPending() {
		return Boolean(this.active && this.active.isPending());
	}

	get busy() {
		return this.isPending();
	}

	tryReserve(gate) {
		if (!gate) return false;
		if (this.isPending()) return false;
		this.active = gate;
		gate.once('terminal', () => this.release(gate));
		return true;
	}

	release(gate) {
		if (this.active === gate) this.active = null;
	}
}

module.exports = {
	STATES,
	RESOURCE_PACK_STATUS,
	STATUS_NAMES,
	PROGRESS_STATUSES,
	FAILURE_CODES,
	DEFAULT_PACK_TIMEOUT_MS,
	DEFAULT_PROMPT,
	JoinGate,
	JoinAdmission,
	normalizeUuid,
	packPrompt
};
