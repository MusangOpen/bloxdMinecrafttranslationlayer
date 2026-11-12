#!/usr/bin/env node
'use strict';
// allow: SIZE_OK — single-file 856 smoke check; each block is an independent evidence assertion.

/*
 * Focused 856 descriptor smoke check.
 *
 * Verifies the pinned target, the embedded evidence hashes, the authoritative
 * 854->856 mapping, the disposition ledger, and the behaviour-critical settings
 * and join field names. Reads .research only as evidence; the product
 * descriptor itself is static.
 *
 *   node test/protocol-856.js
 */

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = require(path.join(ROOT, 'bloxd', 'protocol', 'target.js'));
const protocol = require(path.join(ROOT, 'bloxd', 'protocol', 'live.js'));
const mapping = JSON.parse(fs.readFileSync(path.join(ROOT, '.research', '7rp1w-audit', 'mapping.json'), 'utf8'));
const generatedDir = path.join(ROOT, '.research', '7rp1w-audit', 'generated');
const inboundIdsDoc = JSON.parse(fs.readFileSync(path.join(generatedDir, 'inbound-ids.json'), 'utf8'));
const outboundIdsDoc = JSON.parse(fs.readFileSync(path.join(generatedDir, 'outbound-ids.json'), 'utf8'));
const inboundSchemasDoc = JSON.parse(fs.readFileSync(path.join(generatedDir, 'inbound-schemas.json'), 'utf8'));
const transportDoc = JSON.parse(fs.readFileSync(path.join(generatedDir, 'transport.json'), 'utf8'));

