#!/usr/bin/env node
'use strict';

/*
 * Independent 846 compatibility harness.
 *
 * Expected values live in `test/fixtures/846/*.json` and were frozen from the
 * captured tcwczu/357faec1 generated evidence plus explicit baseline evidence.
 * Nothing in this file derives an expected value from production code.
 *
 * Product modules (`bloxd/protocol/live.js`, `bloxd/client.js`, `bloxd/types/*`,
 * `mc/*`) are loaded only as the object under test.
 *
 * Modes:
 *   node test/protocol-846.js
 *     Positive compatibility run (must fail against the current 840 product).
 *   node test/protocol-846.js --only ids,schemas,coverage
 *     Positive run restricted to categories (task 6 acceptance surface).
 *   node test/protocol-846.js --expect-red
 *     Exit 0 only while every frozen current failure is still observed.
 *   node test/protocol-846.js --self-test self-reference
 *     Prove that fixtures derived from production are rejected.
 *   node test/protocol-846.js --self-test skip
 *     Prove that skipping a required assertion is a failure (exits non-zero).
 *   node test/protocol-846.js --self-test truncate-table
 *   node test/protocol-846.js --self-test unresolved-existing
 *   node test/protocol-846.js --self-test stale-840-fallback
 *     Registry fault self-tests; each exits non-zero when the fault is detected.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE_DIR = path.join(__dirname, 'fixtures', '846');
const BUILD_DIR = path.join(ROOT, '.research', 'builds', 'tcwczu-357faec1');
const GENERATED_DIR = path.join(BUILD_DIR, 'generated');

const KNOWN_MANIFEST_SHA = 'ec1532d7c2175f6a70998f29afead0eb210290bc10fcad7661bcae5884ce6ff3';
// Independent handler -> 846 wire id evidence. Schema-backed ids come from
// generated outbound-schemas/call-sites; ids 23/76 come from the bundle packet
// module (Ki=23 zero-arg StartUse, Bi=76 zero-arg Respawn) because the generated
// call-site scan only captures calls with an argument.
const HANDLER_OUTBOUND_IDS = Object.freeze({
  CPacketHookDetection: 106,
  CPacketTickEventDetection: 117,
  CPacketBaseEventDetection: 72,
  CPacketKillDetection: 94,
  CPacketSimulationDetection: 40,
  CPacketPickupItem: 123,
  CPacketMovePlayer: 15,
  CPacketAcceptTeleport: 22,
  CPacketSelectSlot: 21,
  CPacketSwingItem: 73,
  CPacketMilkEntity: 80,
  CPacketAttackEntity: 56,
  CPacketBreakEntity: 55,
  CPacketRespawn: 76,
  CPacketCloseChest: 112,
  CPacketMoveItemAmount: 59,
  CPacketMoveItem: 36,
  CPacketRemoveItem: 96,
  CPacketShopPurchase: 67,
  CPacketChat: 124,
  CPacketModifyBlock: 58,
  CPacketFinishUse: 2,
  CPacketRequestChunk: 65,
  CPacketUseItem: 32,
  CPacketUseBoat: 52,
  CPacketFillBucket: 16,
  CPacketUseBucket: 12,
  CPacketEnchantItem: 20,
  CPacketStartUse: 23,
  CPacketBreakBlock: 24
});
const HANDLER_CALL_SITE_MANIFEST = Object.freeze({
  count: 48,
  files: { 'anticheat.js': 15, 'entity.js': 10, 'gui.js': 8, 'misc.js': 2, 'world.js': 13 },
  names: Object.freeze([
    'CPacketAcceptTeleport', 'CPacketAttackEntity', 'CPacketBaseEventDetection',
    'CPacketBreakBlock', 'CPacketBreakEntity', 'CPacketChat', 'CPacketCloseChest',
    'CPacketConstantDetection', 'CPacketConstantDetection10', 'CPacketConstantDetection2',
    'CPacketConstantDetection4', 'CPacketConstantDetection5', 'CPacketConstantDetection6',
    'CPacketConstantDetection7', 'CPacketConstantDetection8', 'CPacketConstantDetection9',
    'CPacketEnchantItem', 'CPacketFillBucket', 'CPacketFinishUse', 'CPacketGravityDetection',
    'CPacketHookDetection', 'CPacketKillDetection', 'CPacketMilkEntity', 'CPacketModifyBlock',
    'CPacketMoveItem', 'CPacketMoveItemAmount', 'CPacketMovePlayer', 'CPacketPickupItem',
    'CPacketRemoveItem', 'CPacketRequestChunk', 'CPacketRespawn', 'CPacketSelectSlot',
    'CPacketShopPurchase', 'CPacketSimulationDetection', 'CPacketStartUse', 'CPacketSwingItem',
    'CPacketTickEventDetection', 'CPacketUseBoat', 'CPacketUseBucket', 'CPacketUseItem'
  ])
});
// Generated call-site-without-schema ids plus the two bundle zero-arg ids.
const BUNDLE_OUTBOUND_IDS = Object.freeze(new Set([23, 76]));
const REGISTRY_EXPECTED = Object.freeze({
  runtimeExpandedKeyCount: 16164,
  numericIdCount: 8082,
  nameCount: 8082,
  itemRegistryKeys: 1447,
  atlasCount: 1219
});
// Frozen from tcwczu/357faec1 generated registry evidence. These are extra
// anchors in the harness (not fixture edits) for the post-840 entries.
const REGISTRY_ANCHORS_846 = Object.freeze({
  blocks: [
    { id: 8069, name: 'Darkstone', textureInfo: 'darkstone', atlasIdx: 1205 },
    { id: 8070, name: 'Darkstone Bricks', textureInfo: 'darkstone_bricks', atlasIdx: 1206 }
  ],
  items: [
    { id: 8083, name: 'Wood Pickaxe', type: 'Tool', damage: 18 },
    { id: 8392, name: 'Chunk Map', type: 'Item' }
  ],
  names: [
    { name: 'Darkstone', id: 8069 },
    { name: 'Chunk Map', id: 8392 }
  ]
});
const REGISTRY_HANDLER_SOURCES = Object.freeze([
  'bloxd/handlers/impl',
  'bloxd/types/guis.js',
  'bloxd/types/crafting_recipe.js'
]);
const FIXTURE_NAMES = ['provenance', 'packets', 'transport', 'registry', 'handlers', 'items', 'defects'];
const CATEGORY_ORDER = ['version', 'transport', 'ids', 'schemas', 'registry', 'handlers', 'items', 'defects'];
const KNOWN_CATEGORIES = CATEGORY_ORDER.concat(['coverage', 'client']);
// Frozen from tcwczu/357faec1 generated evidence. Inbound 117 carries the
// per-player settings bulk update; the real 846 EntityDamage packet is id 122.
const CLIENT_SETTINGS_PACKET = Object.freeze({
  id: 117,
  ledgerName: 'SPacketServerSetting',
  fields: ['UT', 'KT'],
  entryFields: ['wT', 'vT', 'eT', 'uT'],
  joinPacketName: 'SPacketJoinGame',
  joinLocalIdField: 'iL'
});
const CLIENT_SELF_TESTS = Object.freeze([
  'client-unknown-inbound',
  'client-unknown-outbound',
  'client-settings-heuristic',
  'client-settings-packet',
  'client-unsupported-ids'
]);

// Handler-shaped outbound payloads. These are the values the existing handlers
// pass, not schema-random objects.
const HANDLER_OUTBOUND_PAYLOADS = Object.freeze({
  CPacketGravityDetection: -10,
  CPacketHookDetection: 0,
  CPacketTickEventDetection: 3,
  CPacketBaseEventDetection: 3,
  CPacketKillDetection: { id: 5 },
  CPacketConstantDetection: { '1osza3dnmpu5': '1jh318zxzjya1j' },
  CPacketConstantDetection2: { '1kg59q': '17lf2hdgucjo07' },
  CPacketConstantDetection4: { ux: 'szjw' },
  CPacketConstantDetection5: undefined,
  CPacketConstantDetection6: { '1ah': '18fwrv9h6qy54h' },
  CPacketConstantDetection7: { '9hgp': '1yz3wrxopl7' },
  CPacketConstantDetection8: { orpu4e7tt: 'fl' },
  CPacketConstantDetection9: { '1mziqo': '1m41xu92xcu93' },
  CPacketConstantDetection10: { '1kl': '1pdnc0rn' },
  CPacketSimulationDetection: {
    dmmg: 24, multt: 160, crchSpd: 48, wlkSpd: 96, runSpd: 168,
    time: 20, amount: 0, dimWidth: 0.5, dimHeight: 1.8, mass: 1
  },
  CPacketPickupItem: { itemEId: 'ent-1', itemAmt: 2, sendInfo: true },
  CPacketMovePlayer: {
    x: 1, y: 2, z: 3, heading: 0.5, speed: 4, jumping: false, crouching: false,
    pitch: 0.5, armSwinging: false, useDir: [0, 0, 1], physicsVersion: 'v2'
  },
  CPacketAcceptTeleport: { id: 1, type: 10 },
  CPacketSelectSlot: 5,
  CPacketSwingItem: { type: 2, doubleClick: false, targetPos: [1, 2, 3], targetBlock: 5 },
  CPacketMilkEntity: { targetEId: 'ent-2', toSlot: null },
  CPacketAttackEntity: {
    eId: 'ent-3', bodyPart: 'Head', dirFacing: [0, 0, 1], heldName: 'Sword',
    v: 1, tickCounter: 100, clientClickCounter: 2
  },
  CPacketBreakEntity: { eId: 'ent-3', dirFacing: [0, 0, 1], heldName: 'Sword' },
  CPacketRespawn: undefined,
  CPacketCloseChest: undefined,
  CPacketMoveItemAmount: { i: 1, j: 2, amt: 3 },
  CPacketMoveItem: { i: 1, j: 2 },
  CPacketRemoveItem: { amount: 1, id: 5, idx: 3 },
  CPacketShopPurchase: { category: 'Loot', name: 'Mystery Kit', shopVersion: 1 },
  CPacketChat: { msg: 'hello', channelName: null },
  CPacketModifyBlock: { changePos: [1, 2, 3], toBlock: 4, checker: 'abc' },
  CPacketFinishUse: { used: true, duration: 500 },
  CPacketRequestChunk: {
    id: '0|0|0|overworld', lastSeen: null, hash: null, forceRefresh: 'key', renderStatus: 0
  },
  CPacketUseItem: {
    targetPos: [1, 2, 3], targetEId: null, dirFacing: [0, 0, 1], heldId: 1, complete: 'use'
  },
  CPacketUseBoat: { pos: [1, 2, 3] },
  CPacketFillBucket: { pos: [1, 2, 3], toBlock: 0, toSlot: 5 },
  CPacketUseBucket: { pos: [1, 2, 3] },
  CPacketEnchantItem: { enchantItemHeldIdx: 1, enchantItemTablePos: [1, 2, 3], enchantItemLevel: 78 },
  CPacketStartUse: undefined,
  CPacketBreakBlock: [1, 2, 3]
});

// Expected decoded field subset for every supported handler-shaped payload.
const HANDLER_OUTBOUND_EXPECTATIONS = Object.freeze({
  CPacketHookDetection: 0,
  CPacketTickEventDetection: { hC: 3 },
  CPacketBaseEventDetection: { dD: 0, hD: true, JD: 3 },
  CPacketKillDetection: { sC: 5 },
  CPacketSimulationDetection: {
    hj: 24, Jj: 160, yj: 48, Uj: 96, wj: 168,
    vj: 20, uj: 0, Kj: 0.5, Ej: 1.8, Qj: 1
  },
  CPacketPickupItem: { Oj: 'ent-1', kR: 2, Xj: true },
  CPacketMovePlayer: {
    CR: 1, sR: 2, cR: 3, LR: 0.5, OR: 4,
    kC: false, XR: false, WR: 0.5, bR: false, MR: 'v2'
  },
  CPacketAcceptTeleport: { tR: 1, zR: 10 },
  CPacketSelectSlot: 5,
  CPacketSwingItem: { lR: 2, UD: false, nD: [1, 2, 3], KD: '5' },
  CPacketMilkEntity: { KD: 'ent-2', oD: null },
  CPacketAttackEntity: {
    aC: 'ent-3', NC: 'Head', ED: [0, 0, 1], SD: 'Sword', VC: 1, mT: 100, dC: 2
  },
  CPacketBreakEntity: { SR: 'ent-3', ED: [0, 0, 1], SD: 'Sword' },
  CPacketMoveItemAmount: { mC: 1, dR: 2, hR: 3 },
  CPacketMoveItem: { ER: 1, QR: 2 },
  CPacketRemoveItem: { KC: 3, nC: 5, RD: 1 },
  CPacketChat: { JC: 'hello', yC: null },
  CPacketModifyBlock: { BR: [1, 2, 3], qD: 4, qR: 'abc', ZR: false, pR: false, AR: false },
  CPacketFinishUse: { Ai: true, uR: 500 },
  CPacketRequestChunk: {
    UC: '0|0|0|overworld', wC: null, vC: null, eC: 'key', uC: 0
  },
  CPacketUseBoat: { gR: [1, 2, 3] },
  CPacketFillBucket: { RR: [1, 2, 3], qD: 0, oD: 5 },
  CPacketUseBucket: { IR: [1, 2, 3] },
  CPacketEnchantItem: { Yj: 1, Nj: [1, 2, 3], Vj: 78 },
  CPacketStartUse: undefined,
  CPacketBreakBlock: [1, 2, 3],
  CPacketShopPurchase: { categoryKey: 'Loot', itemKey: 'Mystery Kit', shopVersion: 1, userInput: null },
  CPacketUseItem: { nD: [1, 2, 3], KD: null, ED: [0, 0, 1], QD: 1, xD: 'use' },
  CPacketRespawn: undefined,
  CPacketCloseChest: null
});

// Existing inbound subscriptions and handler-shaped wire values.
const HANDLER_INBOUND_PROBES = Object.freeze({
  SPacketServerSetting: {
    payload: { UT: [{ wT: 'player-1', vT: null, eT: '{"walkingSpeed":5}', uT: [] }], KT: [] },
    expected: { UT: [{ wT: 'player-1', vT: null, eT: '{"walkingSpeed":5}', uT: [] }], KT: [] }
  },
  SPacketEntityDamage: {
    payload: { eH: 'ent-1', uH: null, nH: true, EH: true, QH: 40, xH: 1.5, oH: 0.5 },
    expected: { eId: 'ent-1', yourAttack: true, kbParticles: true, damageAmount: 40, damageAngle: 1.5, healthFrac: 0.5 }
  },
  SPacketEntityVelocity: { payload: [0.5, 1, 2], expected: [0.5, 1, 2] },
  SPacketEntityVelocityPlayer: { payload: [0.5, 1, 2], expected: { dir: [0.5, 1, 2] } },
  SPacketUpdateEffect: {
    payload: { Fj: 'ent-1', zj: 'Speed', iR: null, hT: 'icon', JT: 500, yT: 2 },
    expected: { lifeformId: 'ent-1', name: 'Speed', duration: 500, level: 2 }
  },
  SPacketRemoveEffect: {
    payload: { Fj: 'ent-1', zj: 'Speed', iR: null },
    expected: { lifeformId: 'ent-1', name: 'Speed' }
  },
  SPacketPlayerTeleport: {
    payload: { aT: 1, NT: 10, VT: 20, mH: 30 },
    expected: { id: 1, x: 10, y: 20, z: 30 }
  },
  SPacketViewAngles: { payload: [1, 2, 3], expected: [1, 2, 3] },
  SPacketRemoveItem: { payload: { CT: 'Sword', TT: 2 }, expected: { name: 'Sword', amt: 2 } },
  SPacketSyncInventory: {
    payload: { TL: { HL: '{"playerInven":"[]"}', sL: null, cL: null, LL: null, OL: null }, kP: false },
    expected: { kP: false }
  },
  SPacketUpdateChest: {
    payload: { Zs: true, ps: null, As: '{"0":{"name":"Sword"}}', AD: null, ls: null, Ss: false, Is: 0, fs: null },
    expected: { open: true, contents: '{"0":{"name":"Sword"}}' }
  },
  SPacketLogError: { payload: 'boom', expected: 'boom' },
  SPacketChunkData: {
    payload: { nT: '0|0|0', Ii: false, ET: Buffer.from([1, 2]), sharedBlockData: null, QT: null, Vt: null },
    expected: { id: '0|0|0', cancelled: false }
  },
  SPacketSetBlock: { payload: { QC: [1, 2, 3], xC: 5 }, expected: { pos: [1, 2, 3], newId: 5 } },
  SPacketSetMultiBlock: { payload: [[1, 2, 3, 5]], expected: [[1, 2, 3, 5]] },
  SPacketSetBlock2: { payload: { Us: [1, 2, 3], vs: 5 }, expected: { pos: [1, 2, 3], newId: 5 } },
  SPacketSetBlock3: {
    payload: [{ WL: [1, 2, 3], bL: 5, YL: null }],
    expected: [{ pos: [1, 2, 3], actualId: 5, data: null }]
  },
  SPacketPlaySound: {
    payload: { xT: 'bow', soundVolume: 1, oT: 1.25, GT: { BT: 'ent-1', qT: 0.5, ZT: 0.75 } },
    expected: { namePrefix: 'bow', volume: 1, posSettings: { playerIdOrPos: 'ent-1', volume: 0.5, pitch: 0.75 } }
  },
  SPacketEntitySetting: { payload: { nameTagInfo: { content: 'hi' } }, expected: { nameTagInfo: { content: 'hi' } } },
  SPacketSetSlot: { payload: { index: 5, name: 'Sword', amount: 1 }, expected: { index: 5, name: 'Sword', amount: 1 } },
  SPacketPickupItem: { payload: [{ name: 'Sword', amount: 1 }], expected: [{ name: 'Sword', amount: 1 }] },
  SPacketClearInventory: { payload: {}, expected: {} },
  SPacketPlayerKilled: { payload: { killerEId: 'ent-1' }, expected: { killerEId: 'ent-1' } },
  SPacketKillfeed: { payload: { withItem: 'Bed' }, expected: { withItem: 'Bed' } },
  SPacketChat: {
    payload: { content: [{ str: 'hi' }], chatterEId: 'ent-1' },
    expected: { content: [{ str: 'hi' }], chatterEId: 'ent-1' }
  },
  SPacketSetBlockData: { payload: { pos: [1, 2, 3], data: {} }, expected: { pos: [1, 2, 3], data: {} } }
});

const HANDLER_INBOUND_ALIASES = Object.freeze({
  SPacketEquipArmor: 'legacy-handler-alias:no 846 wire id in generated/inbound-ids.json',
  SPacketResyncVelocity: 'legacy-handler-alias:no 846 wire id in generated/inbound-ids.json'
});

function failErr(code, message, details) {
  const err = new Error(message);
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function sha256File(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function relative(absolutePath) {
  return path.relative(ROOT, absolutePath).split(path.sep).join('/');
}

function loadFixtures() {
  if (!fs.existsSync(FIXTURE_DIR)) {
    throw failErr('E_FIXTURES_MISSING', 'fixture directory is missing: ' + relative(FIXTURE_DIR));
  }
  const fixtures = {};
  for (const name of FIXTURE_NAMES) {
    const filePath = path.join(FIXTURE_DIR, name + '.json');
    if (!fs.existsSync(filePath)) {
      throw failErr('E_FIXTURES_MISSING', 'fixture is missing: ' + relative(filePath));
    }
    fixtures[name] = readJson(filePath);
  }
  return fixtures;
}

function loadGeneratedEvidence() {
  const read = (name) => readJson(path.join(GENERATED_DIR, name));
  return {
    manifest: read('manifest.json'),
    inboundIds: read('inbound-ids.json'),
    outboundIds: read('outbound-ids.json'),
    inboundSchemas: read('inbound-schemas.json'),
    outboundSchemas: read('outbound-schemas.json'),
    transport: read('transport.json'),
    registry: read('registry.json'),
    assets: read('assets.json'),
    baselineInbound: readJson(path.join(ROOT, '.research', 'live', 'inbound-schemas.json')),
    transportVectors: readJson(path.join(ROOT, '.research', 'evidence', 'transport-vectors-846.json'))
  };
}

// ---------------------------------------------------------------------------
// Structural schema signatures and fixture provenance
// ---------------------------------------------------------------------------

function structuralSignature(type) {
  if (typeof type === 'string') return type;
  if (Array.isArray(type)) return { union: type.map(structuralSignature) };
  if (!type || typeof type !== 'object') return type;
  if (type.type === 'array') return { array: structuralSignature(type.items) };
  if (type.type === 'map') return { map: structuralSignature(type.values) };
  if (type.type === 'record') return { record: (type.fields || []).map((field) => structuralSignature(field.type)) };
  if (type.type === 'enum') return { enum: (type.symbols || []).slice() };
  if (type.type === 'fixed') return { fixed: type.size };
  if (type.type) return structuralSignature(type.type);
  return type;
}

function signatureString(type) {
  return JSON.stringify(structuralSignature(type));
}

function buildSchemaSignatureMap(schemaList) {
  const map = {};
  for (const entry of schemaList) {
    const signature = signatureString(entry.schema);
    map[entry.id] = { signature: JSON.parse(signature), sha256: sha256(signature) };
  }
  return map;
}

function registryDigest(table) {
  const lines = Object.entries(table).map(([id, value]) => {
    const entry = value && typeof value === 'object' ? value : { name: value };
    return [id, entry.name || '', entry.displayName || entry.textureInfo || ''].join('\t');
  }).sort();
  return sha256(lines.join('\n'));
}

function verifyProvenance(provenance) {
  const errors = [];
  if (provenance.derivedFrom !== 'generated-evidence') {
    errors.push({ code: 'E_SELF_REFERENCE', subject: 'provenance.derivedFrom', expected: 'generated-evidence', actual: provenance.derivedFrom });
  }
  const manifestPath = path.join(GENERATED_DIR, 'manifest.json');
  const actualManifestSha = sha256File(manifestPath);
  if (provenance.generatedManifestSha256 !== KNOWN_MANIFEST_SHA) {
    errors.push({ code: 'E_FIXTURE_EVIDENCE_MISMATCH', subject: 'provenance.generatedManifestSha256', expected: KNOWN_MANIFEST_SHA, actual: provenance.generatedManifestSha256 });
  }
  if (actualManifestSha !== KNOWN_MANIFEST_SHA) {
    errors.push({ code: 'E_GENERATED_EVIDENCE_CHANGED', subject: 'generated/manifest.json', expected: KNOWN_MANIFEST_SHA, actual: actualManifestSha });
  }
  for (const source of provenance.sources || []) {
    const filePath = path.join(ROOT, ...source.name.split('/'));
    if (!fs.existsSync(filePath)) {
      errors.push({ code: 'E_FIXTURE_SOURCE_MISSING', subject: source.name, expected: 'present', actual: 'missing' });
      continue;
    }
    const actualSha = sha256File(filePath);
    const actualBytes = fs.statSync(filePath).size;
    if (actualSha !== source.sha256) {
      errors.push({ code: 'E_FIXTURE_EVIDENCE_MISMATCH', subject: source.name + ' sha256', expected: source.sha256, actual: actualSha });
    }
    if (actualBytes !== source.bytes) {
      errors.push({ code: 'E_FIXTURE_EVIDENCE_MISMATCH', subject: source.name + ' bytes', expected: source.bytes, actual: actualBytes });
    }
  }
  return errors;
}



/*
 * Recompute the frozen fixtures from the captured evidence. A fixture set that
 * was derived from the current production module instead of the evidence fails
 * here (see `--self-test self-reference`).
 */
