const fs = require('fs');
const ws = require('ws');
const TARGET = require('../protocol/target.js');
const MCSPConst = 'wqMm7LRJ1jI9sp9B6bWKtsw3fJ7j';
const MCConst = '-OUv0hdWLNE4_EvgagxGBAuuxA5zKtG_kc2KXpv-DupjG-OugR56GFbhNcz0WCQx3Mg7hm-4xA45nErR8275n2PDPQcDclD9mRRgyIAAigWD6xHFj3pSSJwo5XkPpRg3Fg9vEoD7KdcfwXva0SM6CspiVn4IzwFv_PrHcZS7LVXuNSBgC58QHGKxUAS';
const LOGIN_PATH = './login.json';
const SETTINGS_PATH = './settings.json';
const HEADERS = {
	'Accept': 'application/json',
	'Content-Type': 'application/json',
	'Origin': 'https://bloxd.io',
	'sec-fetch-dest': 'empty',
	'sec-fetch-mode': 'cors',
	'sec-fetch-site': 'same-site',
	'Referer': 'https://bloxd.io/',
	'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0'
};
let socialId = 1 + Math.floor(Math.random() * 29);
let lSocket, promise;
const TOKEN_PORT = 6875;
const SOCIAL_PORT = 6876;
let trafficServer = null;
let browserTokenServer = null;
let browserToken = null;
let browserTokenWaiters = [];
let browserSocialServer = null;
let browserSocialSocket = null;
let browserSocialSeq = 0;
const browserSocialPending = new Map();

/**
 * Adds 32 zero's as a base into the specified string.
 * @param {string} input
 * @returns {string}
 */
function addPadding(input) {
	return (input >>> 0).toString(2).padStart(32, '0');
};

/**
 * Generates a random specified character length string.
 * @param {number | undefined} length Random string length
 * @returns {string}
*/
function genString() {
	let length = arguments.length > 0 ? arguments[0] : 21;
	return crypto.getRandomValues(new Uint8Array(length)).reduce(((val, ind) => val += (ind &= 63) < 36 ? ind.toString(36) : ind < 62 ? (ind - 26).toString(36).toUpperCase() : ind > 62 ? '-' : '_'), '');
};

/**
 * Generates a compliant tracking string based on the input.
 * @param {string} input Base input
 * @returns {string}
*/
function complianceString(siteUsed, subsiteUsed, secure = true, euGdpr = false) {
	const normalise = (value) => String(value).replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
	return [normalise(siteUsed), normalise(subsiteUsed), euGdpr ? 'eu-gdpr' : 'non-eu', 'secure=' + (secure ? 'true' : 'false')].join('_');
};

/**
 * Generates the unique MCSP version token.
 * @param {string} input - Padded version number
 * @returns {string}
*/
function gen3PSIDMCSP(input) {
	let token = '';
	return token += input[26],
	token += MCSPConst[9],
	token += input[10],
	token += MCSPConst[24],
	token += input[15],
	token += MCSPConst[23],
	token += MCSPConst[19],
	token += MCSPConst[16],
	token += MCSPConst[7],
	token += input[4],
	token += input[12],
	token += MCSPConst[11],
	token += MCSPConst[3],
	token += input[31],
	token += input[27],
	token += input[9],
	token += input[29],
	token += input[7],
	token += input[16],
	token += input[14],
	token += input[23],
	token += MCSPConst[27],
	token += input[21],
	token += input[0],
	token += MCSPConst[8],
	token += input[18],
	token += MCSPConst[21],
	token += input[25],
	token += MCSPConst[4],
	token += MCSPConst[0],
	token += MCSPConst[10],
	token += MCSPConst[5],
	token += MCSPConst[2],
	token += MCSPConst[14],
	token += input[24],
	token += MCSPConst[13],
	token += input[8],
	token += MCSPConst[1],
	token += input[1],
	token += input[17],
	token += input[6],
	token += MCSPConst[6],
	token += input[20],
	token += input[3],
	token += MCSPConst[20],
	token += MCSPConst[12],
	token += MCSPConst[22],
	token += input[22],
	token += input[19],
	token += MCSPConst[15],
	token += input[5],
	token += input[2],
	token += input[13],
	token += MCSPConst[25],
	token += input[11],
	token += input[30],
	token += MCSPConst[17],
	token += MCSPConst[18],
	token += MCSPConst[26],
	token += input[28],
	token
};

