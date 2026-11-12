#!/usr/bin/env node
'use strict';

/*
 * Deterministic Minecraft Java 1.21.11 (pack_format 75) resource pack
 * generator for the current Bloxd build 854.
 *
 * Inputs are the build-scoped evidence only:
 *   - .research/itj4su-853-audit/generated/assets.json
 *   - bloxd/types/registry-853.json
 *   - .research/builds/itj4su-ee8a864d/main.js and its pinned PNG chunks
 *
 * Real PNG bytes are decoded from the pinned 854 chunk PNG modules. A required
 * texture name that is absent from those chunks is a hard build failure
 * instead of a silent fallback; only `caught_*` names may use the explicit
 * missing-evidence placeholder. No 840 or vanilla image data is used.
 *
 * The ZIP is written with Node built-ins only: sorted entry paths, fixed DOS
 * timestamps, fixed Unix permissions, and deterministic deflate settings.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..', '..');
const TARGET = require(path.join(__dirname, '..', 'protocol', 'target.js'));
const DEFAULT_OUT = __dirname;
const BUILD_DIR = path.join(ROOT, '.research', 'builds', '7rp1w-57cd8edd');
const CHUNK_DIR = path.join(BUILD_DIR, 'chunks');
const ASSETS_PATH = path.join(ROOT, '.research', '7rp1w-audit', 'generated', 'assets.json');
const REGISTRY_PATH = path.join(ROOT, 'bloxd', 'types', 'registry-856.json');
const MAIN_PATH = path.join(BUILD_DIR, 'main.js');
const MAPPING_CHUNK_RELATIVE = 'chunks/7rp1w.76.e7006091.chunk.js';

const CHUNK_SOURCES = Object.freeze([
  {
    path: path.join(CHUNK_DIR, '7rp1w.162.00166941.chunk.js'),
    relative: 'chunks/7rp1w.162.00166941.chunk.js',
    sha256: '8d5dce106fb885e91c0958f008c24f4a308f7f1f626ce7a7c4e5112b072d3c70'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.166.59cf3057.chunk.js'),
    relative: 'chunks/7rp1w.166.59cf3057.chunk.js',
    sha256: 'b628810733d98993bdf29e63e1fe55c79e3a980cc05e116fad37867ddfc1c5b5'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.170.648ded14.chunk.js'),
    relative: 'chunks/7rp1w.170.648ded14.chunk.js',
    sha256: 'b5f04d18297c9afc8ac87d97cf906dd47ace731f305a28fecd66aa05f663ec39'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.228.87cafaf3.chunk.js'),
    relative: 'chunks/7rp1w.228.87cafaf3.chunk.js',
    sha256: '42633318fae32cd62d13a7daadc09826b270ad102ee011563dba9dacedfb755d'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.229.4fe58dd1.chunk.js'),
    relative: 'chunks/7rp1w.229.4fe58dd1.chunk.js',
    sha256: '396b93809483162bdf197042a8b0b85f1b5d8a6be9f41e472d01528a8e91be4a'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.230.c4a3c304.chunk.js'),
    relative: 'chunks/7rp1w.230.c4a3c304.chunk.js',
    sha256: 'cc75fde0135be2914f139fcb442fecdd5ddf3f49faa4de8d8d3cfb3ab600c0b6'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.231.ecf411f7.chunk.js'),
    relative: 'chunks/7rp1w.231.ecf411f7.chunk.js',
    sha256: 'fc73bf59397f5ec169155d0e77fc35dbce1afc5524a1fd9c62a1bb4d068661b5'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.232.b64905ea.chunk.js'),
    relative: 'chunks/7rp1w.232.b64905ea.chunk.js',
    sha256: '55d642d6f6396d54aad80d059d4b77bd8a82e1a77e2eb3ff8e9864e85563bd70'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.233.33e74427.chunk.js'),
    relative: 'chunks/7rp1w.233.33e74427.chunk.js',
    sha256: '8df4d70147a00e23851bdee9026c35417030932510fde8c7e1cf9429194251be'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.234.bb5cfcb6.chunk.js'),
    relative: 'chunks/7rp1w.234.bb5cfcb6.chunk.js',
    sha256: '56e5caba11ced71b247a1f9be840410ed6a21682911feb21dc013fc69bdf6ecb'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.235.475a9347.chunk.js'),
    relative: 'chunks/7rp1w.235.475a9347.chunk.js',
    sha256: 'c58e82f9d6b266757844f7965b7978554d7bbc835e302ea65e53d7a8b342b5fc'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.236.79a6d55d.chunk.js'),
    relative: 'chunks/7rp1w.236.79a6d55d.chunk.js',
    sha256: 'bb21793d927cff5c35457b0de1467649ced196ddb62dc863faaaa0a3035fc4fc'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.237.cae7fc9c.chunk.js'),
    relative: 'chunks/7rp1w.237.cae7fc9c.chunk.js',
    sha256: 'f6b5d76db2959ccea10487122b0d180fbb99a1a321b5c04247628feac827083d'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.238.a7718dd9.chunk.js'),
    relative: 'chunks/7rp1w.238.a7718dd9.chunk.js',
    sha256: '81f97a35ef323839633420541177899af2adf0fce7269d486b2d3b6d436c2349'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.239.b1a3f758.chunk.js'),
    relative: 'chunks/7rp1w.239.b1a3f758.chunk.js',
    sha256: 'c6cf70f1b58c79406f913e8ee14ad104cb33451bba7db142530f1e64bfc03d42'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.240.51def966.chunk.js'),
    relative: 'chunks/7rp1w.240.51def966.chunk.js',
    sha256: 'eb77dd6255c2099edf348794180d14d6bb0e2b3349ef3e642b8109e786402286'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.241.7b91946f.chunk.js'),
    relative: 'chunks/7rp1w.241.7b91946f.chunk.js',
    sha256: 'c453abcdacba215377557644499cdd6df34e2f278164c0632f8bb37c92e528d4'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.242.55c9ac61.chunk.js'),
    relative: 'chunks/7rp1w.242.55c9ac61.chunk.js',
    sha256: '4d17b0f1eb39e6c4c3d121e3011a69d9986c1e3d87ecae74a5113fcf8ac517b6'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.243.e97165b0.chunk.js'),
    relative: 'chunks/7rp1w.243.e97165b0.chunk.js',
    sha256: '772c49202936a0b57e29c59871acb80dffc08e778d81f63315aa950a1e565b83'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.260.054a667f.chunk.js'),
    relative: 'chunks/7rp1w.260.054a667f.chunk.js',
    sha256: '3b008712c555e22fb52fa1643635b5b585473f1ebd544fd121c393e35f552229'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.65.c9a1a724.chunk.js'),
    relative: 'chunks/7rp1w.65.c9a1a724.chunk.js',
    sha256: '9b044a2a377dbe74d0b17017d88bb704feef34b9d17f6290394dedab6c3e8865'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.71.b09f340d.chunk.js'),
    relative: 'chunks/7rp1w.71.b09f340d.chunk.js',
    sha256: 'c4a7c496927d9ce94701e3527c87fed680326b03b91f5ba2eaeb65f62645f327'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.75.0d26ecd1.chunk.js'),
    relative: 'chunks/7rp1w.75.0d26ecd1.chunk.js',
    sha256: 'e5bd6c4e1550a6fd0eb19986238365fc3f347448d32b47537169fe30ee68dbac'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.76.e7006091.chunk.js'),
    relative: 'chunks/7rp1w.76.e7006091.chunk.js',
    sha256: 'd0c0aa8de2f9253c23e7f1f09031163580e264339addd79924659ceca4831302'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.77.ad1d9852.chunk.js'),
    relative: 'chunks/7rp1w.77.ad1d9852.chunk.js',
    sha256: 'b4161c48a16f58fddda3ded4027be8f1a3cb2e7defab03b59766d6f5d006a57c'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.80.90f773cb.chunk.js'),
    relative: 'chunks/7rp1w.80.90f773cb.chunk.js',
    sha256: 'd6f93558b860bacbe9134e4e2877d1443b8f5446fab5d08215145137d8f5657e'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.91.ce0ed282.chunk.js'),
    relative: 'chunks/7rp1w.91.ce0ed282.chunk.js',
    sha256: 'c171cb09768cf6394da80e39646fdebe7d3a8a3c202fc1e0cc53ff0b640e3fec'
  },
  {
    path: path.join(CHUNK_DIR, '7rp1w.wasmPlay.697232d4.chunk.js'),
    relative: 'chunks/7rp1w.wasmPlay.697232d4.chunk.js',
    sha256: '204db436e8da33e64bd3e3661b98932101b0067afdab0786e6bc8058ef87a74f'
  }
]);

const PACK_FORMAT = 75;
const NAMESPACE = 'bloxd';
const PACK_NAME = 'bloxd-856';
const ZIP_NAME = `${PACK_NAME}.zip`;
const REAL_TEXTURE_SOURCE = 'pinned-856-chunk-base64';
const PLACEHOLDER_TEXTURE_SOURCE = 'missing-evidence-placeholder';
const PLACEHOLDER_ALLOWED_PREFIX = 'caught_';
// Explicit 853 exceptions: the mapping block names these module ids but the
// pinned build ships no PNG module for them. Anything else stays a hard fail.
const MISSING_EVIDENCE_TEXTURES = Object.freeze({
  brown_paint_bow_charging_3: 'mapping module 14000 has no PNG module in the pinned 854 build',
  explosive_paint_sticky_black: 'mapping module 16000 has no PNG module in the pinned 854 build',
  sanguine_bow: 'mapping module 20000 has no PNG module in the pinned 854 build',
  diorite_brick: 'mapping module 8000 has no PNG module in the pinned 854 build',
  heatwarp_flounder: 'mapping module 17000 has no PNG module in the pinned 854 build',
  pine_item_pedestal: 'mapping module 19000 has no PNG module in the pinned 854 build'
});
function allowsPlaceholder(name) {
  return name.startsWith(PLACEHOLDER_ALLOWED_PREFIX) || Object.prototype.hasOwnProperty.call(MISSING_EVIDENCE_TEXTURES, name);
}
const PLACEHOLDER_SIZE = 16;

const EXPECTED = Object.freeze({
  build: '7rp1w',
  buildVersion: '57cd8edd',
  bloxdVersion: TARGET.version,
  sourceMainSha256: TARGET.mainBundle.sha256
});

// The 853 capture of generated/assets.json retained the previous build label.
// It is accepted only when sourceMainSha256 matches the pinned 854 main bundle.
const STALE_ASSET_BUILD_LABELS = Object.freeze({
  tcwczu: TARGET.mainBundle.sha256
});

const EXPECTED_ASSETS_SHA256 =
  '8d59114a0d85beea556e7d7e224f80f3c4ed7afc34e454b079974a39d13d6df8';
const EXPECTED_REGISTRY_SHA256 =
  'e152ad3d223f83deacb9bc28b19034da1fe470829f951c5c200a26036a000f10';

const LEGACY_COLORS = Object.freeze({
  '0': 'black',
  '1': 'dark_blue',
  '2': 'dark_green',
  '3': 'dark_aqua',
  '4': 'dark_red',
  '5': 'dark_purple',
  '6': 'gold',
  '7': 'gray',
  '8': 'dark_gray',
  '9': 'blue',
  a: 'green',
  b: 'aqua',
  c: 'red',
  d: 'light_purple',
  e: 'yellow',
  f: 'white'
});

const LEGACY_FLAGS = Object.freeze({
  k: 'obfuscated',
  l: 'bold',
  m: 'strikethrough',
  n: 'underlined',
  o: 'italic'
});

class PackError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.name = 'PackError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, message, detail) {
  throw new PackError(code, message, detail);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function relativePath(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function verifyPinnedFile(file, expectedSha256, label) {
  if (!file || !fs.existsSync(file)) return;
  const actual = sha256(fs.readFileSync(file));
  if (actual !== expectedSha256) {
    fail('E_STALE_ASSET', `${label} hash does not match the pinned 854 evidence`, {
      expected: expectedSha256,
      actual
    });
  }
}

const CRC_TABLE = (() => {
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

function crc32(buffer) {
  let value = 0xffffffff;
  for (let index = 0; index < buffer.length; index++) {
    value = CRC_TABLE[(value ^ buffer[index]) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodePng(width, height, pixels) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const color = pixels(x, y);
      const offset = row + 1 + x * 4;
      raw[offset] = color[0];
      raw[offset + 1] = color[1];
      raw[offset + 2] = color[2];
      raw[offset + 3] = color[3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

/*
 * An explicit, deliberately synthetic placeholder. It is used only for a
 * missing-evidence `caught_*` texture whose current-854 chunk has no PNG
 * module. It is never presented as a real Bloxd texture and is not derived
 * from the texture name.
 */