function validateFixtureAgainstEvidence(fixtures, evidence) {
  const errors = [];
  const mismatch = (subject, expected, actual) => {
    if (!isDeepStrictEqual(expected, actual)) {
      errors.push({ code: 'E_FIXTURE_EVIDENCE_MISMATCH', subject, expected, actual });
    }
  };

  mismatch('packets.version', evidence.manifest.counts.version, fixtures.packets.version);
  mismatch('transport.version', evidence.manifest.counts.version, fixtures.transport.version);
  mismatch('packets.sendKey', evidence.manifest.sendKey.value, fixtures.packets.sendKey);
  mismatch('transport.sendKey', evidence.manifest.sendKey.value, fixtures.transport.sendKey);
  mismatch('transport.formula', evidence.transport.transportKey.formula, fixtures.transport.formula);

  const inbound = evidence.inboundIds;
  mismatch('packets.inbound.count', inbound.count, fixtures.packets.inbound.count);
  mismatch('packets.inbound.ids', inbound.ids, fixtures.packets.inbound.ids);
  mismatch('packets.inbound.schemaIds', inbound.schemaIds, fixtures.packets.inbound.schemaIds);
  mismatch('packets.inbound.schemaOnlyIds', inbound.schemaOnlyIds, fixtures.packets.inbound.schemaOnlyIds);
  mismatch('packets.inbound.handlerWithoutSchemaIds', inbound.handlerWithoutSchemaIds, fixtures.packets.inbound.handlerWithoutSchemaIds);
  mismatch('handlers.inboundHandlerIds', inbound.handlerIds, fixtures.handlers.inboundHandlerIds);
  mismatch('handlers.handledSchemaIds', inbound.ids, fixtures.handlers.handledSchemaIds);
  mismatch('handlers.schemaOnlyIds', inbound.schemaOnlyIds, fixtures.handlers.schemaOnlyIds);
  mismatch('handlers.handlerWithoutSchemaIds', inbound.handlerWithoutSchemaIds, fixtures.handlers.handlerWithoutSchemaIds);
  mismatch('handlers.counts', inbound.disposition, fixtures.handlers.counts);

  const outbound = evidence.outboundIds;
  mismatch('packets.outbound.count', outbound.count, fixtures.packets.outbound.count);
  mismatch('packets.outbound.ids', outbound.ids, fixtures.packets.outbound.ids);
  mismatch('packets.outbound.callSiteIds', outbound.callSiteIds, fixtures.packets.outbound.callSiteIds);
  mismatch('packets.outbound.schemaOnlyIds', outbound.schemaOnlyIds, fixtures.packets.outbound.schemaOnlyIds);
  mismatch('packets.outbound.callSiteWithoutSchemaIds', outbound.callSiteWithoutSchemaIds, fixtures.packets.outbound.callSiteWithoutSchemaIds);

  mismatch('packets.inbound.schemaSignatures', buildSchemaSignatureMap(evidence.inboundSchemas), fixtures.packets.inbound.schemaSignatures);
  mismatch('packets.outbound.schemaSignatures', buildSchemaSignatureMap(evidence.outboundSchemas), fixtures.packets.outbound.schemaSignatures);

  mismatch('transport.roles.keepalive', evidence.transport.roles.keepalive.id, fixtures.transport.roles.keepalive);
  mismatch('transport.roles.analyticsPing', evidence.transport.roles.analyticsPing.id, fixtures.transport.roles.analyticsPing);
  mismatch('transport.roles.analyticsUpdate', evidence.transport.roles.analyticsUpdate.id, fixtures.transport.roles.analyticsUpdate);

  const transportEvidencePath = path.join(ROOT, '.research', 'evidence', 'transport-vectors-846.json');
  mismatch('transport.evidenceFile', relative(transportEvidencePath), fixtures.transport.evidenceFile);
  mismatch('transport.evidenceSha256', sha256File(transportEvidencePath), fixtures.transport.evidenceSha256);
  mismatch('transport.expKey', evidence.transportVectors.source.constants.expKey, fixtures.transport.expKey);
  mismatch('transport.offsets', {
    secondPass: evidence.transportVectors.source.constants.secondPass,
    lengthMultiplier: evidence.transportVectors.source.constants.multiplier
  }, fixtures.transport.offsets);
  mismatch('transport.vectors', evidence.transportVectors.vectors, fixtures.transport.vectors);
  for (const vector of fixtures.transport.vectors) {
    const evidenceVector = evidence.transportVectors.vectors.find((candidate) => candidate.name === vector.name);
    const subject = 'transport.vectors.' + vector.name;
    if (!evidenceVector) {
      mismatch(subject, 'evidence vector ' + vector.name, null);
      continue;
    }
    mismatch(subject + '.packet', evidenceVector.packet, vector.packet);
    mismatch(subject + '.value', evidenceVector.value, vector.value);
    mismatch(subject + '.expectedWireId', evidenceVector.expectedWireId, vector.expectedWireId);
  }

  const registry = evidence.registry;
  mismatch('registry.runtimeExpandedKeyCount', registry.runtimeExpandedKeyCount, fixtures.registry.runtimeExpandedKeyCount);
  mismatch('registry.literalMemberCount', registry.literalMemberCount, fixtures.registry.literalMemberCount);
  mismatch('registry.nameCount', Object.keys(registry.numericIdView).length, fixtures.registry.nameCount);
  mismatch('registry.itemRegistryKeys', registry.items.count, fixtures.registry.itemRegistryKeys);
  mismatch('registry.atlasCount', registry.atlas.count, fixtures.registry.atlasCount);
  mismatch('registry.digest', registryDigest(registry.numericIdView), fixtures.registry.digest.value);

  const blockAnchors = fixtures.registry.anchors.blocks.map((anchor) => {
    const actual = registry.numericIdView[anchor.id] || {};
    const projected = {};
    for (const key of Object.keys(anchor)) projected[key] = key === 'id' ? anchor.id : actual[key];
    return projected;
  });
  mismatch('registry.anchors.blocks', fixtures.registry.anchors.blocks, blockAnchors);

  const itemAnchors = fixtures.registry.anchors.items.map((anchor) => {
    const actual = registry.items.numericIdView[anchor.id] || {};
    const projected = {};
    for (const key of Object.keys(anchor)) projected[key] = key === 'id' ? anchor.id : actual[key];
    return projected;
  });
  mismatch('registry.anchors.items', fixtures.registry.anchors.items, itemAnchors);

  const atlasAnchors = fixtures.registry.anchors.atlas.map((anchor) => ({
    name: anchor.name,
    index: registry.atlas.byName[anchor.name]
  }));
  mismatch('registry.anchors.atlas', fixtures.registry.anchors.atlas, atlasAnchors);

  const nameAnchors = fixtures.registry.anchors.names.map((anchor) => ({
    name: anchor.name,
    id: registry.nameView[anchor.name] !== undefined
      ? registry.nameView[anchor.name]
      : registry.items.nameView[anchor.name]
  }));
  mismatch('registry.anchors.names', fixtures.registry.anchors.names, nameAnchors);

  mismatch('items.componentExpectations', {
    sourceName: fixtures.items.blockAnchor.name,
    displayName: fixtures.items.blockAnchor.displayName,
    textureInfo: fixtures.items.blockAnchor.textureInfo,
    atlasIdx: fixtures.items.blockAnchor.atlasIdx
  }, fixtures.items.componentExpectations && {
    sourceName: fixtures.items.componentExpectations.sourceName,
    displayName: fixtures.items.componentExpectations.displayName,
    textureInfo: fixtures.items.componentExpectations.textureInfo,
    atlasIdx: fixtures.items.componentExpectations.atlasIdx
  });

  const baseline117 = evidence.baselineInbound[117] || evidence.baselineInbound['117'];
  const generated117 = evidence.inboundSchemas.find((entry) => entry.id === 117);
  mismatch('defects.entityDamage.baseline840FieldCount', baseline117.schema.fields.length, fixtures.defects.entityDamage.baseline840FieldCount);
  mismatch('defects.entityDamage.expected846TopFieldCount', generated117.schema.fields.length, fixtures.defects.entityDamage.expected846TopFieldCount);
  mismatch('defects.entityDamage.baseline840FieldNames', baseline117.schema.fields.map((field) => field.name), fixtures.defects.entityDamage.baseline840FieldNames);
  mismatch('defects.entityDamage.expected846FieldNames', generated117.schema.fields.map((field) => field.name), fixtures.defects.entityDamage.expected846FieldNames);

  const baseline78 = evidence.baselineInbound[78] || evidence.baselineInbound['78'];
  const remove = fixtures.defects.removeEffect;
  mismatch('defects.removeEffect.scope', 'baseline840Only', remove.scope);
  mismatch('defects.removeEffect.notAn846Id', true, remove.notAn846Id);
  mismatch('defects.removeEffect.baseline840.inboundId', 78, remove.baseline840.inboundId);
  mismatch('defects.removeEffect.baseline840.firstField', baseline78.schema.fields[0].name, remove.baseline840.firstField);
  mismatch('defects.removeEffect.baseline840.fieldCount', baseline78.schema.fields.length, remove.baseline840.fieldCount);
  mismatch('defects.removeEffect.baseline840.sha256', sha256File(path.join(ROOT, '.research', 'live', 'inbound-schemas.json')), remove.baseline840.sha256);
  mismatch('defects.removeEffect.generated846.hasInboundId78', false, remove.generated846.hasInboundId78);
  mismatch('defects.removeEffect.generated846.containsLifeformId', false, remove.generated846.containsLifeformId);
  mismatch('defects.removeEffect.generated846.actualHasInboundId78', false, evidence.inboundIds.schemaIds.includes(78));
  mismatch('defects.removeEffect.generated846.actualContainsLifeformId', false, JSON.stringify({
    inboundIds: evidence.inboundIds,
    inboundSchemas: evidence.inboundSchemas,
    outboundIds: evidence.outboundIds,
    outboundSchemas: evidence.outboundSchemas
  }).indexOf('lifeformId') >= 0);

  const expectedRed = fixtures.defects.expectedRed || {};
  mismatch('defects.expectedRed reasons', true, Object.keys(expectedRed).length > 0);
  for (const [reason, minimum] of Object.entries(expectedRed)) {
    mismatch('defects.expectedRed.' + reason, true, Number.isInteger(minimum) && minimum > 0);
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Product subject
// ---------------------------------------------------------------------------

function buildFixtureSubject(fixtures, evidence) {
  const { Type } = require('avsc');
  const inboundIds = {};
  const inboundSchemas = {};
  const outboundIds = {};
  const outboundSchemas = {};
  for (const entry of evidence.inboundSchemas) {
    const name = 'I' + entry.id;
    inboundIds[name] = entry.id;
    inboundSchemas[name] = Type.forSchema(entry.schema);
  }
  for (const entry of evidence.outboundSchemas) {
    const name = 'O' + entry.id;
    outboundIds[name] = entry.id;
    outboundSchemas[name] = Type.forSchema(entry.schema);
  }
  for (const vector of fixtures.transport.vectors) {
    outboundIds[vector.packet] = vector.plainLogicalId;
    outboundSchemas[vector.packet] = Type.forSchema({ type: 'array', items: 'int' });
  }
  const generated117 = evidence.inboundSchemas.find((entry) => entry.id === 117);
  // Expected-red fixture only: mirror the pre-task-10 117 mapping so the old
  // 840 harness stays intentionally non-green. Production uses id 122 below.
  inboundSchemas.SPacketEntityDamage = Type.forSchema(generated117.schema);
  inboundSchemas.SPacketRemoveEffect = Type.forSchema({
    type: 'record',
    fields: [{ name: 'lifeformId', type: 'string' }]
  });

  function FixtureClient() {}
  FixtureClient.prototype.send = function send(name, value) {
    if (!this.pass || !this.room || !this.connected) return;
    const passKey = JSON.stringify(this.pass);
    const vector = fixtures.transport.vectors.find((candidate) => candidate.packet === name && JSON.stringify(candidate.pass) === passKey);
    if (!vector) throw new Error('fixture subject has no transport vector for ' + name);
    this.room.sendBytes(vector.expectedWireId, Buffer.from(vector.expectedWirePayloadHex, 'hex'));
  };

  return {
    protocol: {
      VERSION: fixtures.packets.version,
      INBOUND_IDS: inboundIds,
      INBOUND_JSON: {},
      INBOUND_SCHEMAS: inboundSchemas,
      OUTBOUND_IDS: outboundIds,
      OUTBOUND_JSON: {},
      OUTBOUND_SCHEMAS: outboundSchemas
    },
    BloxClient: FixtureClient,
    registry: {
      file: 'fixture-subject',
      table: evidence.registry.numericIdView,
      itemTable: evidence.registry.items.numericIdView,
      itemNameView: evidence.registry.items.nameView,
      atlas: evidence.registry.atlas
    },
    assetReferences: evidence.assets,
    handlerVocabulary: {
      names: new Set(fixtures.handlers.inboundHandlerIds.map((id) => 'fixture-' + id)),
      ids: new Set(fixtures.handlers.inboundHandlerIds),
      withSchema: new Set(fixtures.handlers.handledSchemaIds)
    },
    itemConversion: {
      translateItem() {
        return { name: 'Dirt', displayName: 'item:dirt' };
      },
      itemStack() {
        return {
          components: [{ type: 'unbreakable' }, { type: 'custom_name' }],
          addedComponentCount: 2,
          removedComponentCount: 0
        };
      }
    },
    removeEffect: { schemaField: 'lifeformId', usedFields: ['lifeformId'] }
  };
}

function loadSubject(fixtures, evidence) {
  if (process.env.PROTOCOL_846_FIXTURE_SUBJECT === '1') {
    return buildFixtureSubject(fixtures, evidence);
  }
  const protocol = require(path.join(ROOT, 'bloxd', 'protocol', 'live.js'));
  const BloxClient = require(path.join(ROOT, 'bloxd', 'client.js'));
  return { protocol, BloxClient };
}

function productInboundIdSet(protocol) {
  // Raw inbound ids are the ids that have a captured avsc schema. Handler-only
  // ids live in INBOUND_HANDLER_IDS/INBOUND_JSON and must not be counted here.
  const ids = new Set();
  for (const name of Object.keys(protocol.INBOUND_SCHEMAS || {})) {
    const id = protocol.INBOUND_IDS[name];
    if (typeof id === 'number') ids.add(id);
  }
  return ids;
}

function productOutboundIdSet(protocol) {
  // Raw outbound ids are the ids that have a captured avsc schema. Call-site
  // only ids live in OUTBOUND_CALL_SITE_IDS/OUTBOUND_JSON.
  const ids = new Set();
  for (const name of Object.keys(protocol.OUTBOUND_SCHEMAS || {})) {
    const id = protocol.OUTBOUND_IDS[name];
    if (typeof id === 'number') ids.add(id);
  }
  return ids;
}

function productSchemaMap(protocol, direction) {
  const ids = direction === 'inbound' ? protocol.INBOUND_IDS : protocol.OUTBOUND_IDS;
  const schemas = direction === 'inbound' ? protocol.INBOUND_SCHEMAS : protocol.OUTBOUND_SCHEMAS;
  const map = new Map();
  for (const [name, id] of Object.entries(ids)) {
    const type = schemas[name];
    if (!type) continue;
    let schema;
    try {
      schema = typeof type.schema === 'function' ? type.schema() : type;
    } catch (err) {
      continue;
    }
    if (!map.has(id)) map.set(id, []);
    const signature = signatureString(schema);
    map.get(id).push({ name, signature: JSON.parse(signature), sha256: sha256(signature) });
  }
  return map;
}

function loadProductRegistry() {
  for (const name of ['registry-846.json', 'registry-840.json']) {
    const filePath = path.join(ROOT, 'bloxd', 'types', name);
    if (!fs.existsSync(filePath)) continue;
    const data = readJson(filePath);
    if (Array.isArray(data)) {
      return { file: relative(filePath), table: data, legacy: true };
    }
    if (data && data.numericIdView) {
      return {
        file: relative(filePath),
        table: data.numericIdView,
        nameView: data.nameView,
        runtimeExpandedKeyCount: data.runtimeExpandedKeyCount,
        itemTable: data.items && data.items.numericIdView,
        itemNameView: data.items && data.items.nameView,
        atlas: data.atlas,
        assetReferences: data.assetReferences,
        legacy: false
      };
    }
    return { file: relative(filePath), table: data, legacy: false };
  }
  return null;
}

function registryEntryName(value) {
  if (value && typeof value === 'object') return value.name;
  return value;
}

function readStringLiterals(source) {
  const values = [];
  for (const pattern of [/'(?:\\.|[^'\\\n])*'/g, /"(?:\\.|[^"\\\n])*"/g]) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const raw = match[0].slice(1, -1);
      // Skip literals with escapes so substrings such as the "Lantern" part of
      // 'Jack o\'Lantern' do not become false handler item names.
      if (raw.includes('\\')) continue;
      values.push(raw);
    }
  }
  return values;
}

