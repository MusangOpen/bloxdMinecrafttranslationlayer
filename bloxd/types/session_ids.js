'use strict';

/*
 * Play/visit session ids for the Bloxd join payload.
 *
 * 853 sends `playSessionId` (per game, reused while activity is fresh) and
 * `visitSessionId` (per page visit) in the Colyseus join options. The browser
 * keeps both in localStorage; a Node middleman keeps them in memory with the
 * same 5 minute freshness window.
 */

const crypto = require('crypto');

const ID_LENGTH = 21;
const ID_PATTERN = /^[A-Za-z0-9_-]{21}$/;
const EXPIRY_MS = 5 * 60 * 1000;

function genSessionId(length = ID_LENGTH) {
	const bytes = new Uint8Array(length);
	if (typeof crypto.getRandomValues === 'function') {
		crypto.getRandomValues(bytes);
	} else {
		const filled = crypto.randomBytes(length);
		for (let i = 0; i < length; i++) bytes[i] = filled[i];
	}
	let out = '';
	for (const raw of bytes) {
		const value = raw & 63;
		if (value < 36) out += value.toString(36);
		else if (value < 62) out += (value - 26).toString(36).toUpperCase();
		else if (value > 62) out += '-';
		else out += '_';
	}
	return out;
}

function isValidSessionId(value) {
	return typeof value === 'string' && value.length === ID_LENGTH && ID_PATTERN.test(value);
}

const playSessions = new Map();
let visitSession = null;
let visitSessionAt = 0;

function playSessionId(gameName, now = Date.now()) {
	const key = String(gameName);
	const entry = playSessions.get(key);
	if (entry && now - entry.at <= EXPIRY_MS && isValidSessionId(entry.id)) {
		entry.at = now;
		return entry.id;
	}
	const id = genSessionId();
	playSessions.set(key, { id, at: now });
	return id;
}

function visitSessionId(now = Date.now()) {
	if (visitSession && now - visitSessionAt <= EXPIRY_MS && isValidSessionId(visitSession)) {
		visitSessionAt = now;
		return visitSession;
	}
	visitSession = genSessionId();
	visitSessionAt = now;
	return visitSession;
}

function resetSessionIds() {
	playSessions.clear();
	visitSession = null;
	visitSessionAt = 0;
}

module.exports = {
	ID_LENGTH,
	ID_PATTERN,
	EXPIRY_MS,
	genSessionId,
	isValidSessionId,
	playSessionId,
	visitSessionId,
	resetSessionIds
};
