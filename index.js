const { socialRequest, version, checkLogin, user, languages } = require('./bloxd/types/browser_info.js');
const BloxClient = require('./bloxd/client.js');
const handlers = require('./bloxd/handlers/init.js');
const LegacyClient = require('./mc/client.js');
const { JoinGate, JoinAdmission, DEFAULT_PACK_TIMEOUT_MS } = require('./mc/join-gate.js');
const { buildRegistryTags } = require('./mc/registry_tags.js');
const { createResourcePackServer } = require('./bloxd/resource_pack/server.js');
const { installBloxdDnsOverride } = require('./bloxd/dns_override.js');
const mc = require('minecraft-protocol');
const MC_VERSION = '1.21.11';

function packTimeoutFromEnv(value) {
	const timeout = Number(value);
	return Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_PACK_TIMEOUT_MS;
}

const PACK_TIMEOUT_MS = packTimeoutFromEnv(process.env.BLOXD_PACK_TIMEOUT_MS);

function parsePort(value) {
	if (value === undefined || value === null || value === '') return undefined;
	const port = Number(value);
	return Number.isInteger(port) && port >= 0 && port <= 65535 ? port : undefined;
}

function resolveStartOptions(options = {}) {
	const settings = options && typeof options === 'object' ? options : {};
	const packOptions = Object.assign({}, settings.packOptions || {});

	if (packOptions.zipPath === undefined && process.env.BLOXD_PACK_ZIP) {
		packOptions.zipPath = process.env.BLOXD_PACK_ZIP;
	}
	if (packOptions.manifestPath === undefined && process.env.BLOXD_PACK_MANIFEST) {
		packOptions.manifestPath = process.env.BLOXD_PACK_MANIFEST;
	}
	const envPackPort = parsePort(process.env.BLOXD_PACK_PORT);
	if (packOptions.port === undefined && envPackPort !== undefined) {
		packOptions.port = envPackPort;
	}

	const port =
		settings.port !== undefined
			? settings.port
			: parsePort(process.env.MC_PORT ?? process.env.BLOXD_MC_PORT);
	const host =
		settings.host !== undefined
			? settings.host
			: process.env.MC_HOST ?? process.env.BLOXD_MC_HOST;

	return Object.assign({}, settings, {
		packOptions,
		port,
		host,
		timeoutMs:
			Number.isFinite(settings.timeoutMs) && settings.timeoutMs > 0
				? settings.timeoutMs
				: PACK_TIMEOUT_MS,
		installSignalHandlers: settings.installSignalHandlers === true,
		exitOnSignal: settings.exitOnSignal !== false,
		createPackServer:
			typeof settings.createPackServer === 'function'
				? settings.createPackServer
				: createResourcePackServer,
		createMinecraftServer:
			typeof settings.createMinecraftServer === 'function'
				? settings.createMinecraftServer
				: mc.createServer,
		createLegacyClient:
			typeof settings.createLegacyClient === 'function'
				? settings.createLegacyClient
				: (rawClient, clientOptions) => new LegacyClient(rawClient, clientOptions),
		joinGateFactory:
			typeof settings.joinGateFactory === 'function'
				? settings.joinGateFactory
				: (gateOptions) => new JoinGate(gateOptions)
	});
}

let runtime = null;
let startPromise = null;
let stopPromise = null;
let connected;
let bloxDClient;
let admission = new JoinAdmission();

function installRegistryTags(client) {
	const write = client.write.bind(client);
	let sent = false;
	client.write = function(name, ...args) {
		if (name === 'finish_configuration' && !sent) {
			sent = true;
			write('tags', { tags: buildRegistryTags() });
		}
		return write(name, ...args);
	};
}

function cleanup(teleport) {
	connected = teleport ?? false;
	Object.values(handlers).forEach((handler) => handler.cleanup(teleport));
}

async function queue(gamemode, roomId) {
	let fetched;
	try {
		fetched = socialRequest('bloxd-matchmake', {
			gameNameWithVariation: gamemode ?? 'skywars',
			lobbyNameOrDiscordContext: roomId,
			languages: languages
		});
	} catch (exception) {
		fetched = {text: function() { return exception; }};
	}
	return fetched;
}