function registryNameSet(productRegistry) {
  const names = new Set();
  for (const value of Object.values((productRegistry && productRegistry.table) || {})) {
    const name = registryEntryName(value);
    if (name) names.add(name);
  }
  for (const name of Object.keys((productRegistry && productRegistry.nameView) || {})) {
    names.add(name);
  }
  return names;
}

function collectHandlerItemNames(productRegistry) {
  const registryNames = registryNameSet(productRegistry);
  const names = new Set();
  const sources = [];
  for (const source of REGISTRY_HANDLER_SOURCES) {
    const absolute = path.join(ROOT, source);
    if (!fs.existsSync(absolute)) continue;
    if (fs.statSync(absolute).isDirectory()) {
      for (const file of fs.readdirSync(absolute)) {
        if (file.endsWith('.js')) sources.push(path.join(absolute, file));
      }
    } else {
      sources.push(absolute);
    }
  }
  for (const file of sources) {
    for (const literal of readStringLiterals(fs.readFileSync(file, 'utf8'))) {
      if (registryNames.has(literal)) names.add(literal);
    }
  }
  return [...names].sort();
}

function loadProductItems() {
  return require(path.join(ROOT, 'bloxd', 'types', 'items.js'));
}

function productItemMapping(name, itemModules) {
  if (!itemModules || !Array.isArray(itemModules.IDITEM) || !Array.isArray(itemModules.ITEMID)) return undefined;
  const index = itemModules.IDITEM.indexOf(name);
  if (index < 0) return undefined;
  return itemModules.ITEMID[index];
}

function summarizeProductRegistry(productRegistry, itemModules, handlerNames) {
  const table = (productRegistry && productRegistry.table) || {};
  const entries = Object.entries(table);
  const nameView = (productRegistry && productRegistry.nameView) || {};
  const numericIds = entries.length;
  const runtimeKeys = numericIds + Object.keys(nameView).length;
  const numericValues = entries.map(([id, value]) => (
    value && typeof value === 'object' && value.id !== undefined ? value.id : Number(id)
  ));
  const nameIds = Object.values(nameView);
  const duplicateId = (numericValues.length - new Set(numericValues).size)
    + (nameIds.length - new Set(nameIds).size);

  const existingNames = handlerNames || collectHandlerItemNames(productRegistry);
  let unresolvedExisting = 0;
  for (const name of existingNames) {
    if (productItemMapping(name, itemModules) === undefined) unresolvedExisting++;
  }

  let silentFallback = 0;
  for (const value of Object.values(table)) {
    const name = registryEntryName(value);
    if (!name || name === 'Air') continue;
    if (productItemMapping(name, itemModules) === undefined) continue;
    if (!itemModules || !itemModules.ITEMS || !Object.prototype.hasOwnProperty.call(itemModules.ITEMS, name)) {
      silentFallback++;
    }
  }

  return {
    runtimeKeys,
    numericIds,
    nameCount: Object.keys(nameView).length,
    duplicateId,
    unresolvedExisting,
    silentFallback,
    handlerItemNames: existingNames.length,
    aliases: []
  };
}

function registryAnchorErrors(productRegistry) {
  const errors = [];
  const table = (productRegistry && productRegistry.table) || {};
  const nameView = (productRegistry && productRegistry.nameView) || {};
  const itemTable = (productRegistry && productRegistry.itemTable) || {};
  for (const anchor of REGISTRY_ANCHORS_846.blocks) {
    const value = table[anchor.id] && typeof table[anchor.id] === 'object' ? table[anchor.id] : { name: table[anchor.id] };
    for (const key of Object.keys(anchor)) {
      if (key === 'id') continue;
      if (value[key] !== anchor[key]) {
        errors.push({ code: 'E_REGISTRY_ANCHOR_MISMATCH', subject: 'block id ' + anchor.id + ' ' + key, expected: anchor[key], actual: value[key] });
      }
    }
  }
  for (const anchor of REGISTRY_ANCHORS_846.items) {
    const value = itemTable[anchor.id] && typeof itemTable[anchor.id] === 'object' ? itemTable[anchor.id] : { name: itemTable[anchor.id] };
    for (const key of Object.keys(anchor)) {
      if (key === 'id') continue;
      if (value[key] !== anchor[key]) {
        errors.push({ code: 'E_REGISTRY_ANCHOR_MISMATCH', subject: 'item id ' + anchor.id + ' ' + key, expected: anchor[key], actual: value[key] });
      }
    }
  }
  const itemNameView = (productRegistry && productRegistry.itemNameView) || {};
  for (const anchor of REGISTRY_ANCHORS_846.names) {
    const actual = nameView[anchor.name] !== undefined ? nameView[anchor.name] : itemNameView[anchor.name];
    if (actual !== anchor.id) {
      errors.push({ code: 'E_REGISTRY_ANCHOR_MISMATCH', subject: 'name ' + anchor.name + ' id', expected: anchor.id, actual });
    }
  }
  return errors;
}

function registryFaults(productRegistry, itemModules, options) {
  const errors = [];
  const expected = (options && options.expected) || REGISTRY_EXPECTED;
  if (!productRegistry) {
    return { errors: [{ code: 'E_REGISTRY_MISSING', subject: 'bloxd/types/registry-*.json', expected: 'present', actual: 'missing' }], summary: null };
  }
  if (Array.isArray(productRegistry.table) || !productRegistry.nameView) {
    errors.push({
      code: 'E_REGISTRY_STALE_840',
      subject: 'registry structure',
      expected: 'numericIdView + nameView',
      actual: Array.isArray(productRegistry.table) ? 'legacy array' : 'missing nameView'
    });
  }
  let summary;
  try {
    summary = summarizeProductRegistry(productRegistry, itemModules, options && options.handlerNames);
  } catch (err) {
    errors.push({ code: 'E_REGISTRY_SUMMARY_FAILED', subject: 'registry summary', expected: 'readable item module', actual: err.message });
    return { errors, summary: null };
  }
  if (summary.runtimeKeys !== expected.runtimeExpandedKeyCount) {
    errors.push({
      code: 'E_REGISTRY_TRUNCATED',
      subject: 'runtime registry keys',
      expected: expected.runtimeExpandedKeyCount,
      actual: summary.runtimeKeys,
      detail: { numericIds: summary.numericIds, nameCount: summary.nameCount }
    });
  }
  if (productRegistry.runtimeExpandedKeyCount !== undefined
    && productRegistry.runtimeExpandedKeyCount !== expected.runtimeExpandedKeyCount) {
    errors.push({
      code: 'E_REGISTRY_TRUNCATED',
      subject: 'declared runtimeExpandedKeyCount',
      expected: expected.runtimeExpandedKeyCount,
      actual: productRegistry.runtimeExpandedKeyCount
    });
  }
  if (summary.numericIds <= 0) {
    errors.push({ code: 'E_REGISTRY_EMPTY', subject: 'numeric-id view', expected: '> 0', actual: summary.numericIds });
  }
  if (summary.duplicateId !== 0) {
    errors.push({ code: 'E_REGISTRY_DUPLICATE_ID', subject: 'duplicate registry ids', expected: 0, actual: summary.duplicateId });
  }
  if (summary.unresolvedExisting !== 0) {
    errors.push({
      code: 'E_REGISTRY_UNRESOLVED_EXISTING',
      subject: 'existing handler item names',
      expected: 0,
      actual: summary.unresolvedExisting,
      detail: { scanned: summary.handlerItemNames }
    });
  }
  if (summary.silentFallback !== 0) {
    errors.push({
      code: 'E_REGISTRY_SILENT_FALLBACK',
      subject: 'unresolved names with a fallback mapping',
      expected: 0,
      actual: summary.silentFallback
    });
  }
  errors.push(...registryAnchorErrors(productRegistry));
  return { errors, summary };
}