/**
 * Generates the unique MC identifier token.
 * @param {string} input1 - Random string 1
 * @param {string} input2 - Random string 2
 * @param {string | undefined} input3 - Unused string 3
 * @returns {string}
*/
function gen3PSIDMC(input1, input2, input3) {
	let token = '';
	return token += MCConst[30],
	token += input2[17],
	token += MCConst[12],
	token += MCConst[129],
	token += MCConst[11],
	token += MCConst[132],
	token += MCConst[6],
	token += MCConst[176],
	token += MCConst[19],
	token += input2[16],
	token += MCConst[65],
	token += MCConst[45],
	token += MCConst[67],
	token += input2[4],
	token += MCConst[86],
	token += input2[0],
	token += input1[1],
	token += MCConst[146],
	token += MCConst[1],
	token += MCConst[100],
	token += MCConst[11],
	token += MCConst[36],
	token += MCConst[155],
	token += MCConst[97],
	token += MCConst[88],
	token += input1[14],
	token += input1[10],
	token += MCConst[178],
	token += MCConst[166],
	token += MCConst[105],
	token += MCConst[161],
	token += MCConst[93],
	token += MCConst[130],
	token += MCConst[6],
	token += MCConst[87],
	token += MCConst[40],
	token += MCConst[5],
	token += input2[20],
	token += MCConst[16],
	token += MCConst[114],
	token += MCConst[16],
	token += MCConst[96],
	token += input2[7],
	token += input2[14],
	token += MCConst[111],
	token += MCConst[117],
	token += input1[2],
	token += MCConst[107],
	token += MCConst[94],
	token += MCConst[147],
	token += MCConst[17],
	token += MCConst[133],
	token += MCConst[24],
	token += MCConst[7],
	token += input1[19],
	token += MCConst[44],
	token += input2[3],
	token += MCConst[22],
	token += MCConst[164],
	token += MCConst[115],
	token += MCConst[82],
	token += MCConst[153],
	token += MCConst[160],
	token += MCConst[173],
	token += MCConst[27],
	token += MCConst[154],
	token += input2[10],
	token += MCConst[2],
	token += MCConst[58],
	token += MCConst[89],
	token += MCConst[85],
	token += MCConst[62],
	token += input1[7],
	token += input1[15],
	token += MCConst[76],
	token += MCConst[125],
	token += MCConst[51],
	token += input1[13],
	token += MCConst[145],
	token += MCConst[127],
	token += MCConst[143],
	token += MCConst[119],
	token += MCConst[131],
	token += MCConst[10],
	token += MCConst[134],
	token += input2[18],
	token += MCConst[9],
	token += MCConst[43],
	token += input2[8],
	token += MCConst[13],
	token += MCConst[79],
	token += MCConst[20],
	token += MCConst[32],
	token += MCConst[128],
	token += MCConst[120],
	token += input1[0],
	token += MCConst[74],
	token += MCConst[179],
	token += MCConst[23],
	token += MCConst[171],
	token += MCConst[78],
	token += MCConst[124],
	token += MCConst[31],
	token += input2[13],
	token += MCConst[68],
	token += MCConst[182],
	token += input2[6],
	token += input2[12],
	token += MCConst[151],
	token += input1[20],
	token += input1[12],
	token += MCConst[122],
	token += MCConst[15],
	token += input1[11],
	token += MCConst[156],
	token += MCConst[9],
	token += MCConst[104],
	token += MCConst[184],
	token += MCConst[39],
	token += input2[9],
	token += MCConst[168],
	token += MCConst[123],
	token += MCConst[38],
	token += MCConst[177],
	token += MCConst[28],
	token += MCConst[61],
	token += MCConst[57],
	token += MCConst[14],
	token += MCConst[81],
	token += MCConst[113],
	token += MCConst[112],
	token += input2[5],
	token += input1[6],
	token += MCConst[20],
	token += MCConst[83],
	token += MCConst[72],
	token += MCConst[25],
	token += MCConst[162],
	token += MCConst[52],
	token += MCConst[4],
	token += MCConst[169],
	token += MCConst[55],
	token += MCConst[29],
	token += MCConst[48],
	token += MCConst[75],
	token += MCConst[66],
	token += MCConst[163],
	token += input2[15],
	token += MCConst[64],
	token += MCConst[186],
	token += MCConst[5],
	token += MCConst[140],
	token += MCConst[34],
	token += MCConst[118],
	token += MCConst[116],
	token += MCConst[35],
	token += MCConst[4],
	token += MCConst[135],
	token += MCConst[42],
	token += MCConst[73],
	token += MCConst[41],
	token += MCConst[69],
	token += MCConst[3],
	token += MCConst[106],
	token += MCConst[172],
	token += MCConst[91],
	token += MCConst[167],
	token += MCConst[185],
	token += MCConst[77],
	token += MCConst[142],
	token += MCConst[26],
	token += MCConst[110],
	token += MCConst[54],
	token += MCConst[102],
	token += MCConst[17],
	token += MCConst[165],
	token += MCConst[80],
	token += MCConst[181],
	token += MCConst[13],
	token += MCConst[183],
	token += MCConst[53],
	token += MCConst[8],
	token += MCConst[174],
	token += MCConst[90],
	token += MCConst[137],
	token += MCConst[108],
	token += MCConst[18],
	token += input2[19],
	token += MCConst[33],
	token += MCConst[0],
	token += MCConst[70],
	token += MCConst[47],
	token += MCConst[7],
	token += MCConst[158],
	token += MCConst[59],
	token += input1[4],
	token += input1[5],
	token += MCConst[95],
	token += input1[3],
	token += MCConst[84],
	token += MCConst[21],
	token += input1[8],
	token += MCConst[14],
	token += MCConst[50],
	token += MCConst[148],
	token += MCConst[37],
	token += MCConst[159],
	token += MCConst[71],
	token += MCConst[8],
	token += MCConst[3],
	token += input1[16],
	token += MCConst[98],
	token += MCConst[103],
	token += MCConst[121],
	token += input2[1],
	token += input1[9],
	token += MCConst[170],
	token += MCConst[56],
	token += MCConst[18],
	token += input2[2],
	token += MCConst[139],
	token += MCConst[0],
	token += MCConst[99],
	token += MCConst[109],
	token += MCConst[136],
	token += MCConst[46],
	token += MCConst[2],
	token += MCConst[126],
	token += MCConst[15],
	token += MCConst[63],
	token += MCConst[157],
	token += MCConst[180],
	token += MCConst[138],
	token += MCConst[19],
	token += MCConst[49],
	token += MCConst[175],
	token += MCConst[141],
	token += MCConst[152],
	token += input2[11],
	token += input1[18],
	token += MCConst[144],
	token += input1[17],
	token += MCConst[12],
	token += MCConst[101],
	token += MCConst[60],
	token += MCConst[149],
	token += MCConst[10],
	token += MCConst[1],
	token += MCConst[92],
	token += MCConst[150],
	token;
};