const MISSING_EVIDENCE_PNG = encodePng(PLACEHOLDER_SIZE, PLACEHOLDER_SIZE, (x, y) => {
  const checker = ((x >> 2) + (y >> 2)) % 2 === 0;
  return checker ? [255, 0, 255, 255] : [32, 32, 32, 255];
});
const MISSING_EVIDENCE_SHA256 = sha256(MISSING_EVIDENCE_PNG);

function pngInfo(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33) {
    fail('E_TEXTURE_PNG', 'texture bytes are too short to be a PNG');
  }
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, 8).equals(signature)) {
    fail('E_TEXTURE_PNG', 'texture bytes do not start with the PNG signature');
  }
  if (buffer.readUInt32BE(8) !== 13 || buffer.subarray(12, 16).toString('ascii') !== 'IHDR') {
    fail('E_TEXTURE_PNG', 'texture PNG does not start with an IHDR chunk');
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

/*
 * Pinned current-854 chunks embed every real texture as a Webpack module of the
 * form `id:name=>{name.exports="data:image/png;base64,..."}`. The mapping
 * modules in the chunk-22 mapping chunk map relative PNG paths to module ids.
 * Module ids are shared across chunks: a mapped texture can live in another
 * pinned chunk, and the same id can appear in several chunks with identical
 * bytes. Identical duplicates are deduplicated; the same id with different
 * bytes is a hard evidence conflict.
 */
const PNG_MODULE_RE =
  /(?:^|[,{])(\d+):(?:\([^)]*\)|[A-Za-z_$][\w$]*)=>\{\s*(?:[A-Za-z_$][\w$]*\.)?exports="data:image\/png;base64,([^"]+)"/g;