function productHandlerVocabulary(protocol) {
  const nameToId = new Map();
  for (const [name, id] of Object.entries(protocol.INBOUND_IDS)) nameToId.set(name, id);
  for (const [name, spec] of Object.entries(protocol.INBOUND_JSON)) nameToId.set(name, spec.id);

  const implDir = path.join(ROOT, 'bloxd', 'handlers', 'impl');
  const names = new Set();
  const ids = new Set();
  const withSchema = new Set();
  // The generated 846 handler registration table is the authoritative inbound
  // handler surface; the static subscriptions below are the existing product
  // handlers that must all resolve through it.
  for (const [name, id] of Object.entries(protocol.INBOUND_HANDLER_IDS || {})) {
    names.add(name);
    if (typeof id === 'number') ids.add(id);
    if (protocol.INBOUND_SCHEMAS[name]) withSchema.add(id);
  }
  if (fs.existsSync(implDir)) {
    for (const file of fs.readdirSync(implDir)) {
      if (!file.endsWith('.js')) continue;
      const source = fs.readFileSync(path.join(implDir, file), 'utf8');
      const pattern = /bClient\.on\(\s*['"](SPacket[A-Za-z0-9_]+)['"]/g;
      let match;
      while ((match = pattern.exec(source)) !== null) {
        const name = match[1];
        names.add(name);
        const id = nameToId.get(name);
        if (id === undefined) continue;
        ids.add(id);
        if (protocol.INBOUND_SCHEMAS[name]) withSchema.add(id);
      }
    }
  }
  return { names, ids, withSchema };
}

// ---------------------------------------------------------------------------
// Assertion collector
// ---------------------------------------------------------------------------

function createCollector() {
  const assertions = [];
  const push = (ok, category, reason, subject, expected, actual, detail) => {
    assertions.push({
      ok,
      category,
      reason,
      subject,
      expected,
      actual,
      detail: detail === undefined ? null : detail
    });
  };
  return {
    assertions,
    record(ok, category, reason, subject, expected, actual, detail) {
      push(Boolean(ok), category, reason, subject, expected, actual, detail);
    },
    equal(category, reason, subject, expected, actual, detail) {
      push(isDeepStrictEqual(expected, actual), category, reason, subject, expected, actual, detail);
    },
    skip(subject) {
      throw failErr('E_SKIP_REJECTED', 'required assertion was skipped: ' + subject);
    }
  };
}

function demoFailure(reason, category, subject, expected, actual, detail) {
  return { ok: false, category, reason, subject, expected, actual, detail: detail === undefined ? null : detail };
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function checkVersion(collector, fixtures, subject) {
  collector.equal('version', 'E_VERSION_MISMATCH', 'bloxd/protocol/live.js VERSION', fixtures.packets.version, subject.protocol.VERSION);
}

function captureTransportVector(subject, vector) {
  const client = Object.create(subject.BloxClient.prototype);
  client.pass = vector.pass.slice();
  client.connected = true;
  let captured = null;
  client.room = {
    sendBytes(id, data) {
      captured = { id: Number(id), data: Buffer.from(data), binary: true };
    },
    send(id, data) {
      captured = { id: Number(id), data, binary: false };
    }
  };
  client.send(vector.packet, vector.value);
  return captured;
}

function checkTransport(collector, fixtures, subject) {
  const vectors = fixtures.transport.vectors || [];
  for (const vector of vectors) {
    let captured;
    try {
      captured = captureTransportVector(subject, vector);
    } catch (err) {
      collector.record(false, 'transport', 'E_TRANSPORT_VECTOR_MISMATCH', 'vector ' + vector.name + ' send', 'captured frame', 'threw: ' + err.message);
      continue;
    }
    if (!captured) {
      collector.record(false, 'transport', 'E_TRANSPORT_VECTOR_MISMATCH', 'vector ' + vector.name + ' send', 'captured frame', 'nothing captured');
      continue;
    }
    const logicalId = subject.protocol.OUTBOUND_IDS[vector.packet];
    if (logicalId === undefined) {
      collector.record(false, 'transport', 'E_TRANSPORT_VECTOR_MISMATCH', 'vector ' + vector.name + ' packet', 'known outbound packet', vector.packet);
      continue;
    }
    const actualMask = (logicalId ^ captured.id) >>> 0;
    collector.equal(
      'transport',
      'E_TRANSPORT_VECTOR_MISMATCH',
      'vector ' + vector.name + ' send-key mask',
      vector.expectedMask,
      actualMask,
      { logicalId, wireId: captured.id, pass: vector.pass }
    );
    collector.equal(
      'transport',
      'E_TRANSPORT_VECTOR_MISMATCH',
      'vector ' + vector.name + ' wire id',
      vector.expectedWireId,
      captured.id,
      { logicalId, pass: vector.pass }
    );
    if (captured.binary) {
      collector.equal(
        'transport',
        'E_TRANSPORT_VECTOR_MISMATCH',
        'vector ' + vector.name + ' payload',
        vector.expectedWirePayloadHex,
        captured.data.toString('hex'),
        { plainPayloadHex: vector.plainPayloadHex }
      );
    } else {
      collector.record(false, 'transport', 'E_TRANSPORT_VECTOR_MISMATCH', 'vector ' + vector.name + ' payload', 'binary payload', 'json payload');
    }

    if (vector.name === (vectors[0] && vectors[0].name)) {
      const actualSendKey = (11 * subject.protocol.VERSION + 7) >>> 0;
      const actualExpKey = (actualMask
        ^ vector.pass[2]
        ^ vector.pass.length
        ^ vector.pass[6]
        ^ actualSendKey) >>> 0;
      collector.equal('transport', 'E_SEND_KEY_MISMATCH', 'observed transport key', fixtures.transport.sendKey, actualSendKey);
      collector.equal('transport', 'E_TRANSPORT_EXP_KEY_MISMATCH', 'observed transport exp key', fixtures.transport.expKey, actualExpKey);
    }
  }
}

function checkIds(collector, fixtures, subject) {
  const inboundExpected = new Set(fixtures.packets.inbound.schemaIds);
  const inboundActual = productInboundIdSet(subject.protocol);
  for (const id of inboundExpected) {
    if (!inboundActual.has(id)) {
      collector.record(false, 'ids', 'E_INBOUND_ID_MISSING', 'inbound id ' + id, 'present', 'missing');
    }
  }
  for (const id of inboundActual) {
    if (!inboundExpected.has(id)) {
      collector.record(false, 'ids', 'E_INBOUND_ID_UNEXPECTED', 'inbound id ' + id, 'absent', 'present');
    }
  }

  const outboundExpected = new Set(fixtures.packets.outbound.ids);
  const outboundActual = productOutboundIdSet(subject.protocol);
  for (const id of outboundExpected) {
    if (!outboundActual.has(id)) {
      collector.record(false, 'ids', 'E_OUTBOUND_ID_MISSING', 'outbound id ' + id, 'present', 'missing');
    }
  }
  for (const id of outboundActual) {
    if (!outboundExpected.has(id)) {
      collector.record(false, 'ids', 'E_OUTBOUND_ID_UNEXPECTED', 'outbound id ' + id, 'absent', 'present');
    }
  }
}

function checkSchemas(collector, fixtures, subject) {
  const cases = [
    ['inbound', 'E_INBOUND_SCHEMA_SIGNATURE_MISMATCH', fixtures.packets.inbound.schemaSignatures],
    ['outbound', 'E_OUTBOUND_SCHEMA_SIGNATURE_MISMATCH', fixtures.packets.outbound.schemaSignatures]
  ];
  for (const [direction, reason, expectedMap] of cases) {
    const actualMap = productSchemaMap(subject.protocol, direction);
    for (const [idText, expected] of Object.entries(expectedMap)) {
      const id = Number(idText);
      const candidates = actualMap.get(id);
      if (!candidates) continue; // missing ids are reported by the `ids` category
      const matched = candidates.some((candidate) => candidate.sha256 === expected.sha256);
      collector.record(
        matched,
        'schemas',
        reason,
        direction + ' schema id ' + id,
        expected.sha256,
        candidates.map((candidate) => candidate.sha256),
        { expectedSignature: expected.signature, candidates }
      );
    }
  }
}

function checkRegistry(collector, fixtures, subject) {
  const production = !subject.registry;
  const productRegistry = subject.registry || loadProductRegistry();
  if (!productRegistry) {
    collector.record(false, 'registry', 'E_REGISTRY_MISSING', 'bloxd/types/registry-*.json', 'present', 'missing');
    return;
  }
  const entries = Object.entries(productRegistry.table);
  collector.equal('registry', 'E_REGISTRY_COUNT_MISMATCH', 'registry name count', fixtures.registry.nameCount, entries.length, { file: productRegistry.file });
  collector.equal('registry', 'E_REGISTRY_DIGEST_MISMATCH', 'registry digest', fixtures.registry.digest.value, registryDigest(productRegistry.table), { file: productRegistry.file });

  const project = (table, anchor) => {
    const raw = table[anchor.id];
    const value = raw && typeof raw === 'object' ? raw : { name: raw };
    const result = {};
    for (const key of Object.keys(anchor)) result[key] = key === 'id' ? anchor.id : value[key];
    return result;
  };
  for (const anchor of fixtures.registry.anchors.blocks) {
    collector.equal('registry', 'E_REGISTRY_ANCHOR_MISMATCH', 'block id ' + anchor.id, anchor, project(productRegistry.table, anchor));
  }
  const itemTable = productRegistry.itemTable || productRegistry.table;
  for (const anchor of fixtures.registry.anchors.items) {
    collector.equal('registry', 'E_REGISTRY_ANCHOR_MISMATCH', 'item id ' + anchor.id, anchor, project(itemTable, anchor));
  }
  for (const anchor of fixtures.registry.anchors.names) {
    const found = entries.find(([, value]) => registryEntryName(value) === anchor.name);
    const itemId = productRegistry.itemNameView ? productRegistry.itemNameView[anchor.name] : undefined;
    const itemFound = itemId === undefined && itemTable !== productRegistry.table
      ? Object.entries(itemTable).find(([, value]) => registryEntryName(value) === anchor.name)
      : undefined;
    const actualId = found ? Number(found[0]) : (itemId !== undefined ? itemId : (itemFound ? Number(itemFound[0]) : undefined));
    collector.equal('registry', 'E_REGISTRY_ANCHOR_MISMATCH', 'name ' + anchor.name + ' id', anchor.id, actualId);
  }

  const atlas = productRegistry.atlas || (subject.registry && subject.registry.atlas) || null;
  for (const anchor of fixtures.registry.anchors.atlas) {
    const actual = atlas && atlas.byName ? atlas.byName[anchor.name] : undefined;
    collector.equal('registry', 'E_REGISTRY_ANCHOR_MISMATCH', 'atlas anchor ' + anchor.name, anchor.index, actual);
  }

  const assets = productRegistry.assetReferences || subject.assetReferences || null;
  const expectedAssets = fixtures.registry.assetReferences;
  collector.equal('registry', 'E_REGISTRY_ASSET_REFERENCE_MISMATCH', 'asset reference count', expectedAssets.count, assets ? assets.referenceCount : undefined);
  collector.equal('registry', 'E_REGISTRY_ASSET_REFERENCE_MISMATCH', 'asset entries without reference', expectedAssets.entriesWithoutReference, assets ? assets.entriesWithoutReference : undefined);
  collector.equal('registry', 'E_REGISTRY_ASSET_REFERENCE_MISMATCH', 'missing assets', expectedAssets.missingAssets, assets ? assets.missingAssets : undefined);
  collector.equal('registry', 'E_REGISTRY_ASSET_REFERENCE_MISMATCH', 'historical asset fallback', expectedAssets.noHistoricalFallback, assets ? assets.noHistoricalFallback : undefined);

  // Production-only structural checks: the fixture subject deliberately keeps
  // the frozen evidence table and has no item module / name view.
  if (production) {
    const result = registryFaults(productRegistry, loadProductItems());
    for (const error of result.errors) {
      collector.record(false, 'registry', error.code, error.subject, error.expected, error.actual, error.detail);
    }
    if (result.summary) {
      collector.equal('registry', 'E_REGISTRY_RUNTIME_KEY_COUNT_MISMATCH', 'runtime registry keys', REGISTRY_EXPECTED.runtimeExpandedKeyCount, result.summary.runtimeKeys);
      collector.record(result.summary.numericIds > 0, 'registry', 'E_REGISTRY_EMPTY', 'numeric registry ids > 0', true, result.summary.numericIds);
      collector.equal('registry', 'E_REGISTRY_DUPLICATE_ID', 'duplicate registry ids', 0, result.summary.duplicateId);
      collector.equal('registry', 'E_REGISTRY_UNRESOLVED_EXISTING', 'unresolved existing handler item names', 0, result.summary.unresolvedExisting);
      collector.equal('registry', 'E_REGISTRY_SILENT_FALLBACK', 'silent item fallbacks', 0, result.summary.silentFallback);
    }
  }
}

function checkHandlers(collector, fixtures, subject) {
  const actual = subject.handlerVocabulary || productHandlerVocabulary(subject.protocol);
  const expected = new Set(fixtures.handlers.inboundHandlerIds);
  for (const id of expected) {
    if (!actual.ids.has(id)) {
      collector.record(false, 'handlers', 'E_HANDLER_ID_MISSING', 'inbound handler id ' + id, 'registered', 'missing');
    }
  }
  for (const id of actual.ids) {
    if (!expected.has(id)) {
      collector.record(false, 'handlers', 'E_HANDLER_ID_UNEXPECTED', 'inbound handler id ' + id, 'absent', 'registered');
    }
  }
  collector.equal(
    'handlers',
    'E_HANDLER_SCHEMA_COVERAGE_MISMATCH',
    'handlers with inbound schema',
    fixtures.handlers.handledSchemaIds.length,
    actual.withSchema.size,
    { vocabulary: [...actual.names].sort() }
  );

  const binaryIds = new Set(Object.entries(subject.protocol.INBOUND_IDS)
    .filter(([name]) => Boolean(subject.protocol.INBOUND_SCHEMAS[name]))
    .map(([, id]) => id));
  const schemaOnly = [...binaryIds].filter((id) => !actual.ids.has(id)).sort((a, b) => a - b);
  const handlerWithoutSchema = [...actual.ids].filter((id) => !binaryIds.has(id)).sort((a, b) => a - b);
  collector.equal('handlers', 'E_HANDLER_DISPOSITION_MISMATCH', 'schema-only inbound ids', fixtures.handlers.schemaOnlyIds, schemaOnly);
  collector.equal('handlers', 'E_HANDLER_DISPOSITION_MISMATCH', 'handler-without-schema inbound ids', fixtures.handlers.handlerWithoutSchemaIds, handlerWithoutSchema);
}

function collectHandlerCallSites() {
  const dir = path.join(ROOT, 'bloxd', 'handlers', 'impl');
  const sites = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.js')) continue;
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    const searchable = source
      .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, '');
    const pattern = /(?:bClient|bloxDClient)\.send\(\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = pattern.exec(searchable)) !== null) {
      sites.push({
        name: match[1],
        file: 'bloxd/handlers/impl/' + file,
        line: source.slice(0, match.index).split('\n').length
      });
    }
  }
  return sites;
}

function collectHandlerInboundNames() {
  const dir = path.join(ROOT, 'bloxd', 'handlers', 'impl');
  const names = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.js')) continue;
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    const pattern = /bClient\.on\(\s*['"](SPacket[A-Za-z0-9_]+)['"]/g;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      if (!names.some((entry) => entry.name === match[1])) {
        names.push({ name: match[1], file: 'bloxd/handlers/impl/' + file });
      }
    }
  }
  return names;
}

function subsetMatches(expected, actual) {
  if (Array.isArray(expected)) {
    return Array.isArray(actual)
      && expected.length === actual.length
      && expected.every((value, index) => subsetMatches(value, actual[index]));
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') return false;
    return Object.entries(expected).every(([key, value]) => subsetMatches(value, actual[key]));
  }
  return isDeepStrictEqual(expected, actual);
}

function probeHandlerOutbound(subject, site, payloadOverride, hasOverride) {
  const protocol = subject.protocol;
  const name = site.name;
  const payload = hasOverride ? payloadOverride : HANDLER_OUTBOUND_PAYLOADS[name];
  const resolved = typeof protocol.OUTBOUND_IDS[name] === 'number'
    || Boolean(protocol.OUTBOUND_JSON && protocol.OUTBOUND_JSON[name])
    || Boolean(protocol.OUTBOUND_UNSUPPORTED && protocol.OUTBOUND_UNSUPPORTED[name]);
  const expectedId = HANDLER_OUTBOUND_IDS[name];
  const declaredId = protocol.OUTBOUND_IDS[name];
  const jsonId = protocol.OUTBOUND_JSON && protocol.OUTBOUND_JSON[name] ? protocol.OUTBOUND_JSON[name].id : undefined;
  const idMatches = typeof expectedId === 'number'
    ? declaredId === expectedId && (jsonId === undefined || jsonId === expectedId)
    : false;
  const result = {
    name, file: site.file, line: site.line, resolved, expectedId, declaredId, jsonId, idMatches,
    unsupported: Boolean(protocol.OUTBOUND_UNSUPPORTED && protocol.OUTBOUND_UNSUPPORTED[name]),
    encodeFailure: false, swallowed: false, valueAsserted: false, unsupportedResolved: false, error: null
  };
  if (!resolved) return result;

  if (result.unsupported) {
    const client = probeClient(subject);
    const errors = captureProtocolErrors(client, () => client.send(name, payload)).map((error) => error.code);
    result.unsupportedResolved = errors.includes('E_PROTOCOL_UNSUPPORTED_OUTBOUND')
      && client.__sends.length === 0
      && protocolCounter(client, 'unsupportedOutbound') > 0;
    return result;
  }

  let decoded;
  try {
    if (protocol.OUTBOUND_JSON && protocol.OUTBOUND_JSON[name]) {
      decoded = protocol.encodeOutbound(name, payload);
    } else {
      const encoded = protocol.encodeOutbound(name, payload);
      const type = protocol.OUTBOUND_SCHEMAS[name];
      decoded = type.fromBuffer(encoded);
    }
  } catch (err) {
    result.encodeFailure = true;
    result.error = err.message;
  }

  if (!result.encodeFailure && Object.prototype.hasOwnProperty.call(HANDLER_OUTBOUND_EXPECTATIONS, name)) {
    result.valueAsserted = result.idMatches && subsetMatches(HANDLER_OUTBOUND_EXPECTATIONS[name], decoded);
  }

  const client = probeClient(subject);
  const before = protocolCounter(client, 'encodeFailed');
  const errors = captureProtocolErrors(client, () => client.send(name, payload)).map((error) => error.code);
  const after = protocolCounter(client, 'encodeFailed');
  if (after > before || errors.includes('E_PROTOCOL_ENCODE_FAILED')) result.encodeFailure = true;
  if (!result.encodeFailure && client.__sends.length === 0) result.swallowed = true;
  return result;
}

function probeHandlerInbound(subject, entry) {
  const protocol = subject.protocol;
  const name = entry.name;
  const hasId = typeof protocol.INBOUND_IDS[name] === 'number'
    || Boolean(protocol.INBOUND_JSON && protocol.INBOUND_JSON[name]);
  const alias = HANDLER_INBOUND_ALIASES[name];
  const result = { name, file: entry.file, resolved: hasId || Boolean(alias), valueAsserted: false, alias: Boolean(alias), error: null };
  if (!result.resolved) return result;
  if (alias) {
    const ledger = protocol.PROTOCOL_LEDGER || { inbound: [] };
    result.valueAsserted = (ledger.inbound || []).some((row) => row.name === name && row.disposition === 'ignored');
    return result;
  }
  const probe = HANDLER_INBOUND_PROBES[name];
  if (!probe) return result;
  try {
    const type = protocol.INBOUND_SCHEMAS[name];
    const decoded = type
      ? protocol.decodeInbound(name, type.toBuffer(probe.payload))
      : protocol.decodeInbound(name, probe.payload);
    result.valueAsserted = subsetMatches(probe.expected, decoded);
    result.decoded = decoded;
  } catch (err) {
    result.error = err.message;
  }
  return result;
}

function ledgerRuntimeMismatches(protocol) {
  const mismatches = [];
  const runtimeById = new Map();
  const runtimeNameIds = new Map();
  for (const [name, id] of Object.entries(protocol.OUTBOUND_IDS || {})) {
    runtimeNameIds.set(name, id);
    if (!runtimeById.has(id)) runtimeById.set(id, []);
    runtimeById.get(id).push(name);
  }
  for (const [name, spec] of Object.entries(protocol.OUTBOUND_JSON || {})) {
    runtimeNameIds.set(name, spec.id);
    if (!runtimeById.has(spec.id)) runtimeById.set(spec.id, []);
    if (!runtimeById.get(spec.id).includes(name)) runtimeById.get(spec.id).push(name);
  }
  const unsupported = protocol.OUTBOUND_UNSUPPORTED || {};
  const runtimeCallSiteIds = new Set(Object.values(protocol.OUTBOUND_CALL_SITE_IDS || {}));
  const handlerNames = new Set(HANDLER_CALL_SITE_MANIFEST.names);
  const ledger = protocol.PROTOCOL_LEDGER || { outbound: [] };
  const rows = Array.isArray(ledger.outbound) ? ledger.outbound : [];
  for (const row of rows) {
    if (typeof row.id !== 'number') continue;
    const names = runtimeById.get(row.id) || [];
    if (!names.includes(row.name)) {
      mismatches.push({ id: row.id, name: row.name, reason: 'name-not-runtime-for-id', runtimeNames: names });
    }
    if (runtimeNameIds.get(row.name) !== row.id) {
      mismatches.push({ id: row.id, name: row.name, reason: 'runtime-id-mismatch', runtimeId: runtimeNameIds.get(row.name) });
    }
    if (Object.prototype.hasOwnProperty.call(unsupported, row.name)) {
      mismatches.push({ id: row.id, name: row.name, reason: 'unsupported-name-has-numeric-ledger-row' });
    }
    if ((runtimeCallSiteIds.has(row.id) || handlerNames.has(row.name)) && row.disposition !== 'implemented') {
      mismatches.push({ id: row.id, name: row.name, reason: 'numeric-row-not-implemented', disposition: row.disposition });
    }
    if (protocol.OUTBOUND_SCHEMAS && protocol.OUTBOUND_SCHEMAS[row.name]) {
      if (row.codec !== 'avsc' || !row.schema || row.schema.source !== 'generated/outbound-schemas.json' || row.schema.id !== row.id) {
        mismatches.push({ id: row.id, name: row.name, reason: 'schema-row-mismatch', codec: row.codec, schema: row.schema });
      }
    } else if (protocol.OUTBOUND_JSON && protocol.OUTBOUND_JSON[row.name]) {
      if (row.codec !== 'json-passthrough' || row.schema !== null) {
        mismatches.push({ id: row.id, name: row.name, reason: 'json-row-mismatch', codec: row.codec, schema: row.schema });
      }
    } else {
      mismatches.push({ id: row.id, name: row.name, reason: 'runtime-codec-missing' });
    }
  }
  for (const [id, names] of runtimeById) {
    for (const name of names) {
      if (!rows.some((row) => row.id === id && row.name === name)) {
        mismatches.push({ id, name, reason: 'runtime-name-missing-ledger-row' });
      }
    }
  }
  for (const name of Object.keys(unsupported)) {
    const row = rows.find((entry) => entry.name === name);
    if (!row) {
      mismatches.push({ id: null, name, reason: 'unsupported-name-missing-ledger-row' });
      continue;
    }
    if (row.id !== null || row.disposition !== 'unsupported' || row.codec !== 'none' || row.schema !== null) {
      mismatches.push({ id: row.id, name, reason: 'unsupported-row-shape', disposition: row.disposition, codec: row.codec, schema: row.schema });
    }
  }
  return mismatches;
}