/**
 * Generate a random entry index based on the socialWhamm.
 * @param {string} socialWhamm - Base string
 * @param {number} start - Starting index
 * @param {number} length - Max index
 * @returns {number}
*/
function getRandomEntry(socialWhamm, start, length) {
	let result = 0, i = 0;
	if (socialWhamm.length > 0) {
		for (; i < socialWhamm.length; ) {
			result = (result << 5) - result + socialWhamm.charCodeAt(i++) | 0;
		}
	}
	return Math.abs(result) % (length - start) + start;
};

/**
 * Sends a post request to generate the 3PSIDMCPP token.
 * @param {string} expired - Regenerate the trafficCode
*/
async function gen3PSIDMCPP(expired) {
	let data;
	try {
		data = await fetch('https://bloxd.io/index/metrics/cookies', {
			method: 'POST',
			headers: {
				'Cookie': `___Secure-3PSIDMC=${exports.metrics['3PSIDMC']}; bloxd={"bedwars_solo":{}}`,
				...HEADERS
			},
			body: JSON.stringify({
				metricsCookies: exports.metrics
			})
		});
	} catch (err) {
		console.log(`\x1b[31m[*] Bloxd login network error: ${err.message ?? err}\x1b[0m`);
		return;
	}

	if (data && data.ok) {
		try {
			data = await data.json();
		} catch (err) {
			console.log(`\x1b[31m[*] Bloxd login response error: ${err.message ?? err}\x1b[0m`);
			return;
		}
		exports.metrics['3PSIDMCPP'] = data['3PSIDMCPP'];
		exports.user.name = data.name;
		if (data.whamm !== undefined && data.whamm !== null && String(data.whamm).length > 0) {
			exports.user.whamm = String(data.whamm);
		}
		console.log(`\x1b[36m[*] Logged in as ${data.name}\x1b[0m`);
	} else {
		if (data && data.status == 420) {
			console.log(`\x1b[36m[*] Outdated version or unauthorized, please wait for an update!\x1b[0m`);
			return;
		}
		console.log(`\x1b[36m[*] Failed to log in : ${data && data.status}\x1b[0m`);
		return;
	}

	if (expired) {
		await startWebSocketLogic();
		lSocket.send('request');
		try {
			data = await fetch('https://bloxd.io/index/traffic-code', {
				method: 'POST',
				headers: {
					'Cookie': `___Secure-3PSIDMC=${exports.metrics['3PSIDMC']}`,
					...HEADERS
				},
				body: JSON.stringify({
					contents: {
						x: {
							a: await new Promise(resolve => {promise = resolve})
						}
					},
					metricsCookies: exports.metrics
				})
			});
		} catch (err) {
			console.log(`\x1b[31m[*] Bloxd traffic-code network error: ${err.message ?? err}\x1b[0m`);
			return;
		}

		if (data && data.ok) {
			data = await data.json();
			exports.matchmaking.trafficCode = data.trafficCode;
			console.log(`\x1b[36m[*] Generated traffic token!\x1b[0m`);
		} else {
			console.log(`\x1b[36m[*] Failed to generate traffic token : ${data && data.status}\x1b[0m`);
			return;
		}

		fs.writeFileSync(LOGIN_PATH, JSON.stringify({
			'3PSIDMC': exports.metrics['3PSIDMC'],
			trafficCode: exports.matchmaking.trafficCode,
			expireTime: Date.now() + 6048e5
		}));
	}
};

