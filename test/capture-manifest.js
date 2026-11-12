'use strict';

// Capture manifest test for the pinned public Bloxd build.
//
// Normal mode (`--check`) verifies the on-disk build store against its
// manifest: every file must exist, byte size and SHA-256 must match, and no
// chunk may be missing. It never rewrites the manifest.
//
// Self-tests inject a fault and REQUIRE the shared verification / capture
// helpers to reject it. They intentionally exit non-zero (2) when the fault is
// correctly detected, because the plan defines them as failure-path checks
// (`truncated-chunk`, `overwrite-mismatch`). If a fault is NOT detected they
// exit 1, which is the actual dangerous outcome.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT, '.research', 'builds', 'tcwczu-357faec1');
const EXPECTED_BUILD = 'tcwczu';
const MAIN_NAME = 'tcwczu.main.357faec1.js';
const MAIN_URL = 'https://bloxd.io/static/js/' + MAIN_NAME;

function fail(message, code) {
  const err = new Error(message);
  err.code = code || 'E_CHECK';
  return err;
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function isHex64(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

// Loads the downloader module lazily so a missing/older module produces a
// useful error instead of a stack trace from require().
function loadCapture() {
  let mod;
  try {
    mod = require(path.join(ROOT, '.research', 'download-live.js'));
  } catch (err) {
    throw fail('cannot load .research/download-live.js: ' + err.message, 'E_MODULE_MISSING');
  }
  if (!mod || typeof mod.verifyStore !== 'function' || typeof mod.writeFileNoOverwrite !== 'function') {
    throw fail('.research/download-live.js does not export verifyStore/writeFileNoOverwrite', 'E_MODULE_API');
  }
  return mod;
}

function readManifest(buildDir) {
  const manifestPath = path.join(buildDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw fail('manifest not found at ' + manifestPath + ' (no current build captured)', 'E_NO_MANIFEST');
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    throw fail('manifest is not valid JSON: ' + err.message, 'E_MANIFEST_JSON');
  }
  return { manifest, manifestPath };
}

function assertManifestShape(manifest) {
  if (manifest.build !== EXPECTED_BUILD) {
    throw fail('manifest.build=' + manifest.build + ' expected ' + EXPECTED_BUILD, 'E_BUILD');
  }
  if (manifest.mainUrl !== MAIN_URL) {
    throw fail('manifest.mainUrl=' + manifest.mainUrl + ' expected ' + MAIN_URL, 'E_MAIN_URL');
  }
  if (manifest.entryUrl !== MAIN_URL) {
    throw fail('manifest.entryUrl=' + manifest.entryUrl + ' expected ' + MAIN_URL, 'E_ENTRY_URL');
  }
  if (manifest.httpStatus !== 200) {
    throw fail('manifest.httpStatus=' + manifest.httpStatus + ' expected 200', 'E_HTTP_STATUS');
  }
  if (typeof manifest.retrievedAt !== 'string' || isNaN(Date.parse(manifest.retrievedAt))) {
    throw fail('manifest.retrievedAt is not an ISO date', 'E_RETRIEVED_AT');
  }
  if (!manifest.main || !isHex64(manifest.main.sha256)) {
    throw fail('manifest.main.sha256 is not a 64-hex lowercase string', 'E_MAIN_HASH');
  }
  if (!Number.isInteger(manifest.main.size) || manifest.main.size <= 0) {
    throw fail('manifest.main.size must be a positive integer', 'E_MAIN_SIZE');
  }
  if (!Number.isInteger(manifest.chunkCount) || manifest.chunkCount <= 0) {
    throw fail('manifest.chunkCount must be a positive integer', 'E_CHUNK_COUNT');
  }
  if (!Array.isArray(manifest.chunks) || manifest.chunks.length !== manifest.chunkCount) {
    throw fail('manifest.chunks length does not equal chunkCount', 'E_CHUNK_LIST');
  }
  if (manifest.missing !== 0) {
    throw fail('manifest.missing=' + manifest.missing + ' expected 0', 'E_MANIFEST_MISSING');
  }
}

// Shared verification, also used by the self-tests and the downloader.
function verifyStore(buildDir) {
  const { manifest, manifestPath } = readManifest(buildDir);
  assertManifestShape(manifest);
  const missing = [];
  const hashMismatch = [];
  const sizeMismatch = [];

  const mainPath = path.join(buildDir, manifest.main.path || 'main.js');
  if (!fs.existsSync(mainPath)) {
    missing.push(manifest.main.path || 'main.js');
  } else {
    const buf = fs.readFileSync(mainPath);
    if (buf.length !== manifest.main.size) sizeMismatch.push('main.js');
    if (sha256(buf) !== manifest.main.sha256) hashMismatch.push('main.js');
  }

  const seen = new Set();
  for (const chunk of manifest.chunks) {
    if (!chunk || typeof chunk.id !== 'string' || !chunk.id) {
      throw fail('chunk entry without a string id', 'E_CHUNK_ENTRY');
    }
    if (seen.has(chunk.id)) throw fail('duplicate chunk id ' + chunk.id, 'E_CHUNK_DUPLICATE');
    seen.add(chunk.id);
    if (!isHex64(chunk.sha256)) throw fail('chunk ' + chunk.id + ' sha256 not 64-hex', 'E_CHUNK_HASH');
    if (!Number.isInteger(chunk.size) || chunk.size <= 0) {
      throw fail('chunk ' + chunk.id + ' size must be a positive integer', 'E_CHUNK_SIZE');
    }
    if (typeof chunk.url !== 'string' || !chunk.url.startsWith('https://bloxd.io/static/js/')) {
      throw fail('chunk ' + chunk.id + ' url is not a public static URL', 'E_CHUNK_URL');
    }
    if (typeof chunk.path !== 'string' || chunk.path.length === 0) {
      throw fail('chunk ' + chunk.id + ' missing relative path', 'E_CHUNK_PATH');
    }
    const abs = path.resolve(buildDir, chunk.path);
    if (!abs.startsWith(path.resolve(buildDir) + path.sep)) {
      throw fail('chunk ' + chunk.id + ' path escapes build dir', 'E_CHUNK_PATH_TRAVERSAL');
    }
    if (!fs.existsSync(abs)) {
      missing.push(chunk.path);
      continue;
    }
    const buf = fs.readFileSync(abs);
    if (buf.length !== chunk.size) sizeMismatch.push(chunk.path);
    if (sha256(buf) !== chunk.sha256) hashMismatch.push(chunk.path);
  }

  if (missing.length) {
    throw fail('missing files: ' + missing.join(', '), 'E_MISSING_FILES');
  }
  if (sizeMismatch.length) {
    throw fail('size mismatch: ' + sizeMismatch.join(', '), 'E_SIZE_MISMATCH');
  }
  if (hashMismatch.length) {
    throw fail('hash mismatch: ' + hashMismatch.join(', '), 'E_HASH_MISMATCH');
  }

  return {
    build: manifest.build,
    mainSha256: manifest.main.sha256,
    mainSize: manifest.main.size,
    chunks: manifest.chunkCount,
    missing: missing.length,
    hashMismatch: hashMismatch.length,
    retrievedAt: manifest.retrievedAt,
    manifestPath
  };
}

function check() {
  const report = verifyStore(BUILD_DIR);
  console.log(JSON.stringify({
    ok: true,
    build: report.build,
    mainSha256: report.mainSha256,
    mainSize: report.mainSize,
    chunks: report.chunks,
    missing: report.missing,
    hashMismatch: report.hashMismatch
  }, null, 2));
  return 0;
}

function makeTempDir(label) {
  const dir = path.join(ROOT, '.research', 'builds', '.selftest-' + label + '-' + process.pid + '-' + Date.now());
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'chunks'), { recursive: true });
  return dir;
}