function parsePngModules(source) {
  const modules = new Map();
  let match;
  PNG_MODULE_RE.lastIndex = 0;
  while ((match = PNG_MODULE_RE.exec(source)) !== null) {
    const bytes = Buffer.from(match[2], 'base64');
    const info = pngInfo(bytes);
    modules.set(Number(match[1]), {
      bytes,
      sha256: sha256(bytes),
      width: info.width,
      height: info.height
    });
  }
  return modules;
}

function parsePngMappingBlocks(source) {
  const blocks = [];
  const blockRe = /var [A-Za-z_$][\w$]*=\{([^{}]*)\};function/g;
  let match;
  while ((match = blockRe.exec(source)) !== null) {
    const nameMap = new Map();
    // Required: 853 emits exponent numeric literals (8e3 = 8000) for three module ids.
    const pairRe = /"\.\/([^"]+\.png)":(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
    let pair;
    while ((pair = pairRe.exec(match[1])) !== null) {
      // JavaScript object literals keep the last value for a duplicate key.
      nameMap.set(pair[1].replace(/\.png$/, ''), Number(pair[2]));
    }
    if (nameMap.size > 0) blocks.push(nameMap);
  }
  return blocks;
}

function loadChunkTextures() {
  const modules = new Map();
  const duplicateModules = [];
  const chunkHashes = [];
  let mappingSource = null;

  for (const chunk of CHUNK_SOURCES) {
    const raw = fs.readFileSync(chunk.path);
    const actual = sha256(raw);
    if (actual !== chunk.sha256) {
      fail('E_STALE_ASSET', `pinned chunk hash mismatch for ${chunk.relative}`, {
        expected: chunk.sha256,
        actual
      });
    }
    chunkHashes.push({ path: chunk.relative, sha256: actual });
    const text = raw.toString('utf8');
    if (chunk.relative === MAPPING_CHUNK_RELATIVE) mappingSource = text;
    const map = parsePngModules(text);
    for (const [moduleId, value] of map) {
      const previous = modules.get(moduleId);
      if (!previous) {
        modules.set(moduleId, Object.assign({}, value, { chunks: [chunk.relative] }));
        continue;
      }
      if (previous.sha256 !== value.sha256) {
        fail(
          'E_EVIDENCE_CONFLICT',
          `PNG module id ${moduleId} has different bytes in ${previous.chunks.join(', ')} and ${chunk.relative}`
        );
      }
      previous.chunks.push(chunk.relative);
      const duplicate = duplicateModules.find((entry) => entry.moduleId === moduleId);
      if (duplicate) {
        duplicate.chunks.push(chunk.relative);
      } else {
        duplicateModules.push({
          moduleId,
          sha256: value.sha256,
          chunks: previous.chunks.slice()
        });
      }
    }
  }

  if (!mappingSource) {
    fail('E_EVIDENCE', `PNG mapping chunk ${MAPPING_CHUNK_RELATIVE} was not loaded`);
  }
  const mappingBlocks = parsePngMappingBlocks(mappingSource);
  const preferredMap = mappingBlocks.find((block) => block.has('wooden_pickaxe'));
  if (!preferredMap) {
    fail('E_EVIDENCE', `${MAPPING_CHUNK_RELATIVE} item-texture PNG mapping block was not found`);
  }

  // Item icons take priority over block textures for names present in both.
  const nameMap = new Map(preferredMap);
  for (const block of mappingBlocks) {
    if (block === preferredMap) continue;
    for (const [name, moduleId] of block) {
      if (!nameMap.has(name)) nameMap.set(name, moduleId);
    }
  }

  const byName = new Map();
  const unresolved = [];
  for (const [name, moduleId] of nameMap) {
    const module = modules.get(moduleId);
    if (!module) {
      unresolved.push({ name, moduleId });
      continue;
    }
    const sourceChunk = module.chunks.includes(MAPPING_CHUNK_RELATIVE)
      ? MAPPING_CHUNK_RELATIVE
      : module.chunks[0];
    byName.set(name, {
      textureName: name,
      bytes: module.bytes,
      sha256: module.sha256,
      width: module.width,
      height: module.height,
      textureSource: REAL_TEXTURE_SOURCE,
      sourceChunk,
      sourceModule: moduleId,
      sourcePath: `./${name}.png`,
      missingEvidence: false
    });
  }

  return {
    byName,
    modules,
    nameMap,
    unresolved,
    chunkHashes,
    moduleCount: modules.size,
    mappingCount: nameMap.size,
    mappingBlocks: mappingBlocks.length,
    preferredMappingCount: preferredMap.size,
    duplicateModules
  };
}