/**
 * Starts the local websocket server for the browser to pass the turnstileToken to.
*/
function ensureTrafficServer() {
	if (trafficServer) return;
	const wsServer = new ws.Server({
		host: '127.0.0.1',
		port: 6874
	});
	trafficServer = wsServer;

	wsServer.on('connection', function(socket) {
		if (lSocket != undefined) {
			socket.terminate();
			return;
		}
		lSocket = socket;

		socket.on('message', function(msg) {
			if (promise) {
				promise(msg.toString('utf8'));
				promise = undefined;
			}
		});

		socket.on('close', function() {
			lSocket = undefined;
		});
	});

	wsServer.on('error', () => {
		trafficServer = null;
		lSocket = undefined;
	});
};

async function startWebSocketLogic() {
	console.log(`\x1b[36m[*] Expired trafficCode, please load up the tampermonkey script to continue.\x1b[0m`);
	ensureTrafficServer();
	if (lSocket != undefined) return;
	await new Promise((resolve) => {
		let loop;
		loop = setInterval(() => {
			if (lSocket != undefined) {
				clearInterval(loop);
				resolve();
			}
		}, 10);
	});
};

function loadSettings() {
	if (fs.existsSync(SETTINGS_PATH)) {
		for (const [name, val] of Object.entries(JSON.parse(fs.readFileSync(SETTINGS_PATH, { encoding: 'utf-8' })))) {
			exports.settings[name] = val;
		}
	} else {
		exports.saveSettings();
	}
}

/**
 * Reads login.json to grab the current 3PSIDMC and trafficCode.
*/
function isBrowserToken(value) {
	return typeof value === 'string' && value.length >= 20 && !/\s/.test(value);
}

function resolveBrowserToken(value) {
	browserToken = value;
	exports.metrics['3PSIDMC'] = value;
	const waiters = browserTokenWaiters.splice(0);
	for (const waiter of waiters) waiter(value);
}

