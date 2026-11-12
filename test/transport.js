#!/usr/bin/env node
'use strict';

/*
 * Fixed 853 transport/auth checks.
 *
 * Expected transport values come from the pinned evidence in
 * `.research/trkzmh-853-audit/transport-vectors-853.json` and the generated 853
 * schemas in `.research/trkzmh-853-audit/generated/*`, not from the production
 * cipher implementation. The production client is only the object under test.
 *
 * Modes:
 *   node test/transport.js
 *   node test/transport.js --self-test changed-key
 *   node test/transport.js --self-test duplicate-version-source
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { Type } = require('avsc');

const ROOT = path.resolve(__dirname, '..');
const TARGET_FILE = path.join(ROOT, 'bloxd', 'protocol', 'target.js');
const BUILD_DIR = path.join(ROOT, '.research', 'builds', '7rp1w-57cd8edd');
const GENERATED_DIR = path.join(ROOT, '.research', '7rp1w-audit', 'generated');
const EVIDENCE_FILE = path.join(ROOT, '.research', '7rp1w-audit', 'transport-vectors-856.json');

const TARGET = require(TARGET_FILE);
const protocol = require('../bloxd/protocol/live.js');
const browserInfo = require('../bloxd/types/browser_info.js');
const anticheat = require('../bloxd/types/anticheat_constants.js');
const BloxClient = require('../bloxd/client.js');

// Frozen inputs/outputs from the pinned evidence. Do not compute these from
// production code: the client under test must reproduce these exact values.
const PINNED = Object.freeze({
  "build": "7rp1w",
  "buildVersion": "57cd8edd",
  "version": 856,
  "mainSha256": "5b55225a3b3758475fb4a6538ba3170c05a26394fcd878deacf649ecc94dd205",
  "sendKey": 9423,
  "expKey": 42,
  "secondPassOffset": 5,
  "lengthMultiplier": 3,
  "masks": {
    "primary": 9399,
    "secondary": 9451
  },
  "binary": [
    {
      "name": "CPacketOutbound14",
      "logicalId": 14,
      "pass": [
        10,
        20,
        30,
        40,
        50,
        60,
        70,
        80,
        90,
        100
      ],
      "expectedMask": 9399,
      "expectedWireId": 9401,
      "plainHex": "046162",
      "expectedHex": "dedcc2",
      "value": "ab"
    },
    {
      "name": "CPacketOutbound14",
      "logicalId": 14,
      "pass": [
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10
      ],
      "expectedMask": 9451,
      "expectedWireId": 9445,
      "plainHex": "046162",
      "expectedHex": "ef8b87",
      "value": "ab"
    }
  ],
  "inbound": {
    "name": "SPacketInbound9",
    "logicalId": 9,
    "value": "ab",
    "plainHex": "046162"
  },
  "callSites": [
    {
      "name": "CPacketCallSite7",
      "logicalId": 7,
      "wireId": 9392,
      "payload": {
        "marker": "CPacketCallSite7"
      },
      "expected": {
        "marker": "CPacketCallSite7"
      }
    },
    {
      "name": "CPacketShopPurchase",
      "logicalId": 45,
      "wireId": 9370,
      "payload": {
        "category": "Loot",
        "name": "Kit",
        "shopVersion": 1
      },
      "expected": {
        "categoryKey": "Loot",
        "itemKey": "Kit",
        "shopVersion": 1,
        "userInput": null
      }
    },
    {
      "name": "CPacketCallSite55",
      "logicalId": 55,
      "wireId": 9344,
      "payload": {
        "marker": "CPacketCallSite55"
      },
      "expected": {
        "marker": "CPacketCallSite55"
      }
    },
    {
      "name": "CPacketCallSite71",
      "logicalId": 71,
      "wireId": 9456,
      "payload": {
        "marker": "CPacketCallSite71"
      },
      "expected": {
        "marker": "CPacketCallSite71"
      }
    },
    {
      "name": "CPacketCallSite112",
      "logicalId": 112,
      "wireId": 9415,
      "payload": {
        "marker": "CPacketCallSite112"
      },
      "expected": {
        "marker": "CPacketCallSite112"
      }
    },
    {
      "name": "CPacketCloseChest",
      "logicalId": 116,
      "wireId": 9411,
      "expected": null
    }
  ]
});;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function relative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function frame(logicalId, plainPayload, pass, options) {
  const payload = Buffer.from(plainPayload);
  const expKey = options.expKey;
  const sendKey = options.sendKey;
  const offset = options.secondPassOffset;
  const multiplier = options.lengthMultiplier;
  for (let i = 0; i < payload.length; i++) {
    const a = pass[i % pass.length];
    const b = pass[(i + offset) % pass.length];
    payload[i] ^= a ^ expKey ^ (i + payload.length * multiplier) ^ b ^ sendKey;
  }
  const id = (logicalId
    ^ pass[2]
    ^ pass.length
    ^ expKey
    ^ pass[6]
    ^ sendKey) >>> 0;
  return { id, payload };
}

function makeClient(pass) {
  const client = Object.create(BloxClient.prototype);
  client.pass = pass.slice();
  client.connected = true;
  client.frames = [];
  client.room = {
    sendBytes(id, data) {
      client.frames.push({ id: Number(id), data: Buffer.from(data), binary: true });
    },
    send(id, data) {
      client.frames.push({ id: Number(id), data, binary: false });
    }
  };
  return client;
}

function maskFor(pass) {
  return (pass[2]
    ^ pass.length
    ^ PINNED.expKey
    ^ pass[6]
    ^ PINNED.sendKey) >>> 0;
}

// ---------------------------------------------------------------------------
// Source-of-truth scan
// ---------------------------------------------------------------------------

function maskCommentsAndStrings(text) {
  const out = text.split('');
  let state = 'code';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (state === 'code') {
      if (ch === '/' && next === '/') {
        state = 'line';
        out[i] = ' ';
        out[i + 1] = ' ';
        i++;
      } else if (ch === '/' && next === '*') {
        state = 'block';
        out[i] = ' ';
        out[i + 1] = ' ';
        i++;
      } else if (ch === "'" || ch === '"' || ch === '`') {
        state = ch;
        out[i] = ' ';
      }
    } else if (state === 'line') {
      if (ch === '\n' || ch === '\r') state = 'code';
      else out[i] = ' ';
    } else if (state === 'block') {
      if (ch === '*' && next === '/') {
        out[i] = ' ';
        out[i + 1] = ' ';
        i++;
        state = 'code';
      } else if (ch !== '\n' && ch !== '\r') {
        out[i] = ' ';
      }
    } else {
      if (ch === '\\') {
        out[i] = ' ';
        if (i + 1 < text.length) {
          out[i + 1] = ' ';
          i++;
        }
      } else if (ch === state) {
        out[i] = ' ';
        state = 'code';
      } else if (ch !== '\n' && ch !== '\r') {
        out[i] = ' ';
      }
    }
  }
  return out.join('');
}

function walkJavaScript(directory, files) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walkJavaScript(entryPath, files);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(entryPath);
  }
}

function sourceFileList() {
  const files = [path.join(ROOT, 'index.js')];
  walkJavaScript(path.join(ROOT, 'bloxd'), files);
  return files;
}

function collectVersionSources(extraSources) {
  const results = [];
  const scan = (file, text) => {
    const clean = maskCommentsAndStrings(text);
    const match = /\b(840|846|852|853|854|856)\b/.exec(clean);
    if (!match) return;
    results.push({
      file,
      value: Number(match[1]),
      line: clean.slice(0, match.index).split('\n').length
    });
  };
  for (const filePath of sourceFileList()) {
    scan(relative(filePath), fs.readFileSync(filePath, 'utf8'));
  }
  for (const extra of extraSources || []) scan(extra.file, extra.text);
  return results;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const failures = [];
function check(name, fn) {
  try {
    fn();
    console.log('PASS ' + name);
  } catch (err) {
    failures.push({ name, message: err.message });
    console.error('FAIL ' + name + ': ' + err.message);
  }
}

function checkTarget() {
  assert.strictEqual(TARGET.build, PINNED.build, 'target build');
  assert.strictEqual(TARGET.buildVersion, PINNED.buildVersion, 'target build version');
  assert.strictEqual(TARGET.version, PINNED.version, 'target version');
  assert.strictEqual(TARGET.mainBundle.sha256, PINNED.mainSha256, 'target main sha256');
  assert.strictEqual(TARGET.transport.sendKey, PINNED.sendKey, 'target send key');
  assert.strictEqual(TARGET.transport.expKey, PINNED.expKey, 'target exp key');
  assert.strictEqual(protocol.VERSION, TARGET.version, 'protocol VERSION');
  assert.strictEqual(browserInfo.version, TARGET.version, 'browser/auth version');
  assert.strictEqual(anticheat.PACKET_SEND_VER_KEY, PINNED.sendKey, 'anticheat send key');
  assert.strictEqual(anticheat.PACKET_SEND_EXP_KEY, PINNED.expKey, 'anticheat exp key');
  assert.strictEqual(anticheat.PACKET_GEN_VER_KEY, PINNED.version * 5 + 13, 'anticheat generated key');
  assert.strictEqual(anticheat.ATTACK_KEY, Math.floor(PINNED.version / 3) + 4, 'anticheat attack key');
}

function checkTargetEvidence() {
  const evidence = readJson(EVIDENCE_FILE);
  const manifest = readJson(path.join(BUILD_DIR, 'manifest.json'));
  assert.strictEqual(TARGET.mainBundle.sha256, evidence.source.mainSha256, 'main bundle sha256');
  assert.strictEqual(TARGET.generatedManifestSha256, evidence.generatedManifestSha256, 'generated manifest sha256');
  assert.strictEqual(TARGET.mainBundle.url, manifest.mainUrl, 'main bundle url');
  assert.strictEqual(TARGET.sourceUrl, manifest.entryUrl, 'source url');
  assert.strictEqual(evidence.build, PINNED.build, 'evidence build');
  assert.strictEqual(evidence.buildVersion, PINNED.buildVersion, 'evidence build version');
  assert.strictEqual(evidence.protocolVersion, PINNED.version, 'evidence version');
  assert.strictEqual(evidence.source.versionKeyValue, PINNED.sendKey, 'evidence send key');
  assert.strictEqual(evidence.source.constants.expKey, PINNED.expKey, 'evidence exp key');
  assert.strictEqual(evidence.source.constants.secondPass, PINNED.secondPassOffset, 'evidence second pass');
  assert.strictEqual(evidence.source.constants.multiplier, PINNED.lengthMultiplier, 'evidence multiplier');
  assert.deepStrictEqual(evidence.masks, PINNED.masks, 'evidence masks');
  for (const expected of PINNED.binary) {
    const vector = evidence.vectors.find((entry) => entry.packet === expected.name && entry.expectedWireId === expected.expectedWireId);
    assert(vector, 'evidence vector ' + expected.name + '/' + expected.expectedWireId);
    assert.deepStrictEqual(vector.pass, expected.pass, 'evidence pass ' + expected.expectedWireId);
    assert.strictEqual(vector.packet, expected.name, 'evidence packet');
    assert.deepStrictEqual(vector.value, expected.value, 'evidence value');
    assert.strictEqual(vector.plainLogicalId, expected.logicalId, 'evidence logical id');
    assert.strictEqual(vector.plainPayloadHex, expected.plainHex, 'evidence plain payload');
    assert.strictEqual(vector.expectedMask, expected.expectedMask, 'evidence mask');
    assert.strictEqual(vector.expectedWirePayloadHex, expected.expectedHex, 'evidence wire payload');
  }
  for (const expected of PINNED.callSites) {
    const site = evidence.callSites.find((entry) => entry.name === expected.name);
    assert(site, 'evidence call site ' + expected.name);
    assert.strictEqual(site.logicalId, expected.logicalId, 'evidence call site id ' + expected.name);
    assert.strictEqual(site.wireId, expected.wireId, 'evidence call site wire id ' + expected.name);
  }
}

function checkGlobalVersionSource() {
  const sources = collectVersionSources();
  assert.strictEqual(sources.length, 1, 'target version sources: ' + JSON.stringify(sources));
  assert.strictEqual(sources[0].file, 'bloxd/protocol/target.js', 'canonical module');
  assert.strictEqual(sources[0].value, PINNED.version, 'canonical version');
  console.log('globalVersionCount=' + sources.length);
}

function checkCipher() {
  for (const vector of PINNED.binary) {
    const expected = frame(vector.logicalId, Buffer.from(vector.plainHex, 'hex'), vector.pass, {
      expKey: PINNED.expKey,
      sendKey: PINNED.sendKey,
      secondPassOffset: PINNED.secondPassOffset,
      lengthMultiplier: PINNED.lengthMultiplier
    });
    assert.strictEqual(expected.id, vector.expectedWireId, 'pinned cipher id');
    assert.strictEqual(expected.payload.toString('hex'), vector.expectedHex, 'pinned cipher payload');
  }
}

function checkBinarySendAndDecode() {
  const generated = readJson(path.join(GENERATED_DIR, 'outbound-schemas.json'));
  const entry = generated.find((candidate) => candidate.id === PINNED.binary[0].logicalId);
  assert(entry, 'generated outbound schema id ' + PINNED.binary[0].logicalId);
  const type = Type.forSchema(entry.schema);

  for (const vector of PINNED.binary) {
    const plain = type.toBuffer(vector.value);
    assert.strictEqual(plain.toString('hex'), vector.plainHex, 'schema encode ' + vector.expectedWireId);
    assert.strictEqual(protocol.OUTBOUND_IDS[vector.name], vector.logicalId, 'declared logical id');
    assert.strictEqual(protocol.isOutboundBinary(vector.name), true, 'binary packet');

    const client = makeClient(vector.pass);
    client.send(vector.name, vector.value);
    assert.strictEqual(client.frames.length, 1, 'one frame sent');
    const sent = client.frames[0];
    assert.strictEqual(sent.binary, true, 'wire payload is binary');
    assert.strictEqual(sent.id, vector.expectedWireId, 'wire id');
    assert.strictEqual(sent.data.toString('hex'), vector.expectedHex, 'wire payload');
    assert.strictEqual(maskFor(vector.pass), vector.expectedMask, 'mask');

    // Undo the pinned payload XOR; XOR is its own inverse.
    const unxorred = Buffer.from(sent.data);
    for (let i = 0; i < unxorred.length; i++) {
      const a = vector.pass[i % vector.pass.length];
      const b = vector.pass[(i + PINNED.secondPassOffset) % vector.pass.length];
      unxorred[i] ^= a ^ PINNED.expKey ^ (i + unxorred.length * PINNED.lengthMultiplier) ^ b ^ PINNED.sendKey;
    }
    assert.strictEqual(unxorred.toString('hex'), vector.plainHex, 'wire payload roundtrip');
    assert.deepStrictEqual(type.fromBuffer(unxorred), vector.value, 'schema decode');  }

  const inboundGenerated = readJson(path.join(GENERATED_DIR, 'inbound-schemas.json'));
  const inboundEntry = inboundGenerated.find((candidate) => candidate.id === PINNED.inbound.logicalId);
  assert(inboundEntry, 'generated inbound schema id ' + PINNED.inbound.logicalId);
  const inboundType = Type.forSchema(inboundEntry.schema);
  const inboundPlain = inboundType.toBuffer(PINNED.inbound.value);
  assert.strictEqual(inboundPlain.toString('hex'), PINNED.inbound.plainHex, 'inbound schema encode');
  assert.strictEqual(protocol.INBOUND_IDS[PINNED.inbound.name], PINNED.inbound.logicalId, 'inbound declared id');
  assert.deepStrictEqual(protocol.decodeInbound(PINNED.inbound.name, inboundPlain), PINNED.inbound.value, 'inbound decode');
}

function checkJsonCallSites() {
  const pass = PINNED.binary[0].pass;
  const mask = maskFor(pass);
  assert.strictEqual(mask, PINNED.masks.primary, 'primary mask');

  for (const callSite of PINNED.callSites) {
    assert.strictEqual(protocol.OUTBOUND_IDS[callSite.name], callSite.logicalId, 'declared id ' + callSite.name);
    assert(protocol.OUTBOUND_JSON[callSite.name], 'json codec ' + callSite.name);
    assert.strictEqual(protocol.isOutboundBinary(callSite.name), false, 'json packet ' + callSite.name);

    const payload = callSite.payload;
    const client = makeClient(pass);
    client.send(callSite.name, payload);
    assert.strictEqual(client.frames.length, 1, 'one json frame ' + callSite.name);
    const sent = client.frames[0];
    assert.strictEqual(sent.binary, false, 'json frame ' + callSite.name);
    assert.strictEqual(sent.id, callSite.wireId, 'wire id ' + callSite.name);
    assert.deepStrictEqual(sent.data, callSite.expected, 'json payload ' + callSite.name);
  }
}

function checkJoinPayload() {
  const colyseusPath = require.resolve('colyseus.js');
  const clientPath = require.resolve('../bloxd/client.js');
  const sessionPath = require.resolve('../bloxd/types/session_ids.js');
  const savedColyseus = require.cache[colyseusPath];
  const previousTrafficCode = browserInfo.matchmaking.trafficCode;
  const sessionIds = require(sessionPath);
  sessionIds.resetSessionIds();
  let captured = null;
  let constructed = 0;

  class FakeClient {
    constructor(url) {
      constructed++;
      this.url = url;
      this.http = { headers: {} };
    }
    joinOrCreate(gameName, payload) {
      captured = { gameName, payload, url: this.url };
      return Promise.resolve({
        onMessage() {},
        onLeave() {},
        leave() {},
        send() {},
        sendBytes() {}
      });
    }
  }

  const matchmake = Object.freeze({
    gameServerHost: 'game-1.bloxd.io:443',
    gameNameWithVariation: 'skywars',
    lobbyName: 11
  });

  try {
    browserInfo.matchmaking.trafficCode = 'transport-join-self-test';
    require.cache[colyseusPath] = {
      id: colyseusPath,
      filename: colyseusPath,
      loaded: true,
      exports: { Client: FakeClient }
    };
    delete require.cache[clientPath];
    const Client = require('../bloxd/client.js');

    const fail = (message) => {
      throw new Error('unexpected client callback: ' + message);
    };

    const joinedClient = new Client(matchmake, fail);
    assert(captured, 'joinOrCreate called');
    assert.strictEqual(constructed, 1, 'exactly one Colyseus client');
    assert.strictEqual(captured.url, 'wss://game-1.bloxd.io:443', 'game server websocket url');
    assert.strictEqual(joinedClient.ip, matchmake.gameServerHost, 'party location host');
    assert.strictEqual(captured.gameName, 'skywars', 'room name');

    const payload = captured.payload;
    assert.strictEqual(payload.version, PINNED.version, 'join payload version');
    assert.strictEqual(payload.version, TARGET.version, 'join payload canonical version');
    assert.deepStrictEqual(payload.cookies, { origin: 'classic' }, 'join cookies');
    assert.strictEqual(payload.isMobile, false, 'join isMobile');
    assert.strictEqual(payload.isUsingCustomGameTexturePack, false, 'join custom texture pack');
    assert.strictEqual(payload.isLoggedIn, false, 'join isLoggedIn');
    assert.strictEqual(payload.lobbyName, 11, 'join lobby name passes through the matchmake value');
    assert.strictEqual(payload.siteUsed, 'bloxd', 'join siteUsed');
    assert.strictEqual(payload.subsiteUsed, 'bloxd', 'join subsiteUsed');
    assert.ok(Array.isArray(payload.languages) && payload.languages.length > 0, 'join languages');
    assert.strictEqual(payload.languages[payload.languages.length - 1], 'En-Gb', 'join language key');
    assert.strictEqual(payload.generalCookies.trafficCode, 'transport-join-self-test', 'join traffic code');
    assert.strictEqual(payload.generalCookies.compliance, 'BLOXD_BLOXD_non-eu_secure=true', 'join compliance');
    assert.strictEqual(payload.generalCookies.joinDiscord, false, 'join discord cookie');
    assert.strictEqual(payload.browserInfo.ua, browserInfo.browser.ua, 'join browser ua');
    assert.match(payload.playSessionId, sessionIds.ID_PATTERN, 'play session id shape');
    assert.match(payload.visitSessionId, sessionIds.ID_PATTERN, 'visit session id shape');
    assert.notStrictEqual(payload.playSessionId, payload.visitSessionId, 'session ids differ');

    captured = null;
    new Client(matchmake, fail);
    assert.strictEqual(captured.payload.playSessionId, payload.playSessionId, 'play session reused for the same game');
    assert.strictEqual(captured.payload.visitSessionId, payload.visitSessionId, 'visit session reused within the process');

    captured = null;
    new Client(Object.assign({}, matchmake, { gameNameWithVariation: 'bedwars' }), fail);
    assert.notStrictEqual(captured.payload.playSessionId, payload.playSessionId, 'play session is per game');
    assert.strictEqual(captured.payload.visitSessionId, payload.visitSessionId, 'visit session is shared');

    captured = null;
    constructed = 0;
    let callbackMessage = null;
    new Client({ gameNameWithVariation: 'skywars', lobbyName: 11 }, (message) => {
      callbackMessage = message;
    });
    assert.match(String(callbackMessage), /gameServerHost/, 'missing host is reported by name');
    assert.strictEqual(constructed, 0, 'no Colyseus client without gameServerHost');
    assert.strictEqual(captured, null, 'no join without gameServerHost');

    console.log('joinVersion=' + payload.version);
  } finally {
    browserInfo.matchmaking.trafficCode = previousTrafficCode;
    sessionIds.resetSessionIds();
    if (savedColyseus) require.cache[colyseusPath] = savedColyseus;
    else delete require.cache[colyseusPath];
    delete require.cache[clientPath];
  }
}

function checkColyseusSchemaVersion() {
  const colyseusVersion = require('colyseus.js/package.json').version;
  const schemaVersion = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'node_modules', '@colyseus', 'schema', 'package.json'), 'utf8')
  ).version;
  const [colyseusMajor, colyseusMinor] = colyseusVersion.split('.').map(Number);
  const [schemaMajor] = schemaVersion.split('.').map(Number);
  assert.strictEqual(colyseusMajor, 0, 'colyseus.js major');
  assert.ok(colyseusMinor >= 16, 'colyseus.js must understand the schema 3 handshake (>= 0.16), got ' + colyseusVersion);
  assert.ok(schemaMajor >= 3, '@colyseus/schema must match bloxd state schema (>= 3), got ' + schemaVersion);
}

function checkBannerSource() {
  const source = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
  assert(source.includes("' / Bloxd protocol ' + version"), 'banner uses the auth version variable');
}

// ---------------------------------------------------------------------------
// Self-tests
// ---------------------------------------------------------------------------

function runSelfTestChangedKey() {
  const vector = PINNED.binary[0];
  const plain = Buffer.from(vector.plainHex, 'hex');
  const good = frame(vector.logicalId, plain, vector.pass, {
    expKey: PINNED.expKey,
    sendKey: PINNED.sendKey,
    secondPassOffset: PINNED.secondPassOffset,
    lengthMultiplier: PINNED.lengthMultiplier
  });
  const wrong = frame(vector.logicalId, plain, vector.pass, {
    expKey: PINNED.expKey,
    sendKey: PINNED.sendKey + 1,
    secondPassOffset: PINNED.secondPassOffset,
    lengthMultiplier: PINNED.lengthMultiplier
  });
  const goodAccepted = good.id === vector.expectedWireId && good.payload.toString('hex') === vector.expectedHex;
  const detected = wrong.id !== vector.expectedWireId || wrong.payload.toString('hex') !== vector.expectedHex;
  const output = {
    ok: false,
    selfTest: 'changed-key',
    code: detected ? 'E_TRANSPORT_KEY_CHANGED' : 'E_TRANSPORT_KEY_CHANGE_NOT_DETECTED',
    detected,
    goodAccepted,
    expectedWireId: vector.expectedWireId,
    changedWireId: wrong.id,
    expectedWirePayloadHex: vector.expectedHex,
    changedWirePayloadHex: wrong.payload.toString('hex')
  };
  console.log(JSON.stringify(output, null, 2));
  process.exit(detected && goodAccepted ? 1 : 2);
}

function runSelfTestDuplicateVersionSource() {
  const real = collectVersionSources();
  const withDuplicate = collectVersionSources([
    { file: '<synthetic>/duplicate.js', text: 'const VERSION = ' + PINNED.version + ';\n' }
  ]);
  const detected = withDuplicate.filter((entry) => entry.value === PINNED.version).length > 1;
  const output = {
    ok: false,
    selfTest: 'duplicate-version-source',
    code: detected ? 'E_DUPLICATE_VERSION_SOURCE' : 'E_DUPLICATE_VERSION_SOURCE_NOT_DETECTED',
    detected,
    realVersionCount: real.length,
    duplicateVersionCount: withDuplicate.filter((entry) => entry.value === PINNED.version).length,
    sources: withDuplicate
  };
  console.log(JSON.stringify(output, null, 2));
  process.exit(detected ? 1 : 2);
}

function main(argv) {
  const selfIndex = argv.indexOf('--self-test');
  if (selfIndex >= 0) {
    const name = argv[selfIndex + 1];
    if (name === 'changed-key') return runSelfTestChangedKey();
    if (name === 'duplicate-version-source') return runSelfTestDuplicateVersionSource();
    console.error('unknown self-test: ' + String(name));
    process.exit(2);
  }

  check('target/version', checkTarget);
  check('target/evidence', checkTargetEvidence);
  check('global-version-source', checkGlobalVersionSource);
  check('pinned-cipher', checkCipher);
  check('binary-send-decode', checkBinarySendAndDecode);
  check('json-call-sites', checkJsonCallSites);
  check('join-payload', checkJoinPayload);
  check('colyseus-schema-version', checkColyseusSchemaVersion);
  check('banner-source', checkBannerSource);

  console.log('sendKey=' + TARGET.transport.sendKey);
  for (const vector of PINNED.binary) {
    console.log('VECTOR ' + vector.name + ' mask=' + vector.expectedMask + ' wireId=' + vector.expectedWireId + ' payload=' + vector.expectedHex);
  }
  console.log('TRANSPORT pass=' + (9 - failures.length) + ' fail=' + failures.length);

  if (failures.length > 0) {
    console.error(JSON.stringify({ ok: false, failures }, null, 2));
    process.exit(1);
  }
  process.exit(0);
}

try {
  main(process.argv.slice(2));
} catch (err) {
  console.error(JSON.stringify({
    ok: false,
    code: err.code || 'E_TRANSPORT_HARNESS_FAILURE',
    message: err.message,
    stack: String(err.stack || '').split('\n').slice(0, 8)
  }, null, 2));
  process.exit(2);
}