function slugify(value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '');
  return slug || 'unnamed';
}

/*
 * Converts legacy section-sign styling to a real JSON text component. Unknown
 * formatting codes are a hard failure so a raw section sign can never survive
 * into a component that a client expects to be structured.
 */
function parseLegacyComponent(raw) {
  if (typeof raw !== 'string') {
    fail('E_INVALID_NAME', 'legacy name must be a string', { raw });
  }

  const parts = [];
  const codes = [];
  const style = {};
  let text = '';

  function flush() {
    if (text.length > 0) {
      parts.push(Object.assign({ text }, style));
      text = '';
    }
  }

  let index = 0;
  while (index < raw.length) {
    const character = raw[index];
    if (character !== '\u00a7') {
      text += character;
      index++;
      continue;
    }

    if (index + 1 >= raw.length) {
      fail('E_LEGACY_STYLE_INVALID', 'legacy formatting code has no code character', { raw });
    }

    const code = raw[index + 1].toLowerCase();
    const isColor = Object.prototype.hasOwnProperty.call(LEGACY_COLORS, code);
    const isFlag = Object.prototype.hasOwnProperty.call(LEGACY_FLAGS, code);
    if (!isColor && !isFlag && code !== 'r') {
      fail('E_LEGACY_STYLE_INVALID', `unsupported legacy formatting code §${code}`, { raw, code });
    }

    flush();
    codes.push(code);
    if (code === 'r') {
      for (const key of Object.keys(style)) delete style[key];
    } else if (isColor) {
      // Legacy colour codes reset all active formatting, then set the colour.
      for (const key of Object.keys(style)) delete style[key];
      style.color = LEGACY_COLORS[code];
    } else {
      style[LEGACY_FLAGS[code]] = true;
    }
    index += 2;
  }
  flush();

  let component;
  if (parts.length === 0) {
    component = { text: '' };
  } else if (parts.length === 1) {
    component = parts[0];
  } else {
    component = { text: '', extra: parts };
  }

  if (JSON.stringify(component).includes('\u00a7')) {
    fail('E_RAW_SECTION_SIGN', 'legacy component still contains a raw section sign', { raw });
  }
  return { component, codes };
}

function validateSource(evidence, registry, verifyMainFile) {
  if (!evidence || typeof evidence !== 'object') {
    fail('E_EVIDENCE', 'asset evidence is missing');
  }
  if (!registry || typeof registry !== 'object') {
    fail('E_EVIDENCE', 'registry evidence is missing');
  }
  const staleAssetBuild = Object.prototype.hasOwnProperty.call(
    STALE_ASSET_BUILD_LABELS,
    evidence.build
  );
  if (
    evidence.build !== EXPECTED.build &&
    !(staleAssetBuild && evidence.sourceMainSha256 === EXPECTED.sourceMainSha256)
  ) {
    fail('E_STALE_ASSET', `expected build ${EXPECTED.build}, got ${evidence.build}`, {
      expected: EXPECTED.build,
      actual: evidence.build
    });
  }
  if (
    evidence.buildVersion !== undefined &&
    evidence.buildVersion !== EXPECTED.buildVersion
  ) {
    fail('E_STALE_ASSET', `expected build version ${EXPECTED.buildVersion}, got ${evidence.buildVersion}`);
  }
  if (evidence.bloxdVersion !== undefined && evidence.bloxdVersion !== EXPECTED.bloxdVersion) {
    fail('E_STALE_ASSET', `expected Bloxd ${EXPECTED.bloxdVersion}, got ${evidence.bloxdVersion}`, {
      actual: evidence.bloxdVersion
    });
  }
  if (evidence.sourceMainSha256 !== EXPECTED.sourceMainSha256) {
    fail('E_STALE_ASSET', 'asset evidence main.js hash does not match build 854 evidence');
  }
  if (registry.build !== EXPECTED.build) {
    fail('E_STALE_ASSET', `registry build ${registry.build} is not ${EXPECTED.build}`);
  }
  if (registry.buildVersion !== EXPECTED.buildVersion) {
    fail('E_STALE_ASSET', `registry build version ${registry.buildVersion} is not ${EXPECTED.buildVersion}`);
  }
  if (registry.sourceMainSha256 !== EXPECTED.sourceMainSha256) {
    fail('E_STALE_ASSET', 'registry main.js hash does not match asset evidence');
  }
  if (
    registry.bloxdVersion !== undefined &&
    registry.bloxdVersion !== EXPECTED.bloxdVersion
  ) {
    fail('E_STALE_ASSET', `registry Bloxd version ${registry.bloxdVersion} is not ${EXPECTED.bloxdVersion}`);
  }
  if (!Array.isArray(evidence.references)) {
    fail('E_EVIDENCE', 'asset evidence references must be an array');
  }
  if (!registry.items || typeof registry.items !== 'object' || !registry.items.numericIdView) {
    fail('E_EVIDENCE', 'registry items.numericIdView is missing');
  }

  if (verifyMainFile) {
    if (!fs.existsSync(MAIN_PATH)) {
      fail('E_STALE_ASSET', `current build main.js is missing: ${relativePath(MAIN_PATH)}`);
    }
    const actual = sha256(fs.readFileSync(MAIN_PATH));
    if (actual !== EXPECTED.sourceMainSha256) {
      fail('E_STALE_ASSET', 'current build main.js hash does not match the pinned 854 evidence', {
        expected: EXPECTED.sourceMainSha256,
        actual
      });
    }
  }
}