function damageFieldCount(protocol) {
  const fields = schemaFieldNames(protocol.INBOUND_SCHEMAS.SPacketEntityDamage);
  return Array.isArray(fields) ? fields.length : -1;
}

function checkHandlerSites(collector, subject) {
  const protocol = subject.protocol;
  const sites = collectHandlerCallSites();
  const uniqueSites = [];
  for (const site of sites) if (!uniqueSites.some((entry) => entry.name === site.name)) uniqueSites.push(site);
  const outbound = uniqueSites.map((site) => probeHandlerOutbound(subject, site));
  const unresolvedSites = outbound.filter((result) => !result.resolved).length;
  const idMismatches = outbound.filter((result) => !result.unsupported && !result.idMatches).length;
  const encodeFailures = outbound.filter((result) => result.encodeFailure).length;
  const swallowedErrors = outbound.filter((result) => result.swallowed).length;
  const unsupportedSites = outbound.filter((result) => result.unsupported).length;
  const unsupportedResolved = outbound.filter((result) => result.unsupportedResolved).length;
  const supportedSites = outbound.filter((result) => !result.unsupported).length;
  const outboundValueAssertions = outbound.filter((result) => result.valueAsserted).length;
  const expectedSupportedSites = Object.keys(HANDLER_OUTBOUND_IDS).length;
  const expectedUnsupportedSites = HANDLER_CALL_SITE_MANIFEST.names.filter((name) => !Object.prototype.hasOwnProperty.call(HANDLER_OUTBOUND_IDS, name)).length;

  const inboundEntries = collectHandlerInboundNames();
  const inbound = inboundEntries.map((entry) => probeHandlerInbound(subject, entry));
  const unresolvedInbound = inbound.filter((result) => !result.resolved).length;
  const inboundValueAssertions = inbound.filter((result) => result.valueAsserted).length;

  const damageFields = damageFieldCount(protocol);
  const removeMap = protocol.INBOUND_FIELD_MAPS && protocol.INBOUND_FIELD_MAPS.SPacketRemoveEffect;
  const removeEffectField = removeMap && removeMap.lifeformId ? 'lifeformId' : null;
  const removeEffectWireField = removeMap && removeMap.lifeformId ? removeMap.lifeformId : null;
  const removeHandlerSource = fs.readFileSync(path.join(ROOT, 'bloxd', 'handlers', 'impl', 'entity.js'), 'utf8');
  const removeBlockStart = removeHandlerSource.indexOf("bClient.on('SPacketRemoveEffect'");
  const removeBlockEnd = removeBlockStart < 0 ? -1 : removeHandlerSource.indexOf('bClient.on(', removeBlockStart + 10);
  const removeBlock = removeBlockStart < 0 ? '' : removeHandlerSource.slice(removeBlockStart, removeBlockEnd < 0 ? undefined : removeBlockEnd);
  const removeUsesLifeformId = /data\.lifeformId/.test(removeBlock) && !/data\.playerId/.test(removeBlock);
  const ledgerMismatches = ledgerRuntimeMismatches(protocol);
  collector.equal('handlers', 'E_LEDGER_RUNTIME_MISMATCH', 'outbound ledger/runtime mismatches', 0, ledgerMismatches.length, { ledgerMismatches });

  const manifest = HANDLER_CALL_SITE_MANIFEST;
  const actualNames = [...new Set(sites.map((site) => site.name))].sort();
  const actualFiles = {};
  for (const site of sites) {
    const file = path.basename(site.file);
    actualFiles[file] = (actualFiles[file] || 0) + 1;
  }
  collector.equal('handlers', 'E_HANDLER_OUTBOUND_MANIFEST', 'handler call-site count', manifest.count, sites.length);
  collector.equal('handlers', 'E_HANDLER_OUTBOUND_MANIFEST', 'handler call-site names', manifest.names.slice().sort(), actualNames);
  collector.equal('handlers', 'E_HANDLER_OUTBOUND_MANIFEST', 'handler call-site files', manifest.files, actualFiles);
  collector.equal('handlers', 'E_HANDLER_OUTBOUND_MANIFEST', 'unique handler send names', manifest.names.length, uniqueSites.length);
  const byOutboundId = new Map();
  for (const [name, id] of Object.entries(protocol.OUTBOUND_IDS || {})) {
    if (!byOutboundId.has(id)) byOutboundId.set(id, []);
    byOutboundId.get(id).push(name);
  }
  const unresolvedDuplicateIds = [];
  for (const [id, names] of byOutboundId) {
    if (names.length < 2) continue;
    for (const name of names.slice(1)) {
      const declared = (protocol.OUTBOUND_ALIASES && protocol.OUTBOUND_ALIASES[name])
        || (protocol.OUTBOUND_JSON_ALIASES && protocol.OUTBOUND_JSON_ALIASES[name]);
      if (!declared) unresolvedDuplicateIds.push({ id, names, name });
    }
  }
  collector.equal('handlers', 'E_HANDLER_DUPLICATE_ID', 'outbound duplicate ids without explicit alias', 0, unresolvedDuplicateIds.length, { unresolvedDuplicateIds });
  collector.record(manifest.count > 0, 'handlers', 'E_HANDLER_OUTBOUND_EMPTY', 'handler send call sites', '> 0', manifest.count);
  collector.equal('handlers', 'E_HANDLER_OUTBOUND_UNRESOLVED', 'unresolved handler send sites', 0, unresolvedSites, { sites: outbound.filter((result) => !result.resolved) });
  collector.equal('handlers', 'E_HANDLER_OUTBOUND_ID', 'handler send id mismatches', 0, idMismatches, { sites: outbound.filter((result) => !result.unsupported && !result.idMatches) });
  collector.equal('handlers', 'E_HANDLER_OUTBOUND_ENCODE', 'handler send encode failures', 0, encodeFailures, { sites: outbound.filter((result) => result.encodeFailure) });
  collector.equal('handlers', 'E_HANDLER_OUTBOUND_SWALLOWED', 'swallowed handler encode errors', 0, swallowedErrors, { sites: outbound.filter((result) => result.swallowed) });
  collector.equal('handlers', 'E_HANDLER_OUTBOUND_SUPPORTED', 'supported handler send sites', expectedSupportedSites, supportedSites);
  collector.equal('handlers', 'E_HANDLER_OUTBOUND_UNSUPPORTED', 'explicit unsupported handler send sites', expectedUnsupportedSites, unsupportedResolved, { unsupported: outbound.filter((result) => result.unsupported) });
  collector.equal('handlers', 'E_HANDLER_VALUE_ASSERTION', 'outbound handler value assertions', expectedSupportedSites, outboundValueAssertions, { names: outbound.filter((result) => !result.unsupported && !result.valueAsserted) });
  collector.equal('handlers', 'E_HANDLER_INBOUND_UNRESOLVED', 'unresolved handler inbound subscriptions', 0, unresolvedInbound, { names: inbound.filter((result) => !result.resolved) });
  collector.equal('handlers', 'E_HANDLER_VALUE_ASSERTION', 'inbound handler value assertions', inbound.length, inboundValueAssertions, { names: inbound.filter((result) => !result.valueAsserted) });
  collector.equal('handlers', 'E_ENTITY_DAMAGE_FIELD_COUNT', '846 EntityDamage field count', 7, damageFields, { mapped: protocol.INBOUND_FIELD_MAPS && protocol.INBOUND_FIELD_MAPS.SPacketEntityDamage });
  collector.equal('handlers', 'E_REMOVE_EFFECT_FIELD_MISMATCH', 'RemoveEffect handler-facing field', 'lifeformId', removeEffectField, { wireField: removeEffectWireField });
  collector.record(removeUsesLifeformId, 'handlers', 'E_REMOVE_EFFECT_FIELD_MISMATCH', 'RemoveEffect handler consumes lifeformId', true, removeBlock.match(/data\.[A-Za-z0-9_]+/g));

  collector.handlers = {
    outboundSites: sites.length,
    manifestCallSiteCount: manifest.count,
    manifestNames: manifest.names.length,
    uniqueOutboundSites: uniqueSites.length,
    supportedSites,
    expectedSupportedSites,
    unsupportedSites,
    expectedUnsupportedSites,
    unsupportedResolved,
    idMismatches,
    unresolvedSites,
    encodeFailures,
    swallowedErrors,
    outboundValueAssertions,
    inboundSubscriptions: inbound.length,
    unresolvedInbound,
    inboundValueAssertions,
    damageFields,
    damageMappedFields: protocol.INBOUND_FIELD_MAPS && Object.keys(protocol.INBOUND_FIELD_MAPS.SPacketEntityDamage || {}),
    removeEffectField,
    removeEffectWireField,
    unresolvedDuplicateIds: unresolvedDuplicateIds.length,
    ledgerMismatches: ledgerMismatches.length,
    unsupported: outbound.filter((result) => result.unsupported).map((result) => result.name),
    siteDetails: outbound
  };
}

function checkItems(collector, fixtures, subject) {
  const expectations = fixtures.items.componentExpectations;
  let translated;
  let stack;
  try {
    if (subject.itemConversion) {
      translated = subject.itemConversion.translateItem({ name: expectations.sourceName, amount: 1 });
      stack = subject.itemConversion.itemStack(translated);
    } else {
      const utils = require(path.join(ROOT, 'bloxd', 'utils.js'));
      const mcRegistry = require(path.join(ROOT, 'mc', 'registry.js'));
      translated = utils.translateItem({
        name: expectations.sourceName,
        amount: 1,
        attributes: { customAttributes: {} }
      });
      stack = mcRegistry.itemStack(translated);
    }
  } catch (err) {
    collector.record(false, 'items', 'E_ITEM_COMPONENT_LOSS', 'item conversion modules', 'loadable', 'threw: ' + err.message);
    return;
  }

  const components = Array.isArray(stack.components) ? stack.components : [];
  const componentTypes = components.map((component) => component && component.type).filter(Boolean);
  if (stack.itemModel !== undefined) componentTypes.push('item_model');
  if (stack.customName !== undefined || stack.custom_name !== undefined) componentTypes.push('custom_name');

  const identityValues = [
    translated && translated.name,
    translated && translated.displayName,
    components.find((component) => component && component.type === 'custom_name')
  ].filter((value) => typeof value === 'string' && value.length > 0);
  const identityOk = identityValues.includes(expectations.sourceName) || identityValues.includes(expectations.displayName);
  collector.record(
    identityOk,
    'items',
    'E_ITEM_COMPONENT_LOSS',
    'translated item preserves Bloxd identity',
    [expectations.sourceName, expectations.displayName],
    identityValues,
    { translated: translated && { name: translated.name, displayName: translated.displayName } }
  );

  for (const counter of expectations.requiredCounters) {
    collector.equal(
      'items',
      'E_ITEM_COMPONENT_LOSS',
      'itemStack.' + counter,
      expectations.counterValues[counter],
      stack[counter],
      { stackKeys: Object.keys(stack) }
    );
  }
  for (const componentType of expectations.requiredComponentTypes) {
    collector.record(
      componentTypes.includes(componentType),
      'items',
      'E_ITEM_COMPONENT_LOSS',
      'itemStack component ' + componentType,
      'present',
      componentTypes,
      { components }
    );
  }
  for (const componentType of expectations.forbiddenComponentTypes || []) {
    collector.record(
      !componentTypes.includes(componentType),
      'items',
      'E_ITEM_COMPONENT_LOSS',
      'itemStack component ' + componentType + ' forbidden',
      'absent',
      componentTypes,
      { components }
    );
  }
}

function inboundSchemaById(protocol, id) {
  const ids = protocol && protocol.INBOUND_IDS;
  const schemas = protocol && protocol.INBOUND_SCHEMAS;
  if (!ids || !schemas) return null;
  for (const [name, value] of Object.entries(ids)) {
    if (value === id) return schemas[name] || null;
  }
  return null;
}

function checkDefects(collector, fixtures, subject) {
  const defect = fixtures.defects;

  // The fixture defect is keyed by its captured wire id (117). Resolve that id
  // instead of assuming the semantic name SPacketEntityDamage still owns it;
  // in 846 id 117 is SPacketServerSetting (UT/KT) and 122 is EntityDamage.
  const damageType = inboundSchemaById(subject.protocol, defect.entityDamage.id)
    || subject.protocol.INBOUND_SCHEMAS.SPacketEntityDamage;
  let damageFields = null;
  try {
    damageFields = damageType && typeof damageType.schema === 'function' ? damageType.schema().fields : null;
  } catch (err) {
    damageFields = null;
  }
  const damageCount = Array.isArray(damageFields) ? damageFields.length : -1;
  if (subject.protocol.VERSION === 840) {
    collector.equal(
      'defects',
      'E_ENTITY_DAMAGE_FIELD_COUNT',
      'SPacketEntityDamage fields vs captured 840 baseline',
      defect.entityDamage.baseline840FieldCount,
      damageCount,
      { expected846FieldCount: defect.entityDamage.expected846TopFieldCount }
    );
  }
  collector.equal(
    'defects',
    'E_ENTITY_DAMAGE_FIELD_COUNT',
    'SPacketEntityDamage fields vs generated 846 schema',
    defect.entityDamage.expected846TopFieldCount,
    damageCount,
    { baseline840FieldCount: defect.entityDamage.baseline840FieldCount }
  );

  if (subject.protocol.VERSION === 840) {
  const productRemove = defect.removeEffect.product;
  const removeType = subject.protocol.INBOUND_SCHEMAS.SPacketRemoveEffect;
  let removeFields = [];
  let usedFields = [];
  if (subject.removeEffect) {
    removeFields = [subject.removeEffect.schemaField];
    usedFields = subject.removeEffect.usedFields;
  } else {
    try {
      removeFields = removeType && typeof removeType.schema === 'function'
        ? removeType.schema().fields.map((field) => field.name)
        : [];
    } catch (err) {
      removeFields = [];
    }
    const handlerPath = path.join(ROOT, ...productRemove.handlerSource.split('/'));
    const handlerSource = fs.readFileSync(handlerPath, 'utf8');
    const start = handlerSource.indexOf("bClient.on('SPacketRemoveEffect'");
    const end = start < 0 ? -1 : handlerSource.indexOf('bClient.on(', start + 10);
    const handlerBlock = start < 0 ? '' : handlerSource.slice(start, end < 0 ? undefined : end);
    usedFields = [...handlerBlock.matchAll(/data\.([A-Za-z0-9_]+)/g)].map((match) => match[1]);
  }
  collector.record(
    removeFields.includes(productRemove.schemaField),
    'defects',
    'E_REMOVE_EFFECT_FIELD_MISMATCH',
    'SPacketRemoveEffect schema exposes ' + productRemove.schemaField,
    true,
    removeFields,
    { usedFields }
  );
  collector.record(
    usedFields.includes(productRemove.schemaField),
    'defects',
    'E_REMOVE_EFFECT_FIELD_MISMATCH',
    'SPacketRemoveEffect handler consumes ' + productRemove.schemaField,
    true,
    usedFields,
    { schemaFields: removeFields }
  );
  }

  const missingCodecs = [];
  for (const [name, id] of Object.entries(subject.protocol.OUTBOUND_IDS)) {
    if (!subject.protocol.OUTBOUND_SCHEMAS[name] && !subject.protocol.OUTBOUND_JSON[name]) {
      missingCodecs.push(name + ':' + id);
    }
  }
  for (const missing of missingCodecs) {
    collector.record(false, 'defects', 'E_OUTBOUND_CODEC_MISSING', 'outbound codec ' + missing, 'codec present', 'missing');
  }
}

function ledgerEntries(ledger, direction) {
  const rows = direction === 'inbound' ? ledger.inbound : ledger.outbound;
  return Array.isArray(rows) ? rows : [];
}

function evidenceIdSet(evidence, direction) {
  if (direction === 'inbound') {
    return new Set([].concat(evidence.inboundIds.schemaIds, evidence.inboundIds.handlerIds));
  }
  return new Set([].concat(evidence.outboundIds.schemaIds, evidence.outboundIds.callSiteIds));
}

/*
 * Independent disposition check: the ledger must cover the generated evidence
 * exactly, must not contain removed/unknown ids, must resolve every duplicate
 * explicitly, and may not carry an un-evidenced ("guessed") schema.
 */
function validateLedgerAgainstEvidence(ledger, evidence, bundleOutboundIds) {
  const errors = [];
  if (!ledger || typeof ledger !== 'object' || !Array.isArray(ledger.inbound) || !Array.isArray(ledger.outbound)) {
    errors.push({ code: 'E_LEDGER_MISSING', subject: 'PROTOCOL_LEDGER', expected: 'inbound/outbound arrays', actual: typeof ledger });
    return errors;
  }

  for (const direction of ['inbound', 'outbound']) {
    const expected = evidenceIdSet(evidence, direction);
    if (direction === 'outbound' && bundleOutboundIds) {
      for (const id of bundleOutboundIds) expected.add(id);
    }
    const rows = ledgerEntries(ledger, direction);
    const seen = new Set();
    for (const row of rows) {
      if (row.id === null || row.id === undefined) continue;
      const id = Number(row.id);
      if (!expected.has(id)) {
        errors.push({ code: 'E_PROTOCOL_REMOVED_ID', subject: direction + ' ledger id ' + id, expected: 'id present in generated evidence', actual: id });
      }
      seen.add(id);
      if (row.guessed === true) {
        errors.push({ code: 'E_PROTOCOL_GUESSED_SCHEMA', subject: direction + ' ledger id ' + id, expected: 'evidence-backed schema', actual: 'guessed=true' });
      }
      if (row.schema && row.codec === 'avsc') {
        const source = row.schema.source || '';
        if (!/^generated\/(inbound|outbound)-schemas\.json$/.test(source)) {
          errors.push({ code: 'E_PROTOCOL_GUESSED_SCHEMA', subject: direction + ' ledger id ' + id, expected: 'generated schema source', actual: source });
        }
      }
    }
    for (const id of expected) {
      if (!seen.has(id)) {
        errors.push({ code: 'E_LEDGER_UNACCOUNTED', subject: direction + ' id ' + id, expected: 'ledger disposition', actual: 'missing' });
      }
    }

    const byId = new Map();
    for (const row of rows) {
      if (row.id === null || row.id === undefined) continue;
      if (!byId.has(row.id)) byId.set(row.id, []);
      byId.get(row.id).push(row);
    }
    const declared = new Set((ledger.duplicates || [])
      .filter((entry) => entry.direction === direction)
      .map((entry) => entry.id));
    for (const [id, entries] of byId) {
      if (entries.length > 1 && !declared.has(id)) {
        errors.push({ code: 'E_PROTOCOL_AMBIGUOUS_ID', subject: direction + ' id ' + id, expected: 'explicit duplicate disposition', actual: entries.map((entry) => entry.name) });
      }
    }
  }
  return errors;
}

