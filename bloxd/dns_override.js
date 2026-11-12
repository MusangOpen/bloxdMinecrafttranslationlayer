'use strict';

const dns = require('node:dns');
const https = require('node:https');

const FAKE_IPV4 = /^198\.(?:18|19)\./;
const GAME_SERVER_HOST = /^game-server-[a-z0-9]+\.bloxd\.io$/i;
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DOH_TIMEOUT_MS = 3000;
const DOH_ENDPOINTS = [
	'https://cloudflare-dns.com/dns-query?type=A&name=',
	'https://dns.alidns.com/resolve?type=A&name='
];

function isFakeIp(address) {
	return typeof address === 'string' && FAKE_IPV4.test(address);
}

function shouldOverride(hostname) {
	return typeof hostname === 'string' && GAME_SERVER_HOST.test(hostname);
}

function requestDoh(endpoint, hostname, timeoutMs) {
	return new Promise((resolve, reject) => {
		const request = https.get(endpoint + encodeURIComponent(hostname), {
			headers: { accept: 'application/dns-json' },
			timeout: timeoutMs
		}, (response) => {
			if (response.statusCode !== 200) {
				response.resume();
				reject(new Error('DoH HTTP ' + response.statusCode));
				return;
			}
			let body = '';
			response.setEncoding('utf8');
			response.on('data', (chunk) => {
				body += chunk;
			});
			response.on('end', () => {
				try {
					resolve(JSON.parse(body));
				} catch (error) {
					reject(error);
				}
			});
		});
		request.on('timeout', () => request.destroy(new Error('DoH timeout')));
		request.on('error', reject);
	});
}

function pickAddresses(payload) {
	const answers = payload && Array.isArray(payload.Answer) ? payload.Answer : [];
	const addresses = [];
	for (const answer of answers) {
		if (!answer || answer.type !== 1) continue;
		const address = String(answer.data || '');
		if (/^\d+\.\d+\.\d+\.\d+$/.test(address) && !isFakeIp(address)) addresses.push(address);
	}
	return addresses;
}

async function resolveViaDoh(hostname) {
	for (const endpoint of DOH_ENDPOINTS) {
		try {
			const addresses = pickAddresses(await requestDoh(endpoint, hostname, DOH_TIMEOUT_MS));
			if (addresses.length > 0) return addresses[0];
		} catch (_error) {}
	}
	return null;
}

function reply(callback, all, address) {
	if (all) {
		callback(null, [{ address, family: 4 }]);
		return;
	}
	callback(null, address, 4);
}

function createDnsOverride(config) {
	const {
		originalLookup,
		resolveHost,
		isFake,
		shouldHandle,
		onFakeIp,
		ttlMs = DEFAULT_TTL_MS,
		now = Date.now
	} = config;
	const cache = new Map();

	return function patchedLookup(hostname, options, callback) {
		let settings = options;
		let done = callback;
		if (typeof settings === 'function') {
			done = settings;
			settings = {};
		}
		if (typeof done !== 'function' || !shouldHandle(hostname)) {
			return originalLookup(hostname, settings, done);
		}
		const all = Boolean(settings && settings.all);
		const cached = cache.get(hostname);
		if (cached && cached.expires > now()) {
			reply(done, all, cached.address);
			return undefined;
		}
		return originalLookup(hostname, settings, (error, address, family) => {
			if (error) {
				done(error);
				return;
			}
			const entries = Array.isArray(address) ? address : [{ address, family }];
			const allFake = entries.length > 0 && entries.every((entry) => entry && isFake(entry.address));
			if (!allFake) {
				done(null, address, family);
				return;
			}
			if (typeof onFakeIp === 'function') onFakeIp(hostname, entries);
			Promise.resolve()
				.then(() => resolveHost(hostname))
				.then((resolved) => {
					if (!resolved) {
						done(null, address, family);
						return;
					}
					cache.set(hostname, { address: resolved, expires: now() + ttlMs });
					reply(done, all, resolved);
				})
				.catch(() => done(null, address, family));
		});
	};
}

function installBloxdDnsOverride(config = {}) {
	if (process.env.BLOXD_DNS_OVERRIDE === 'off') return false;
	if (dns.lookup && dns.lookup.__bloxdDnsOverride) return true;
	const original = dns.lookup;
	let announced = false;
	const patched = createDnsOverride({
		originalLookup: original,
		resolveHost: config.resolveHost || resolveViaDoh,
		isFake: config.isFake || isFakeIp,
		shouldHandle: config.shouldHandle || shouldOverride,
		onFakeIp: (hostname, entries) => {
			if (announced) return;
			announced = true;
			const sample = entries.map((entry) => entry.address).filter(Boolean).join(', ');
			console.log(`\x1b[36m[*] DNS: ${hostname} resolves to proxy fake-ip (${sample}); switching to DoH for game servers.\x1b[0m`);
		},
		ttlMs: config.ttlMs,
		now: config.now
	});
	patched.__bloxdDnsOverride = true;
	dns.lookup = patched;
	return true;
}

module.exports = {
	installBloxdDnsOverride,
	createDnsOverride,
	resolveViaDoh,
	isFakeIp,
	shouldOverride
};
