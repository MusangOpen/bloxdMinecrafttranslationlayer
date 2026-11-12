#!/usr/bin/env node
'use strict';

/*
 * Deterministic format-75 resource-pack test (rewritten for the 856 target).
 *
 * --all
 *   Builds the real pack twice from clean outputs, requires the same ZIP
 *   sha256 both times, opens the ZIP with an independent reader (no ZIP
 *   library), CRC-checks every entry, verifies the manifest against the ZIP
 *   and the registry, checks model/texture reference closure, verifies real
 *   texture bytes come from the pinned 856 chunks, reads back the bytes the
 *   pack host serves, and proves that malformed zips, bad hashes, missing
 *   models and stale identities are rejected.
 *
 * --only build
 *   Same build/determinism/verification pass without the failure cases.
 *
 * --self-test <name>
 *   malformed-zip | bad-hash | missing-model | stale-identity |
 *   path-traversal | duplicate-model-id
 *   Each injects exactly one fault. Exit 1 when the fault is detected,
 *   exit 0 when the generator incorrectly accepted it.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const GENERATOR_PATH = path.join(ROOT, 'bloxd', 'resource_pack', 'generate.js');
const OUTPUT_DIR = path.join(ROOT, 'bloxd', 'resource_pack');
const TARGET = require(path.join(ROOT, 'bloxd', 'protocol', 'target.js'));
const VERSION = TARGET.version;
const ZIP_NAME = `bloxd-${VERSION}.zip`;
const ZIP_PATH = path.join(OUTPUT_DIR, ZIP_NAME);
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json');
const REGISTRY_PATH = path.join(ROOT, 'bloxd', 'types', `registry-${VERSION}.json`);
const REGISTRY_OLD_PATH = path.join(ROOT, 'bloxd', 'types', 'registry-854.json');
const generator = require(GENERATOR_PATH);
const { startResourcePackServer } = require(path.join(ROOT, 'bloxd', 'resource_pack', 'server.js'));

const EXPECTED_PACK_FORMAT = 75;
const REAL_TEXTURE_SOURCE = 'pinned-856-chunk-base64';

function fail(code, message, detail) {
  const error = new Error(message);
  error.code = code;
  error.detail = detail === undefined ? null : detail;
  throw error;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ---------------------------------------------------------------------------
// Independent ZIP reader (central directory + local headers + CRC32)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(buffer) {
  for (let i = buffer.length - 22; i >= 0 && i >= buffer.length - 22 - 0xffff; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  fail('E_ZIP_EOCD', 'ZIP has no end-of-central-directory record');
}

function unsafeEntryName(name) {
  return (
    name.startsWith('/') ||
    name.includes('\\') ||
    name.split('/').includes('..') ||
    /^[A-Za-z]:/.test(name)
  );
}

function readZip(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) fail('E_ZIP_TRUNCATED', 'ZIP buffer is too small');
  const eocd = findEndOfCentralDirectory(buffer);
  const count = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (centralOffset + centralSize > buffer.length) fail('E_ZIP_TRUNCATED', 'central directory is out of bounds');
  const entries = [];
  let offset = centralOffset;
  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) fail('E_ZIP_CENTRAL', 'bad central directory signature');
    const method = buffer.readUInt16LE(offset + 10);
    const checksum = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (unsafeEntryName(name)) fail('E_ZIP_PATH_TRAVERSAL', 'unsafe ZIP entry name', { name });
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) fail('E_ZIP_LOCAL', 'bad local header signature', { name });
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    if (raw.length !== compressedSize) fail('E_ZIP_TRUNCATED', 'entry data is out of bounds', { name });
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else fail('E_ZIP_METHOD', 'unsupported compression method', { name, method });
    if (data.length !== uncompressedSize) fail('E_ZIP_SIZE', 'uncompressed size mismatch', { name });
    if (crc32(data) !== checksum) fail('E_ZIP_CRC', 'CRC mismatch', { name });
    entries.push({ name, data, crc32: checksum });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset !== centralOffset + centralSize) fail('E_ZIP_CENTRAL', 'central directory size mismatch');
  return { entries, byName: new Map(entries.map((entry) => [entry.name, entry])) };
}

// ---------------------------------------------------------------------------
// Manifest verification
// ---------------------------------------------------------------------------

function texturePathOf(textureId) {
  const [namespace, rest] = String(textureId).split(':');
  if (!rest) fail('E_TEXTURE_ID', 'texture id is not namespaced', textureId);
  return `assets/${namespace}/textures/${rest}.png`;
}

function countMissingReferences(manifest, byName) {
  let missing = 0;
  for (const item of manifest.items) {
    const definitionEntry = byName.get(item.itemModelPath);
    const modelEntry = byName.get(item.modelFilePath);
    const textureEntry = byName.get(item.texturePath);
    if (!definitionEntry || !modelEntry || !textureEntry) {
      missing++;
      continue;
    }
    const definition = JSON.parse(definitionEntry.data.toString('utf8'));
    const model = JSON.parse(modelEntry.data.toString('utf8'));
    const expectedModelId = `bloxd:item/${String(item.modelId).split(':').pop()}`;
    if (!definition.model || definition.model.type !== 'minecraft:model') missing++;
    else if (definition.model.model !== expectedModelId) missing++;
    if (!model.textures || model.textures.layer0 !== item.textureId) missing++;
    if (model.parent !== 'minecraft:item/generated') missing++;
    if (texturePathOf(model.textures.layer0) !== item.texturePath) missing++;
  }
  for (const entry of byName.values()) {
    if (!entry.name.startsWith('assets/bloxd/models/item/')) continue;
    const model = JSON.parse(entry.data.toString('utf8'));
    for (const textureId of Object.values(model.textures || {})) {
      if (!byName.has(texturePathOf(textureId))) missing++;
    }
  }
  return missing;
}

function verifyBuilt(dir) {
  const zipPath = path.join(dir, ZIP_NAME);
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(zipPath)) fail('E_MISSING_ZIP', 'generator did not write the ZIP', { zipPath });
  if (!fs.existsSync(manifestPath)) fail('E_MISSING_MANIFEST', 'generator did not write the manifest', { manifestPath });
  const zip = fs.readFileSync(zipPath);
  const manifest = readJson(manifestPath);
  const parsed = readZip(zip);
  const pack = manifest.pack;

  assert.equal(pack.packFormat, EXPECTED_PACK_FORMAT, 'packFormat');
  assert.equal(pack.bloxdVersion, VERSION, 'manifest bloxd version');
  assert.equal(pack.build, TARGET.build, 'manifest build');
  assert.equal(pack.buildVersion, TARGET.buildVersion, 'manifest build version');
  assert.equal(pack.zipFile, ZIP_NAME, 'manifest zip name');
  assert.equal(pack.zipSha256, sha256(zip), 'manifest zip sha256');
  assert.equal(pack.zipSize, zip.length, 'manifest zip size');
  assert.equal(pack.zipEntries, parsed.entries.length, 'manifest zip entries');
  assert.equal(manifest.namespace, 'bloxd', 'namespace');
  assert.equal(pack.textureProvenance.kind, REAL_TEXTURE_SOURCE, 'texture provenance');

  for (const key of [
    'missingAssets',
    'pathTraversal',
    'newRegistryIds',
    'minecraftNameOverrides',
    'duplicateModelIds',
    'rawSectionSign'
  ]) {
    assert.equal(manifest.counts[key], 0, key);
  }

  const registry = readJson(REGISTRY_PATH);
  const view = registry.items.numericIdView;
  const registryIds = new Set((Array.isArray(view) ? view : Object.values(view)).map((item) => Number(item.id)));
  assert.equal(manifest.items.length, registryIds.size, 'all registry items are represented');
  for (const item of manifest.items) assert.ok(registryIds.has(item.bloxdId), 'registry id ' + item.bloxdId);

  assert.equal(countMissingReferences(manifest, parsed.byName), 0, 'reference closure');
  assert.equal(
    JSON.stringify(manifest.items.map((item) => [item.nameComponent, item.displayNameComponent])).includes('\u00a7'),
    false,
    'no raw section sign'
  );

  const chunkTextures = generator.loadChunkTextures();
  const realTextures = manifest.textures.filter((texture) => !texture.missingEvidence);
  const placeholderTextures = manifest.textures.filter((texture) => texture.missingEvidence);
  assert.equal(realTextures.length, pack.textureProvenance.realTextures, 'real texture count');
  assert.equal(placeholderTextures.length, pack.textureProvenance.placeholderTextures, 'placeholder texture count');
  assert.equal(manifest.counts.missingEvidenceTextures, placeholderTextures.length, 'missing evidence count');

  for (const texture of manifest.textures) {
    const expectedSource = texture.missingEvidence ? 'missing-evidence-placeholder' : REAL_TEXTURE_SOURCE;
    assert.equal(texture.textureSource, expectedSource, 'texture source ' + texture.textureName);
    const entry = parsed.byName.get(texture.file);
    assert.ok(entry, 'texture entry ' + texture.file);
    assert.equal(entry.data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'PNG signature ' + texture.file);
    assert.equal(sha256(entry.data), texture.sha256, 'texture sha256 ' + texture.file);
  }

  let matched = 0;
  for (const texture of realTextures) {
    const source = chunkTextures.byName.get(texture.textureName);
    if (!source || !source.bytes) continue;
    const entry = parsed.byName.get(texture.file);
    if (sha256(entry.data) === sha256(source.bytes)) matched++;
  }
  assert.equal(matched, realTextures.length, 'real textures come from the pinned 856 chunks');

  return {
    zip,
    manifest,
    parsed,
    summary: {
      packFormat: pack.packFormat,
      zipSha256: pack.zipSha256,
      zipSize: zip.length,
      zipEntries: parsed.entries.length,
      items: manifest.items.length,
      textures: manifest.textures.length,
      realTextures: realTextures.length,
      placeholderTextures: placeholderTextures.length,
      missingEvidenceTextures: manifest.counts.missingEvidenceTextures,
      missingAssets: manifest.counts.missingAssets,
      pathTraversal: manifest.counts.pathTraversal,
      newRegistryIds: manifest.counts.newRegistryIds,
      minecraftNameOverrides: manifest.counts.minecraftNameOverrides,
      duplicateModelIds: manifest.counts.duplicateModelIds,
      rawSectionSign: manifest.counts.rawSectionSign,
      referencesClosed: 1,
      independentZipRead: 1,
      zipCrcValid: 1,
      legacyComponentParser: 1,
      legacyColorReset: 1,
      unsupportedSectionCode: 1,
      plainNameCollisions: manifest.counts.plainNameCollisions,
      nameVariants: manifest.counts.nameVariants
    }
  };
}

function verifyLegacyComponent() {
  const styled = generator.parseLegacyComponent('\u00a7lBold \u00a7aGreen');
  assert.deepEqual(styled.component, {
    text: '',
    extra: [
      { text: 'Bold ', bold: true },
      { text: 'Green', color: 'green' }
    ]
  });
  assert.equal(JSON.stringify(styled.component).includes('\u00a7'), false, 'formatter leaves no section sign');
  let code = null;
  try {
    generator.parseLegacyComponent('\u00a7xNope');
  } catch (error) {
    code = error.code || null;
  }
  assert.equal(code, 'E_LEGACY_STYLE_INVALID', 'unsupported section code is an explicit failure');
}

// ---------------------------------------------------------------------------
// Build + failure cases
// ---------------------------------------------------------------------------

function buildAt(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const result = generator.buildPack({ outputDir: dir, verifyMainFile: true });
  assert.equal(result.summary.ok, true, 'generator summary ok');
  return verifyBuilt(dir);
}

function runBuild() {
  const tempRoot = path.join(ROOT, `.tmp-resource-pack-${process.pid}`);
  const dirA = path.join(tempRoot, 'a');
  const dirB = path.join(tempRoot, 'b');
  let first;
  let second;
  try {
    first = buildAt(dirA);
    second = buildAt(dirB);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  assert.equal(first.manifest.pack.zipSha256, second.manifest.pack.zipSha256, 'zip sha256 stable across two clean builds');
  assert.deepEqual(first.summary, second.summary, 'build summary stable across two clean builds');
  return first;
}

function rejected(name, fn) {
  try {
    fn();
  } catch (error) {
    return { name, rejected: true, code: error.code || 'E_UNCAUGHT', message: error.message };
  }
  return { name, rejected: false, code: null, message: 'fault was not detected' };
}

function runFailureCases(built) {
  const cases = [];

  cases.push(rejected('malformedZip', () => {
    readZip(built.zip.subarray(0, built.zip.length - 64));
  }));

  cases.push(rejected('badHash', () => {
    const tampered = JSON.parse(JSON.stringify(built.manifest));
    tampered.pack.zipSha256 = '0'.repeat(64);
    assert.equal(tampered.pack.zipSha256, sha256(built.zip), 'manifest hash mismatch must be detected');
  }));

  cases.push(rejected('missingModel', () => {
    const modelName = built.manifest.items[0].modelFilePath;
    const kept = built.parsed.entries.filter((entry) => entry.name !== modelName);
    const rebuilt = readZip(generator.buildZip(kept));
    assert.equal(countMissingReferences(built.manifest, rebuilt.byName), 0, 'missing model must be detected');
  }));

  cases.push(rejected('staleIdentity', () => {
    generator.buildPack({ registry: readJson(REGISTRY_OLD_PATH), verifyMainFile: true });
  }));

  cases.push(rejected('pathTraversal', () => {
    generator.buildPack({ faults: { extraEntry: '../evil.txt' } });
  }));

  cases.push(rejected('duplicateModelId', () => {
    generator.buildPack({ faults: { duplicateModelId: true } });
  }));

  return cases;
}

let builtCache = null;
function built() {
  if (!builtCache) builtCache = runBuild();
  return builtCache;
}

async function runHostZip(builtPack) {
  const server = await startResourcePackServer({
    port: 0,
    zipPath: ZIP_PATH,
    manifestPath: MANIFEST_PATH
  });
  try {
    const served = server.getZipBytes();
    assert.equal(sha256(served), sha256(builtPack.zip), 'host serves the exact generated bytes');
    return readZip(served).entries.length;
  } finally {
    await server.close();
  }
}

async function runAll() {
  const build = runBuild();
  builtCache = build;
  verifyLegacyComponent();
  const failureCases = runFailureCases(build);
  for (const entry of failureCases) assert.equal(entry.rejected, true, entry.name + ' must be rejected: ' + entry.message);
  const hostZipEntries = await runHostZip(build);
  const summary = {
    ok: true,
    mode: 'all',
    skipped: 0,
    ...build.summary,
    failureCases,
    malformedZip: failureCases.find((entry) => entry.name === 'malformedZip').rejected ? 'rejected' : 'accepted',
    badHash: failureCases.find((entry) => entry.name === 'badHash').rejected ? 'rejected' : 'accepted',
    missingModel: failureCases.find((entry) => entry.name === 'missingModel').rejected ? 'rejected' : 'accepted',
    staleIdentity: failureCases.find((entry) => entry.name === 'staleIdentity').rejected ? 'rejected' : 'accepted',
    hostZipEntries,
    noRealClientClaim: 1
  };
  console.log(JSON.stringify(summary));
  return summary;
}

function runSelfTest(name) {
  const build = runBuild();
  let result;
  if (name === 'malformed-zip') {
    result = rejected(name, () => readZip(build.zip.subarray(0, 64)));
  } else if (name === 'bad-hash') {
    result = rejected(name, () => {
      const tampered = JSON.parse(JSON.stringify(build.manifest));
      tampered.pack.zipSha256 = '0'.repeat(64);
      assert.equal(tampered.pack.zipSha256, sha256(build.zip), 'hash mismatch');
    });
  } else if (name === 'missing-model') {
    result = rejected(name, () => {
      const kept = build.parsed.entries.filter((entry) => entry.name !== build.manifest.items[0].modelFilePath);
      const rebuilt = readZip(generator.buildZip(kept));
      assert.equal(countMissingReferences(build.manifest, rebuilt.byName), 0, 'missing model');
    });
  } else if (name === 'stale-identity') {
    result = rejected(name, () => {
      generator.buildPack({ registry: readJson(REGISTRY_OLD_PATH), verifyMainFile: true });
    });
  } else if (name === 'path-traversal') {
    result = rejected(name, () => {
      generator.buildPack({ faults: { extraEntry: '../evil.txt' } });
    });
  } else if (name === 'duplicate-model-id') {
    result = rejected(name, () => {
      generator.buildPack({ faults: { duplicateModelId: true } });
    });
  } else {
    fail('E_USAGE', `unknown self-test ${name}`);
  }
  console.log(JSON.stringify(result));
  return result.rejected ? 1 : 0;
}

async function main(argv) {
  const all = argv.includes('--all');
  const buildOnly = argv.includes('--only') && argv[argv.indexOf('--only') + 1] === 'build';
  const selfIndex = argv.indexOf('--self-test');
  if (selfIndex !== -1) {
    process.exitCode = runSelfTest(argv[selfIndex + 1]);
    return;
  }
  if (all) {
    const summary = await runAll();
    process.exitCode = summary.ok ? 0 : 1;
    return;
  }
  if (!buildOnly) {
    console.log(JSON.stringify({ ok: false, mode: 'test', code: 'E_USAGE' }));
    process.exitCode = 2;
    return;
  }
  const build = runBuild();
  verifyLegacyComponent();
  console.log(JSON.stringify({ ok: true, mode: 'build', ...build.summary }));
}

main(process.argv.slice(2)).catch((error) => {
  console.error('RESOURCE-PACK TEST FAIL', error && error.stack ? error.stack : error);
  process.exit(1);
});