function probeOutboundSend(subject, name, version, expKey) {
  const pass = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const client = Object.create(subject.BloxClient.prototype);
  client.pass = pass.slice();
  client.connected = true;
  let wireId = null;
  let payload = null;
  client.room = {
    send(id, data) {
      wireId = Number(id);
      payload = data;
    },
    sendBytes(id, data) {
      wireId = Number(id);
      payload = data;
    }
  };
  try {
    client.send(name, { probe: name });
  } catch (err) {
    return { name, declared: subject.protocol.OUTBOUND_IDS[name], error: err.message, wireId, unsrambled: null };
  }
  const mask = (pass[2] ^ pass.length ^ expKey ^ pass[6] ^ (11 * version + 7)) >>> 0;
  const wire = wireId === null ? null : (wireId >>> 0);
  const unsrambled = wire === null ? null : ((wire ^ mask) >>> 0);
  return { name, declared: subject.protocol.OUTBOUND_IDS[name], mask, wireId: wire, unsrambled, payloadType: typeof payload };
}

function checkOutboundCallSiteRegression(collector, fixtures, subject, evidence) {
  if (subject.handlerVocabulary) return; // expected-red fixture has no product names
  const protocol = subject.protocol;
  const outboundIds = protocol.OUTBOUND_IDS || {};
  const callSiteIds = protocol.OUTBOUND_CALL_SITE_IDS || {};
  const outboundJson = protocol.OUTBOUND_JSON || {};
  const ledger = protocol.PROTOCOL_LEDGER;
  const ledgerOutboundById = new Map();
  for (const row of ledgerEntries(ledger, 'outbound')) {
    if (typeof row.id === 'number') ledgerOutboundById.set(row.id, row);
  }
  const evidenceCallSiteIds = new Set(evidence.outboundIds.callSiteWithoutSchemaIds || []);
  const allowedJsonIds = new Set([...evidenceCallSiteIds, ...BUNDLE_OUTBOUND_IDS]);

  const nonNumeric = Object.entries(outboundIds)
    .filter(([, id]) => typeof id !== 'number')
    .map(([name, id]) => ({ name, id, type: typeof id }));
  collector.equal('coverage', 'E_OUTBOUND_ID_NOT_NUMBER', 'all OUTBOUND_IDS values numeric', [], nonNumeric);

  const mismatches = [];
  for (const [name, id] of Object.entries(callSiteIds)) {
    const declared = outboundIds[name];
    if (typeof declared !== 'number' || declared !== id) {
      mismatches.push({ name, callSiteId: id, outboundId: declared, outboundType: typeof declared });
    }
  }
  collector.equal('coverage', 'E_OUTBOUND_CALL_SITE_ID_MISMATCH', 'OUTBOUND_CALL_SITE_IDS resolve numerically through OUTBOUND_IDS', [], mismatches);

  const jsonNamesById = new Map();
  for (const [name, spec] of Object.entries(outboundJson)) {
    if (!jsonNamesById.has(spec.id)) jsonNamesById.set(spec.id, []);
    jsonNamesById.get(spec.id).push(name);
  }
  const unaccountedJsonIds = [...jsonNamesById.keys()].filter((id) => !allowedJsonIds.has(id));
  collector.equal('coverage', 'E_OUTBOUND_CALL_SITE_ID_MISMATCH', 'JSON call-site ids covered by evidence', [], unaccountedJsonIds);

  for (const id of evidenceCallSiteIds) {
    const names = jsonNamesById.get(id) || [];
    collector.record(names.length > 0, 'coverage', 'E_OUTBOUND_CALL_SITE_ID_MISMATCH', 'generated call-site id ' + id + ' has a product JSON name', '>= 1', names);
    for (const name of names) {
      collector.equal('coverage', 'E_OUTBOUND_CALL_SITE_ID_MISMATCH', name + ' OUTBOUND_IDS', id, outboundIds[name]);
      collector.equal('coverage', 'E_OUTBOUND_CALL_SITE_ID_MISMATCH', name + ' OUTBOUND_CALL_SITE_IDS', id, callSiteIds[name]);
      collector.equal('coverage', 'E_OUTBOUND_CALL_SITE_ID_MISMATCH', name + ' OUTBOUND_JSON.id', id, outboundJson[name].id);
      collector.equal('coverage', 'E_OUTBOUND_CALL_SITE_ID_MISMATCH', name + ' ledger id', id, ledgerOutboundById.get(id) && ledgerOutboundById.get(id).id);
      const probe = probeOutboundSend(subject, name, fixtures.packets.version, fixtures.transport.expKey);
      collector.equal('coverage', 'E_OUTBOUND_SEND_ID_MISMATCH', name + ' send roundtrip', id, probe.unsrambled, probe);
    }
  }
}

function checkCoverage(collector, fixtures, subject) {
  const protocol = subject.protocol;
  const ledger = protocol.PROTOCOL_LEDGER;
  if (!ledger || !ledger.counts) {
    collector.record(false, 'coverage', 'E_LEDGER_MISSING', 'PROTOCOL_LEDGER.counts', 'present', 'missing');
    return;
  }
  const evidence = loadGeneratedEvidence();
  const ledgerErrors = validateLedgerAgainstEvidence(ledger, evidence, BUNDLE_OUTBOUND_IDS);
  for (const error of ledgerErrors) {
    collector.record(false, 'coverage', error.code, error.subject, error.expected, error.actual);
  }

  const counts = ledger.counts;
  const inboundActual = productInboundIdSet(protocol);
  const outboundActual = productOutboundIdSet(protocol);
  const vocabulary = subject.handlerVocabulary || productHandlerVocabulary(protocol);
  const byName = new Map();
  for (const row of ledgerEntries(ledger, 'inbound')) if (row.name) byName.set(row.name, row);
  let existingUnsupported = 0;
  for (const name of vocabulary.names) {
    const row = byName.get(name);
    if (row && row.disposition === 'unsupported') existingUnsupported++;
  }
  const expectedCounts = {
    inboundRaw: fixtures.packets.inbound.schemaIds.length,
    inboundCanonical: fixtures.packets.inbound.ids.length,
    inboundHandler: fixtures.handlers.inboundHandlerIds.length,
    inboundSchemaOnly: fixtures.handlers.schemaOnlyIds.length,
    inboundHandlerOnly: fixtures.handlers.handlerWithoutSchemaIds.length,
    outboundRaw: fixtures.packets.outbound.ids.length,
    outboundCallSite: fixtures.packets.outbound.callSiteIds.length,
    outboundCallSiteWithoutSchema: fixtures.packets.outbound.callSiteWithoutSchemaIds.length,
    unaccounted: 0,
    ambiguous: 0,
    guessed: 0,
    existingHandlerIdsUnsupported: 0
  };
  for (const [key, expected] of Object.entries(expectedCounts)) {
    collector.equal('coverage', 'E_COVERAGE_MISMATCH', 'ledger count ' + key, expected, counts[key]);
  }
  collector.equal('coverage', 'E_COVERAGE_MISMATCH', 'product inbound schema ids', expectedCounts.inboundRaw, inboundActual.size);
  collector.equal('coverage', 'E_COVERAGE_MISMATCH', 'product outbound schema ids', expectedCounts.outboundRaw, outboundActual.size);
  collector.equal('coverage', 'E_LEDGER_UNACCOUNTED', 'ledger unaccounted ids', 0, ledgerErrors.filter((error) => error.code === 'E_LEDGER_UNACCOUNTED').length);
  collector.equal('coverage', 'E_PROTOCOL_AMBIGUOUS_ID', 'ledger ambiguous ids', 0, ledgerErrors.filter((error) => error.code === 'E_PROTOCOL_AMBIGUOUS_ID').length);
  collector.equal('coverage', 'E_PROTOCOL_GUESSED_SCHEMA', 'ledger guessed schemas', 0, ledgerErrors.filter((error) => error.code === 'E_PROTOCOL_GUESSED_SCHEMA').length);
  collector.equal('coverage', 'E_PROTOCOL_REMOVED_ID', 'ledger removed ids', 0, ledgerErrors.filter((error) => error.code === 'E_PROTOCOL_REMOVED_ID').length);
  collector.equal('coverage', 'E_HANDLER_UNSUPPORTED', 'existing handler ids marked unsupported', 0, existingUnsupported);
  checkOutboundCallSiteRegression(collector, fixtures, subject, evidence);
}

// ---------------------------------------------------------------------------
// Client behaviour probes (task 9)
// ---------------------------------------------------------------------------

function probeClient(subject) {
  const { EventEmitter } = require('node:events');
  const client = Object.create(subject.BloxClient.prototype);
  client.connected = true;
  client.pass = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  client.pass = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  client.settings = {
    canPickUpItems: true,
    walkingSpeed: 4,
    runningSpeed: 7,
    crouchingSpeed: 2,
    staleSetting: 'stale'
  };
  client.settingsEvent = new EventEmitter();
  client.packetEvent = new EventEmitter();
  client.__sends = [];
  client.room = {
    send(id, data) {
      client.__sends.push({ id: Number(id), data, binary: false });
    },
    sendBytes(id, data) {
      client.__sends.push({ id: Number(id), data: Buffer.from(data), binary: true });
    }
  };
  return client;
}

function protocolCounter(client, key) {
  const counters = client.protocolErrors || client.protocolCounters || {};
  return typeof counters[key] === 'number' ? counters[key] : 0;
}

function captureProtocolErrors(client, run) {
  const errors = [];
  const listener = (error) => errors.push(error);
  client.packetEvent.on('protocol-error', listener);
  try {
    run();
  } finally {
    client.packetEvent.removeListener('protocol-error', listener);
  }
  return errors;
}

function schemaFieldNames(type) {
  if (!type) return null;
  let schema;
  try {
    schema = typeof type.schema === 'function' ? type.schema() : type;
  } catch (err) {
    return null;
  }
  return Array.isArray(schema && schema.fields) ? schema.fields.map((field) => field.name) : null;
}

function firstRecordFields(type, fieldName) {
  if (!type) return null;
  let schema;
  try {
    schema = typeof type.schema === 'function' ? type.schema() : type;
  } catch (err) {
    return null;
  }
  const field = schema && Array.isArray(schema.fields) ? schema.fields.find((entry) => entry.name === fieldName) : null;
  const arrayType = field && field.type && field.type.type === 'array' ? field.type.items : null;
  return arrayType && Array.isArray(arrayType.fields) ? arrayType.fields.map((entry) => entry.name) : null;
}

function encodeProbeInbound(protocol, name, value) {
  const type = protocol.INBOUND_SCHEMAS[name];
  if (!type || typeof type.toBuffer !== 'function') {
    throw failErr('E_CLIENT_PROBE_SCHEMA_MISSING', 'no encodable inbound schema for ' + name);
  }
  return type.toBuffer(value);
}

function collectClientProbes(subject) {
  const protocol = subject.protocol;
  const handlerAvailable = typeof subject.BloxClient.prototype._handleInbound === 'function';
  const ledger = protocol.PROTOCOL_LEDGER || { inbound: [] };
  const ledgerRow = (ledger.inbound || []).find((row) => row.id === CLIENT_SETTINGS_PACKET.id) || null;
  const mapping = protocol.PROTOCOL_SETTINGS || null;

  const probes = {
    handlerAvailable,
    unknownInbound: {
      errors: [],
      counter: 0,
      settingsChanged: false,
      unknownEmitted: false
    },
    decodeFailure: {
      errors: [],
      counter: 0,
      settingsChanged: false,
      decodeErrorEmitted: false
    },
    settings: {
      heuristicPresent: typeof subject.BloxClient.prototype._applySettingsHeuristic === 'function',
      mapping: mapping
        ? { id: mapping.id, name: mapping.name, fields: mapping.fields || null }
        : null,
      ledgerRowName: ledgerRow && ledgerRow.name,
      schemaFields: ledgerRow ? schemaFieldNames(protocol.INBOUND_SCHEMAS[ledgerRow.name]) : null,
      entryFields: ledgerRow ? firstRecordFields(protocol.INBOUND_SCHEMAS[ledgerRow.name], CLIENT_SETTINGS_PACKET.fields[0]) : null,
      localPlayerId: null,
      applied: null,
      settingEvents: [],
      serverSettingEvents: [],
      errors: []
    },
    unknownOutbound: {
      bytesSent: 0,
      errors: [],
      counter: 0
    },
    unsupported: {
      accounted: false,
      nonImplementedRows: 0,
      unsupportedRows: 0,
      unaccounted: [],
      ignoredProbe: null
    }
  };

  if (handlerAvailable) {
    const unknownClient = probeClient(subject);
    const beforeUnknown = JSON.stringify(unknownClient.settings);
    let unknownEvent = null;
    unknownClient.packetEvent.on('unknown', (payload) => { unknownEvent = payload; });
    probes.unknownInbound.errors = captureProtocolErrors(unknownClient, () => {
      unknownClient._handleInbound(9999, { walkingSpeed: 99, _health: 1 });
    }).map((error) => error.code);
    probes.unknownInbound.counter = protocolCounter(unknownClient, 'unknownInbound');
    probes.unknownInbound.settingsChanged = JSON.stringify(unknownClient.settings) !== beforeUnknown;
    probes.unknownInbound.unknownEmitted = Boolean(unknownEvent);
  }

  if (handlerAvailable) {
    const decodeClient = probeClient(subject);
    const beforeDecode = JSON.stringify(decodeClient.settings);
    let decodeErrorEvent = null;
    decodeClient.packetEvent.on('decode-error', (payload) => { decodeErrorEvent = payload; });
    probes.decodeFailure.errors = captureProtocolErrors(decodeClient, () => {
      // SPacketEffectMultiplier id 0 is a float; a one-byte payload cannot
      // satisfy the generated avsc schema.
      decodeClient._handleInbound(0, Buffer.alloc(1));
    }).map((error) => error.code);
    probes.decodeFailure.counter = protocolCounter(decodeClient, 'decodeFailed');
    probes.decodeFailure.settingsChanged = JSON.stringify(decodeClient.settings) !== beforeDecode;
    probes.decodeFailure.decodeErrorEmitted = Boolean(decodeErrorEvent);
  }

  const joinName = CLIENT_SETTINGS_PACKET.joinPacketName;
  const joinId = protocol.INBOUND_IDS[joinName];
  if (handlerAvailable && ledgerRow && joinId !== undefined) {
    const settingsClient = probeClient(subject);
    const localPlayerId = 'probe-local-player';
    const joinBuffer = encodeProbeInbound(protocol, joinName, {
      [CLIENT_SETTINGS_PACKET.joinLocalIdField]: localPlayerId,
      jL: [0, 0]
    });
    settingsClient._handleInbound(joinId, joinBuffer);
    probes.settings.localPlayerId = settingsClient.localPlayerId || null;

    settingsClient.settingsEvent.on('walkingSpeed', (value) => probes.settings.settingEvents.push({ key: 'walkingSpeed', value }));
    settingsClient.settingsEvent.on('canPickUpItems', (value) => probes.settings.settingEvents.push({ key: 'canPickUpItems', value }));
    settingsClient.packetEvent.on('SPacketServerSetting', (value) => probes.settings.serverSettingEvents.push(value));

    const settingsBuffer = encodeProbeInbound(protocol, ledgerRow.name, {
      UT: [{
        wT: localPlayerId,
        vT: null,
        eT: JSON.stringify({ walkingSpeed: 5, canPickUpItems: false }),
        uT: ['staleSetting']
      }],
      KT: []
    });
    probes.settings.errors = captureProtocolErrors(settingsClient, () => {
      settingsClient._handleInbound(CLIENT_SETTINGS_PACKET.id, settingsBuffer);
    }).map((error) => error.code);
    probes.settings.applied = {
      walkingSpeed: settingsClient.settings.walkingSpeed,
      canPickUpItems: settingsClient.settings.canPickUpItems,
      staleSettingPresent: Object.prototype.hasOwnProperty.call(settingsClient.settings, 'staleSetting')
    };
  }

  const outboundClient = probeClient(subject);
  probes.unknownOutbound.errors = captureProtocolErrors(outboundClient, () => {
    outboundClient.send('CPacketDefinitelyUnknown', { probe: true });
  }).map((error) => error.code);
  probes.unknownOutbound.bytesSent = outboundClient.__sends.length;
  probes.unknownOutbound.counter = protocolCounter(outboundClient, 'unknownOutbound');

  const nonImplemented = (ledger.inbound || []).filter((row) => row.disposition !== 'implemented');
  const nonNull = nonImplemented.filter((row) => typeof row.id === 'number');
  const unaccounted = nonNull.filter((row) => (
    protocol.INBOUND_IDS[row.name] !== row.id
    && (!protocol.INBOUND_JSON[row.name] || protocol.INBOUND_JSON[row.name].id !== row.id)
  ));
  probes.unsupported.nonImplementedRows = nonImplemented.length;
  probes.unsupported.unsupportedRows = nonImplemented.filter((row) => row.disposition === 'unsupported').length;
  probes.unsupported.unaccounted = unaccounted.map((row) => ({ id: row.id, name: row.name, disposition: row.disposition }));
  probes.unsupported.accounted = unaccounted.length === 0;

  const ignored = nonImplemented.find((row) => row.disposition === 'ignored' && typeof row.id === 'number' && protocol.INBOUND_JSON[row.name]);
  if (handlerAvailable && ignored) {
    const ignoredClient = probeClient(subject);
    const beforeIgnored = JSON.stringify(ignoredClient.settings);
    probes.unsupported.ignoredProbe = {
      id: ignored.id,
      name: ignored.name,
      errors: captureProtocolErrors(ignoredClient, () => {
        ignoredClient._handleInbound(ignored.id, { probe: true });
      }).map((error) => error.code),
      unknownCounter: protocolCounter(ignoredClient, 'unknownInbound'),
      settingsChanged: JSON.stringify(ignoredClient.settings) !== beforeIgnored
    };
  }

  return probes;
}