function startTokenBridge() {
	if (browserTokenServer) return;
	try {
		browserTokenServer = new ws.Server({ host: '127.0.0.1', port: TOKEN_PORT });
		browserTokenServer.on('connection', (socket) => {
			socket.on('error', () => {});
			socket.on('message', (raw) => {
				let message;
				try {
					message = JSON.parse(raw.toString('utf8'));
				} catch (_error) {
					return;
				}
				if (!message || message.type !== '3PSIDMC' || !isBrowserToken(message.value)) return;
				resolveBrowserToken(message.value);
				socket.close();
			});
			socket.send(JSON.stringify({ type: 'request-token' }));
		});
		browserTokenServer.on('error', () => {
			browserTokenServer = null;
		});
	} catch (_error) {
		browserTokenServer = null;
	}
}

function waitForBrowserToken(timeoutMs) {
	if (browserToken) return Promise.resolve(browserToken);
	return new Promise((resolve) => {
		let settled = false;
		const finish = (value) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(value);
		};
		browserTokenWaiters.push(finish);
		const timer = setTimeout(() => {
			browserTokenWaiters = browserTokenWaiters.filter((waiter) => waiter !== finish);
			finish(null);
		}, timeoutMs);
		if (typeof timer.unref === 'function') timer.unref();
	});
}

function startSocialBridge() {
	if (browserSocialServer) return;
	try {
		browserSocialServer = new ws.Server({ host: '127.0.0.1', port: SOCIAL_PORT });
		browserSocialServer.on('connection', (socket) => {
			socket.on('error', () => {});
			if (browserSocialSocket && browserSocialSocket !== socket) {
				try {
					browserSocialSocket.terminate();
				} catch (_error) {}
			}
			browserSocialSocket = socket;
			console.log(`\x1b[36m[*] Browser social bridge connected.\x1b[0m`);

			socket.on('message', (raw) => {
				let message;
				try {
					message = JSON.parse(raw.toString('utf8'));
				} catch (_error) {
					return;
				}
				if (!message || message.type !== 'social-response' || message.id === undefined) return;
				const id = String(message.id);
				const pending = browserSocialPending.get(id);
				if (!pending) return;
				browserSocialPending.delete(id);
				clearTimeout(pending.timer);
				pending.resolve({
					status: Number(message.status),
					statusText: typeof message.statusText === 'string' ? message.statusText : '',
					body: typeof message.body === 'string' ? message.body : ''
				});
			});

			socket.on('close', () => {
				if (browserSocialSocket === socket) browserSocialSocket = null;
			});
		});
		browserSocialServer.on('error', () => {
			browserSocialServer = null;
			browserSocialSocket = null;
		});
		console.log(`\x1b[36m[*] Browser social bridge listening on ${SOCIAL_PORT}.\x1b[0m`);
	} catch (_error) {
		browserSocialServer = null;
	}
}

function browserSocialRequest(url, body) {
	return new Promise((resolve) => {
		const socket = browserSocialSocket;
		if (!socket || socket.readyState !== 1) {
			resolve(null);
			return;
		}
		const id = String(++browserSocialSeq);
		const timer = setTimeout(() => {
			browserSocialPending.delete(id);
			resolve(null);
		}, 15000);
		browserSocialPending.set(id, { resolve, timer });
		try {
			socket.send(JSON.stringify({ type: 'social-request', id, url, body }));
		} catch (_error) {
			clearTimeout(timer);
			browserSocialPending.delete(id);
			resolve(null);
		}
	});
}

function makeBrowserResponse(result) {
	if (!result || !Number.isInteger(result.status) || result.status < 100 || result.status > 599) {
		return null;
	}
	try {
		return new Response(result.body, {
			status: result.status,
			statusText: result.statusText,
			headers: {
				'content-type': 'application/json'
			}
		});
	} catch (_error) {
		return null;
	}
}

exports.startTokenBridge = startTokenBridge;
exports.waitForBrowserToken = waitForBrowserToken;
exports.startSocialBridge = startSocialBridge;