async function connect(client, requeue, gamemode, roomId) {
	if (requeue) {
		if (bloxDClient) {
			bloxDClient.disconnect();
		}

		client.write('respawn', {
			dimension: 0,
			difficulty: 2,
			gamemode: 0,
			levelType: 'FLAT'
		});
	}
	cleanup(true);

	let fetched;
	for (let i = 0; i < 2; i++) {
		fetched = await queue(gamemode, roomId);
		if (!fetched.ok) {
			if (fetched.statusText == 'Unauthorized' && i <= 0) {
				await checkLogin();
				continue;
			}

			client.end(`Queue request failed: ${fetched.statusText ?? 'Disconnected'}`);
			return;
		} else {
			break;
		}
	}

	fetched = await fetched.json();
	const gameServerHost = fetched && fetched.gameServerHost;
	if (typeof gameServerHost !== 'string' || gameServerHost.length === 0) {
		const keys = fetched && typeof fetched === 'object' ? Object.keys(fetched).join(',') : typeof fetched;
		console.log(`\x1b[31m[*] Matchmake response has no gameServerHost (keys: ${keys})\x1b[0m`);
		client.end('Matchmaking failed: Bloxd returned no game server host. Please update the pinned build and report this log.');
		return;
	}
	console.log(`\x1b[36m[*] Connecting to wss://${gameServerHost} : Lobby ${fetched.lobbyName} : ${fetched.gameNameWithVariation}\x1b[0m`);
	if (client.ended) return;

	try {
		bloxDClient = new BloxClient(fetched, (message) => {
			console.log(`\x1b[31m[*] Bloxd room closed: ${message}\x1b[0m`);
			client.end(message);
		});
	} catch (error) {
		console.log(`\x1b[31m[*] Failed to create the Bloxd client: ${error && error.message}\x1b[0m`);
		client.end(`Failed to join the Bloxd room: ${error && error.message ? error.message : error}`);
		return;
	}

	bloxDClient.name = user.name;
	bloxDClient.on('SPacketJoinGame', (data) => {
		bloxDClient.pass = data.pass;
		console.log(`\x1b[36m[*] Joined Bloxd room (${bloxDClient.gameName} / lobby ${bloxDClient.lobbyName})\x1b[0m`);

		Object.values(handlers).forEach((handler) => handler.bloxd(bloxDClient, data));
		bloxDClient.emitInitialSettings();
		setTimeout(() => {
			if (!bloxDClient || !bloxDClient.connected) return;
			const chunkPackets = (handlers.world && handlers.world.chunkDataPackets) || 0;
			const mapChunks = (client && client.mapChunkWrites) || 0;
			if (chunkPackets === 0 || mapChunks === 0) {
				const entity = handlers.entity || {};
				console.log(`\x1b[33m[*] Terrain diagnostic: Bloxd chunk packets=${chunkPackets}, map_chunk writes=${mapChunks}, local.spawned=${entity.local && entity.local.spawned}, entitySetting=${JSON.stringify(entity.lastEntitySetting)} (lobby ${bloxDClient.lobbyName}).\x1b[0m`);
			}
		}, 20000).unref();
		// The play login is sent once by the resource-pack gate before this
		// connect() ever runs. Sending it here again would duplicate world login.
	});

	bloxDClient.on('SPacketKick', (data) => {
		console.log(`\x1b[31m[*] Kicked by Bloxd: ${data}\x1b[0m`);
		client.end(data);
	});
}

function emitLifecycle(settings, events, name, details) {
	const event = Object.assign({ name, at: Date.now() }, details || {});
	events.push(event);
	if (typeof settings.onEvent === 'function') settings.onEvent(event);
}

function resourcePackFromServer(packServer) {
	return Object.freeze({
		uuid: packServer.uuid,
		url: packServer.url,
		hash: packServer.sha1
	});
}

function minecraftPortOf(server) {
	if (!server || !server.socketServer) return null;
	const address = server.socketServer.address();
	return address && typeof address.port === 'number' ? address.port : null;
}

function waitForMinecraftListening(server) {
	return new Promise((resolve, reject) => {
		if (!server || !server.socketServer) {
			reject(new Error('E_MINECRAFT_SERVER_REQUIRED'));
			return;
		}
		if (server.socketServer.listening) {
			resolve();
			return;
		}

		let settled = false;
		const finish = (error) => {
			if (settled) return;
			settled = true;
			server.removeListener('listening', onListening);
			server.removeListener('error', onError);
			if (error) reject(error);
			else resolve();
		};
		const onListening = () => finish();
		const onError = (error) => finish(error);

		server.once('listening', onListening);
		server.once('error', onError);
	});
}

function closeMinecraftServer(server) {
	return new Promise((resolve) => {
		if (!server || !server.socketServer) {
			resolve();
			return;
		}
		const socketServer = server.socketServer;
		if (!socketServer.listening) {
			resolve();
			return;
		}

		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			socketServer.removeListener('close', finish);
			resolve();
		};
		const timer = setTimeout(finish, 2000);
		if (typeof timer.unref === 'function') timer.unref();
		socketServer.once('close', finish);

		try {
			const clients =
				server.clients && typeof server.clients === 'object'
					? Object.values(server.clients)
					: [];
			for (const client of clients) {
				try {
					client.end('ServerShutdown');
				} catch (_error) {
					// best-effort shutdown
				}
			}
			server.close();
		} catch (_error) {
			finish();
		}
	});
}