function buildTextureEvidence(evidence) {
  const byName = new Map();
  for (const reference of evidence.references) {
    if (!reference || reference.kind !== 'item') continue;
    if (!['textureInfo', 'itemTexture', 'textureName'].includes(reference.field)) continue;
    const name = reference.value;
    if (typeof name !== 'string' || name.length === 0) continue;
    const expectedSha = sha256(name);
    if (reference.sha256 !== expectedSha) {
      fail('E_EVIDENCE_CONFLICT', `evidence hash for item texture ${name} is inconsistent`, {
        texture: name,
        expected: expectedSha,
        actual: reference.sha256
      });
    }
    const previous = byName.get(name);
    if (previous && previous.sourceSha256 !== expectedSha) {
      fail('E_EVIDENCE_CONFLICT', `conflicting evidence for item texture ${name}`);
    }
    byName.set(name, {
      textureName: name,
      sourceSha256: expectedSha,
      atlas: reference.atlas || null
    });
  }
  return byName;
}

function registryItems(registry) {
  const view = registry.items.numericIdView;
  const values = Array.isArray(view) ? view.slice() : Object.values(view);
  return values.sort((left, right) => Number(left.id) - Number(right.id));
}

/*
 * Builds the pack in memory. If `outputDir` is set the ZIP and manifest are
 * written there; otherwise only buffers are returned (used by self-tests).
 */