const checks = [];
function check(label, fn) {
  try {
    fn();
    checks.push({ label, ok: true });
  } catch (err) {
    checks.push({ label, ok: false, error: err.message });
  }
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

check('target build identity', () => {
  assert.strictEqual(TARGET.build, '7rp1w');
  assert.strictEqual(TARGET.buildVersion, '57cd8edd');
  assert.strictEqual(TARGET.version, 856);
  assert.strictEqual(TARGET.sourceUrl, 'https://bloxd.io/static/js/7rp1w.main.57cd8edd.js');
  assert.strictEqual(TARGET.mainBundle.url, TARGET.sourceUrl);
  assert.strictEqual(TARGET.mainBundle.filename, '7rp1w.main.57cd8edd.js');
  assert.strictEqual(TARGET.mainBundle.sha256, '5b55225a3b3758475fb4a6538ba3170c05a26394fcd878deacf649ecc94dd205');
});

check('target transport constants', () => {
  assert.strictEqual(TARGET.transport.sendKey, 9423);
  assert.strictEqual(TARGET.transport.sendKey, 11 * 856 + 7);
  assert.strictEqual(TARGET.transport.expKey, 42);
  assert.strictEqual(TARGET.transport.secondPassOffset, 5);
  assert.strictEqual(TARGET.transport.lengthMultiplier, 3);
});

check('embedded evidence hashes match the 856 generated files', () => {
  const manifestFile = path.join(generatedDir, 'manifest.json');
  assert.strictEqual(TARGET.generatedManifestSha256, sha256File(manifestFile));
  assert.strictEqual(protocol.EVIDENCE.generatedManifestSha256, TARGET.generatedManifestSha256);
  assert.strictEqual(protocol.EVIDENCE.generatedDir, '.research/7rp1w-audit/generated');
  assert.strictEqual(protocol.PROTOCOL_LEDGER.generatedManifestSha256, TARGET.generatedManifestSha256);
  const names = Object.keys(protocol.EVIDENCE.files);
  assert.deepStrictEqual(names.sort(), fs.readdirSync(generatedDir).filter((name) => name.endsWith('.json') && name !== 'manifest.json').sort());
  for (const [name, evidence] of Object.entries(protocol.EVIDENCE.files)) {
    const file = path.join(generatedDir, name);
    assert.strictEqual(evidence.bytes, fs.statSync(file).size, name + ' bytes');
    assert.strictEqual(evidence.sha256, sha256File(file), name + ' sha256');
  }
});

check('inbound counts', () => {
  assert.strictEqual(protocol.VERSION, 856);
  assert.strictEqual(Object.keys(protocol.INBOUND_IDS).length, 74);
  assert.strictEqual(Object.keys(protocol.INBOUND_SCHEMAS).length, 74);
  assert.strictEqual(Object.keys(protocol.INBOUND_HANDLER_IDS).length, 100);
  assert.strictEqual(Object.keys(protocol.INBOUND_JSON).length, 29);
  const counts = protocol.PROTOCOL_LEDGER.counts;
  assert.strictEqual(counts.inboundIds, 71);
  assert.strictEqual(counts.inboundSchemas, 74);
  assert.strictEqual(counts.inboundHandlerIds, 100);
  assert.strictEqual(counts.outboundIds, 75);
  assert.strictEqual(counts.inboundRaw, 74);
  assert.strictEqual(counts.inboundCanonicalHandled, 71);
  assert.strictEqual(counts.inboundHandler, 100);
  assert.strictEqual(counts.inboundSchemaOnly, 3);
  assert.strictEqual(counts.inboundHandlerOnly, 29);
  assert.deepStrictEqual(new Set(inboundIdsDoc.schemaIds), new Set(Object.values(protocol.INBOUND_IDS)));
  assert.deepStrictEqual(new Set(inboundIdsDoc.handlerIds), new Set(Object.values(protocol.INBOUND_HANDLER_IDS)));
});

check('outbound counts', () => {
  const uniqueIds = new Set(Object.values(protocol.OUTBOUND_IDS));
  const uniqueCallSites = new Set(Object.values(protocol.OUTBOUND_CALL_SITE_IDS));
  assert.strictEqual(uniqueIds.size, 81);
  assert.strictEqual(Object.keys(protocol.OUTBOUND_IDS).length, 83);
  assert.strictEqual(uniqueCallSites.size, 68);
  assert.strictEqual(Object.keys(protocol.OUTBOUND_CALL_SITE_IDS).length, 70);
  assert.strictEqual(Object.keys(protocol.OUTBOUND_SCHEMAS).length, 77);
  assert.strictEqual(Object.keys(protocol.OUTBOUND_JSON).length, 6);
  assert.strictEqual(protocol.PROTOCOL_LEDGER.counts.outboundRaw, 75);
  assert.strictEqual(protocol.PROTOCOL_LEDGER.counts.outboundCallSiteIds, 68);
  const descriptorSchemaIds = new Set(
    Object.keys(protocol.OUTBOUND_SCHEMAS)
      .map((name) => protocol.OUTBOUND_IDS[name])
      .filter((id) => typeof id === 'number')
  );
  assert.deepStrictEqual(descriptorSchemaIds, new Set(outboundIdsDoc.schemaIds));
  assert.deepStrictEqual(new Set(outboundIdsDoc.callSiteIds), new Set(Object.values(protocol.OUTBOUND_CALL_SITE_IDS)));
});

check('authoritative inbound mapping', () => {
  for (const [name, map] of Object.entries(mapping.inbound)) {
    if (map.schemaId !== null) assert.strictEqual(protocol.INBOUND_IDS[name], map.schemaId, name + ' schemaId');
    if (map.handlerId !== null) assert.strictEqual(protocol.INBOUND_HANDLER_IDS[name], map.handlerId, name + ' handlerId');
    if (map.schemaId === null) {
      assert.ok(protocol.INBOUND_JSON[name], name + ' should be JSON passthrough');
      assert.strictEqual(protocol.INBOUND_JSON[name].id, map.handlerId);
    }
  }
});

check('authoritative outbound mapping', () => {
  for (const [name, map] of Object.entries(mapping.outbound)) {
    assert.strictEqual(protocol.OUTBOUND_IDS[name], map.id, name);
  }
  for (const name of mapping.unmapped.outbound) {
    assert.strictEqual(protocol.OUTBOUND_IDS[name], undefined, name + ' must not invent an id');
    assert.ok(protocol.OUTBOUND_UNSUPPORTED[name], name + ' must be explicitly unsupported');
    const row = protocol.PROTOCOL_LEDGER.outbound.find((entry) => entry.name === name);
    assert.ok(row, name + ' must have a ledger row');
    assert.strictEqual(row.id, null);
    assert.strictEqual(row.disposition, 'unsupported');
  }
});

check('duplicate outbound ids are only the documented aliases', () => {
  const byId = new Map();
  for (const [name, id] of Object.entries(protocol.OUTBOUND_IDS)) {
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(name);
  }
  const duplicates = [...byId.entries()].filter(([, names]) => names.length > 1);
  assert.deepStrictEqual(
    duplicates.map(([id, names]) => [id, names.sort()]).sort((a, b) => a[0] - b[0]),
    [[105, ['CPacketBaseEventDetection', 'CPacketResponseDetection']], [111, ['CPacketMovePlayer', 'CPacketReloadGun']]]
  );
});

check('ledger covers every 856 id exactly once', () => {
  const valid = new Set(['implemented', 'ignored', 'unsupported']);
  const inbound = protocol.PROTOCOL_LEDGER.inbound;
  const outbound = protocol.PROTOCOL_LEDGER.outbound;
  for (const row of [...inbound, ...outbound]) assert.ok(valid.has(row.disposition), row.name + ' disposition');

  const inboundIds = new Map();
  for (const row of inbound) {
    if (row.id === null) continue;
    assert.strictEqual(inboundIds.has(row.id), false, 'duplicate inbound ledger id ' + row.id);
    inboundIds.set(row.id, row);
  }
  const expectedInbound = new Set([...inboundIdsDoc.schemaIds, ...inboundIdsDoc.handlerIds]);
  assert.deepStrictEqual(new Set(inboundIds.keys()), expectedInbound);

  const outboundById = new Map();
  for (const row of outbound) {
    if (row.id === null) continue;
    if (!outboundById.has(row.id)) outboundById.set(row.id, []);
    outboundById.get(row.id).push(row.name);
  }
  const expectedOutbound = new Set([...outboundIdsDoc.schemaIds, ...outboundIdsDoc.callSiteIds]);
  assert.deepStrictEqual(new Set(outboundById.keys()), expectedOutbound);
  const outboundDuplicates = [...outboundById.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([id, names]) => [id, names.sort()])
    .sort((a, b) => a[0] - b[0]);
  assert.deepStrictEqual(outboundDuplicates, [
    [105, ['CPacketBaseEventDetection', 'CPacketResponseDetection']],
    [111, ['CPacketMovePlayer', 'CPacketReloadGun']]
  ]);
  assert.strictEqual(protocol.PROTOCOL_LEDGER.counts.unaccounted, 0);
  assert.strictEqual(protocol.PROTOCOL_LEDGER.counts.guessed, 0);
});

check('settings packet keeps historical field names with 856 wire names', () => {
  assert.strictEqual(protocol.INBOUND_IDS.SPacketServerSetting, 59);
  assert.strictEqual(protocol.INBOUND_HANDLER_IDS.SPacketServerSetting, 59);
  assert.strictEqual(protocol.PROTOCOL_SETTINGS.id, 59);
  assert.strictEqual(protocol.PROTOCOL_SETTINGS.name, 'SPacketServerSetting');
  assert.deepStrictEqual(protocol.PROTOCOL_SETTINGS.fields, {
    entries: 'UT',
    removed: 'KT',
    playerId: 'wT',
    name: 'vT',
    settingsJson: 'eT',
    removedKeys: 'uT'
  });
  assert.deepStrictEqual(protocol.PROTOCOL_SETTINGS.wireFields, {
    entries: 'tFF',
    removed: 'IFF',
    playerId: 'qFF',
    name: 'pFF',
    settingsJson: 'DFF',
    removedKeys: 'fFF'
  });
  const topFields = protocol.INBOUND_SCHEMAS.SPacketServerSetting.fields.map((field) => field.name);
  assert.deepStrictEqual(topFields, ['UT', 'KT']);
});

check('join packet keeps iL/jL with 854 wire fields TA/HA', () => {
  assert.strictEqual(protocol.INBOUND_IDS.SPacketJoinGame, 64);
  const fields = protocol.INBOUND_SCHEMAS.SPacketJoinGame.fields.map((field) => field.name);
  assert.deepStrictEqual(fields, ['iL', 'jL']);
  const evidence = inboundSchemasDoc.find((row) => row.id === 64);
  assert.deepStrictEqual(evidence.schema.fields.map((field) => field.name), ['aE', 'qE']);
});

check('transport roles resolve to 854 ids', () => {
  assert.strictEqual(protocol.OUTBOUND_IDS.CPacketKeepAliveDetection, 25);
  assert.strictEqual(transportDoc.roles.keepalive.id, 25);
  assert.strictEqual(transportDoc.roles.keepalive.intervalMs, 42500);
  assert.strictEqual(transportDoc.roles.analyticsPing.id, 26);
  assert.strictEqual(transportDoc.roles.analyticsUpdate.id, 17);
  assert.strictEqual(protocol.OUTBOUND_IDS.CPacketOutbound26, 26);
  assert.strictEqual(protocol.OUTBOUND_IDS.CPacketOutbound17, 17);
  assert.strictEqual(protocol.PROTOCOL_LEDGER.outbound.find((row) => row.id === 26).disposition, 'implemented');
  assert.strictEqual(protocol.PROTOCOL_LEDGER.outbound.find((row) => row.id === 17).disposition, 'implemented');
});

check('inbound field maps resolve against the preserved schemas', () => {
  for (const [name, spec] of Object.entries(protocol.INBOUND_FIELD_MAPS)) {
    const type = protocol.INBOUND_SCHEMAS[name];
    assert.ok(type, name + ' schema');
    const walk = (mapSpec, fieldType, label) => {
      if (mapSpec.element) {
        assert.ok(fieldType.itemsType && fieldType.itemsType.fields, label + ' element must be a record');
        walk(mapSpec.element, fieldType.itemsType, label + '.element');
        return;
      }
      const names = new Set(fieldType.fields.map((field) => field.name));
      const recordFields = (type) => {
        if (type.fields) return type.fields;
        if (Array.isArray(type.types)) {
          const branch = type.types.find((entry) => entry.fields);
          if (branch) return branch.fields;
        }
        return null;
      };
      for (const [target, source] of Object.entries(mapSpec)) {
        if (source && typeof source === 'object') {
          assert.ok(names.has(source.from), label + ' missing ' + source.from);
          const nested = recordFields(fieldType.fields.find((field) => field.name === source.from).type);
          assert.ok(nested, label + '.' + source.from + ' must resolve to a record');
          const nestedFields = new Set(nested.map((field) => field.name));
          for (const nestedSource of Object.values(source.map || {})) {
            assert.ok(nestedFields.has(nestedSource), label + '.' + source.from + ' missing ' + nestedSource);
          }
        } else {
          assert.ok(names.has(source), label + ' missing ' + source);
        }
      }
    };
    walk(spec, type, name);
  }
});

check('codec round-trips', () => {
  const { Type } = require('avsc');
  const join = protocol.INBOUND_SCHEMAS.SPacketJoinGame.random();
  const decodedJoin = protocol.decodeInbound('SPacketJoinGame', protocol.INBOUND_SCHEMAS.SPacketJoinGame.toBuffer(join));
  assert.strictEqual(typeof decodedJoin.eId, 'string');
  assert.ok(Array.isArray(decodedJoin.pass));

  const settings = protocol.INBOUND_SCHEMAS.SPacketServerSetting.random();
  const decodedSettings = protocol.decodeInbound('SPacketServerSetting', protocol.INBOUND_SCHEMAS.SPacketServerSetting.toBuffer(settings));
  assert.ok(Array.isArray(decodedSettings.UT));
  assert.ok(Array.isArray(decodedSettings.KT));

  const finish = protocol.encodeOutbound('CPacketFinishUse', { used: true, duration: 5 });
  assert.ok(Buffer.isBuffer(finish));
  const finishSchema = Type.forSchema({ type: 'record', fields: [{ name: 'Ai', type: 'boolean' }, { name: 'uR', type: 'long' }] });
  const decodedFinish = finishSchema.fromBuffer(finish);
  assert.strictEqual(decodedFinish.Ai, true);
  assert.strictEqual(Number(decodedFinish.uR), 5);
});

check('product target and descriptor contain no 846 literal', () => {
  for (const file of ['bloxd/protocol/target.js', 'bloxd/protocol/live.js']) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.strictEqual(/\b846\b/.test(text), false, file + ' still mentions 846');
  }
});

const failed = checks.filter((entry) => !entry.ok);
for (const entry of checks) {
  if (!entry.ok) console.error('FAIL ' + entry.label + ': ' + entry.error);
}
console.log('PROTOCOL-856 checks=' + checks.length + ' fail=' + failed.length);
process.exit(failed.length === 0 ? 0 : 1);