// Fault: a manifest promises bytes that the chunk file does not contain.
function selfTestTruncatedChunk() {
  const dir = makeTempDir('truncated');
  try {
    const mainBuf = Buffer.from('console.log("main");');
    const chunkBuf = Buffer.from('ab');
    fs.writeFileSync(path.join(dir, 'main.js'), mainBuf);
    fs.writeFileSync(path.join(dir, 'chunks', 'tcwczu.1.deadbeef.chunk.js'), chunkBuf);
    const manifest = {
      build: EXPECTED_BUILD,
      entryUrl: MAIN_URL,
      mainUrl: MAIN_URL,
      httpStatus: 200,
      retrievedAt: new Date().toISOString(),
      main: { path: 'main.js', sha256: sha256(mainBuf), size: mainBuf.length },
      chunkCount: 1,
      chunks: [{
        id: '1',
        url: 'https://bloxd.io/static/js/tcwczu.1.deadbeef.chunk.js',
        path: 'chunks/tcwczu.1.deadbeef.chunk.js',
        sha256: sha256(Buffer.from('abcdefghij')),
        size: 10
      }],
      missing: 0
    };
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    return gatedSelfTest('truncated-chunk', () => verifyStore(dir), dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Fault: an existing file differs from incoming bytes. It must never be
// overwritten and no manifest may be accepted.
function selfTestOverwriteMismatch() {
  const dir = makeTempDir('overwrite');
  try {
    const target = path.join(dir, 'chunks', 'existing.chunk.js');
    fs.writeFileSync(target, 'ORIGINAL');
    let caught = null;
    try {
      loadCapture().writeFileNoOverwrite(target, Buffer.from('REPLACEMENT'));
    } catch (err) {
      caught = err;
    }
    const unchanged = fs.readFileSync(target, 'utf8') === 'ORIGINAL';
    const manifestAccepted = fs.existsSync(path.join(dir, 'manifest.json'));
    if (!caught) {
      console.error(JSON.stringify({ selfTest: 'overwrite-mismatch', rejected: false, reason: 'writer overwrote a mismatched file' }, null, 2));
      return 1;
    }
    if (!caught.code || !/MISMATCH/.test(caught.code)) {
      console.error(JSON.stringify({ selfTest: 'overwrite-mismatch', rejected: false, reason: 'wrong error code: ' + caught.code }, null, 2));
      return 1;
    }
    if (!unchanged) {
      console.error(JSON.stringify({ selfTest: 'overwrite-mismatch', rejected: false, reason: 'file was modified' }, null, 2));
      return 1;
    }
    if (manifestAccepted) {
      console.error(JSON.stringify({ selfTest: 'overwrite-mismatch', rejected: false, reason: 'partial manifest accepted' }, null, 2));
      return 1;
    }
    console.error(JSON.stringify({
      selfTest: 'overwrite-mismatch',
      rejected: true,
      code: caught.code,
      fileUnchanged: unchanged,
      manifestAccepted,
      expectedExit: 2
    }, null, 2));
    return 2;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function gatedSelfTest(name, fn, dir) {
  let caught = null;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  const manifestAccepted = fs.existsSync(path.join(dir, 'manifest.json')) && caught === null;
  if (!caught) {
    console.error(JSON.stringify({ selfTest: name, rejected: false, reason: 'corrupt store was accepted', manifestAccepted }, null, 2));
    return 1;
  }
  console.error(JSON.stringify({
    selfTest: name,
    rejected: true,
    code: caught.code,
    message: caught.message,
    manifestAccepted: false,
    expectedExit: 2
  }, null, 2));
  return 2;
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--self-test')) {
    const i = args.indexOf('--self-test');
    const name = args[i + 1];
    if (name === 'truncated-chunk') return selfTestTruncatedChunk();
    if (name === 'overwrite-mismatch') return selfTestOverwriteMismatch();
    console.error('unknown self-test: ' + name);
    return 1;
  }
  if (args.includes('--check')) return check();
  console.error('usage: node test/capture-manifest.js --check | --self-test <truncated-chunk|overwrite-mismatch>');
  return 1;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv);
  } catch (err) {
    console.error(JSON.stringify({ ok: false, code: err.code || 'E_UNEXPECTED', error: err.message }, null, 2));
    process.exitCode = 1;
  }
}

module.exports = { verifyStore, assertManifestShape, readManifest, sha256, BUILD_DIR, MAIN_URL, MAIN_NAME, EXPECTED_BUILD };