function buildPack(options = {}) {
  const verifyMainFile = options.verifyMainFile !== false;
  if (!options.evidence) {
    verifyPinnedFile(ASSETS_PATH, EXPECTED_ASSETS_SHA256, 'assets.json');
  }
  if (!options.registry) {
    verifyPinnedFile(REGISTRY_PATH, EXPECTED_REGISTRY_SHA256, 'registry-856.json');
  }
  const evidence = options.evidence || readJson(ASSETS_PATH);
  const registry = options.registry || readJson(REGISTRY_PATH);
  validateSource(evidence, registry, verifyMainFile);

  const evidenceByTexture = buildTextureEvidence(evidence);
  const chunkTextures = options.chunkTextures || loadChunkTextures();
  const items = registryItems(registry);
  const faults = options.faults || {};

  const entries = [];
  const records = [];
  const textureRecords = [];
  const textureBySlug = new Map();
  const usedModelIds = new Map();
  const nameKeyToModel = new Map();

  let missingAssets = 0;
  let missingEvidenceTextures = 0;
  let legacyStyleItems = 0;
  let pathTraversal = 0;
  let rawSectionSign = 0;
  let minecraftNameOverrides = 0;

  const missingRequiredTextures = [];
  for (const item of items) {
    const texture = item.textureInfo || item.itemTexture;
    if (!texture) continue;
    if (!chunkTextures.byName.has(texture) && !allowsPlaceholder(texture)) {
      missingRequiredTextures.push({ bloxdId: item.id, name: item.name, texture });
    }
  }
  if (missingRequiredTextures.length > 0) {
    missingAssets += missingRequiredTextures.length;
    fail(
      'E_MISSING_ASSET',
      `pinned 854 chunks have no PNG module for ${missingRequiredTextures.length} required textures`,
      { textures: missingRequiredTextures }
    );
  }

  function addEntry(entryPath, data, kind) {
    if (typeof entryPath !== 'string' || entryPath.length === 0) {
      fail('E_INVALID_ENTRY', 'entry path must be a non-empty string');
    }
    if (entryPath.includes('\\') || entryPath.startsWith('/') || /^[A-Za-z]:/.test(entryPath)) {
      pathTraversal++;
      fail('E_PATH_TRAVERSAL', `unsafe entry path ${entryPath}`);
    }
    const segments = entryPath.split('/');
    if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
      pathTraversal++;
      fail('E_PATH_TRAVERSAL', `unsafe entry path ${entryPath}`);
    }
    if (entryPath.endsWith('/')) {
      fail('E_INVALID_ENTRY', `directory entries are not allowed: ${entryPath}`);
    }
    if (entryPath.startsWith('assets/minecraft/')) {
      minecraftNameOverrides++;
      fail('E_MINECRAFT_OVERRIDE', `Minecraft namespace override is not allowed: ${entryPath}`);
    }
    entries.push({
      name: entryPath,
      data: Buffer.isBuffer(data) ? data : Buffer.from(data),
      kind
    });
  }

  entries.push({
    name: 'pack.mcmeta',
    data: Buffer.from(
      stableJson({
        pack: {
          pack_format: PACK_FORMAT,
          description: 'Bloxd 854 item visuals (namespace bloxd)'
        }
      }),
      'utf8'
    ),
    kind: 'pack-meta'
  });

  for (const item of items) {
    const primaryTexture = item.textureInfo || item.itemTexture;
    if (!primaryTexture) {
      missingAssets++;
      fail('E_MISSING_ASSET', `Bloxd item ${item.id} has no current-854 texture evidence`, {
        bloxdId: item.id,
        name: item.name
      });
    }

    const textureEvidence = evidenceByTexture.get(primaryTexture);
    if (!textureEvidence) {
      missingAssets++;
      fail('E_MISSING_ASSET', `texture evidence is missing for ${primaryTexture}`, {
        bloxdId: item.id,
        name: item.name,
        texture: primaryTexture
      });
    }

    const realTexture = chunkTextures.byName.get(primaryTexture);
    let textureSource;
    if (realTexture) {
      textureSource = realTexture;
    } else if (allowsPlaceholder(primaryTexture)) {
      textureSource = {
        textureName: primaryTexture,
        bytes: MISSING_EVIDENCE_PNG,
        sha256: MISSING_EVIDENCE_SHA256,
        width: PLACEHOLDER_SIZE,
        height: PLACEHOLDER_SIZE,
        textureSource: PLACEHOLDER_TEXTURE_SOURCE,
        sourceChunk: null,
        sourceModule: null,
        sourcePath: null,
        missingEvidence: true
      };
    } else {
      missingAssets++;
      fail(
        'E_MISSING_ASSET',
        `pinned 854 chunks have no PNG module for required texture ${primaryTexture}`,
        {
          bloxdId: item.id,
          name: item.name,
          texture: primaryTexture
        }
      );
    }

    const textureSlug = slugify(primaryTexture);
    const existingTexture = textureBySlug.get(textureSlug);
    if (existingTexture && existingTexture.textureName !== primaryTexture) {
      fail('E_TEXTURE_SLUG_COLLISION', `texture names collide on ${textureSlug}`, {
        first: existingTexture.textureName,
        second: primaryTexture
      });
    }

    if (!existingTexture) {
      const texturePath = `assets/${NAMESPACE}/textures/item/${textureSlug}.png`;
      addEntry(texturePath, textureSource.bytes, 'texture');
      if (textureSource.missingEvidence) missingEvidenceTextures++;
      const textureRecord = {
        textureName: primaryTexture,
        textureId: `${NAMESPACE}:item/${textureSlug}`,
        file: texturePath,
        textureSource: textureSource.textureSource,
        sourceChunk: textureSource.sourceChunk,
        sourceModule: textureSource.sourceModule,
        sourcePath: textureSource.sourcePath,
        width: textureSource.width,
        height: textureSource.height,
        bytes: textureSource.bytes.length,
        sha256: textureSource.sha256,
        missingEvidence: Boolean(textureSource.missingEvidence),
        atlas: textureEvidence.atlas
      };
      textureBySlug.set(textureSlug, textureRecord);
      textureRecords.push(textureRecord);
    }

    const naturalModelSlug = `${textureSlug}_${item.id}`;
    const modelSlug = faults.duplicateModelId ? 'forced_collision' : naturalModelSlug;
    if (usedModelIds.has(modelSlug)) {
      fail('E_DUPLICATE_MODEL_ID', `duplicate model id ${modelSlug}`, {
        first: usedModelIds.get(modelSlug),
        second: item.id
      });
    }
    usedModelIds.set(modelSlug, item.id);

    const modelId = `${NAMESPACE}:${modelSlug}`;
    const modelPath = `${NAMESPACE}:item/${modelSlug}`;
    const itemModelPath = `assets/${NAMESPACE}/items/${modelSlug}.json`;
    const modelFilePath = `assets/${NAMESPACE}/models/item/${modelSlug}.json`;
    const nameKey = item.metaStr ? `${item.name}|${item.metaStr}` : item.name;

    if (nameKeyToModel.has(nameKey)) {
      fail('E_NAME_KEY_COLLISION', `duplicate Bloxd name key ${nameKey}`, {
        first: nameKeyToModel.get(nameKey),
        second: modelId
      });
    }
    nameKeyToModel.set(nameKey, modelId);

    const nameParsed = parseLegacyComponent(item.name);
    const displayParsed = parseLegacyComponent(item.displayName || item.name);
    if (item.name.includes('\u00a7') || String(item.displayName || '').includes('\u00a7')) {
      legacyStyleItems++;
    }
    if (JSON.stringify(nameParsed.component).includes('\u00a7') ||
        JSON.stringify(displayParsed.component).includes('\u00a7')) {
      rawSectionSign++;
      fail('E_RAW_SECTION_SIGN', `raw section sign survived for Bloxd item ${item.id}`);
    }

    addEntry(
      itemModelPath,
      stableJson({
        model: {
          type: 'minecraft:model',
          model: modelPath
        }
      }),
      'item-definition'
    );
    addEntry(
      modelFilePath,
      stableJson({
        parent: 'minecraft:item/generated',
        textures: {
          layer0: `${NAMESPACE}:item/${textureSlug}`
        }
      }),
      'model'
    );

    records.push({
      bloxdId: Number(item.id),
      name: item.name,
      metaStr: item.metaStr || '',
      nameKey,
      displayName: item.displayName || item.name,
      type: item.type || null,
      modelId,
      itemModelPath,
      modelPath,
      modelFilePath,
      textureName: primaryTexture,
      textureId: `${NAMESPACE}:item/${textureSlug}`,
      texturePath: `assets/${NAMESPACE}/textures/item/${textureSlug}.png`,
      textureSource: textureSource.textureSource,
      textureSourceSha256: textureSource.sha256,
      textureSourceChunk: textureSource.sourceChunk,
      textureSourceModule: textureSource.sourceModule,
      missingEvidence: Boolean(textureSource.missingEvidence),
      nameComponent: nameParsed.component,
      displayNameComponent: displayParsed.component,
      legacyStyleCodes: nameParsed.codes.concat(displayParsed.codes)
    });
  }

  if (faults.extraEntry) {
    addEntry(faults.extraEntry, Buffer.from('self-test fault\n', 'utf8'), 'fault');
  }

  entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

  const entryByName = new Map();
  for (const entry of entries) {
    if (entryByName.has(entry.name)) {
      fail('E_DUPLICATE_ENTRY', `duplicate ZIP entry ${entry.name}`);
    }
    entryByName.set(entry.name, entry);
  }

  // Reference closure: manifest item -> item definition -> model -> texture.
  let unresolvedReferences = 0;
  for (const record of records) {
    const definitionEntry = entryByName.get(record.itemModelPath);
    const modelEntry = entryByName.get(record.modelFilePath);
    const textureEntry = entryByName.get(record.texturePath);
    if (!definitionEntry || !modelEntry || !textureEntry) {
      unresolvedReferences++;
      continue;
    }
    let definition;
    let model;
    try {
      definition = JSON.parse(definitionEntry.data.toString('utf8'));
      model = JSON.parse(modelEntry.data.toString('utf8'));
    } catch (_error) {
      unresolvedReferences++;
      continue;
    }
    if (
      !definition.model ||
      definition.model.type !== 'minecraft:model' ||
      definition.model.model !== record.modelPath
    ) {
      unresolvedReferences++;
    }
    if (
      !model.textures ||
      model.textures.layer0 !== record.textureId ||
      model.parent !== 'minecraft:item/generated'
    ) {
      unresolvedReferences++;
    }
  }

  for (const entry of entries) {
    if (entry.kind !== 'model') continue;
    let model;
    try {
      model = JSON.parse(entry.data.toString('utf8'));
    } catch (_error) {
      unresolvedReferences++;
      continue;
    }
    for (const textureId of Object.values(model.textures || {})) {
      const textureSlug = String(textureId).split(':').pop().replace(/^item\//, '');
      if (!entryByName.has(`assets/${NAMESPACE}/textures/item/${textureSlug}.png`)) {
        unresolvedReferences++;
      }
    }
  }

  if (unresolvedReferences > 0) {
    missingAssets += unresolvedReferences;
    fail('E_REFERENCE_CLOSURE', `${unresolvedReferences} manifest/model/texture references do not resolve`);
  }

  const packMetaEntry = entryByName.get('pack.mcmeta');
  if (!packMetaEntry) {
    missingAssets++;
    fail('E_REFERENCE_CLOSURE', 'pack.mcmeta is missing');
  }
  let packMeta;
  try {
    packMeta = JSON.parse(packMetaEntry.data.toString('utf8'));
  } catch (_error) {
    fail('E_PACK_META', 'pack.mcmeta is not valid JSON');
  }
  if (!packMeta.pack || packMeta.pack.pack_format !== PACK_FORMAT) {
    fail('E_PACK_FORMAT', `pack.mcmeta pack_format is not ${PACK_FORMAT}`);
  }

  const registryIds = new Set(
    registryItems(registry).map((item) => Number(item.id))
  );
  const itemIds = records.map((record) => record.bloxdId);
  const newRegistryIds = itemIds.filter((id) => !registryIds.has(id));
  if (newRegistryIds.length > 0) {
    fail('E_NEW_REGISTRY_ID', 'manifest contains registry ids that are not in the 854 registry', {
      ids: newRegistryIds
    });
  }

  if (textureBySlug.size !== textureRecords.length) {
    fail('E_TEXTURE_DUPLICATE', 'texture record count does not match unique texture slugs');
  }

  const zip = buildZip(entries);
  const zipSha256 = sha256(zip);

  const plainGroups = new Map();
  for (const record of records) {
    if (!plainGroups.has(record.name)) plainGroups.set(record.name, []);
    plainGroups.get(record.name).push(record);
  }
  const plainNameToModel = {};
  const variantIndex = {};
  for (const [name, group] of plainGroups) {
    const base = group.find((record) => record.metaStr === '') || group[0];
    plainNameToModel[name] = base.modelId;
    if (group.length > 1) {
      variantIndex[name] = group.map((record) => ({
        nameKey: record.nameKey,
        metaStr: record.metaStr,
        modelId: record.modelId,
        textureId: record.textureId,
        textureName: record.textureName
      }));
    }
  }
  const plainNameCollisions = [...plainGroups.values()].filter((group) => group.length > 1).length;
  const nameVariants = [...plainGroups.values()].reduce(
    (total, group) => total + Math.max(0, group.length - 1),
    0
  );

  const outputDir = options.outputDir || null;
  const zipFile = ZIP_NAME;
  const realTextures = textureRecords.filter((texture) => !texture.missingEvidence).length;
  const placeholderTextures = textureRecords.filter((texture) => texture.missingEvidence).length;
  if (missingEvidenceTextures !== placeholderTextures) {
    fail('E_TEXTURE_DUPLICATE', 'missing-evidence texture count does not match placeholder records');
  }

  const manifest = {
    schemaVersion: 1,
    namespace: NAMESPACE,
    pack: {
      name: PACK_NAME,
      id: PACK_NAME,
      build: EXPECTED.build,
      buildVersion: EXPECTED.buildVersion,
      bloxdVersion: EXPECTED.bloxdVersion,
      packFormat: PACK_FORMAT,
      description: 'Bloxd 854 item visuals (namespace bloxd)',
      zipFile,
      zipSha256,
      zipSize: zip.length,
      zipEntries: entries.length,
      textureProvenance: {
        kind: REAL_TEXTURE_SOURCE,
        imageBytes: true,
        realTextures,
        placeholderTextures,
        missingEvidenceTextures,
        explicitMissingEvidence: Object.freeze(Object.fromEntries(
          textureRecords
            .filter((texture) => texture.missingEvidence && !texture.textureName.startsWith(PLACEHOLDER_ALLOWED_PREFIX))
            .map((texture) => [texture.textureName, MISSING_EVIDENCE_TEXTURES[texture.textureName] || 'not in the explicit exception list'])
        )),
        note:
          'Real PNG bytes are decoded from pinned current-854 chunk PNG modules ' +
          '(8 pinned chunks, mapping chunk itj4su.18.6efbf4e4). No 840 or ' +
          'vanilla image data is used. A caught_* texture, or a texture listed in ' +
          'explicitMissingEvidence, uses the explicit missing-evidence-placeholder ' +
          'and is never claimed as real.'
      }
    },
    source: {
      assets: options.evidencePath ? relativePath(options.evidencePath) : null,
      assetsSha256: options.evidencePath && fs.existsSync(options.evidencePath)
        ? sha256(fs.readFileSync(options.evidencePath))
        : null,
      assetsBuild: evidence.build,
      registry: options.registryPath ? relativePath(options.registryPath) : null,
      registrySha256: options.registryPath && fs.existsSync(options.registryPath)
        ? sha256(fs.readFileSync(options.registryPath))
        : null,
      chunks: chunkTextures.chunkHashes.map((chunk) => ({
        path: path.posix.join(relativePath(BUILD_DIR), chunk.path),
        sha256: chunk.sha256
      })),
      duplicatePngModules: chunkTextures.duplicateModules.map((entry) => ({
        moduleId: entry.moduleId,
        sha256: entry.sha256,
        chunks: entry.chunks
      })),
      mainSha256: evidence.sourceMainSha256,
      pinned: Object.assign({}, EXPECTED)
    },
    nameKeyRule: 'name when metaStr is empty; name + "|" + metaStr otherwise',
    counts: {
      items: records.length,
      uniqueTextures: textureRecords.length,
      itemModelDefinitions: records.length,
      models: records.length,
      textures: textureRecords.length,
      realTextures,
      placeholderTextures,
      missingEvidenceTextures,
      zipEntries: entries.length,
      plainNames: plainGroups.size,
      legacyStyleItems,
      plainNameCollisions,
      nameVariants,
      duplicateModelIds: 0,
      missingAssets: 0,
      pathTraversal: 0,
      newRegistryIds: 0,
      minecraftNameOverrides: 0,
      rawSectionSign: 0
    },
    nameToModel: plainNameToModel,
    nameKeyToModel: Object.fromEntries(nameKeyToModel),
    nameVariants: variantIndex,
    items: records,
    textures: textureRecords.sort((left, right) =>
      left.textureName < right.textureName ? -1 : left.textureName > right.textureName ? 1 : 0
    ),
    files: entries.map((entry) => ({
      path: entry.name,
      kind: entry.kind,
      size: entry.data.length,
      sha256: sha256(entry.data),
      crc32: crc32(entry.data),
      compression: 'deflate'
    }))
  };

  const manifestJson = stableJson(manifest);
  if (manifestJson.includes('\u00a7')) {
    fail('E_RAW_SECTION_SIGN', 'manifest contains a raw section sign');
  }

  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, ZIP_NAME), zip);
    fs.writeFileSync(path.join(outputDir, 'manifest.json'), manifestJson, 'utf8');
  }

  return {
    zip,
    manifest,
    manifestJson,
    entries,
    summary: {
      ok: true,
      mode: 'build',
      packFormat: PACK_FORMAT,
      zipFile,
      zipSha256,
      zipSize: zip.length,
      zipEntries: entries.length,
      items: records.length,
      textures: textureRecords.length,
      realTextures,
      placeholderTextures,
      missingEvidenceTextures,
      missingAssets: 0,
      pathTraversal: 0,
      newRegistryIds: 0,
      minecraftNameOverrides: 0,
      duplicateModelIds: 0,
      rawSectionSign: 0,
      legacyStyleItems,
      plainNameCollisions,
      nameVariants
    }
  };
}