function validateClientProbes(probes) {
  const errors = [];
  const push = (code, subject, expected, actual, detail) => {
    errors.push({ code, subject, expected, actual, detail: detail === undefined ? null : detail });
  };

  if (!probes.handlerAvailable) {
    push('E_CLIENT_HANDLER_MISSING', 'BloxClient._handleInbound', 'present', 'missing');
  }

  if (!probes.unknownInbound.errors.includes('E_PROTOCOL_UNKNOWN_INBOUND') || probes.unknownInbound.counter < 1) {
    push('E_CLIENT_UNKNOWN_INBOUND_SILENT_DROP', 'unknown inbound 9999', 'typed E_PROTOCOL_UNKNOWN_INBOUND + counter', {
      errors: probes.unknownInbound.errors,
      counter: probes.unknownInbound.counter
    });
  }
  if (probes.unknownInbound.settingsChanged) {
    push('E_CLIENT_UNKNOWN_INBOUND_SETTINGS_MUTATED', 'unknown inbound 9999 settings', 'unchanged', 'mutated', probes.unknownInbound);
  }

  if (!probes.decodeFailure.errors.includes('E_PROTOCOL_DECODE_FAILED') || probes.decodeFailure.counter < 1) {
    push('E_CLIENT_DECODE_FAILURE_UNTYPED', 'decode failure id 0', 'typed E_PROTOCOL_DECODE_FAILED + counter', {
      errors: probes.decodeFailure.errors,
      counter: probes.decodeFailure.counter
    });
  }
  if (probes.decodeFailure.settingsChanged) {
    push('E_CLIENT_DECODE_FAILURE_SETTINGS_MUTATED', 'decode failure settings', 'unchanged', 'mutated', probes.decodeFailure);
  }

  const settings = probes.settings;
  if (settings.heuristicPresent || !settings.mapping) {
    push('E_CLIENT_SETTINGS_HEURISTIC', 'settings path', 'evidence-backed PROTOCOL_SETTINGS mapping', {
      heuristicPresent: settings.heuristicPresent,
      mapping: settings.mapping
    });
  } else {
    if (settings.mapping.id !== CLIENT_SETTINGS_PACKET.id || settings.mapping.name !== CLIENT_SETTINGS_PACKET.ledgerName) {
      push('E_CLIENT_SETTINGS_PACKET_MISMATCH', 'PROTOCOL_SETTINGS', CLIENT_SETTINGS_PACKET, settings.mapping);
    }
    if (!isDeepStrictEqual(settings.mapping.fields, { entries: 'UT', removed: 'KT', playerId: 'wT', settingsJson: 'eT', removedKeys: 'uT' })) {
      push('E_CLIENT_SETTINGS_PACKET_MISMATCH', 'PROTOCOL_SETTINGS.fields', 'UT/KT/wT/eT/uT evidence map', settings.mapping.fields);
    }
  }
  if (!isDeepStrictEqual(settings.schemaFields, CLIENT_SETTINGS_PACKET.fields)) {
    push('E_CLIENT_SETTINGS_PACKET_MISMATCH', 'settings schema top-level fields', CLIENT_SETTINGS_PACKET.fields, settings.schemaFields);
  }
  if (!isDeepStrictEqual(settings.entryFields, CLIENT_SETTINGS_PACKET.entryFields)) {
    push('E_CLIENT_SETTINGS_PACKET_MISMATCH', 'settings schema entry fields', CLIENT_SETTINGS_PACKET.entryFields, settings.entryFields);
  }
  if (!settings.localPlayerId) {
    push('E_CLIENT_SETTINGS_ROUTE_MISSING', 'local player id from SPacketJoinGame.iL', 'present', settings.localPlayerId);
  }
  const applied = settings.applied || {};
  if (applied.walkingSpeed !== 5 || applied.canPickUpItems !== false || applied.staleSettingPresent !== false) {
    push('E_CLIENT_SETTINGS_NOT_APPLIED', 'local settings after exact settings packet', {
      walkingSpeed: 5,
      canPickUpItems: false,
      staleSettingPresent: false
    }, applied);
  }
  if (!settings.settingEvents.some((event) => event.key === 'walkingSpeed' && event.value === 5)
    || !settings.settingEvents.some((event) => event.key === 'canPickUpItems' && event.value === false)) {
    push('E_CLIENT_SETTINGS_EVENT_MISSING', 'settingsEvent emissions', 'walkingSpeed=5 and canPickUpItems=false', settings.settingEvents);
  }
  if (!settings.serverSettingEvents.some((value) => value && value.walkingSpeed === 5)) {
    push('E_CLIENT_SETTINGS_EVENT_MISSING', 'SPacketServerSetting emission', 'walkspeed 5 object', settings.serverSettingEvents);
  }
  if (settings.errors.length > 0) {
    push('E_CLIENT_SETTINGS_ERROR', 'settings packet protocol errors', [], settings.errors);
  }

  if (probes.unknownOutbound.bytesSent > 0) {
    push('E_CLIENT_UNKNOWN_OUTBOUND_BYTES', 'unknown outbound send', 0, probes.unknownOutbound.bytesSent);
  }
  if (!probes.unknownOutbound.errors.includes('E_PROTOCOL_UNKNOWN_OUTBOUND') || probes.unknownOutbound.counter < 1) {
    push('E_CLIENT_UNKNOWN_OUTBOUND_UNTYPED', 'unknown outbound name', 'typed E_PROTOCOL_UNKNOWN_OUTBOUND + counter', {
      errors: probes.unknownOutbound.errors,
      counter: probes.unknownOutbound.counter
    });
  }

  if (!probes.unsupported.accounted) {
    push('E_CLIENT_UNSUPPORTED_UNACCOUNTED', 'ledger non-implemented inbound ids', 'all non-implemented ids accounted', {
      unsupportedRows: probes.unsupported.unsupportedRows,
      unaccounted: probes.unsupported.unaccounted
    });
  }
  if (probes.unsupported.ignoredProbe) {
    const probe = probes.unsupported.ignoredProbe;
    if (probe.unknownCounter !== 0 || probe.settingsChanged || probe.errors.length > 0) {
      push('E_CLIENT_IGNORED_ID_UNKNOWN', 'ledger ignored inbound id ' + probe.id, 'known no-op without settings mutation', probe);
    }
  }

  return errors;
}

function summarizeClientProbes(probes) {
  const errors = validateClientProbes(probes);
  const codes = new Set(errors.map((error) => error.code));
  const settingsOk = !codes.has('E_CLIENT_SETTINGS_HEURISTIC')
    && !codes.has('E_CLIENT_SETTINGS_PACKET_MISMATCH')
    && !codes.has('E_CLIENT_SETTINGS_NOT_APPLIED')
    && !codes.has('E_CLIENT_SETTINGS_EVENT_MISSING')
    && !codes.has('E_CLIENT_SETTINGS_ROUTE_MISSING')
    && !codes.has('E_CLIENT_SETTINGS_ERROR');
  return {
    unknownInboundNoSilentDrop: !codes.has('E_CLIENT_UNKNOWN_INBOUND_SILENT_DROP')
      && !codes.has('E_CLIENT_UNKNOWN_INBOUND_SETTINGS_MUTATED') ? 1 : 0,
    unknownOutboundNoBytes: !codes.has('E_CLIENT_UNKNOWN_OUTBOUND_BYTES')
      && !codes.has('E_CLIENT_UNKNOWN_OUTBOUND_UNTYPED') ? 1 : 0,
    settingsExactPacket: settingsOk ? 1 : 0,
    unsupportedIdsAccounted: !codes.has('E_CLIENT_UNSUPPORTED_UNACCOUNTED')
      && !codes.has('E_CLIENT_IGNORED_ID_UNKNOWN') ? 1 : 0,
    decodeFailureTyped: !codes.has('E_CLIENT_DECODE_FAILURE_UNTYPED')
      && !codes.has('E_CLIENT_DECODE_FAILURE_SETTINGS_MUTATED') ? 1 : 0,
    settingsPacket: probes.settings.mapping,
    errorCodes: [...codes].sort(),
    counters: {
      unknownInbound: probes.unknownInbound.counter,
      decodeFailed: probes.decodeFailure.counter,
      unknownOutbound: probes.unknownOutbound.counter
    }
  };
}

function checkClient(collector, fixtures, subject) {
  const probes = collectClientProbes(subject);
  const errors = validateClientProbes(probes);
  const summary = summarizeClientProbes(probes);
  for (const error of errors) {
    collector.record(false, 'client', error.code, error.subject, error.expected, error.actual, error.detail);
  }
  collector.record(summary.unknownInboundNoSilentDrop === 1, 'client', 'E_CLIENT_UNKNOWN_INBOUND_SILENT_DROP', 'unknownInboundNoSilentDrop', 1, summary.unknownInboundNoSilentDrop, probes.unknownInbound);
  collector.record(summary.unknownOutboundNoBytes === 1, 'client', 'E_CLIENT_UNKNOWN_OUTBOUND_BYTES', 'unknownOutboundNoBytes', 1, summary.unknownOutboundNoBytes, probes.unknownOutbound);
  collector.record(summary.settingsExactPacket === 1, 'client', 'E_CLIENT_SETTINGS_HEURISTIC', 'settingsExactPacket', 1, summary.settingsExactPacket, probes.settings);
  collector.record(summary.unsupportedIdsAccounted === 1, 'client', 'E_CLIENT_UNSUPPORTED_UNACCOUNTED', 'unsupportedIdsAccounted', 1, summary.unsupportedIdsAccounted, probes.unsupported);
  collector.client = summary;
}

function runChecks(categories, fixtures, subject) {
  const collector = createCollector();
  if (categories.has('version')) checkVersion(collector, fixtures, subject);
  if (categories.has('transport')) checkTransport(collector, fixtures, subject);
  if (categories.has('ids')) checkIds(collector, fixtures, subject);
  if (categories.has('schemas')) checkSchemas(collector, fixtures, subject);
  if (categories.has('registry')) checkRegistry(collector, fixtures, subject);
  if (categories.has('handlers')) {
    checkHandlers(collector, fixtures, subject);
    if (!subject.handlerVocabulary) checkHandlerSites(collector, subject);
  }
  if (categories.has('items')) checkItems(collector, fixtures, subject);
  if (categories.has('defects')) checkDefects(collector, fixtures, subject);
  if (categories.has('coverage')) checkCoverage(collector, fixtures, subject);
  if (categories.has('client')) checkClient(collector, fixtures, subject);
  const assertions = collector.assertions;
  assertions.client = collector.client || null;
  assertions.handlers = collector.handlers || null;
  return assertions;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function reasonCounts(assertions) {
  const counts = {};
  for (const assertion of assertions) {
    if (assertion.ok) continue;
    counts[assertion.reason] = (counts[assertion.reason] || 0) + 1;
  }
  return counts;
}

function summarizeFailure(assertion) {
  return {
    reason: assertion.reason,
    category: assertion.category,
    subject: assertion.subject,
    expected: assertion.expected,
    actual: assertion.actual,
    detail: assertion.detail
  };
}

function firstFailureByReason(assertions) {
  const byReason = {};
  for (const assertion of assertions) {
    if (assertion.ok || byReason[assertion.reason]) continue;
    byReason[assertion.reason] = summarizeFailure(assertion);
  }
  return byReason;
}

function summarizeRun(assertions) {
  const failures = assertions.filter((assertion) => !assertion.ok);
  return {
    assertions: assertions.length,
    passed: assertions.length - failures.length,
    failed: failures.length,
    reasons: reasonCounts(assertions),
    reasonExamples: firstFailureByReason(assertions),
    examples: failures.slice(0, 25).map(summarizeFailure)
  };
}

function evaluateExpectedRed(fixtures, assertions) {
  const counts = reasonCounts(assertions);
  const examples = firstFailureByReason(assertions);
  const required = fixtures.defects.expectedRed || {};
  const observed = {};
  const mismatched = [];
  for (const [reason, expected] of Object.entries(required)) {
    const actual = counts[reason] || 0;
    const satisfied = actual === expected;
    observed[reason] = { expected, actual, satisfied, example: examples[reason] || null };
    if (!satisfied) mismatched.push({ reason, expected, actual });
  }
  const unexpected = Object.keys(counts)
    .filter((reason) => !Object.prototype.hasOwnProperty.call(required, reason))
    .map((reason) => ({ reason, actual: counts[reason] }));
  const ok = mismatched.length === 0 && unexpected.length === 0 && Object.keys(required).length > 0;
  return {
    ok,
    code: ok ? 'RED_OBSERVED' : 'E_EXPECTED_RED_NOT_OBSERVED',
    observed,
    mismatched,
    missing: mismatched,
    unexpected,
    summary: summarizeRun(assertions)
  };
}

function printJson(value, stream) {
  (stream || process.stdout).write(JSON.stringify(value, null, 2) + '\n');
}

function parseOnly(argv) {
  const index = argv.indexOf('--only');
  if (index < 0) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw failErr('E_BAD_ARGUMENT', '--only requires a comma-separated category list');
  }
  const categories = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (!categories.length) throw failErr('E_BAD_ARGUMENT', '--only category list is empty');
  for (const category of categories) {
    if (!KNOWN_CATEGORIES.includes(category)) {
      throw failErr('E_UNKNOWN_CATEGORY', 'unknown category: ' + category, { known: KNOWN_CATEGORIES });
    }
  }
  return new Set(categories);
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

function runPositive(fixtures, categories) {
  const evidence = loadGeneratedEvidence();
  const subject = loadSubject(fixtures, evidence);
  const assertions = runChecks(categories, fixtures, subject);
  const summary = summarizeRun(assertions);
  const ledger = subject.protocol && subject.protocol.PROTOCOL_LEDGER;
  const counts = ledger && ledger.counts ? ledger.counts : null;
  const client = assertions.client || null;
  const handlers = assertions.handlers || null;
  let registry = null;
  if (categories.has('registry')) {
    try {
      registry = summarizeProductRegistry(loadProductRegistry(), loadProductItems());
    } catch (err) {
      registry = { error: err.message };
    }
  }
  if (summary.failed > 0) {
    printJson({ ok: false, mode: 'positive', code: 'E_COMPATIBILITY_FAILED', categories: [...categories], counts, client, handlers, registry, ...summary });
    process.exit(1);
  }
  printJson({ ok: true, mode: 'positive', code: 'COMPATIBLE', categories: [...categories], counts, client, handlers, registry, ...summary });
  process.exit(0);
}

function runExpectRed(fixtures) {
  const evidence = loadGeneratedEvidence();
  const provenanceErrors = verifyProvenance(fixtures.provenance);
  const evidenceErrors = validateFixtureAgainstEvidence(fixtures, evidence);
  const integrityErrors = provenanceErrors.concat(evidenceErrors);
  if (integrityErrors.length) {
    throw failErr('E_FIXTURE_INTEGRITY', 'fixture integrity failed; expected-red cannot be trusted', integrityErrors);
  }

  const assertions = runChecks(new Set(CATEGORY_ORDER), fixtures, loadSubject(fixtures, evidence));
  const result = evaluateExpectedRed(fixtures, assertions);
  const provenance = {
    ok: true,
    generatedManifestSha256: fixtures.provenance.generatedManifestSha256,
    transportEvidenceSha256: fixtures.transport.evidenceSha256,
    sources: fixtures.provenance.sources.length
  };
  if (!result.ok) {
    printJson({
      ok: false,
      mode: 'expect-red',
      code: result.code,
      provenance,
      observed: result.observed,
      mismatched: result.mismatched,
      missing: result.missing,
      unexpected: result.unexpected,
      ...result.summary
    });
    process.exit(1);
  }
  printJson({
    ok: true,
    mode: 'expect-red',
    code: result.code,
    provenance,
    observed: result.observed,
    mismatched: [],
    missing: [],
    unexpected: [],
    ...result.summary
  });
  process.exit(0);
}

function runSelfTestSelfReference() {
  const fixtures = loadFixtures();
  const evidence = loadGeneratedEvidence();
  const integrity = verifyProvenance(fixtures.provenance).concat(validateFixtureAgainstEvidence(fixtures, evidence));
  if (integrity.length) {
    throw failErr('E_FIXTURE_INTEGRITY', 'checked-in fixtures are not evidence-backed', integrity);
  }

  const subject = loadSubject(fixtures, evidence);
  const bad = JSON.parse(JSON.stringify(fixtures));
  bad.packets.version = subject.protocol.VERSION;
  bad.transport.version = subject.protocol.VERSION;
  bad.packets.sendKey = 11 * subject.protocol.VERSION + 7;
  bad.transport.sendKey = 11 * subject.protocol.VERSION + 7;
  bad.defects.version.currentImpl = subject.protocol.VERSION;
  bad.defects.sendKey.currentImpl = 11 * subject.protocol.VERSION + 7;

  // A production-formula oracle would also copy the stale exp key and vectors.
  bad.transport.expKey = 6;
  bad.transport.vectors[0].packet = 'CPacketUseItem';
  bad.transport.vectors[0].value = { targetPos: [0, 1] };
  bad.transport.vectors[0].expectedMask = (bad.transport.vectors[0].expectedMask ^ 1) >>> 0;
  bad.transport.vectors[0].expectedWirePayloadHex = '00';
  bad.transport.vectors[0].expectedWireId = (bad.transport.vectors[0].expectedWireId ^ 1) >>> 0;

  // A baseline-840 self-reference would relabel the 840 first field as semantic.
  bad.defects.removeEffect.baseline840.firstField = 'lifeformId';
  bad.defects.removeEffect.baseline840.sha256 = '0'.repeat(64);

  const detected = validateFixtureAgainstEvidence(bad, evidence);
  const versionMismatch = detected.find((error) => error.subject === 'packets.version');
  const keyMismatch = detected.find((error) => error.subject === 'packets.sendKey');
  const transportMismatch = detected.find((error) => error.subject === 'transport.expKey' || error.subject === 'transport.vectors');
  const packetMismatch = detected.find((error) => error.subject === 'transport.vectors.primary.packet');
  const valueMismatch = detected.find((error) => error.subject === 'transport.vectors.primary.value');
  const baselineMismatch = detected.find((error) => error.subject.indexOf('defects.removeEffect.baseline840') === 0);
  const versionDiffers = subject.protocol.VERSION !== evidence.manifest.counts.version;
  const keyDiffers = (11 * subject.protocol.VERSION + 7) !== evidence.manifest.sendKey.value;
  const isSelfReference = bad.transport.expKey === 6
    && bad.transport.vectors[0].packet === 'CPacketUseItem'
    && isDeepStrictEqual(bad.transport.vectors[0].value, { targetPos: [0, 1] })
    && bad.transport.vectors[0].expectedWirePayloadHex === '00'
    && bad.defects.removeEffect.baseline840.firstField === 'lifeformId';

  // Version/send-key detection is only meaningful while production disagrees
  // with the frozen evidence. The production-derived transport/vector and
  // baseline-840 relabeling checks remain mandatory at every version.
  const requiredDetections = [transportMismatch, packetMismatch, valueMismatch, baselineMismatch];
  if (versionDiffers) requiredDetections.push(versionMismatch);
  if (keyDiffers) requiredDetections.push(keyMismatch);

  if (!isSelfReference || requiredDetections.some((error) => !error)) {
    printJson({
      ok: false,
      mode: 'self-test',
      selfTest: 'self-reference',
      code: 'E_SELF_REFERENCE_NOT_DETECTED',
      productionVersion: subject.protocol.VERSION,
      productionSendKey: 11 * subject.protocol.VERSION + 7,
      detected
    });
    process.exit(1);
  }

  const detections = requiredDetections.map((error) => ({
    code: 'E_SELF_REFERENCE',
    cause: error.code,
    subject: error.subject,
    expected: error.expected,
    actual: error.actual
  }));
  printJson({
    ok: true,
    mode: 'self-test',
    selfTest: 'self-reference',
    code: 'E_SELF_REFERENCE',
    rejected: true,
    productionVersion: subject.protocol.VERSION,
    productionSendKey: 11 * subject.protocol.VERSION + 7,
    evidenceVersion: evidence.manifest.counts.version,
    evidenceSendKey: evidence.manifest.sendKey.value,
    evidenceExpKey: fixtures.transport.expKey,
    detected: detections
  });
  process.exit(0);
}

function runSelfTestSkip() {
  const collector = createCollector();
  let skipped = null;
  try {
    collector.skip('required inbound id coverage');
  } catch (err) {
    skipped = err;
  }
  if (!skipped || skipped.code !== 'E_SKIP_REJECTED') {
    printJson({ ok: false, mode: 'self-test', selfTest: 'skip', code: 'E_SKIP_NOT_REJECTED', skipped: false });
    process.exit(1);
  }
  printJson({
    ok: false,
    mode: 'self-test',
    selfTest: 'skip',
    code: 'E_SKIP_REJECTED',
    rejected: true,
    message: 'required assertions cannot be skipped; a skip is a failure',
    exitIntent: 1
  });
  process.exit(1);
}

function parseChildJson(stdout, stderr) {
  for (const text of [stdout, stderr]) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < start) continue;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (err) {
      continue;
    }
  }
  return null;
}

