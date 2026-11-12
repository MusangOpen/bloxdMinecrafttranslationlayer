#!/usr/bin/env node
'use strict';

/*
 * Localhost-only HTTP server for the generated resource pack.
 *
 * Contract:
 *   - The ZIP and manifest are read exactly once when the server is created.
 *   - SHA-1 is computed from those exact bytes; the body is never recompressed.
 *   - UUID and content URL are derived from the pack identity + ZIP SHA-1.
 *   - Only 127.0.0.1 is bound; requests with a non-loopback Host are refused.
 *   - GET/HEAD return application/zip with the exact Content-Length.
 *   - close() is idempotent.
 *
 * Construction validates the pack before any listener exists. Missing pack or
 * manifest, an invalid ZIP signature/EOCD, and size/hash mismatches all fail
 * startup with a PackServerError carrying a stable error code.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');

const { version: BLOXD_VERSION } = require('../protocol/target');

const BIND_HOST = '127.0.0.1';
const CONTENT_TYPE = 'application/zip';
const EXPECTED_PACK_FORMAT = 75;
const DEFAULT_ZIP_PATH = path.join(__dirname, `bloxd-${BLOXD_VERSION}.zip`);
const DEFAULT_MANIFEST_PATH = path.join(__dirname, 'manifest.json');

const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_MAX_COMMENT = 0xffff;

class PackServerError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'PackServerError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new PackServerError(code, message, details);
}

function digest(algorithm, buffer) {
  return crypto.createHash(algorithm).update(buffer).digest('hex');
}

function sha1(buffer) {
  return digest('sha1', buffer);
}

function sha256(buffer) {
  return digest('sha256', buffer);
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function zipCrc32(buffer) {
  let value = 0xffffffff;
  for (let index = 0; index < buffer.length; index++) {
    value = CRC32_TABLE[(value ^ buffer[index]) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function normalizeHost(host) {
  if (host === undefined || host === null) return BIND_HOST;
  if (typeof host !== 'string') {
    fail('E_HOST_NOT_LOOPBACK', 'bind host must be a string');
  }
  const value = host.trim().toLowerCase();
  if (value === BIND_HOST || value === 'localhost' || value === '::1' || value === '[::1]') {
    return BIND_HOST;
  }
  fail('E_HOST_NOT_LOOPBACK', `refusing non-loopback bind host ${JSON.stringify(host)}`);
}

function normalizePort(port) {
  if (port === undefined || port === null) return 0;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    fail('E_PORT_INVALID', `invalid TCP port ${JSON.stringify(port)}`);
  }
  return port;
}

function readManifest(manifestPath) {
  let raw;
  try {
    raw = fs.readFileSync(manifestPath);
  } catch (error) {
    fail('E_MANIFEST_MISSING', `resource pack manifest not found: ${manifestPath}`, {
      cause: error.code
    });
  }
  let manifest;
  try {
    manifest = JSON.parse(raw.toString('utf8'));
  } catch (_error) {
    fail('E_MANIFEST_INVALID', `resource pack manifest is not valid JSON: ${manifestPath}`);
  }
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest) ||
    !manifest.pack ||
    typeof manifest.pack !== 'object'
  ) {
    fail('E_MANIFEST_INVALID', 'resource pack manifest has no pack object');
  }
  return manifest;
}

function readZip(zipPath) {
  let stat;
  try {
    stat = fs.statSync(zipPath);
  } catch (error) {
    fail('E_PACK_MISSING', `resource pack ZIP not found: ${zipPath}`, {
      cause: error.code
    });
  }
  if (!stat.isFile()) {
    fail('E_PACK_MISSING', `resource pack ZIP is not a file: ${zipPath}`);
  }
  let buffer;
  try {
    buffer = fs.readFileSync(zipPath);
  } catch (error) {
    fail('E_PACK_READ', `resource pack ZIP could not be read: ${zipPath}`, {
      cause: error.code
    });
  }
  if (buffer.length === 0) {
    fail('E_PACK_EMPTY', `resource pack ZIP is empty: ${zipPath}`);
  }
  return buffer;
}

function findEndOfCentralDirectory(buffer) {
  if (buffer.length < 22) {
    fail('E_ZIP_TRUNCATED', 'ZIP is shorter than an end-of-central-directory record');
  }
  const minimum = Math.max(0, buffer.length - (22 + ZIP_MAX_COMMENT));
  for (let offset = buffer.length - 22; offset >= minimum; offset--) {
    if (buffer.readUInt32LE(offset) !== ZIP_EOCD_SIGNATURE) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) return offset;
  }
  fail('E_ZIP_EOCD', 'end-of-central-directory record not found');
}

function unsafeEntryPath(name) {
  if (typeof name !== 'string' || name.length === 0) return true;
  if (name.includes('\\')) return true;
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) return true;
  return name.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');
}

function validateZip(buffer, expectedEntries) {
  const signature = buffer.length >= 4 ? buffer.readUInt32LE(0) : -1;
  if (signature !== ZIP_LOCAL_SIGNATURE && signature !== ZIP_EOCD_SIGNATURE) {
    fail('E_ZIP_SIGNATURE', 'invalid ZIP signature');
  }

  const eocd = findEndOfCentralDirectory(buffer);
  const disk = buffer.readUInt16LE(eocd + 4);
  const centralDisk = buffer.readUInt16LE(eocd + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocd + 8);
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);

  if (disk !== 0 || centralDisk !== 0) {
    fail('E_ZIP_CORRUPT', 'multi-disk ZIP is not supported');
  }
  if (entriesOnDisk !== totalEntries) {
    fail('E_ZIP_CORRUPT', 'inconsistent ZIP entry counts');
  }
  if (totalEntries === 0) {
    fail('E_ZIP_CORRUPT', 'ZIP contains no entries');
  }
  if (centralOffset + centralSize > eocd) {
    fail('E_ZIP_CORRUPT', 'central directory exceeds ZIP bounds');
  }
  if (
    expectedEntries !== undefined &&
    expectedEntries !== null &&
    expectedEntries !== totalEntries
  ) {
    fail(
      'E_ZIP_ENTRY_COUNT',
      `ZIP has ${totalEntries} entries, manifest expects ${expectedEntries}`
    );
  }

  const seen = new Set();
  const entries = [];
  let cursor = centralOffset;
  for (let index = 0; index < totalEntries; index++) {
    if (cursor + 46 > eocd) {
      fail('E_ZIP_CORRUPT', `truncated central directory at entry ${index}`);
    }
    if (buffer.readUInt32LE(cursor) !== ZIP_CENTRAL_SIGNATURE) {
      fail('E_ZIP_CORRUPT', `bad central header at entry ${index}`);
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const checksum = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    if (nameStart + nameLength > eocd) {
      fail('E_ZIP_CORRUPT', `central directory name exceeds bounds at entry ${index}`);
    }
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');
    cursor = nameStart + nameLength + extraLength + commentLength;
    if (cursor > eocd) {
      fail('E_ZIP_CORRUPT', `central directory entry ${index} exceeds bounds`);
    }
    if (unsafeEntryPath(name)) {
      fail('E_ZIP_PATH_TRAVERSAL', `unsafe ZIP entry path ${JSON.stringify(name)}`);
    }
    if (seen.has(name)) {
      fail('E_ZIP_CORRUPT', `duplicate ZIP entry ${name}`);
    }
    seen.add(name);
    if (
      localOffset + 30 > buffer.length ||
      buffer.readUInt32LE(localOffset) !== ZIP_LOCAL_SIGNATURE
    ) {
      fail('E_ZIP_CORRUPT', `bad local header for entry ${index}`);
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const localNameStart = localOffset + 30;
    if (localNameStart + localNameLength > buffer.length) {
      fail('E_ZIP_CORRUPT', `truncated local name for entry ${index}`);
    }
    const localName = buffer
      .subarray(localNameStart, localNameStart + localNameLength)
      .toString('utf8');
    if (localName !== name) {
      fail('E_ZIP_CORRUPT', `local/central name mismatch for ${name}`);
    }
    const dataStart = localNameStart + localNameLength + localExtraLength;
    if (dataStart + compressedSize > buffer.length) {
      fail('E_ZIP_CORRUPT', `truncated data for entry ${name}`);
    }
    entries.push({
      name,
      flags,
      method,
      crc32: checksum,
      compressedSize,
      uncompressedSize,
      localOffset,
      dataStart
    });
  }
  if (cursor !== centralOffset + centralSize) {
    fail('E_ZIP_CORRUPT', 'central directory size mismatch');
  }

  return { entries: totalEntries, eocdOffset: eocd, names: entries.map((entry) => entry.name), entryList: entries };
}

function readEntryData(buffer, entry) {
  const compressed = buffer.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) {
    try {
      return zlib.inflateRawSync(compressed);
    } catch (error) {
      fail('E_ZIP_CORRUPT', `entry ${entry.name} cannot be inflated`, {
        cause: error.code
      });
    }
  }
  fail('E_ZIP_CORRUPT', `unsupported ZIP compression method ${entry.method} for ${entry.name}`);
  return null;
}

function validatePackContents(buffer, zipInfo, manifest, pack) {
  const entryByName = new Map(zipInfo.entryList.map((entry) => [entry.name, entry]));

  const packMetaEntry = entryByName.get('pack.mcmeta');
  if (!packMetaEntry) {
    fail('E_PACK_META_MISSING', 'resource pack ZIP has no pack.mcmeta');
  }
  let packMeta;
  try {
    packMeta = JSON.parse(readEntryData(buffer, packMetaEntry).toString('utf8'));
  } catch (error) {
    if (error && error.code && String(error.code).startsWith('E_ZIP_')) throw error;
    fail('E_PACK_META_INVALID', 'pack.mcmeta is not valid JSON');
  }
  if (
    !packMeta ||
    typeof packMeta !== 'object' ||
    !packMeta.pack ||
    typeof packMeta.pack !== 'object' ||
    !Number.isInteger(packMeta.pack.pack_format)
  ) {
    fail('E_PACK_META_INVALID', 'pack.mcmeta has no integer pack.pack_format');
  }
  if (packMeta.pack.pack_format !== EXPECTED_PACK_FORMAT) {
    fail(
      'E_PACK_FORMAT',
      `pack.mcmeta pack_format ${packMeta.pack.pack_format} is not ${EXPECTED_PACK_FORMAT}`
    );
  }
  if (pack.packFormat !== EXPECTED_PACK_FORMAT) {
    fail(
      'E_PACK_FORMAT',
      `manifest packFormat ${pack.packFormat} is not ${EXPECTED_PACK_FORMAT}`
    );
  }

  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    fail('E_MANIFEST_INVALID', 'manifest.files must be a non-empty array');
  }
  const fileEntries = [];
  for (const file of manifest.files) {
    if (!file || typeof file.path !== 'string' || file.path.length === 0) {
      fail('E_PACK_FILE_META_MISSING', 'manifest.files contains an entry without a path');
    }
    if (!Number.isSafeInteger(file.size) || file.size < 0) {
      fail('E_PACK_FILE_META_MISSING', `manifest file size is missing or invalid: ${file.path}`);
    }
    if (
      !Number.isSafeInteger(file.crc32) ||
      file.crc32 < 0 ||
      file.crc32 > 0xffffffff
    ) {
      fail('E_PACK_FILE_META_MISSING', `manifest file CRC32 is missing or invalid: ${file.path}`);
    }
    const entry = entryByName.get(file.path);
    if (!entry) {
      fail('E_PACK_FILE_MISSING', `manifest file is not in the ZIP: ${file.path}`);
    }
    fileEntries.push({ file, entry });
  }
  // Recompute size and CRC32 from the actual decompressed bytes. The central
  // directory is not trusted as the integrity oracle.
  for (const { file, entry } of fileEntries) {
    const data = readEntryData(buffer, entry);
    if (data.length !== file.size) {
      fail(
        'E_PACK_FILE_SIZE',
        `manifest size ${file.size} does not match ${data.length} actual bytes for ${file.path}`
      );
    }
    const actualCrc = zipCrc32(data);
    if ((file.crc32 >>> 0) !== actualCrc) {
      fail(
        'E_PACK_FILE_CRC',
        `manifest CRC32 ${file.crc32 >>> 0} does not match ${actualCrc} actual CRC for ${file.path}`
      );
    }
  }

  if (!Array.isArray(manifest.items) || manifest.items.length === 0) {
    fail('E_PACK_ITEMS_MISSING', 'manifest.items must be a non-empty array');
  }
  for (const item of manifest.items) {
    if (!item || typeof item !== 'object') {
      fail('E_MANIFEST_INVALID', 'manifest.items contains a non-object entry');
    }
    for (const field of ['itemModelPath', 'modelFilePath']) {
      if (typeof item[field] !== 'string' || !entryByName.has(item[field])) {
        fail(
          'E_PACK_MODEL_MISSING',
          `manifest item ${item.bloxdId ?? '?'} model is not in the ZIP: ${item[field]}`
        );
      }
    }
    if (typeof item.texturePath !== 'string' || !entryByName.has(item.texturePath)) {
      fail(
        'E_PACK_TEXTURE_MISSING',
        `manifest item ${item.bloxdId ?? '?'} texture is not in the ZIP: ${item.texturePath}`
      );
    }
  }
}

function manifestPack(manifest) {
  const pack = manifest.pack;
  const id =
    typeof pack.id === 'string' && pack.id.trim().length > 0
      ? pack.id.trim()
      : typeof pack.name === 'string'
        ? pack.name.trim()
        : '';
  if (id.length === 0) {
    fail('E_MANIFEST_INVALID', 'manifest pack.id is missing');
  }
  const zipSha256 =
    typeof pack.zipSha256 === 'string' ? pack.zipSha256.toLowerCase() : null;
  if (!zipSha256 || !/^[0-9a-f]{64}$/.test(zipSha256)) {
    fail('E_MANIFEST_INVALID', 'manifest pack.zipSha256 is not a SHA-256 hex digest');
  }
  if (!Number.isSafeInteger(pack.zipSize) || pack.zipSize < 0) {
    fail('E_MANIFEST_INVALID', 'manifest pack.zipSize is not a non-negative integer');
  }
  if (
    pack.zipEntries !== undefined &&
    (!Number.isSafeInteger(pack.zipEntries) || pack.zipEntries < 0)
  ) {
    fail('E_MANIFEST_INVALID', 'manifest pack.zipEntries is not a non-negative integer');
  }
  return {
    id,
    build: typeof pack.build === 'string' ? pack.build : '',
    buildVersion: typeof pack.buildVersion === 'string' ? pack.buildVersion : '',
    packFormat: Number.isInteger(pack.packFormat) ? pack.packFormat : null,
    zipSha256,
    zipSize: pack.zipSize,
    zipEntries: pack.zipEntries
  };
}

// RFC 4122 version-5-shaped UUID. The input is SHA-1 already, so a second
// SHA-1 is used only to mix the identity string; the version/variant bits are
// set explicitly so the result is a valid UUID while remaining deterministic.
function deriveUuid(canonical) {
  const bytes = crypto.createHash('sha1').update(canonical).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20, 32)}`
  );
}

function derivePackIdentity(manifest, sha1Hex, sha256Hex, size, entries) {
  const pack = manifestPack(manifest);
  const canonical = [
    'bloxd-resource-pack-v1',
    pack.id,
    pack.build,
    pack.buildVersion,
    pack.packFormat === null ? '' : String(pack.packFormat),
    String(size),
    sha1Hex
  ].join('|');
  const uuid = deriveUuid(canonical);
  const safeId = pack.id.replace(/[^A-Za-z0-9._-]+/g, '_');
  const contentPath = `/packs/${safeId}/${sha1Hex}.zip`;

  return Object.freeze({
    packId: pack.id,
    build: pack.build,
    buildVersion: pack.buildVersion,
    packFormat: pack.packFormat,
    sha1: sha1Hex,
    sha256: sha256Hex,
    size,
    entries,
    uuid,
    path: contentPath,
    url: contentPath,
    contentType: CONTENT_TYPE
  });
}

function isLoopbackHostHeader(hostHeader) {
  if (typeof hostHeader !== 'string' || hostHeader.length === 0) return false;
  const value = hostHeader.trim().toLowerCase();
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    if (end === -1) return false;
    return value.slice(1, end) === '::1';
  }
  const hostname = value.split(':')[0];
  return hostname === BIND_HOST || hostname === 'localhost';
}

function writeText(response, statusCode, text, extraHeaders) {
  const body = Buffer.from(text, 'utf8');
  response.writeHead(
    statusCode,
    Object.assign(
      {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': String(body.length),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      },
      extraHeaders || {}
    )
  );
  response.end(body);
}

function handleRequest(request, response, identity, responseBytes) {
  try {
    if (!isLoopbackHostHeader(request.headers.host)) {
      writeText(response, 403, 'forbidden host\n');
      return;
    }

    let pathname;
    try {
      pathname = new URL(request.url, `http://${BIND_HOST}`).pathname;
    } catch (_error) {
      writeText(response, 400, 'bad request\n');
      return;
    }

    if (pathname !== identity.path) {
      writeText(response, 404, 'not found\n');
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      writeText(response, 405, 'method not allowed\n', { Allow: 'GET, HEAD' });
      return;
    }

    response.writeHead(200, {
      'Content-Type': CONTENT_TYPE,
      'Content-Length': String(responseBytes.length),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    if (request.method === 'HEAD') response.end();
    else response.end(responseBytes);
  } catch (_error) {
    if (response.headersSent) response.destroy();
    else writeText(response, 500, 'internal server error\n');
  }
}

// Test-only fault injection. Production callers never set faults, so the
// served body is always the exact buffer whose SHA-1 was published.
function applyServeFault(zipBytes, faults) {
  if (!faults || !faults.wrongBytes) return zipBytes;
  const copy = Buffer.from(zipBytes);
  const offset = copy.length >> 1;
  copy[offset] = copy[offset] ^ 0xff;
  return copy;
}

function createResourcePackServer(options = {}) {
  const settings = options && typeof options === 'object' ? options : {};
  const bindHost = normalizeHost(settings.host);
  const requestedPort = normalizePort(settings.port);
  const zipPath = path.resolve(settings.zipPath || DEFAULT_ZIP_PATH);
  const manifestPath = path.resolve(settings.manifestPath || DEFAULT_MANIFEST_PATH);

  const manifest = readManifest(manifestPath);
  const zipBytes = readZip(zipPath);
  const pack = manifestPack(manifest);
  const zipInfo = validateZip(zipBytes, pack.zipEntries);
  const actualSha1 = sha1(zipBytes);
  const actualSha256 = sha256(zipBytes);

  if (pack.zipSize !== zipBytes.length) {
    fail(
      'E_PACK_SIZE_MISMATCH',
      `manifest zipSize ${pack.zipSize} does not match ZIP size ${zipBytes.length}`
    );
  }
  if (pack.zipSha256 !== actualSha256) {
    fail(
      'E_PACK_HASH_MISMATCH',
      `manifest zipSha256 ${pack.zipSha256} does not match ZIP sha256 ${actualSha256}`
    );
  }
  if (
    settings.expectedSha256 !== undefined &&
    String(settings.expectedSha256).toLowerCase() !== actualSha256
  ) {
    fail('E_PACK_HASH_MISMATCH', 'ZIP sha256 does not match the expected sha256');
  }
  if (
    settings.expectedSha1 !== undefined &&
    String(settings.expectedSha1).toLowerCase() !== actualSha1
  ) {
    fail('E_PACK_HASH_MISMATCH', 'ZIP sha1 does not match the expected sha1');
  }

  validatePackContents(zipBytes, zipInfo, manifest, pack);

  const identity = derivePackIdentity(
    manifest,
    actualSha1,
    actualSha256,
    zipBytes.length,
    zipInfo.entries
  );
  const responseBytes = applyServeFault(zipBytes, settings.faults);

  let state = 'created';
  let listeningPort = null;
  let listenPromise = null;
  let closePromise = null;
  let closeRequested = false;
  let resolveClose = null;
  let resolveReady;
  let rejectReady;
  const readyPromise = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  // Avoid an unhandled rejection when a caller creates but never awaits
  // readiness and then closes before listening.
  readyPromise.catch(() => {});

  const httpServer = http.createServer((request, response) => {
    handleRequest(request, response, identity, responseBytes);
  });

  function currentUrl() {
    return listeningPort === null
      ? identity.path
      : `http://${BIND_HOST}:${listeningPort}${identity.path}`;
  }

  function finishClosed() {
    listeningPort = null;
    state = 'closed';
  }

  function listen() {
    if (state === 'closed') {
      return Promise.reject(
        new PackServerError('E_SERVER_CLOSED', 'resource pack server is closed')
      );
    }
    if (listenPromise) return listenPromise;

    // Mark the pending bind synchronously so close() can cancel it before the
    // asynchronous listen callback runs.
    state = 'starting';
    listenPromise = new Promise((resolve, reject) => {
      const onError = (error) => {
        httpServer.removeListener('error', onError);
        if (closeRequested) {
          finishClosed();
          const closedError = new PackServerError(
            'E_SERVER_CLOSED',
            'resource pack server closed while starting'
          );
          rejectReady(closedError);
          reject(closedError);
          if (resolveClose) resolveClose();
          return;
        }
        state = 'failed';
        rejectReady(error);
        reject(error);
      };
      httpServer.once('error', onError);
      try {
        httpServer.listen({ host: BIND_HOST, port: requestedPort, exclusive: true }, () => {
          httpServer.removeListener('error', onError);
          if (closeRequested) {
            // close() ran while the bind was pending. The socket may already
            // be listening, so close it before reporting the cancellation.
            httpServer.close(() => {
              finishClosed();
              const closedError = new PackServerError(
                'E_SERVER_CLOSED',
                'resource pack server closed while starting'
              );
              rejectReady(closedError);
              reject(closedError);
              if (resolveClose) resolveClose();
            });
            return;
          }
          const address = httpServer.address();
          if (
            !address ||
            address.address !== BIND_HOST ||
            typeof address.port !== 'number'
          ) {
            const error = new PackServerError(
              'E_BIND_HOST_MISMATCH',
              `expected to bind ${BIND_HOST}, got ${address && address.address}`
            );
            state = 'failed';
            httpServer.close(() => {});
            rejectReady(error);
            reject(error);
            return;
          }
          listeningPort = address.port;
          state = 'listening';
          resolveReady(api);
          resolve(api);
        });
      } catch (error) {
        onError(error);
      }
    });
    return listenPromise;
  }

  function close() {
    if (closePromise) return closePromise;
    closePromise = new Promise((resolve, reject) => {
      if (state === 'closed') {
        resolve();
        return;
      }
      if (state === 'created') {
        finishClosed();
        rejectReady(
          new PackServerError('E_SERVER_CLOSED', 'resource pack server closed before listening')
        );
        resolve();
        return;
      }
      if (state === 'starting') {
        // The listen callback owns the socket. It will close it, reject
        // listen()/whenReady() with E_SERVER_CLOSED and then resolve here.
        closeRequested = true;
        resolveClose = resolve;
        return;
      }
      const finish = (error) => {
        finishClosed();
        if (error) reject(error);
        else resolve();
      };
      if (!httpServer.listening) {
        finish();
        return;
      }
      httpServer.close((error) => {
        if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') finish(error);
        else finish();
      });
      if (typeof httpServer.closeAllConnections === 'function') {
        httpServer.closeAllConnections();
      }
    });
    return closePromise;
  }

  const api = {
    host: bindHost,
    zipPath,
    manifestPath,
    contentType: CONTENT_TYPE,
    uuid: identity.uuid,
    sha1: identity.sha1,
    sha256: identity.sha256,
    size: identity.size,
    entries: identity.entries,
    packFormat: identity.packFormat,
    packId: identity.packId,
    build: identity.build,
    buildVersion: identity.buildVersion,
    identity,
    pack: identity,
    get state() {
      return state;
    },
    get ready() {
      return state === 'listening';
    },
    get listening() {
      return state === 'listening';
    },
    get port() {
      return listeningPort;
    },
    get origin() {
      return listeningPort === null ? null : `http://${BIND_HOST}:${listeningPort}`;
    },
    get url() {
      return currentUrl();
    },
    get endpoint() {
      return currentUrl();
    },
    get contentUrl() {
      return identity.path;
    },
    get identityUrl() {
      return identity.path;
    },
    address() {
      return httpServer.address();
    },
    whenReady() {
      return readyPromise;
    },
    getZipBytes() {
      return Buffer.from(zipBytes);
    },
    listen,
    close,
    httpServer
  };

  return api;
}

async function startResourcePackServer(options = {}) {
  const server = createResourcePackServer(options);
  await server.listen();
  return server;
}

module.exports = {
  BIND_HOST,
  CONTENT_TYPE,
  EXPECTED_PACK_FORMAT,
  DEFAULT_ZIP_PATH,
  DEFAULT_MANIFEST_PATH,
  PackServerError,
  createResourcePackServer,
  startResourcePackServer,
  createPackServer: createResourcePackServer,
  startPackServer: startResourcePackServer,
  derivePackIdentity,
  validateZip,
  validatePackContents
};