function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = entry.data;
    const checksum = crc32(data);
    const compressed = zlib.deflateRawSync(data, {
      level: 9,
      memLevel: 8,
      strategy: zlib.constants.Z_DEFAULT_STRATEGY
    });

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 name
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // fixed DOS time
    local.writeUInt16LE(0x0021, 12); // fixed DOS date: 1980-01-01
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4); // made by: Unix, 3.0
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8); // UTF-8 name
    central.writeUInt16LE(8, 10); // deflate
    central.writeUInt16LE(0, 12); // fixed DOS time
    central.writeUInt16LE(0x0021, 14); // fixed DOS date
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0x81a40000, 38); // Unix regular file 0644, no symlink
    central.writeUInt32LE(offset, 42);

    centrals.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralOffset = offset;
  const centralBuffer = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuffer, eocd]);
}

function main(argv) {
  try {
    let outputDir = DEFAULT_OUT;
    for (let index = 0; index < argv.length; index++) {
      if (argv[index] === '--out') {
        if (!argv[index + 1]) fail('E_USAGE', '--out requires a directory');
        outputDir = path.resolve(ROOT, argv[index + 1]);
        index++;
      } else {
        fail('E_USAGE', `unknown argument ${argv[index]}`);
      }
    }

    const result = buildPack({
      outputDir,
      evidencePath: ASSETS_PATH,
      registryPath: REGISTRY_PATH,
      verifyMainFile: true
    });
    process.stdout.write(`${JSON.stringify(result.summary)}\n`);
    process.exit(0);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        ok: false,
        mode: 'build',
        code: error.code || 'E_UNCAUGHT',
        message: error.message,
        detail: error.detail || null
      })}\n`
    );
    process.exit(1);
  }
}

module.exports = {
  PACK_FORMAT,
  MISSING_EVIDENCE_TEXTURES,
  EXPECTED,
  PackError,
  buildPack,
  buildZip,
  crc32,
  loadChunkTextures,
  parseLegacyComponent,
  pngInfo,
  slugify
};

if (require.main === module) {
  main(process.argv.slice(2));
}