function runSelfTestExpectedRedGreen() {
  // Exercise the real CLI in a child process with a fixture-backed 846 subject.
  // The subject is built from pinned evidence, not from production code.
  const child = spawnSync(process.execPath, [__filename, '--expect-red'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PROTOCOL_846_FIXTURE_SUBJECT: '1' }
  });
  const output = parseChildJson(String(child.stdout || ''), String(child.stderr || ''));
  const ok = child.status === 1
    && output
    && output.code === 'E_EXPECTED_RED_NOT_OBSERVED'
    && output.failed === 0
    && Array.isArray(output.mismatched)
    && output.mismatched.length > 0;
  if (!ok) {
    printJson({
      ok: false,
      mode: 'self-test',
      selfTest: 'expected-red-green',
      code: 'E_EXPECTED_RED_GREEN_NOT_REJECTED',
      childExitCode: child.status,
      childOutput: output
    });
    process.exit(1);
  }
  printJson({
    ok: true,
    mode: 'self-test',
    selfTest: 'expected-red-green',
    code: 'E_EXPECTED_RED_NOT_OBSERVED',
    childExitCode: child.status,
    greenAssertions: output.assertions,
    greenFailed: output.failed,
    mismatchedReasons: output.mismatched.map((entry) => entry.reason)
  });
  process.exit(0);
}

function runSelfTestRemovedId() {
  const fixtures = loadFixtures();
  const evidence = loadGeneratedEvidence();
  const subject = loadSubject(fixtures, evidence);
  const ledger = JSON.parse(JSON.stringify(subject.protocol.PROTOCOL_LEDGER));
  ledger.inbound.push({
    id: 78,
    direction: 'inbound',
    name: 'SPacketRemoved78',
    disposition: 'implemented',
    codec: 'avsc',
    schema: { source: 'generated/inbound-schemas.json', id: 78 },
    evidence: 'removed-id-self-test'
  });
  const errors = validateLedgerAgainstEvidence(ledger, evidence);
  const detected = errors.filter((error) => error.code === 'E_PROTOCOL_REMOVED_ID');
  if (!detected.length) {
    printJson({
      ok: false,
      mode: 'self-test',
      selfTest: 'removed-id',
      code: 'E_PROTOCOL_REMOVED_ID_NOT_DETECTED',
      detected: false,
      errors
    });
    process.exit(1);
  }
  printJson({
    ok: false,
    mode: 'self-test',
    selfTest: 'removed-id',
    code: 'E_PROTOCOL_REMOVED_ID',
    detected: true,
    errors: detected
  });
  process.exit(1);
}

function runSelfTestGuessedSchema() {
  const fixtures = loadFixtures();
  const evidence = loadGeneratedEvidence();
  const subject = loadSubject(fixtures, evidence);
  const ledger = JSON.parse(JSON.stringify(subject.protocol.PROTOCOL_LEDGER));
  const entry = ledger.inbound.find((row) => row.codec === 'avsc');
  if (!entry) {
    printJson({ ok: false, mode: 'self-test', selfTest: 'guessed-schema', code: 'E_PROTOCOL_GUESSED_SCHEMA_NO_SCHEMA_ENTRY', detected: false });
    process.exit(1);
  }
  entry.guessed = true;
  entry.schema = { source: 'production-inferred', id: entry.id };
  const errors = validateLedgerAgainstEvidence(ledger, evidence);
  const detected = errors.filter((error) => error.code === 'E_PROTOCOL_GUESSED_SCHEMA');
  if (!detected.length) {
    printJson({
      ok: false,
      mode: 'self-test',
      selfTest: 'guessed-schema',
      code: 'E_PROTOCOL_GUESSED_SCHEMA_NOT_DETECTED',
      detected: false,
      errors
    });
    process.exit(1);
  }
  printJson({
    ok: false,
    mode: 'self-test',
    selfTest: 'guessed-schema',
    code: 'E_PROTOCOL_GUESSED_SCHEMA',
    detected: true,
    errors: detected
  });
  process.exit(1);
}

function runSelfTestTruncateTable() {
  const productRegistry = loadProductRegistry();
  const itemModules = loadProductItems();
  if (!productRegistry || !productRegistry.nameView) {
    printJson({ ok: false, mode: 'self-test', selfTest: 'truncate-table', code: 'E_REGISTRY_TRUNCATE_NOT_DETECTED', detected: false, reason: 'structured registry missing' });
    process.exit(1);
  }
  const nameView = { ...productRegistry.nameView };
  const keys = Object.keys(nameView).slice(-10);
  for (const key of keys) delete nameView[key];
  const truncated = { ...productRegistry, nameView };
  const result = registryFaults(truncated, itemModules);
  const detected = result.errors.some((error) => error.code === 'E_REGISTRY_TRUNCATED');
  if (!detected) {
    printJson({ ok: false, mode: 'self-test', selfTest: 'truncate-table', code: 'E_REGISTRY_TRUNCATE_NOT_DETECTED', detected: false, summary: result.summary });
    process.exit(1);
  }
  printJson({
    ok: false,
    mode: 'self-test',
    selfTest: 'truncate-table',
    code: 'E_REGISTRY_TRUNCATED',
    detected: true,
    removedNameKeys: keys.length,
    summary: result.summary,
    evidence: 'removed non-numeric nameView keys'
  });
  process.exit(1);
}

function runSelfTestUnresolvedExisting() {
  const productRegistry = loadProductRegistry();
  const itemModules = loadProductItems();
  const handlerNames = collectHandlerItemNames(productRegistry);
  const target = handlerNames.find((name) => productItemMapping(name, itemModules) !== undefined);
  if (!target) {
    printJson({ ok: false, mode: 'self-test', selfTest: 'unresolved-existing', code: 'E_REGISTRY_UNRESOLVED_NOT_DETECTED', detected: false, reason: 'no existing handler item name to break' });
    process.exit(1);
  }
  const badItems = {
    ITEMS: itemModules.ITEMS,
    IDITEM: itemModules.IDITEM.slice(),
    ITEMID: itemModules.ITEMID.slice()
  };
  badItems.ITEMID[badItems.IDITEM.indexOf(target)] = undefined;
  const result = registryFaults(productRegistry, badItems, { handlerNames });
  const detected = result.errors.some((error) => error.code === 'E_REGISTRY_UNRESOLVED_EXISTING');
  if (!detected) {
    printJson({ ok: false, mode: 'self-test', selfTest: 'unresolved-existing', code: 'E_REGISTRY_UNRESOLVED_NOT_DETECTED', detected: false, target, summary: result.summary });
    process.exit(1);
  }
  printJson({
    ok: false,
    mode: 'self-test',
    selfTest: 'unresolved-existing',
    code: 'E_REGISTRY_UNRESOLVED_EXISTING',
    detected: true,
    target,
    summary: result.summary
  });
  process.exit(1);
}

function runSelfTestStale840Fallback() {
  const legacyPath = path.join(ROOT, 'bloxd', 'types', 'registry-840.json');
  const stale = { file: relative(legacyPath), table: readJson(legacyPath), legacy: true };
  const result = registryFaults(stale, loadProductItems());
  const detected = result.errors.some((error) => error.code === 'E_REGISTRY_STALE_840');
  if (!detected) {
    printJson({ ok: false, mode: 'self-test', selfTest: 'stale-840-fallback', code: 'E_REGISTRY_STALE_840_NOT_DETECTED', detected: false, summary: result.summary });
    process.exit(1);
  }
  printJson({
    ok: false,
    mode: 'self-test',
    selfTest: 'stale-840-fallback',
    code: 'E_REGISTRY_STALE_840',
    detected: true,
    file: stale.file,
    summary: result.summary,
    errors: result.errors.map((error) => ({ code: error.code, subject: error.subject, expected: error.expected, actual: error.actual }))
  });
  process.exit(1);
}

function runSelfTestHandlerShape() {
  const fixtures = loadFixtures();
  const evidence = loadGeneratedEvidence();
  const subject = loadSubject(fixtures, evidence);
  const result = probeHandlerOutbound(subject, {
    name: 'CPacketAttackEntity',
    file: 'self-test',
    line: 0
  }, { eId: 123 }, true);
  if (!result.encodeFailure) {
    printJson({ ok: false, mode: 'self-test', selfTest: 'handler-shape', code: 'E_HANDLER_SHAPE_NOT_DETECTED', result });
    process.exit(0);
  }
  printJson({ ok: false, mode: 'self-test', selfTest: 'handler-shape', code: 'E_HANDLER_SHAPE_MISMATCH', detected: true, result });
  process.exit(1);
}

function runSelfTestSwallowedEncodeError() {
  const fixtures = loadFixtures();
  const evidence = loadGeneratedEvidence();
  const subject = loadSubject(fixtures, evidence);
  const original = subject.BloxClient.prototype.send;
  subject.BloxClient.prototype.send = function silentSend() {};
  let result;
  try {
    result = probeHandlerOutbound(subject, {
      name: 'CPacketTickEventDetection',
      file: 'self-test',
      line: 0
    });
  } finally {
    subject.BloxClient.prototype.send = original;
  }
  if (!result.swallowed) {
    printJson({ ok: false, mode: 'self-test', selfTest: 'swallowed-encode-error', code: 'E_SWALLOWED_ERROR_NOT_DETECTED', result });
    process.exit(0);
  }
  printJson({ ok: false, mode: 'self-test', selfTest: 'swallowed-encode-error', code: 'E_SWALLOWED_ENCODE_ERROR', detected: true, result });
  process.exit(1);
}

function runSelfTestDamageCount() {
  const fixtures = loadFixtures();
  const evidence = loadGeneratedEvidence();
  const subject = loadSubject(fixtures, evidence);
  const fields = schemaFieldNames(subject.protocol.INBOUND_SCHEMAS.SPacketEntityDamage) || [];
  const damageCountValid = (list) => Array.isArray(list) && list.length === 7;
  const detected = damageCountValid(fields) && !damageCountValid(fields.concat('inventedField'));
  if (!detected) {
    printJson({ ok: false, mode: 'self-test', selfTest: 'damage-count', code: 'E_DAMAGE_COUNT_NOT_DETECTED', fields });
    process.exit(0);
  }
  printJson({ ok: false, mode: 'self-test', selfTest: 'damage-count', code: 'E_ENTITY_DAMAGE_FIELD_COUNT', detected: true, fields });
  process.exit(1);
}

function runSelfTestClientFault(name) {
  const fixtures = loadFixtures();
  const evidence = loadGeneratedEvidence();
  const subject = loadSubject(fixtures, evidence);
  const probes = collectClientProbes(subject);
  const baseErrors = validateClientProbes(probes);
  if (baseErrors.length > 0) {
    printJson({
      ok: false,
      mode: 'self-test',
      selfTest: name,
      code: 'E_CLIENT_SELF_TEST_BASE_NOT_GREEN',
      baseErrors
    });
    process.exit(1);
  }

  const mutated = JSON.parse(JSON.stringify(probes));
  let expected;
  switch (name) {
    case 'client-unknown-inbound':
      mutated.unknownInbound.errors = [];
      mutated.unknownInbound.counter = 0;
      expected = 'E_CLIENT_UNKNOWN_INBOUND_SILENT_DROP';
      break;
    case 'client-unknown-outbound':
      mutated.unknownOutbound.bytesSent = 1;
      mutated.unknownOutbound.errors = [];
      mutated.unknownOutbound.counter = 0;
      expected = 'E_CLIENT_UNKNOWN_OUTBOUND_BYTES';
      break;
    case 'client-settings-heuristic':
      mutated.settings.heuristicPresent = true;
      mutated.settings.mapping = null;
      expected = 'E_CLIENT_SETTINGS_HEURISTIC';
      break;
    case 'client-settings-packet':
      mutated.settings.mapping = { id: 118, name: 'SPacketEntitySetting', fields: null };
      expected = 'E_CLIENT_SETTINGS_PACKET_MISMATCH';
      break;
    case 'client-unsupported-ids':
      mutated.unsupported.accounted = false;
      expected = 'E_CLIENT_UNSUPPORTED_UNACCOUNTED';
      break;
    default:
      throw failErr('E_UNKNOWN_SELF_TEST', 'unknown client self-test: ' + String(name));
  }

  const detected = validateClientProbes(mutated).filter((error) => error.code === expected);
  if (detected.length === 0) {
    printJson({
      ok: false,
      mode: 'self-test',
      selfTest: name,
      code: expected + '_NOT_DETECTED',
      detected: false,
      mutated: mutated[name === 'client-unsupported-ids' ? 'unsupported' : name.replace('client-', '')]
    });
    process.exit(1);
  }
  printJson({
    ok: false,
    mode: 'self-test',
    selfTest: name,
    code: expected,
    detected: true,
    errors: detected
  });
  process.exit(1);
}

function main(argv) {
  const selfIndex = argv.indexOf('--self-test');
  if (selfIndex >= 0) {
    const name = argv[selfIndex + 1];
    switch (name) {
      case 'self-reference': return runSelfTestSelfReference();
      case 'skip': return runSelfTestSkip();
      case 'expected-red-green': return runSelfTestExpectedRedGreen();
      case 'removed-id': return runSelfTestRemovedId();
      case 'guessed-schema': return runSelfTestGuessedSchema();
      case 'truncate-table': return runSelfTestTruncateTable();
      case 'unresolved-existing': return runSelfTestUnresolvedExisting();
      case 'stale-840-fallback': return runSelfTestStale840Fallback();
      case 'handler-shape': return runSelfTestHandlerShape();
      case 'swallowed-encode-error': return runSelfTestSwallowedEncodeError();
      case 'damage-count': return runSelfTestDamageCount();
      case 'client-unknown-inbound':
      case 'client-unknown-outbound':
      case 'client-settings-heuristic':
      case 'client-settings-packet':
      case 'client-unsupported-ids':
        return runSelfTestClientFault(name);
      default:
        throw failErr('E_UNKNOWN_SELF_TEST', 'unknown self-test: ' + String(name), {
          known: ['self-reference', 'skip', 'expected-red-green', 'removed-id', 'guessed-schema', 'truncate-table', 'unresolved-existing', 'stale-840-fallback', 'handler-shape', 'swallowed-encode-error', 'damage-count'].concat(CLIENT_SELF_TESTS)
        });
    }
  }

  const fixtures = loadFixtures();
  if (argv.includes('--expect-red')) return runExpectRed(fixtures);
  const categories = parseOnly(argv) || new Set(CATEGORY_ORDER);
  return runPositive(fixtures, categories);
}

try {
  main(process.argv.slice(2));
} catch (err) {
  printJson({
    ok: false,
    code: err.code || 'E_HARNESS_FAILURE',
    message: err.message,
    details: err.details === undefined ? null : err.details
  }, process.stderr);
  process.exit(2);
}