function installSignalHandlers(target) {
	const onSignal = (signal) => {
		handleSignal(signal).catch((error) => {
			console.error(
				`\x1b[31m[*] Shutdown failed: ${error.code ?? error.message ?? error}\x1b[0m`
			);
			process.exitCode = 1;
		});
	};
	const signalHandlers = {
		SIGINT: () => onSignal('SIGINT'),
		SIGTERM: () => onSignal('SIGTERM'),
		exit: () => forceCloseSync(target)
	};

	process.on('SIGINT', signalHandlers.SIGINT);
	process.on('SIGTERM', signalHandlers.SIGTERM);
	process.on('exit', signalHandlers.exit);
	target.signalHandlers = signalHandlers;
}

function removeSignalHandlers(target) {
	const signalHandlers = target && target.signalHandlers;
	if (!signalHandlers) return;
	process.removeListener('SIGINT', signalHandlers.SIGINT);
	process.removeListener('SIGTERM', signalHandlers.SIGTERM);
	process.removeListener('exit', signalHandlers.exit);
	target.signalHandlers = null;
}

function forceCloseSync(target) {
	if (!target) return;
	try {
		if (target.packServer) target.packServer.close();
	} catch (_error) {
		// best-effort exit cleanup
	}
	try {
		if (target.server && target.server.socketServer) target.server.close();
	} catch (_error) {
		// best-effort exit cleanup
	}
}

async function doStart(settings) {
	const events = [];
	let packServer = null;
	let server = null;

	try {
		// Preflight happens synchronously inside the constructor: the ZIP,
		// manifest, entry CRCs and every model/texture reference are validated
		// before any socket exists.
		packServer = settings.createPackServer(settings.packOptions);
		emitLifecycle(settings, events, 'preflight', {
			uuid: packServer.uuid,
			sha1: packServer.sha1,
			size: packServer.size
		});

		// The pack endpoint must be listening before Minecraft accepts clients.
		await packServer.listen();
		emitLifecycle(settings, events, 'packListening', {
			url: packServer.url,
			port: packServer.port
		});

		const minecraftOptions = {
			'online-mode': false,
			motd: '\u00a76' + ' '.repeat(10) + 'Bloxd Translation Layer \u00a7c[1.21.11]\n\u00a7a' + ' '.repeat(17) + 'Made by 7GrandDad',
			favicon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAARFJREFUeF7tmTEOAUEUhncuoVEujUJJJxRbbKJRuACNRkTlDDQieheQUCq2IEoliQalc3CDX/Gq8b5tXyY7+fPe983shmZa+iSOn0AAdAAjAAMcMzABglgAC2ABLIAFHCeABtEgGkSDaNCxBLgMoUE0iAbRoNTgLGtELYl5cZH7/wlBAqADGAEYEHMCQBALGDV4ur/lBPQ7Z1kf1JemCdpcp3L99tiS9XatbDsHEAAdwAjAAJUAEMQCkWtwN+rK7wH5ai8ZUK2ksn4YZ6ZzQL4u5PrH86XfP+npcwAB0AGMAAxQlACCWODPNXhbDH3/HicAOoARgAGm20rkiwMQBIJAEAhGzjHT9oEgFsACWMC1Bb7sOyCgfI4PEQAAAABJRU5ErkJggg==',
			maxPlayers: 1,
			keepAlive: true,
			version: MC_VERSION,
			errorHandler: (rawClient, error) => {
				const message = error && error.message ? error.message : String(error);
				console.log(`\x1b[31m[*] Minecraft connection error: ${message}\x1b[0m`);
				try {
					if (typeof rawClient.end === 'function') rawClient.end(message);
				} catch (_endError) {}
			}
		};
		if (settings.port !== undefined) minecraftOptions.port = settings.port;
		if (settings.host !== undefined) minecraftOptions.host = settings.host;

		server = settings.createMinecraftServer(minecraftOptions);
		emitLifecycle(settings, events, 'minecraftCreated', {
			requestedPort: settings.port === undefined ? null : settings.port,
			requestedHost: settings.host === undefined ? null : settings.host
		});

		await waitForMinecraftListening(server);
		emitLifecycle(settings, events, 'minecraftListening', {
			port: minecraftPortOf(server)
		});

		connected = undefined;
		bloxDClient = undefined;
		admission = new JoinAdmission();

		server.on('login', function(rawClient) {
			installRegistryTags(rawClient);
		});

		server.on('playerJoin', async function(rawClient) {
			if (connected || admission.isPending()) {
				rawClient.end('A player is already logged in!');
				return;
			}

			if (rawClient.username == undefined || rawClient.uuid == undefined) {
				rawClient.end('Missing Username / UUID, please ensure you are using a valid cracked Minecraft account!');
				return;
			}

			if (rawClient.protocolVersion != 774) {
				const message =
					'Unsupported Minecraft protocol version; please use Minecraft 1.21.11 (protocol 774).';
				const error = new Error(message);
				error.code = 'E_UNSUPPORTED_PROTOCOL_VERSION';
				emitLifecycle(settings, events, 'clientRejected', {
					code: error.code,
					protocolVersion: rawClient.protocolVersion
				});
				console.log(`\x1b[33m[*] ${message} (${error.code})\x1b[0m`);
				rawClient.end(message);
				return;
			}

			const client = settings.createLegacyClient(rawClient, {
				version: MC_VERSION,
				deferInitialPosition: true,
				gateSession: true
			});

			const gate = settings.joinGateFactory({
				client,
				resourcePack: resourcePackFromServer(packServer),
				timeoutMs: settings.timeoutMs,
				connect: () => connect(client),
				onWorldReady: () => {
					Object.values(handlers).forEach((handler) => handler.minecraft(client));
				}
			});

			if (!admission.tryReserve(gate)) {
				rawClient.end('A player is already logged in!');
				return;
			}

			gate.on('failure', (failure) => {
				console.log(`\x1b[31m[*] Resource pack gate failed: ${failure.code}\x1b[0m`);
			});

			gate.once('connected', () => {
				connected = !client.ended;
			});

			client.on('error', function(error) {
				console.log(`\x1b[33m[*] Minecraft client socket error: ${error && error.message ? error.message : error}\x1b[0m`);
			});

			client.on('end', function() {
				if (bloxDClient) bloxDClient.disconnect();
				cleanup();
			});

			gate.start();
		});

		const target = {
			packServer,
			server,
			events,
			packUrl: packServer.url,
			packUuid: packServer.uuid,
			packSha1: packServer.sha1,
			packPort: packServer.port,
			minecraftPort: minecraftPortOf(server),
			exitOnSignal: settings.exitOnSignal,
			signalHandlers: null,
			describe() {
				return {
					packUrl: this.packUrl,
					packUuid: this.packUuid,
					packSha1: this.packSha1,
					packPort: this.packPort,
					minecraftPort: this.minecraftPort,
					events: this.events.map((event) => event.name)
				};
			}
		};

		runtime = target;
		if (settings.installSignalHandlers) installSignalHandlers(target);

		return target;
	} catch (error) {
		runtime = null;
		if (packServer) await packServer.close().catch(() => {});
		if (server) await closeMinecraftServer(server);
		throw error;
	}
}