exports.checkLogin = async function() {
	startTokenBridge();
	startSocialBridge();
	ensureTrafficServer();
	let expired = true;
	if (fs.existsSync(LOGIN_PATH)) {
		const loginData = JSON.parse(fs.readFileSync(LOGIN_PATH, { encoding: 'utf-8' }));
		exports.metrics['3PSIDMC'] = loginData['3PSIDMC'];
		exports.matchmaking.trafficCode = loginData.trafficCode;
		expired = loginData.expireTime <= Date.now();
	} else {
		console.log(`\x1b[36m[*] Login not found, waiting for a browser 3PSIDMC token.\x1b[0m`);
	}

	if (!fs.existsSync(LOGIN_PATH) || expired) {
		const token = await waitForBrowserToken(30000);
		if (token) {
			console.log(`\x1b[36m[*] Using browser 3PSIDMC token.\x1b[0m`);
		} else {
			console.log(`\x1b[36m[*] Browser 3PSIDMC token not received; using login/random token.\x1b[0m`);
		}
	}

	socialId = 1 + getRandomEntry([
		95, 16, 46, 198, 195, 196, 132,
		72, 201, 215, 26, 113, 110, 77,
		25, 73, 210, 241, 239, 54, 109
	].map((ind) => exports.metrics['3PSIDMC'][ind]).join(''), 0, 29);

	await gen3PSIDMCPP(expired);
	if (exports.user.whamm) {
		socialId = 1 + getRandomEntry(exports.user.whamm, 0, 29);
	}
	console.log(`\x1b[36m[*] Social shard ${socialId}\x1b[0m`);
	loadSettings();
};

exports.saveSettings = function() {
	fs.writeFileSync(SETTINGS_PATH, JSON.stringify(exports.settings));
};

/**
 * Sends a post request to the desginated social url.
 * @param {string} url - POST Endpoint
 * @param {object} data - Content Data
*/
exports.socialRequest = async function(url, data) {
	const targetUrl = url.includes('bloxd.io') ? url : `https://social${socialId}.bloxd.io/social/${url}`;
	const body = JSON.stringify({
		contents: data,
		metricsCookies: exports.metrics
	});
	const headers = {
		...HEADERS,
		'Cookie': [
			`___Secure-3PSIDMC=${exports.metrics['3PSIDMC']}`,
			`___Secure-3PSIDMCPP=${exports.metrics['3PSIDMCPP']}`,
			`___Secure-3PSIDMCSP=${exports.metrics['3PSIDMCSP']}`,
			'bloxd={"bedwars_solo":{}}'
		].join('; ')
	};

	let response;
	try {
		response = await fetch(targetUrl, {
			method: 'POST',
			headers,
			body
		});
	} catch (error) {
		const browserResponse = makeBrowserResponse(await browserSocialRequest(targetUrl, body));
		if (browserResponse) {
			console.log(`\x1b[36m[*] Social request via browser bridge: ${targetUrl}\x1b[0m`);
			return browserResponse;
		}
		throw error;
	}

	if (response.ok) return response;

	const browserResponse = makeBrowserResponse(await browserSocialRequest(targetUrl, body));
	if (browserResponse) {
		console.log(`\x1b[36m[*] Social request via browser bridge: ${targetUrl} (direct HTTP ${response.status})\x1b[0m`);
		return browserResponse;
	}
	return response;
};

exports.gen3PSIDMCPP = gen3PSIDMCPP;
exports.genString = genString;
exports.version = TARGET.version;
exports.languages = ['en-US', 'en', 'En-Gb'];
exports.browser = {
	ua: HEADERS['User-Agent'],
	name: 'Firefox',
	version: '140.0',
	platform: 'Win32',
	platformType: 'desktop',
	deviceType: 'hybrid'
};

exports.metrics = {
	'1PAPISID': 'N/A',
	'1PSID': 'N/A',
	'3PAPISID': 'N/A',
	'3PSID': 'N/A',
	'3PSIDMC': gen3PSIDMC(genString(), genString(), genString()),
	'3PSIDMCPP': 'N/A',
	'3PSIDMCSP': gen3PSIDMCSP(addPadding(exports.version))
};

exports.matchmaking = {
	trafficCode: '',
	compliance: complianceString('bloxd', 'bloxd')
};

exports.user = {
	name: '',
	whamm: ''
};

exports.settings = {
	server_name: 'Bloxd',
	autoNameChange: false,
	nameChangeTime: 0
};