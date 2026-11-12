#!/usr/bin/env node
'use strict';

/*
 * Independent acceptance check for the captured-build 846 extraction.
 *
 * This file intentionally does not import `bloxd/protocol/live.js`, the
 * production registry helpers or any production descriptor. Expected values
 * below are the verified build facts from the capture task; the generated
 * evidence is produced by `.research/extract-846.cjs` from the captured bytes.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT, '.research', 'builds', 'tcwczu-357faec1');
const GENERATED_DIR = path.join(BUILD_DIR, 'generated');
const EXTRACTOR = path.join(ROOT, '.research', 'extract-846.cjs');

const EXPECTED = {
  build: 'tcwczu',
  buildVersion: '357faec1',
  version: 846,
  roles: { version: 64, packet: 2115, registry: 1316, send: 2094 },
  inboundIds: 72,
  inboundSchemaIds: 73,
  inboundHandlerIds: 101,
  inboundSchemaOnlyIds: 1,
  inboundHandlerWithoutSchemaIds: 29,
  outboundIds: 75,
  outboundCallSiteIds: 68,
  outboundCallSiteWithoutSchemaIds: [17, 49, 54, 67, 93, 112],
  chunkTotalBytes: 22915206,
  assetsEntriesWithoutReference: 254,
  sandboxConstructorEscapes: 0,
  sendKey: 9313,
  registryKeys: 16164,
  ambiguousRoles: 0,
  missingAssets: 0,
  keepalive: 110,
  analyticsPing: 66,
  analyticsUpdate: 62,
};

const SELF_TESTS = ['missing-role', 'ambiguous-role', 'sandbox-write-attempt'];

function main(argv) {
  const selfIndex = argv.indexOf('--self-test');
  if (selfIndex >= 0) {
    return runSelfTest(argv[selfIndex + 1]);
  }
  try {
    const result = check();
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(0);
  } catch (err) {
    process.stderr.write(JSON.stringify({
      ok: false,
      code: err.code || 'E_CHECK_FAILED',
      message: err.message,
      details: err.details === undefined ? null : err.details,
    }, null, 2) + '\n');
    process.exit(2);
  }
}

function runSelfTest(name) {
  if (name === 'sandbox-constructor-escape') {
    const res = spawnSync(process.execPath, [EXTRACTOR, '--self-test', name], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 300000,
      maxBuffer: 64 * 1024 * 1024,
    });
    const combined = String(res.stdout || '') + String(res.stderr || '');
    if (res.status === 0 && combined.indexOf('"sandboxConstructorEscapes": 0') >= 0) {
      process.stdout.write(JSON.stringify({
        ok: true,
        selfTest: name,
        sandboxConstructorEscapes: 0,
        extractorExit: res.status,
      }, null, 2) + '\n');
      process.exit(0);
    }
    process.stderr.write(JSON.stringify({
      ok: false,
      code: 'E_SANDBOX_ESCAPE',
      selfTest: name,
      extractorExit: res.status,
      output: combined.slice(0, 4000),
    }, null, 2) + '\n');
    process.exit(2);
  }
  if (!SELF_TESTS.includes(name)) {
    process.stderr.write(JSON.stringify({ ok: false, code: 'E_BAD_SELF_TEST', selfTest: name }) + '\n');
    process.exit(2);
  }
  const expected = {
    'missing-role': 'E_MISSING_ROLE',
    'ambiguous-role': 'E_AMBIGUOUS_ROLE',
    'sandbox-write-attempt': 'E_SANDBOX_ESCAPE',
  }[name];
  const res = spawnSync(process.execPath, [EXTRACTOR, '--self-test', name], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 300000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const combined = String(res.stdout || '') + String(res.stderr || '');
  const observed = combined.indexOf(expected) >= 0;
  if (res.status !== 0 && observed) {
    // The acceptance contract requires the failure self-test itself to be a
    // non-zero command that names the specific reason.
    process.stderr.write(JSON.stringify({
      ok: false,
      code: 'E_SELF_TEST_FAILURE_CONFIRMED',
      selfTest: name,
      expected,
      extractorExit: res.status,
    }, null, 2) + '\n');
    process.exit(1);
  }
  process.stderr.write(JSON.stringify({
    ok: false,
    code: 'E_SELF_TEST_NOT_OBSERVED',
    selfTest: name,
    expected,
    extractorExit: res.status,
    output: combined.slice(0, 2000),
  }, null, 2) + '\n');
  process.exit(2);
}

function check() {
  assertEqual(typeof fs.existsSync, 'function', 'node builtins');
  if (!fs.existsSync(GENERATED_DIR)) {
    fail('E_MISSING_EVIDENCE', 'generated evidence does not exist: ' + path.relative(ROOT, GENERATED_DIR));
  }
  const manifestPath = path.join(GENERATED_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) fail('E_MISSING_EVIDENCE', 'generated manifest.json does not exist');

  const manifestText = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);
  const canonicalManifestSha = sha256(manifestText);

  assertEqual(manifest.build, EXPECTED.build, 'build');
  assertEqual(manifest.buildVersion, EXPECTED.buildVersion, 'buildVersion');
  assertEqual(manifest.counts.version, EXPECTED.version, 'version');
  assertEqual(manifest.roles.version.module, EXPECTED.roles.version, 'role version module');
  assertEqual(manifest.roles.packet.module, EXPECTED.roles.packet, 'role packet module');
  assertEqual(manifest.roles.registry.module, EXPECTED.roles.registry, 'role registry module');
  assertEqual(manifest.roles.send.module, EXPECTED.roles.send, 'role send module');
  assertEqual(manifest.counts.ambiguousRoles, EXPECTED.ambiguousRoles, 'ambiguousRoles');
  assertEqual(manifest.counts.missingAssets, EXPECTED.missingAssets, 'missingAssets');
  assertEqual(manifest.counts.registryKeys, EXPECTED.registryKeys, 'registryKeys');
  assertEqual(manifest.sendKey.value, EXPECTED.sendKey, 'send key');
  assertEqual(manifest.sendKey.formula, '11*VERSION+7', 'send key formula');
  assertEqual(manifest.source.chunks.totalBytes, EXPECTED.chunkTotalBytes, 'chunk total bytes');
  assertEqual(manifest.counts.sandboxConstructorEscapes, EXPECTED.sandboxConstructorEscapes, 'sandbox constructor escapes');
  assertEqual(manifest.checks.sandboxConstructorEscapes, EXPECTED.sandboxConstructorEscapes, 'sandbox checks constructor escapes');
  const probe = manifest.checks.sandboxProbe;
  for (const key of ['processType', 'requireType', 'fsType', 'childProcessType', 'netType', 'httpType', 'httpsType']) {
    assertEqual(probe[key], 'undefined', 'sandbox probe ' + key);
  }
  assertEqual(probe.write, 'BLOCKED', 'sandbox probe write');
  assertEqual(probe.canaryWritten, false, 'sandbox probe canary');
  for (const key of ['exactUint8Version', 'exactUint8Require', 'exactConsoleVersion', 'exactThisVersion']) {
    assertStrict(
      probe[key] === 'undefined' || String(probe[key]).startsWith('THREW:'),
      'sandbox exact escape probe ' + key + ' must be blocked, got ' + probe[key]
    );
  }

  // Generated file integrity versus the manifest summary.
  for (const file of manifest.files) {
    const p = path.join(GENERATED_DIR, file.name);
    if (!fs.existsSync(p)) fail('E_MISSING_EVIDENCE', 'manifest lists a missing file: ' + file.name);
    const buf = fs.readFileSync(p);
    assertEqual(buf.length, file.bytes, 'file size ' + file.name);
    assertEqual(sha256(buf), file.sha256, 'file sha256 ' + file.name);
  }

  const inboundIds = readJson('inbound-ids.json');
  const outboundIds = readJson('outbound-ids.json');
  const inboundSchemas = readJson('inbound-schemas.json');
  const outboundSchemas = readJson('outbound-schemas.json');
  const inboundSemantics = readJson('inbound-semantics.json');
  const outboundSites = readJson('outbound-call-sites.json');
  const registry = readJson('registry.json');
  const transport = readJson('transport.json');
  const assets = readJson('assets.json');

  assertEqual(manifest.counts.inboundIds, EXPECTED.inboundIds, 'manifest inboundIds');
  assertEqual(inboundIds.count, EXPECTED.inboundIds, 'inbound handled ids');
  assertEqual(inboundIds.ids.length, inboundIds.count, 'inbound canonical id list length');
  assertEqual(manifest.counts.outboundIds, EXPECTED.outboundIds, 'manifest outboundIds');
  assertEqual(outboundIds.count, EXPECTED.outboundIds, 'outbound schema ids');
  assertEqual(outboundIds.ids.length, outboundIds.count, 'outbound canonical id list length');
  assertEqual(inboundIds.schemaIds.length, inboundIds.schemaIdCount, 'inbound schema id list length');
  assertEqual(outboundIds.schemaIds.length, outboundIds.schemaIdCount, 'outbound schema id list length');
  assertEqual(inboundIds.schemaIdCount, EXPECTED.inboundSchemaIds, 'inbound raw schema count');
  assertEqual(inboundIds.handlerIdCount, EXPECTED.inboundHandlerIds, 'inbound handler count');
  assertEqual(inboundIds.schemaOnlyIds.length, EXPECTED.inboundSchemaOnlyIds, 'inbound schema-only count');
  assertEqual(inboundIds.handlerWithoutSchemaIds.length, EXPECTED.inboundHandlerWithoutSchemaIds, 'inbound handler-without-schema count');
  assertEqual(outboundIds.callSiteIdCount, EXPECTED.outboundCallSiteIds, 'outbound call-site count');
  assertEqual(outboundIds.callSiteWithoutSchemaCount, 6, 'outbound call-site-without-schema count');
  assertEqual(
    JSON.stringify(outboundIds.callSiteWithoutSchemaIds),
    JSON.stringify(EXPECTED.outboundCallSiteWithoutSchemaIds),
    'outbound call-site-without-schema ids'
  );
  assertEqual(manifest.counts.outboundCallSiteWithoutSchema, 6, 'manifest outbound call-site-without-schema');
  assertEqual(
    JSON.stringify(manifest.checks.outboundCallSiteWithoutSchemaIdList),
    JSON.stringify(EXPECTED.outboundCallSiteWithoutSchemaIds),
    'manifest outbound call-site-without-schema ids'
  );
  assertArraySortedUnique(inboundIds.ids, 'inbound ids');
  assertArraySortedUnique(inboundIds.schemaIds, 'inbound schema ids');
  assertArraySortedUnique(inboundIds.handlerIds, 'inbound handler ids');
  assertArraySortedUnique(inboundIds.schemaOnlyIds, 'inbound schema-only ids');
  assertArraySortedUnique(inboundIds.handlerWithoutSchemaIds, 'inbound handler-without-schema ids');
  assertArraySortedUnique(outboundIds.ids, 'outbound ids');
  assertArraySortedUnique(outboundIds.callSiteIds, 'outbound call-site ids');

  // The disposition partitions the union of schema ids and handler ids with
  // no overlap and no dropped id.
  const handlerSet = new Set(inboundIds.handlerIds);
  const schemaIdSet = new Set(inboundIds.schemaIds);
  for (const id of inboundIds.ids) {
    if (!handlerSet.has(id) || !schemaIdSet.has(id)) {
      fail('E_HANDLER_WITHOUT_SCHEMA', 'canonical inbound id ' + id + ' is not both handled and typed');
    }
  }
  for (const id of inboundIds.schemaOnlyIds) {
    if (handlerSet.has(id) || !schemaIdSet.has(id)) {
      fail('E_DISPOSITION', 'schema-only id ' + id + ' overlaps or is untyped');
    }
  }
  for (const id of inboundIds.handlerWithoutSchemaIds) {
    if (schemaIdSet.has(id) || !handlerSet.has(id)) {
      fail('E_DISPOSITION', 'handler-without-schema id ' + id + ' overlaps or is typed');
    }
  }
  const union = new Set([].concat(inboundIds.schemaIds, inboundIds.handlerIds));
  assertEqual(
    inboundIds.ids.length + inboundIds.schemaOnlyIds.length + inboundIds.handlerWithoutSchemaIds.length,
    union.size,
    'inbound dispositions cover the id union exactly once'
  );

  const outboundSchemaSet = new Set(outboundIds.schemaIds);
  const outboundCallSiteSet = new Set(outboundIds.callSiteIds);
  const outboundUnion = new Set([].concat(outboundIds.schemaIds, outboundIds.callSiteIds));
  for (const id of outboundIds.callSiteWithoutSchemaIds) {
    if (outboundSchemaSet.has(id) || !outboundCallSiteSet.has(id)) {
      fail('E_DISPOSITION', 'outbound call-site-without-schema id ' + id + ' overlaps or is not a call site');
    }
  }
  assertEqual(
    outboundIds.disposition.schemaWithCallSite + outboundIds.schemaOnlyIds.length + outboundIds.callSiteWithoutSchemaIds.length,
    outboundUnion.size,
    'outbound dispositions cover the id union exactly once'
  );

  // Every generated schema must be a valid avsc shape.
  const PRIMITIVES = new Set(['null', 'boolean', 'int', 'long', 'float', 'double', 'bytes', 'string']);
  const COMPLEX = new Set(['record', 'array', 'map', 'enum', 'fixed', 'error']);
  for (const [direction, list] of [['inbound', inboundSchemas], ['outbound', outboundSchemas]]) {
    if (!list.length) fail('E_EMPTY_SCHEMAS', direction + ' has no schemas');
    for (const entry of list) {
      if (entry.valid !== true) fail('E_SCHEMA_UNSUPPORTED', direction + ' schema ' + entry.id + ' is not valid');
      const kind = schemaKind(entry.schema);
      if (!(PRIMITIVES.has(kind) || COMPLEX.has(kind))) {
        fail('E_SCHEMA_UNSUPPORTED', direction + ' schema ' + entry.id + ' has an invalid avsc type: ' + String(kind));
      }
      if (entry.type !== kind) {
        fail('E_SCHEMA_UNSUPPORTED', direction + ' schema ' + entry.id + ' type field disagrees with schema');
      }
    }
  }

  // Registry: runtime-expanded count must be distinguished from literal
  // members, with numeric-id and name views.
  assertEqual(registry.runtimeExpandedKeyCount, EXPECTED.registryKeys, 'registry runtime count');
  const registryNumericKeys = Object.keys(registry.numericIdView).length;
  const registryNameKeys = Object.keys(registry.nameView).length;
  if (!(registryNumericKeys > 0)) fail('E_REGISTRY_INCOMPLETE', 'registry numeric-id view is empty');
  assertEqual(registryNumericKeys + registryNameKeys, EXPECTED.registryKeys, 'registry numeric+name key count');
  if (!(typeof registry.literalMemberCount === 'number' && registry.literalMemberCount > 0)) {
    fail('E_REGISTRY_INCOMPLETE', 'registry literal member count missing');
  }
  if (!(registry.literalMemberCount < registry.runtimeExpandedKeyCount)) {
    fail('E_REGISTRY_INCOMPLETE', 'runtime-expanded count was not distinguished from literal members', {
      literal: registry.literalMemberCount,
      runtime: registry.runtimeExpandedKeyCount,
    });
  }
  if (Object.keys(registry.nameView).length === 0) fail('E_REGISTRY_INCOMPLETE', 'registry name view is empty');
  if (!registry.items || !(registry.items.count > 0)) fail('E_REGISTRY_INCOMPLETE', 'item registry view is empty');
  if (!(Object.keys(registry.items.numericIdView).length === registry.items.count)) {
    fail('E_REGISTRY_INCOMPLETE', 'item registry numeric view count mismatch');
  }
  if (!(registry.atlas && registry.atlas.count > 0)) fail('E_ASSETS_INCOMPLETE', 'atlas table is empty');

  // Transport.
  assertEqual(transport.version, EXPECTED.version, 'transport version');
  assertEqual(transport.transportKey.computed, EXPECTED.sendKey, 'transport key');
  assertEqual(transport.transportKey.formula, '11*VERSION+7', 'transport key formula');
  assertEqual(transport.roles.keepalive.id, EXPECTED.keepalive, 'keepalive id');
  assertEqual(transport.roles.analyticsPing.id, EXPECTED.analyticsPing, 'analytics ping id');
  assertEqual(transport.roles.analyticsUpdate.id, EXPECTED.analyticsUpdate, 'analytics update id');
  assertStrict(transport.roles.keepalive.intervalMs === 42500, 'keepalive interval 42500');

  // Semantics.
  if (!inboundSemantics.length) fail('E_SEMANTICS_MISSING', 'inbound semantics is empty');
  for (const entry of inboundSemantics) {
    if (!Array.isArray(entry.handlerSites) || entry.handlerSites.length === 0) {
      fail('E_SEMANTICS_MISSING', 'inbound semantics entry ' + entry.id + ' has no handler site');
    }
  }
  if (!outboundSites.length) fail('E_SEMANTICS_MISSING', 'outbound call sites are empty');

  // Assets. missingAssets counts empty/unresolved reference values only;
  // entriesWithoutReference is the number of entries that intentionally carry
  // no texture/model/atlas field and is not a failure.
  assertEqual(assets.missingAssets, EXPECTED.missingAssets, 'missing assets');
  assertEqual(assets.entriesWithoutReference, EXPECTED.assetsEntriesWithoutReference, 'assets entries without reference');
  assertEqual(manifest.counts.assetsEntriesWithoutReference, EXPECTED.assetsEntriesWithoutReference, 'manifest assets entries without reference');
  if (!(assets.referenceCount > 0)) fail('E_ASSETS_INCOMPLETE', 'no asset references extracted');
  assertEqual(assets.build, EXPECTED.build, 'asset build');
  assertEqual(assets.sourceMainSha256, manifest.source.main.sha256, 'asset source main sha256');
  const banned = ['.research/live', 'registry-840', '9s8fb'];
  for (const ref of assets.references) {
    for (const marker of banned) {
      if (String(ref.sourcePath).includes(marker) || String(ref.value).includes(marker)) {
        fail('E_HISTORICAL_FALLBACK', 'asset reference points at historical artifacts: ' + marker);
      }
    }
  }

  // Two clean extractions must produce the same manifest digest.
  const repro = reproducibility(canonicalManifestSha);

  return {
    ok: true,
    build: manifest.build,
    version: manifest.counts.version,
    roles: {
      version: manifest.roles.version.module,
      packet: manifest.roles.packet.module,
      registry: manifest.roles.registry.module,
      send: manifest.roles.send.module,
    },
    inbound: manifest.counts.inboundIds,
    inboundSchema: manifest.counts.inboundSchemaIds,
    inboundHandler: manifest.counts.inboundHandlerIds,
    inboundSchemaOnly: manifest.counts.inboundSchemaOnlyIds,
    inboundHandlerWithoutSchema: manifest.checks.handlerWithoutSchema,
    outbound: manifest.counts.outboundIds,
    outboundCallSite: manifest.counts.outboundCallSiteIds,
    outboundCallSiteWithoutSchema: manifest.counts.outboundCallSiteWithoutSchema,
    sendKey: manifest.sendKey.value,
    registryKeys: manifest.counts.registryKeys,
    ambiguousRoles: manifest.counts.ambiguousRoles,
    missingAssets: manifest.counts.missingAssets,
    assetsEntriesWithoutReference: manifest.counts.assetsEntriesWithoutReference,
    sandboxConstructorEscapes: manifest.counts.sandboxConstructorEscapes,
    chunkTotalBytes: manifest.source.chunks.totalBytes,
    inboundSchemas: inboundSchemas.length,
    outboundSchemas: outboundSchemas.length,
    allSchemasTyped: true,
    manifestSha256: canonicalManifestSha,
    reproducibility: repro,
    checkedFiles: manifest.files.map((f) => f.name).sort(),
  };
}

function reproducibility(canonicalManifestSha) {
  const runs = [];
  const tmpRoots = [];
  try {
    for (let i = 0; i < 2; i++) {
      const outDir = path.join(BUILD_DIR, '.repro-tmp-' + i);
      tmpRoots.push(outDir);
      fs.rmSync(outDir, { recursive: true, force: true });
      const res = spawnSync(process.execPath, [EXTRACTOR, '--out', outDir], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 600000,
        maxBuffer: 128 * 1024 * 1024,
      });
      if (res.status !== 0) {
        fail('E_REPRODUCIBILITY_FAILED', 'clean extraction ' + i + ' failed', {
          status: res.status,
          stderr: String(res.stderr || '').slice(0, 4000),
        });
      }
      const text = fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8');
      runs.push(sha256(text));
    }
  } finally {
    for (const dir of tmpRoots) fs.rmSync(dir, { recursive: true, force: true });
  }
  assertEqual(runs[0], runs[1], 'two-run manifest sha256');
  assertEqual(runs[0], canonicalManifestSha, 'canonical vs clean-run manifest sha256');
  return { runs: 2, manifestSha256: runs[0], stable: true };
}

function schemaKind(schema) {
  if (typeof schema === 'string') return schema;
  if (Array.isArray(schema)) return 'union';
  if (schema && typeof schema === 'object') {
    if (typeof schema.type === 'string') return schema.type;
    if (Array.isArray(schema.type)) return 'union';
  }
  return null;
}

function readJson(name) {
  const p = path.join(GENERATED_DIR, name);
  if (!fs.existsSync(p)) fail('E_MISSING_EVIDENCE', 'missing generated file: ' + name);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    fail('E_INVALID_EVIDENCE', 'cannot parse ' + name + ': ' + err.message);
  }
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    fail('E_ASSERTION', label + ' mismatch', { expected, actual });
  }
}

function assertStrict(condition, label) {
  if (!condition) fail('E_ASSERTION', label);
}

function assertArraySortedUnique(values, label) {
  if (!Array.isArray(values)) fail('E_ASSERTION', label + ' is not an array');
  for (let i = 1; i < values.length; i++) {
    if (values[i] <= values[i - 1]) {
      fail('E_ASSERTION', label + ' is not strictly sorted/unique at index ' + i, { previous: values[i - 1], current: values[i] });
    }
  }
}

function fail(code, message, details) {
  const err = new Error(message);
  err.code = code;
  err.details = details;
  throw err;
}

main(process.argv.slice(2));
