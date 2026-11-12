// ==UserScript==
// @name         BloxdCommunication
// @namespace    http://7granddadpgn.github.io
// @version      2026.11.11.1
// @description  A browser script made to generate tokens on bloxd.io
// @author       7GrandDad
// @match        https://bloxd.io/*
// @icon         https://bloxd.io/favicon.png
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      bloxd.io
// @connect      *.bloxd.io
// @run-at       document-start
// ==/UserScript==

async function getTurnstileToken() {
    return new Promise((resolve, reject) => {
        if (!unsafeWindow.turnstile) {
            reject(new Error('Turnstile is not loaded'));
            return;
        }
        unsafeWindow.turnstile.render("#arthurisstupid", {
            sitekey: "0x4AAAAAAAa4cz8QxEw-M2SE",
            theme: "dark",
            action: "Greenlight",
            retry: "never",
            "refresh-expired": "never",
            callback: function(token) {
                if (this.wrapper) this.wrapper.remove();
                resolve(token);
            }
        });
    });
}

(async function() {
	'use strict';
	const screen = document.createElement('div');
	screen.id = 'arthurisstupid';
	screen.style = "position: absolute; width: 100%; height: 100%; z-index: 10";
	const status = document.createElement('h');
	status.textContent = 'Bloxd Communication Script Status: Not Connected';
	status.style = "font-size: 2.2em; color: #FFF";
	screen.appendChild(status);

	let tokenSocket = null;
	let tokenRetry = null;

	function getBrowserToken() {
		try {
			const storage = unsafeWindow.localStorage || window.localStorage;
			for (const key of ['___Secure-3PSIDMC', '3PSIDMC']) {
				const value = storage.getItem(key);
				if (value && value !== 'undefined') return value;
			}
		} catch (_error) {}
		try {
			const cookie = document.cookie
				.split('; ')
				.find((entry) => entry.startsWith('___Secure-3PSIDMC='));
			return cookie ? decodeURIComponent(cookie.slice('___Secure-3PSIDMC='.length)) : null;
		} catch (_error) {
			return null;
		}
	}

	function createSocket(url) {
		const WebSocketImpl = unsafeWindow.WebSocket || window.WebSocket;
		if (!WebSocketImpl) throw new Error('WebSocket is not available');
		return new WebSocketImpl(url);
	}

	function sendBrowserToken() {
		if (tokenSocket) return;
		const token = getBrowserToken();
		if (!token) {
			status.textContent = 'Bloxd Communication Script Status: 3PSIDMC token not found';
			tokenRetry = setTimeout(sendBrowserToken, 3000);
			return;
		}
		try {
			tokenSocket = createSocket('ws://127.0.0.1:6875');
		} catch (_error) {
			tokenRetry = setTimeout(sendBrowserToken, 3000);
			return;
		}
		tokenSocket.onopen = () => {
			status.textContent = 'Bloxd Communication Script Status: 3PSIDMC token sent';
			tokenSocket.send(JSON.stringify({ type: '3PSIDMC', value: token }));
		};
		tokenSocket.onmessage = () => {
			if (tokenSocket && tokenSocket.readyState === 1) {
				tokenSocket.send(JSON.stringify({ type: '3PSIDMC', value: token }));
			}
		};
		tokenSocket.onerror = () => {};
		tokenSocket.onclose = () => {
			tokenSocket = null;
			tokenRetry = setTimeout(sendBrowserToken, 3000);
		};
	}

	sendBrowserToken();

	let socialSocket = null;
	let socialRetry = null;

	function getGMRequest() {
		if (typeof GM_xmlhttpRequest === 'function') return GM_xmlhttpRequest;
		if (typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function') {
			return GM.xmlHttpRequest.bind(GM);
		}
		return null;
	}

	function pageSocialFetch(url, body) {
		const pageFetch = typeof unsafeWindow !== 'undefined' && unsafeWindow.fetch
			? unsafeWindow.fetch.bind(unsafeWindow)
			: fetch;
		return pageFetch(url, {
			method: 'POST',
			credentials: 'include',
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json'
			},
			body
		}).then(async (response) => ({
			status: response.status,
			statusText: response.statusText || '',
			body: await response.text()
		}));
	}

	function browserSocialFetch(url, body) {
		return new Promise((resolve, reject) => {
			const request = getGMRequest();
			if (!request) {
				pageSocialFetch(url, body).then(resolve, reject);
				return;
			}

			const fallback = () => pageSocialFetch(url, body).then(resolve, reject);
			request({
				method: 'POST',
				url,
				headers: {
					'Accept': 'application/json',
					'Content-Type': 'application/json',
					'Origin': 'https://bloxd.io',
					'Referer': 'https://bloxd.io/'
				},
				data: body,
				timeout: 12000,
				withCredentials: true,
				onload: (response) => {
					if (response.status === 0) {
						fallback();
						return;
					}
					resolve({
						status: response.status,
						statusText: response.statusText || '',
						body: response.responseText || ''
					});
				},
				onerror: fallback,
				ontimeout: fallback
			});
		});
	}

	function sendSocialResponse(message, response) {
		if (!socialSocket || socialSocket.readyState !== 1) return;
		socialSocket.send(JSON.stringify({
			type: 'social-response',
			id: message.id,
			status: response.status,
			statusText: response.statusText,
			body: response.body
		}));
	}

	function connectSocialSocket() {
		if (socialSocket) return;
		try {
			socialSocket = createSocket('ws://127.0.0.1:6876');
		} catch (_error) {
			socialRetry = setTimeout(connectSocialSocket, 2000);
			return;
		}

		socialSocket.onopen = () => {
			console.log('[BloxdBridge] social bridge connected');
		};

		socialSocket.onmessage = async (event) => {
			let message;
			try {
				message = JSON.parse(event.data);
			} catch (_error) {
				return;
			}
			if (!message || message.type !== 'social-request' || message.id === undefined) return;
			if (typeof message.url !== 'string' || !/^https:\/\/(?:[a-z0-9-]+\.)?bloxd\.io\//i.test(message.url)) {
				sendSocialResponse(message, { status: 0, statusText: '', body: 'invalid social url' });
				return;
			}
			try {
				const response = await browserSocialFetch(message.url, String(message.body || ''));
				sendSocialResponse(message, response);
			} catch (error) {
				sendSocialResponse(message, {
					status: 0,
					statusText: '',
					body: String(error && error.message ? error.message : error)
				});
			}
		};

		socialSocket.onerror = () => {};
		socialSocket.onclose = () => {
			socialSocket = null;
			socialRetry = setTimeout(connectSocialSocket, 2000);
		};
	}

	connectSocialSocket();

	let trafficSocket = null;
	let trafficRetry = null;

	function connectTrafficSocket() {
		if (trafficSocket) return;
		trafficSocket = createSocket('ws://127.0.0.1:6874');
		trafficSocket.onmessage = async (event) => {
			if (event.data.startsWith('request')) {
				status.textContent = 'Bloxd Communication Script Status: Generating token...';
				try {
					const token = await getTurnstileToken();
					if (trafficSocket && trafficSocket.readyState === 1) trafficSocket.send(token);
					status.textContent = 'Bloxd Communication Script Status: Sent!';
				} catch (_error) {
					status.textContent = 'Bloxd Communication Script Status: Token generation failed';
				}
			}
		};

		trafficSocket.onopen = async (event) => {
			status.textContent = 'Bloxd Communication Script Status: Connected!';
		};

		trafficSocket.onerror = () => {};

		trafficSocket.onclose = async (event) => {
			trafficSocket = null;
			status.textContent = 'Bloxd Communication Script Status: Traffic bridge standby';
			trafficRetry = setTimeout(connectTrafficSocket, 2000);
		};
	}

	function mountScreen() {
		if (document.body) {
			document.body.appendChild(screen);
			return;
		}
		setTimeout(mountScreen, 50);
	}

	function clearBloxdCookies() {
		const host = location.hostname;
		const paths = ['/'];
		try {
			const segments = location.pathname.split('/').filter((segment) => segment);
			let accumulated = '';
			for (const segment of segments) {
				accumulated += '/' + segment;
				if (!paths.includes(accumulated)) paths.push(accumulated);
			}
		} catch (_error) {}
		const domains = ['', host, '.' + host, host.replace(/^www\./, ''), '.' + host.replace(/^www\./, '')];
		let cleared = 0;
		try {
			const raw = document.cookie ? document.cookie.split(';') : [];
			for (const pair of raw) {
				const eq = pair.indexOf('=');
				const name = (eq > -1 ? pair.slice(0, eq) : pair).trim();
				if (!name) continue;
				for (const path of paths) {
					for (const domain of domains) {
						const domainPart = domain ? ';domain=' + domain : '';
						try {
							document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=' + path + domainPart;
						} catch (_error) {}
					}
				}
				cleared++;
			}
		} catch (_error) {}
		return cleared;
	}

	function startNewAccount() {
		if (!window.confirm('确定要重置会话并创建新账号吗？\n（会清除 bloxd.io 在本浏览器里的全部 cookie 和 sessionStorage 并刷新页面；不会清除其他本地设置）')) {
			return;
		}
		const cleared = clearBloxdCookies();
		try {
			(unsafeWindow.sessionStorage || window.sessionStorage).clear();
		} catch (_error) {}
		console.log('[BloxdBridge] cleared ' + cleared + ' cookies + sessionStorage; reloading for a new guest account');
		try {
			location.reload();
		} catch (_error) {}
	}

	function mountNewAccountButton() {
		if (document.getElementById('bloxd-new-account')) return;
		if (!document.body) {
			setTimeout(mountNewAccountButton, 50);
			return;
		}
		const button = document.createElement('button');
		button.id = 'bloxd-new-account';
		button.type = 'button';
		button.textContent = '新账号';
		button.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;padding:6px 10px;' +
			'font-size:12px;color:#fff;background:#2ed573;border:none;border-radius:4px;cursor:pointer;opacity:.85';
		button.addEventListener('click', startNewAccount);
		document.body.appendChild(button);
	}

	connectTrafficSocket();
	mountScreen();
	mountNewAccountButton();

    // https://stackoverflow.com/questions/22141205/intercept-and-alter-a-sites-javascript-using-greasemonkey
    if(navigator.userAgent.indexOf("Firefox") != -1) {
        window.addEventListener("beforescriptexecute", function(e) {
            if(!(e.target.src.startsWith('https://challenges.cloudflare.com/turnstile/'))) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, false);
    } else {
        new MutationObserver(async (mutations, observer) => {
            let oldScript = mutations
                .flatMap(e => [...e.addedNodes])
                .filter(e => e.tagName == 'SCRIPT');

            for (const script of oldScript) {
                if (!(script.src.startsWith('https://challenges.cloudflare.com/turnstile/'))) script.type = 'javascript/blocked';
            }
        }).observe(document, {
            childList: true,
            subtree: true,
        });
    }

    const scr = document.createElement('script');
    scr.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoaded';
    (document.head || document.documentElement).appendChild(scr);

	await new Promise(resolve => {
		unsafeWindow.onTurnstileLoaded = resolve;
	});
})();