async function start(options = {}) {
	if (runtime) return runtime;
	if (startPromise) return startPromise;

	const settings = resolveStartOptions(options);
	startPromise = doStart(settings);
	try {
		return await startPromise;
	} finally {
		startPromise = null;
	}
}

function stop() {
	if (stopPromise) return stopPromise;
	const target = runtime;
	if (!target) return Promise.resolve();

	stopPromise = (async () => {
		removeSignalHandlers(target);
		try {
			if (target.packServer) await target.packServer.close();
		} catch (_error) {
			// keep shutting down the Minecraft side even if the HTTP close fails
		}
		await closeMinecraftServer(target.server);

		if (runtime === target) {
			runtime = null;
			connected = undefined;
			bloxDClient = undefined;
			admission = new JoinAdmission();
		}
	})();

	return stopPromise.finally(() => {
		stopPromise = null;
	});
}

async function handleSignal(signal) {
	const target = runtime;
	if (!target) return;
	console.log(`\x1b[33m[*] Received ${signal}, shutting down...\x1b[0m`);
	await stop();
	if (target.exitOnSignal) process.exit(0);
}

function getRuntime() {
	return runtime;
}

async function bootstrap() {
	Object.values(handlers).forEach((handler) => handler.obtainHandlers(handlers, connect));
	console.log('\x1b[33mBloxd Translation Layer Started!\nDeveloped & maintained by 7GrandDad (https://youtube.com/c/7GrandDadVape)\nVersion: v' + version + ' / Bloxd protocol ' + version + ' / Minecraft ' + MC_VERSION + '\x1b[0m');
	await checkLogin();
	handlers.misc.friends.refreshData();
}

async function main() {
	try {
		installBloxdDnsOverride();
	} catch (_error) {}
	try {
		await start({ installSignalHandlers: true, exitOnSignal: true });
		await bootstrap();
	} catch (error) {
		console.error(
			`\x1b[31m[*] Startup failed: ${error.code ?? error.message ?? error}\x1b[0m`
		);
		process.exitCode = 1;
		await stop().catch(() => {});
	}
}

module.exports = {
	start,
	stop,
	handleSignal,
	getRuntime,
	bootstrap,
	resourcePackFromServer,
	MC_VERSION
};

if (require.main === module) {
	main();
}
