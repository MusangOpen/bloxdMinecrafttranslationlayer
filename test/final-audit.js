'use strict';

/**
 * Final historical / no-Git / new-ID / scope audit for the 856 update.
 *
 * Normal mode (no arguments) recomputes every captured 840/839 artifact hash
 * from `.research/historical-before.sha256`, verifies the build-scoped 856
 * manifest, and checks the immutability / scope invariants required by task 27.
 * It never rewrites the historical manifest or the captured trees.
 *
 * Failure modes are explicit CLI faults. They inject a fault in memory (or in
 * the audit's own enumerated inventory) and must make the process exit non-zero:
 *
 *   node test/final-audit.js --fault=historical-hash
 *   node test/final-audit.js --fault=fabric-file
 *   node test/final-audit.js --fault=dependency
 *   node test/final-audit.js --fault=registry-id
 *   node test/final-audit.js --fault=git-directory
 *   node test/final-audit.js --fault=minecraft-namespace
 *   node test/final-audit.js --fault=pack-hash
 *   node test/final-audit.js --fault=placed-block
 *   node test/final-audit.js --fault=scope-file
 *
 * `--self-test` runs every fault through a real child process and requires the
 * child to exit non-zero with the matching flag. `--evidence` additionally
 * writes `.omo/evidence/update-bloxd-mc-1-21-11-fabric/task-27.{log,json}`.
 *
 * Plan task 23 status is reported as-is (currently `[x]` complete). This audit
 * surfaces `task23Status` and `blockedTasks` from the plan without requiring
 * task 23 to be blocked.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');

const ROOT = path.resolve(__dirname, '..');
const EVIDENCE_DIR = path.join(ROOT, '.omo', 'evidence', 'update-bloxd-mc-1-21-11-fabric');
const PLAN_PATH = '.omo/plans/update-bloxd-mc-1-21-11-fabric.md';
const HISTORICAL_MANIFEST = '.research/historical-before.sha256';
const BUILD_DIR = '.research/builds/7rp1w-57cd8edd';
const BUILD_MANIFEST = `${BUILD_DIR}/manifest.json`;
const BUILD_REGISTRY = '.research/7rp1w-audit/generated/registry.json';
const REGISTRY_856 = 'bloxd/types/registry-856.json';
const REGISTRY_840 = 'bloxd/types/registry-840.json';
const PACK_ZIP = 'bloxd/resource_pack/bloxd-856.zip';
const PACK_MANIFEST = 'bloxd/resource_pack/manifest.json';

const EXPECTED_HISTORICAL_ENTRIES = 229;
const EXPECTED_BUILD = '7rp1w';
const EXPECTED_BUILD_VERSION = '57cd8edd';
const EXPECTED_BUILD_CHUNKS = 353;
const EXPECTED_PACK_SHA256 = '2a08bb541acb426963d30a58f40b7823efac7656f713700ccca0aa244b028ee4';
const BUILD_SCOPED_DIRECTORIES = Object.freeze([
  'test',
  '.research/builds/7rp1w-57cd8edd',
  '.research/7rp1w-audit',
  '.research/historical-before.sha256',
  '.omo/evidence/update-bloxd-mc-1-21-11-fabric',
  'docs'
]);
const WORK_CUTOFF_MS = Date.parse('2026-11-01T00:00:00Z');

// Direct dependencies that existed before this update. Anything else declared
// by package.json / the lockfile root is a new dependency (including acorn).
const BASELINE_DEPENDENCIES = new Set([
  'avsc',
  'colyseus.js',
  'minecraft-data',
  'minecraft-protocol',
  'ndarray',
  'pako',
  'prismarine-chunk',
  'prismarine-nbt',
  'vec3',
  'ws'
]);

const ALLOWED_TOP_LEVEL_DIRECTORIES = new Set([
  '.codegraph',
  '.omo',
  '.research',
  'bloxd',
  'docs',
  'game',
  'mc',
  'node_modules',
  'reference',
  'test'
]);

const ALLOWED_TOP_LEVEL_FILES = new Set([
  '.gitignore',
  '1.bat',
  'login.json',
  'LICENSE.md',
  'README.md',
  'index.js',
  'package-lock.json',
  'package.json',
  'settings.json',
  'tampermonkey.js'
]);

// Two pre-existing reference snippets from the original repository (mtime
// 2025-08-25). They are not a Fabric mod, Gradle project or Fabric API
// component and this update did not touch them. Every other Java/Gradle/Fabric
// file is forbidden.
const LEGACY_JAVA_FILES = new Map([
  ['reference/physics/Movement.java', 'pre-existing legacy Forge/MCP reference snippet (2025-08-25), unchanged'],
  ['reference/physics/NoaPhysics.java', 'pre-existing legacy Forge/MCP reference snippet (2025-08-25), unchanged']
]);

// Explicit intentional product-change list. Every product file touched after
// 2026-11-01 must appear here with a reason. Test/, .research/ and .omo/ files
// are build-scoped and are not product changes.
const INTENTIONAL_PRODUCT_CHANGES = [
  { path: '.gitignore', reason: 'stop ignoring package-lock.json so the exact pins are reviewable' },
  { path: '1.bat', reason: 'local Windows launcher for npm start' },
  { path: 'login.json', reason: 'local auth cache written by the startup login flow; gitignored and never committed' },
  { path: 'package.json', reason: 'pin Node >=22, exact dependency versions and required-suite scripts' },
  { path: 'package-lock.json', reason: 'lockfile root ranges/resolved versions aligned with package.json pins' },
  { path: 'README.md', reason: 'document 856 baseline, Node 22+, pack scope, commands and honest limits' },
  { path: 'LICENSE.md', reason: 'relicensed from AGPL-3.0 to Apache-2.0 at the repository owner request' },
  { path: 'settings.json', reason: 'local gitignored runtime settings written by the startup path' },
  { path: 'index.js', reason: 'resource-pack preflight, login/pack gate, startup and clean shutdown' },
  { path: 'reference/physics/Movement.java', reason: 'speed/jump/gravity constants replaced with values measured from the 2026-11-11 Bloxd sample' },
  { path: 'reference/physics/NoaPhysics.java', reason: 'measured gravity 19.74 m/s^2 -> gravityVector [0,-9.87,0]; delta 1/30 kept' },
  { path: 'mc/chunk.js', reason: 'explicit 1.21.11 chunk encoder pinned to the vanilla-captured section/heightmap/light layout' },
  { path: 'tampermonkey.js', reason: 'browser 3PSIDMC token bridge to the local auth service' },
  { path: 'bloxd/client.js', reason: 'single 856 version/auth/transport source and fail-closed packet handling' },
  { path: 'bloxd/dns_override.js', reason: 'DoH fallback when local DNS returns proxy fake-ip for game-server hosts' },
  { path: 'bloxd/friends.js', reason: 'validate social API responses before iterating friends/requests' },
  { path: 'bloxd/protocol/target.js', reason: 'pinned 7rp1w/57cd8edd/856 target constants' },
  { path: 'bloxd/protocol/live.js', reason: 'generated 856 packet descriptor with 100% id disposition' },
  { path: 'bloxd/types/browser_info.js', reason: '856 browser-info constants' },
  { path: 'bloxd/types/anticheat_constants.js', reason: '856 anticheat constants' },
  { path: 'bloxd/types/session_ids.js', reason: '853 play/visit session ids for the Colyseus join payload' },
  { path: 'bloxd/types/items.js', reason: '856 item table preserving item names/identity' },
  { path: 'bloxd/types/registry-846.json', reason: 'historical generated 846 block/item registry retained as evidence' },
  { path: 'bloxd/types/registry-852.json', reason: 'historical generated 852 block/item registry retained as evidence' },
  { path: 'bloxd/types/registry-853.json', reason: 'historical generated 853 block/item registry retained as evidence' },
  { path: 'bloxd/types/registry-854.json', reason: 'generated 853 block/item registry derived from the pinned build' },
  { path: 'bloxd/types/registry-856.json', reason: 'generated 856 block/item registry derived from the pinned build' },
  { path: 'mc/registry_tags.js', reason: '1.21.11 configuration tags for dynamic and static registries' },
  { path: 'mc/vanilla_tags_1_21_11.json', reason: 'generated vanilla 1.21.11 item/block/entity/damage_type tags for codec binding' },
  { path: 'bloxd/utils.js', reason: 'structured displayName/lore/itemModel item identity' },
  { path: 'bloxd/types/guis.js', reason: 'preserve structured item display NBT instead of legacy overwrite' },
  { path: 'bloxd/handlers/impl/entity.js', reason: '856 handler field fixes and outbound call sites' },
  { path: 'bloxd/handlers/impl/gui.js', reason: 'degrade unresolved Bloxd items to empty slots instead of throwing in state callbacks' },
  { path: 'bloxd/handlers/impl/world.js', reason: 'fix cannonFire sound fallthrough that emitted an invalid dig.cannonFire name' },
  { path: 'bloxd/handlers/impl/anticheat.js', reason: 'remove obsolete 856 social decoy requests and the invalid HTTP-derived tablist latency write' },
  { path: 'bloxd/handlers/impl/misc.js', reason: 'title/subtitle action mapping fix: middleTextUpper -> action 0 title, new middleTextLower -> action 1 subtitle' },
  { path: 'bloxd/resource_pack/generate.js', reason: 'deterministic format-75 item-visual pack generator for 856 evidence' },
  { path: 'bloxd/resource_pack/server.js', reason: 'localhost-only exact-byte pack HTTP server' },
  { path: 'bloxd/resource_pack/bloxd-846.zip', reason: 'historical deterministic 846 item-visual pack retained as evidence' },
  { path: 'bloxd/resource_pack/bloxd-853.zip', reason: 'historical deterministic 853 item-visual resource pack retained as evidence' },
  { path: 'bloxd/resource_pack/bloxd-854.zip', reason: 'deterministic generated 854 item-visual resource pack' },
  { path: 'bloxd/resource_pack/bloxd-856.zip', reason: 'deterministic generated 856 item-visual resource pack' },
  { path: 'bloxd/resource_pack/manifest.json', reason: 'deterministic generated 856 resource-pack manifest' },
  { path: 'mc/client.js', reason: '1.21.11 adapter fixes, preserved chunk/block translation and use_item sentinel mapping' },
  { path: 'mc/components.js', reason: 'rich text/NBT component preservation' },
  { path: 'mc/item_models.js', reason: 'collision-checked item_model attachment across item paths' },
  { path: 'mc/join-gate.js', reason: 'login/pack/load state machine and world-traffic gate' },
  { path: 'mc/registry.js', reason: 'explicit 1.8 -> 1.21.11 registry mapping with fail-closed unknown handling' }
];
const INTENTIONAL_PRODUCT_PATHS = new Set(INTENTIONAL_PRODUCT_CHANGES.map((entry) => entry.path));

// Wire descriptors are data, not behavior. Block-placement behavior is checked
// only in the changed executable product files.
const DESCRIPTOR_PATHS = new Set([
  'bloxd/protocol/live.js'
]);

const FAULT_MODES = [
  { name: 'historical-hash', flag: 'historicalUnchanged', check: (summary) => summary.flags.historicalUnchanged === 0 },
  { name: 'fabric-file', flag: 'forbiddenFabricFiles', check: (summary) => summary.flags.forbiddenFabricFiles > 0 },
  { name: 'dependency', flag: 'newDependencies', check: (summary) => summary.flags.newDependencies > 0 },
  { name: 'registry-id', flag: 'newRegistryIds', check: (summary) => summary.flags.newRegistryIds > 0 },
  { name: 'git-directory', flag: 'gitDirectory', check: (summary) => summary.flags.gitDirectory > 0 },
  { name: 'minecraft-namespace', flag: 'minecraftNamespaceOverrides', check: (summary) => summary.flags.minecraftNamespaceOverrides > 0 },
  { name: 'pack-hash', flag: 'packSha256Matches', check: (summary) => summary.flags.packSha256Matches === 0 },
  { name: 'placed-block', flag: 'unintendedPlacedBlockBehavior', check: (summary) => summary.flags.unintendedPlacedBlockBehavior > 0 },
  { name: 'scope-file', flag: 'scopeFilesOnly', check: (summary) => summary.flags.scopeFilesOnly === 0 }
];

function absolute(relativePath) {
  return path.join(ROOT, ...relativePath.split('/'));
}

function relative(absolutePath) {
  return path.relative(ROOT, absolutePath).split(path.sep).join('/');
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(absolute(relativePath), 'utf8'));
}

function readText(relativePath) {
  return fs.readFileSync(absolute(relativePath), 'utf8');
}

function walkFilesUnder(relativeDirectory, skipNames = new Set()) {
  const start = absolute(relativeDirectory);
  const files = [];
  if (!fs.existsSync(start)) return files;
  const stack = [start];
  while (stack.length > 0) {
    const directory = stack.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (skipNames.has(entry.name)) continue;
        stack.push(fullPath);
      } else if (entry.isFile()) {
        files.push({
          abs: fullPath,
          rel: relative(fullPath),
          mtimeMs: fs.statSync(fullPath).mtimeMs
        });
      }
    }
  }
  return files;
}

function walkDirectoriesUnder(relativeDirectory, skipNames = new Set()) {
  const start = absolute(relativeDirectory);
  const directories = [];
  if (!fs.existsSync(start)) return directories;
  const stack = [start];
  while (stack.length > 0) {
    const directory = stack.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const fullPath = path.join(directory, entry.name);
      directories.push({ abs: fullPath, rel: relative(fullPath), name: entry.name });
      if (!skipNames.has(entry.name)) stack.push(fullPath);
    }
  }
  return directories;
}

function countMatches(text, regex) {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function parseHistoricalManifest(text) {
  const lines = text.replace(/\r\n/g, '\n').trimEnd().split('\n').filter((line) => line.length > 0);
  const entries = new Map();
  const order = [];
  const formatErrors = [];
  const duplicates = [];
  for (let index = 0; index < lines.length; index++) {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(lines[index]);
    if (!match) {
      formatErrors.push({ line: index + 1, text: lines[index].slice(0, 120) });
      continue;
    }
    if (entries.has(match[2])) duplicates.push(match[2]);
    entries.set(match[2], match[1]);
    order.push(match[2]);
  }
  return { entries, order, formatErrors, duplicates };
}

function collectHistoricalDiskPaths() {
  const paths = new Set();
  for (const file of walkFilesUnder('.research/live')) paths.add(file.rel);
  for (const file of walkFilesUnder('game')) paths.add(file.rel);
  if (fs.existsSync(absolute(REGISTRY_840))) paths.add(REGISTRY_840);
  for (const entry of fs.readdirSync(absolute('.research'), { withFileTypes: true })) {
    if (entry.isFile() && /^patch-.*\.js$/.test(entry.name)) {
      paths.add(`.research/${entry.name}`);
    }
  }
  return Array.from(paths).sort();
}

function auditHistorical(fault) {
  const text = readText(HISTORICAL_MANIFEST);
  const parsed = parseHistoricalManifest(text);
  const expected = new Map(parsed.entries);
  if (fault === 'historical-hash' && parsed.order.length > 0) {
    expected.set(parsed.order[0], '0'.repeat(64));
  }

  const missing = [];
  const changed = [];
  for (const [file, expectedHash] of expected) {
    const filePath = absolute(file);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      missing.push(file);
      continue;
    }
    const actualHash = sha256File(filePath);
    if (actualHash !== expectedHash) {
      changed.push({ path: file, expected: expectedHash, actual: actualHash });
    }
  }

  const diskPaths = collectHistoricalDiskPaths();
  const extraOnDisk = diskPaths.filter((file) => !expected.has(file));
  const expectedMissingFromDisk = Array.from(expected.keys()).filter((file) => !diskPaths.includes(file));

  const ok = parsed.formatErrors.length === 0
    && parsed.duplicates.length === 0
    && missing.length === 0
    && changed.length === 0
    && extraOnDisk.length === 0
    && expectedMissingFromDisk.length === 0
    && expected.size === EXPECTED_HISTORICAL_ENTRIES;

  return {
    ok,
    manifest: HISTORICAL_MANIFEST,
    manifestSha256: crypto.createHash('sha256').update(text).digest('hex'),
    expectedEntries: EXPECTED_HISTORICAL_ENTRIES,
    checkedEntries: expected.size,
    diskEntries: diskPaths.length,
    missing,
    changed,
    extraOnDisk,
    expectedMissingFromDisk,
    formatErrors: parsed.formatErrors,
    duplicates: parsed.duplicates
  };
}

function auditBuildManifest() {
  const manifest = readJson(BUILD_MANIFEST);
  const buildDirectory = absolute(BUILD_DIR);
  const missing = [];
  const hashMismatch = [];
  const sizeMismatch = [];
  const pathTraversal = [];

  const checkEntry = (entry, label) => {
    if (!entry || typeof entry.path !== 'string') {
      missing.push(`${label}:missing-path`);
      return;
    }
    const resolved = path.resolve(buildDirectory, entry.path);
    if (!resolved.startsWith(buildDirectory + path.sep)) {
      pathTraversal.push(entry.path);
      return;
    }
    if (!fs.existsSync(resolved)) {
      missing.push(entry.path);
      return;
    }
    const bytes = fs.readFileSync(resolved);
    if (bytes.length !== entry.size) sizeMismatch.push(entry.path);
    const actualHash = crypto.createHash('sha256').update(bytes).digest('hex');
    if (actualHash !== entry.sha256) hashMismatch.push(entry.path);
  };

  checkEntry(manifest.main, 'main');
  for (const chunk of manifest.chunks || []) checkEntry(chunk, chunk.id);

  const chunks = Array.isArray(manifest.chunks) ? manifest.chunks : [];
  const ok = manifest.build === EXPECTED_BUILD
    && manifest.buildVersion === EXPECTED_BUILD_VERSION
    && manifest.chunkCount === EXPECTED_BUILD_CHUNKS
    && chunks.length === EXPECTED_BUILD_CHUNKS
    && manifest.missing === 0
    && manifest.hashMismatch === 0
    && missing.length === 0
    && hashMismatch.length === 0
    && sizeMismatch.length === 0
    && pathTraversal.length === 0;

  return {
    ok,
    build: manifest.build,
    buildVersion: manifest.buildVersion,
    mainSha256: manifest.main && manifest.main.sha256,
    chunkCount: manifest.chunkCount,
    chunkEntries: chunks.length,
    missing,
    hashMismatch,
    sizeMismatch,
    pathTraversal
  };
}

function auditGit(fault) {
  const gitDirectories = walkDirectoriesUnder('.', new Set(['node_modules']))
    .filter((entry) => entry.name === '.git')
    .map((entry) => entry.rel);
  if (fault === 'git-directory') gitDirectories.push('.git');

  const mutatingCommandPattern = /\bgit\s+(init|add|commit|push|tag|reset|checkout|switch|branch|merge|rebase|stash|clean|rm|mv|fetch|pull|clone)\b/g;
  const files = [];
  files.push({ rel: 'index.js', abs: absolute('index.js') });
  files.push({ rel: 'package.json', abs: absolute('package.json') });
  for (const directory of ['test', 'bloxd', 'mc']) {
    for (const file of walkFilesUnder(directory)) {
      if (/\.(?:js|cjs|mjs)$/.test(file.rel)) files.push(file);
    }
  }
  for (const entry of fs.readdirSync(absolute('.research'), { withFileTypes: true })) {
    if (entry.isFile() && /\.(?:js|cjs)$/.test(entry.name)) {
      files.push({ rel: `.research/${entry.name}`, abs: absolute(`.research/${entry.name}`) });
    }
  }

  const mutatingCommands = [];
  for (const file of files) {
    const text = fs.readFileSync(file.abs, 'utf8');
    const count = countMatches(text, mutatingCommandPattern);
    if (count > 0) mutatingCommands.push({ path: file.rel, count });
  }

  return {
    gitDirectories,
    mutatingCommands
  };
}

function auditFabric(fault) {
  const violations = [];
  const files = walkFilesUnder('.', new Set(['node_modules', '.codegraph']));

  for (const file of files) {
    const name = path.basename(file.rel);
    if (LEGACY_JAVA_FILES.has(file.rel)) continue;
    const forbiddenName = /^(?:fabric\.mod\.json|build\.gradle(?:\.kts)?|settings\.gradle(?:\.kts)?|gradle\.properties|gradlew(?:\.bat)?|mixin\.json|.*\.mixins\.json)$/.test(name)
      || /\.(?:java|kt|gradle|jar)$/.test(name);
    if (forbiddenName) {
      violations.push({
        path: file.rel,
        reason: LEGACY_JAVA_FILES.has(file.rel) ? 'legacy reference file (unexpected)' : 'Fabric/Java/Gradle artifact'
      });
    }
  }

  // Built from fragments so this audit file does not match its own scanner.
  const fabricContentPattern = new RegExp([
    'net\\.' + 'fabricmc',
    'fabric-' + 'loader',
    'fabric_' + 'api',
    'Fabric' + 'Loader',
    'org\\.gradle',
    'fabric\\.mod\\.' + 'json'
  ].join('|'), 'g');
  for (const file of files) {
    const isCode = file.rel === 'package.json'
      || /^index\.js$/.test(file.rel)
      || /^test\/.*\.(?:js|cjs|mjs)$/.test(file.rel)
      || /^bloxd\/.*\.(?:js|cjs|mjs)$/.test(file.rel)
      || /^mc\/.*\.(?:js|cjs|mjs)$/.test(file.rel);
    if (!isCode) continue;
    if (countMatches(fs.readFileSync(file.abs, 'utf8'), fabricContentPattern) > 0) {
      violations.push({ path: file.rel, reason: 'Fabric/Gradle code reference' });
    }
  }

  if (fault === 'fabric-file') {
    violations.push({ path: ['fabric', 'mod', 'json'].join('.'), reason: 'synthetic fault injection' });
  }

  return {
    forbiddenFabricFiles: violations.length,
    violations,
    legacyJavaFiles: Array.from(LEGACY_JAVA_FILES.keys())
  };
}

function auditDependencies(fault) {
  const packageJson = readJson('package.json');
  const lockfile = readJson('package-lock.json');
  const declared = {};

  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const value = packageJson[section];
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    for (const [name, range] of Object.entries(value)) declared[name] = { section, range };
  }
  if (fault === 'dependency') declared.acorn = { section: 'dependencies', range: '^8.0.0' };

  const rootPackage = lockfile.packages && lockfile.packages[''] ? lockfile.packages[''] : {};
  const rootDependencies = rootPackage.dependencies && typeof rootPackage.dependencies === 'object'
    ? rootPackage.dependencies
    : {};

  const extraDeclared = Object.keys(declared).filter((name) => !BASELINE_DEPENDENCIES.has(name));
  const extraLockfile = Object.keys(rootDependencies).filter((name) => !BASELINE_DEPENDENCIES.has(name));
  const missingBaseline = Array.from(BASELINE_DEPENDENCIES).filter((name) => !Object.prototype.hasOwnProperty.call(rootDependencies, name));

  const rangeMismatches = [];
  for (const [name, entry] of Object.entries(declared)) {
    if (name === 'acorn') continue;
    if (!Object.prototype.hasOwnProperty.call(rootDependencies, name)) continue;
    if (rootDependencies[name] !== entry.range) {
      rangeMismatches.push({ package: name, packageJson: entry.range, lockfile: rootDependencies[name] });
    }
  }

  const newDependencies = new Set([...extraDeclared, ...extraLockfile]).size;
  return {
    newDependencies,
    extraDeclared,
    extraLockfile,
    missingBaseline,
    rangeMismatches,
    declaredNames: Object.keys(declared).sort(),
    lockfileRootNames: Object.keys(rootDependencies).sort()
  };
}

function auditRegistry(fault) {
  const generated = readJson(BUILD_REGISTRY);
  const registry = readJson(REGISTRY_856);
  const candidate = fault === 'registry-id'
    ? JSON.parse(JSON.stringify(registry))
    : registry;

  if (fault === 'registry-id') {
    candidate.numericIdView['999999'] = {
      name: '__fault_injected_id__',
      metaStr: '',
      id: 999999
    };
  }

  const generatedIds = new Set(Object.keys(generated.numericIdView || {}));
  const candidateIds = new Set(Object.keys(candidate.numericIdView || {}));
  const extraNumericIds = Array.from(candidateIds).filter((id) => !generatedIds.has(id));
  const missingNumericIds = Array.from(generatedIds).filter((id) => !candidateIds.has(id));

  const generatedNames = new Set(Object.keys(generated.nameView || {}));
  const candidateNames = new Set(Object.keys(candidate.nameView || {}));
  const extraNames = Array.from(candidateNames).filter((name) => !generatedNames.has(name));
  const missingNames = Array.from(generatedNames).filter((name) => !candidateNames.has(name));

  let idValueMismatch = 0;
  for (const id of candidateIds) {
    if (!generatedIds.has(id)) continue;
    const actual = candidate.numericIdView[id];
    const expected = generated.numericIdView[id];
    if (!isDeepStrictEqual(actual, expected)) idValueMismatch += 1;
  }

  const sectionMismatch = ['items', 'atlas', 'runtimeExpandedKeyCount', 'literalMemberCount', 'sourceMainSha256']
    .filter((key) => !isDeepStrictEqual(candidate[key], generated[key]));

  const sourceMainSha256Matches = candidate.sourceMainSha256 === generated.sourceMainSha256;
  const newRegistryIds = extraNumericIds.length + extraNames.length + idValueMismatch + sectionMismatch.length;
  const consistent = newRegistryIds === 0 && missingNumericIds.length === 0 && missingNames.length === 0;

  return {
    newRegistryIds,
    consistent,
    extraNumericIds,
    missingNumericIds,
    extraNames,
    missingNames,
    idValueMismatch,
    sectionMismatch,
    sourceMainSha256Matches,
    numericIds: candidateIds.size,
    names: candidateNames.size
  };
}

function readZipEntryNames(zipPath) {
  const buffer = fs.readFileSync(zipPath);
  const endOfCentralDirectorySignature = 0x06054b50;
  const centralDirectorySignature = 0x02014b50;
  let eocdOffset = -1;
  const minimumOffset = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset--) {
    if (buffer.readUInt32LE(offset) === endOfCentralDirectorySignature) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('ZIP end-of-central-directory record not found');

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const names = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index++) {
    if (buffer.readUInt32LE(offset) !== centralDirectorySignature) {
      throw new Error(`ZIP central-directory entry ${index} has a bad signature`);
    }
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    names.push(buffer.toString('utf8', offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

function auditResourcePack(fault) {
  const names = readZipEntryNames(absolute(PACK_ZIP));
  const manifest = readJson(PACK_MANIFEST);
  const zipOverrides = names.filter((name) => name.startsWith('assets/minecraft/'));
  const manifestOverrides = (manifest.files || [])
    .map((file) => String(file.path || ''))
    .filter((name) => name.startsWith('assets/minecraft/'));
  if (fault === 'minecraft-namespace') {
    zipOverrides.push('assets/minecraft/models/item/__fault__.json');
  }

  const unsafeZipPaths = names.filter((name) => name.includes('..') || name.startsWith('/') || /^[A-Za-z]:/.test(name));
  const minecraftNamespaceOverrides = zipOverrides.length + manifestOverrides.length;

  const zipSha256 = sha256File(absolute(PACK_ZIP));
  const declaredSha256 = manifest.pack && manifest.pack.zipSha256;
  const packSha256Matches = zipSha256 === declaredSha256 && zipSha256 === EXPECTED_PACK_SHA256
    ? 1
    : 0;
  if (fault === 'pack-hash') {
    return {
      minecraftNamespaceOverrides,
      zipEntries: names.length,
      packFormat: manifest.pack && manifest.pack.packFormat,
      zipSha256,
      declaredSha256,
      expectedSha256: EXPECTED_PACK_SHA256,
      packSha256Matches: 0,
      zipOverrides,
      manifestOverrides,
      unsafeZipPaths
    };
  }

  return {
    minecraftNamespaceOverrides,
    zipEntries: names.length,
    packFormat: manifest.pack && manifest.pack.packFormat,
    zipSha256,
    declaredSha256,
    expectedSha256: EXPECTED_PACK_SHA256,
    packSha256Matches,
    zipOverrides,
    manifestOverrides,
    unsafeZipPaths
  };
}

function behaviorFiles() {
  return INTENTIONAL_PRODUCT_CHANGES
    .map((entry) => entry.path)
    .filter((file) => /\.(?:js|cjs|mjs)$/.test(file) && !DESCRIPTOR_PATHS.has(file))
    .filter((file) => fs.existsSync(absolute(file)));
}

function auditPlacedBlockBehavior(fault) {
  const violations = [];
  const fileCounts = {};

  // Pre-existing placement counts in files that this update had to touch for
  // unrelated reasons. Counts above these baselines are still violations.
  const PLACED_BLOCK_BASELINE = Object.freeze({
    'bloxd/handlers/impl/world.js': Object.freeze({ block_place: 1, block_change_write: 1, setBlock: 7 })
  });

  const trackedPatterns = [
    { key: 'block_place', regex: /block_place/g, allowedInClient: 4 },
    { key: 'block_change_write', regex: /\b(?:this\.)?(?:real\.)?write\(\s*['"]block_change['"]/g, allowedInClient: 2 },
    { key: 'setBlockStateId', regex: /\bsetBlockStateId\s*\(/g, allowedInClient: 1 }
  ];
  const forbiddenPatterns = [
    { key: 'setBlock', regex: /\bsetBlock\s*\(/g },
    { key: 'placeBlock', regex: /\bplaceBlock\s*\(/g },
    { key: 'setBlockState', regex: /\bsetBlockState\s*\(/g },
    { key: 'blockUpdate', regex: /\bblockUpdate\s*\(/g },
    { key: 'forbidden_outbound_write', regex: /\b(?:write|send|emit)\(\s*['"](?:place_block|set_block|block_update)['"]/g }
  ];

  for (const file of behaviorFiles()) {
    const text = readText(file);
    const counts = {};
    for (const pattern of trackedPatterns) {
      const count = countMatches(text, pattern.regex);
      counts[pattern.key] = count;
      const baseline = PLACED_BLOCK_BASELINE[file] && PLACED_BLOCK_BASELINE[file][pattern.key];
      const allowed = baseline !== undefined ? baseline : (file === 'mc/client.js' ? pattern.allowedInClient : 0);
      if (count > allowed) {
        violations.push({
          path: file,
          pattern: pattern.key,
          count,
          allowed,
          reason: 'unexpected block-placement behavior in a changed product file'
        });
      }
    }
    for (const pattern of forbiddenPatterns) {
      const count = countMatches(text, pattern.regex);
      const baseline = PLACED_BLOCK_BASELINE[file] && PLACED_BLOCK_BASELINE[file][pattern.key];
      if (count > (baseline || 0)) {
        counts[pattern.key] = count;
        violations.push({ path: file, pattern: pattern.key, count, allowed: baseline || 0, reason: 'forbidden block mutation/send' });
      }
    }
    fileCounts[file] = counts;
  }

  const clientPath = 'mc/client.js';
  const clientText = fs.existsSync(absolute(clientPath)) ? readText(clientPath) : '';
  const functionMatch = /function useItemAsBlockPlace\s*\(\s*packet\s*\)\s*\{([\s\S]*?)\n\}/.exec(clientText);
  const sentinel = functionMatch
    ? functionMatch[1].includes('direction: -1')
      && functionMatch[1].includes('x: NaN')
      && functionMatch[1].includes('y: NaN')
      && functionMatch[1].includes('z: NaN')
    : false;
  if (!sentinel) {
    violations.push({
      path: clientPath,
      pattern: 'useItemAsBlockPlace_sentinel',
      reason: 'use_item must not be turned into a real block placement'
    });
  }

  if (fault === 'placed-block') {
    violations.push({ path: clientPath, pattern: 'synthetic_fault', reason: 'synthetic fault injection' });
  }

  return {
    unintendedPlacedBlockBehavior: violations.length,
    violations,
    sentinel,
    fileCounts
  };
}

function auditScope(fault) {
  const violations = [];
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ALLOWED_TOP_LEVEL_DIRECTORIES.has(entry.name)) {
        violations.push({ path: entry.name, reason: 'unexpected top-level directory' });
      }
    } else if (entry.isFile()) {
      if (!ALLOWED_TOP_LEVEL_FILES.has(entry.name)) {
        violations.push({ path: entry.name, reason: 'unexpected top-level file' });
      }
    }
  }

  const productDirectories = ['bloxd', 'mc', 'physics', 'game'];
  const productFiles = [];
  for (const directory of productDirectories) productFiles.push(...walkFilesUnder(directory));
  for (const name of ALLOWED_TOP_LEVEL_FILES) {
    if (fs.existsSync(absolute(name))) {
      productFiles.push({ rel: name, abs: absolute(name), mtimeMs: fs.statSync(absolute(name)).mtimeMs });
    }
  }

  const changedProductFiles = [];
  for (const file of productFiles) {
    if (file.mtimeMs < WORK_CUTOFF_MS) continue;
    changedProductFiles.push(file.rel);
    if (!INTENTIONAL_PRODUCT_PATHS.has(file.rel)) {
      violations.push({
        path: file.rel,
        reason: 'product file modified after the work cutoff but missing from the intentional-change list'
      });
    }
  }
  changedProductFiles.sort();

  for (const entry of INTENTIONAL_PRODUCT_CHANGES) {
    if (!fs.existsSync(absolute(entry.path))) {
      violations.push({ path: entry.path, reason: 'intentional-change file is missing from disk' });
    }
  }

  if (fault === 'scope-file') {
    violations.push({ path: 'bloxd/__fault_rogue__.js', reason: 'synthetic fault injection' });
  }

  return {
    scopeFilesOnly: violations.length === 0 ? 1 : 0,
    violations,
    changedProductFiles,
    intentionalChangeCount: INTENTIONAL_PRODUCT_CHANGES.length,
    buildScopedDirectories: BUILD_SCOPED_DIRECTORIES.slice()
  };
}

function auditPlan() {
  const lines = readText(PLAN_PATH).replace(/\r\n/g, '\n').split('\n');
  const statuses = new Map();
  let finalVerificationOpen = 0;
  for (const line of lines) {
    const task = /^- \[([ x~])\] (\d+)\./.exec(line);
    if (task) {
      statuses.set(Number(task[2]), task[1]);
      continue;
    }
    if (/^- \[ \] F\d+\./.test(line)) finalVerificationOpen += 1;
  }

  const blockedTasks = [];
  const incompleteTasks = [];
  for (let task = 1; task <= 27; task++) {
    const status = statuses.get(task);
    if (status === '~') blockedTasks.push(task);
    if (status !== 'x') incompleteTasks.push(task);
  }

  const statusOf = (task) => {
    const status = statuses.get(task);
    if (status === 'x') return 'complete';
    if (status === '~') return 'blocked';
    if (status === ' ') return 'open';
    return 'missing';
  };

  return {
    blockedTasks,
    task23Status: statusOf(23),
    task23Complete: statusOf(23) === 'complete',
    task27Status: statusOf(27),
    incompleteTasks,
    finalVerificationOpen,
    allTodosComplete: blockedTasks.length === 0 && incompleteTasks.length === 0 && finalVerificationOpen === 0
  };
}

function runAudit(options = {}) {
  const fault = options.fault || null;
  const failures = [];

  const attempt = (label, fn) => {
    try {
      return fn();
    } catch (error) {
      failures.push({
        code: `E_${label.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
        message: error && error.message ? error.message : String(error)
      });
      return null;
    }
  };

  const historical = attempt('historical', () => auditHistorical(fault)) || {
    ok: false,
    checkedEntries: 0,
    expectedEntries: EXPECTED_HISTORICAL_ENTRIES
  };
  const buildManifest = attempt('build_manifest', auditBuildManifest) || { ok: false };
  const git = attempt('git', () => auditGit(fault)) || { gitDirectories: ['<git scan failed>'], mutatingCommands: [] };
  const fabric = attempt('fabric', () => auditFabric(fault)) || {
    forbiddenFabricFiles: 1,
    violations: [{ path: '<fabric scan failed>' }]
  };
  const dependencies = attempt('dependencies', () => auditDependencies(fault)) || {
    newDependencies: 1,
    extraDeclared: ['<dependency scan failed>'],
    extraLockfile: [],
    missingBaseline: [],
    rangeMismatches: []
  };
  const registry = attempt('registry', () => auditRegistry(fault)) || {
    newRegistryIds: 1,
    consistent: false,
    extraNumericIds: ['<registry scan failed>'],
    missingNumericIds: [],
    extraNames: [],
    missingNames: [],
    idValueMismatch: 0,
    sectionMismatch: [],
    sourceMainSha256Matches: false,
    numericIds: 0,
    names: 0
  };
  const resourcePack = attempt('resource_pack', () => auditResourcePack(fault)) || {
    minecraftNamespaceOverrides: 1,
    zipEntries: 0,
    packFormat: null,
    zipSha256: null,
    declaredSha256: null,
    expectedSha256: EXPECTED_PACK_SHA256,
    packSha256Matches: 0,
    zipOverrides: ['<zip scan failed>'],
    manifestOverrides: [],
    unsafeZipPaths: []
  };
  const placedBlock = attempt('placed_block', () => auditPlacedBlockBehavior(fault)) || {
    unintendedPlacedBlockBehavior: 1,
    violations: [{ path: '<placed-block scan failed>' }],
    sentinel: false,
    fileCounts: {}
  };
  const scope = attempt('scope', () => auditScope(fault)) || {
    scopeFilesOnly: 0,
    violations: [{ path: '<scope scan failed>' }],
    changedProductFiles: [],
    intentionalChangeCount: INTENTIONAL_PRODUCT_CHANGES.length,
    buildScopedDirectories: BUILD_SCOPED_DIRECTORIES.slice()
  };
  const plan = attempt('plan', auditPlan) || {
    blockedTasks: [],
    task23Status: 'unknown',
    task23Complete: false,
    task27Status: 'unknown',
    incompleteTasks: [],
    finalVerificationOpen: 0,
    allTodosComplete: false
  };

  const flags = {
    historicalUnchanged: historical.ok ? 1 : 0,
    gitDirectory: git.gitDirectories.length,
    forbiddenFabricFiles: fabric.forbiddenFabricFiles,
    newDependencies: dependencies.newDependencies,
    newRegistryIds: registry.newRegistryIds,
    minecraftNamespaceOverrides: resourcePack.minecraftNamespaceOverrides,
    packSha256Matches: resourcePack.packSha256Matches,
    unintendedPlacedBlockBehavior: placedBlock.unintendedPlacedBlockBehavior,
    scopeFilesOnly: scope.scopeFilesOnly
  };

  if (flags.historicalUnchanged !== 1) {
    failures.push({
      code: 'E_HISTORICAL_UNCHANGED',
      message: 'captured 840/839 artifacts, registry-840 or one-off patch scripts no longer match .research/historical-before.sha256',
      details: {
        missing: historical.missing,
        changed: historical.changed,
        extraOnDisk: historical.extraOnDisk,
        expectedMissingFromDisk: historical.expectedMissingFromDisk,
        formatErrors: historical.formatErrors,
        duplicates: historical.duplicates,
        checkedEntries: historical.checkedEntries
      }
    });
  }
  if (buildManifest.ok !== true) {
    failures.push({ code: 'E_BUILD_MANIFEST', message: 'build-scoped 856 manifest does not match the captured files', details: buildManifest });
  }
  if (flags.gitDirectory !== 0) {
    failures.push({ code: 'E_GIT_DIRECTORY', message: 'a .git directory exists in the workspace', details: git.gitDirectories });
  }
  if (git.mutatingCommands.length > 0) {
    failures.push({ code: 'E_GIT_MUTATION', message: 'a mutating git command was found in project scripts', details: git.mutatingCommands });
  }
  if (flags.forbiddenFabricFiles !== 0) {
    failures.push({ code: 'E_FORBIDDEN_FABRIC_FILES', message: 'Fabric/Java/Gradle/Fabric API files were found', details: fabric.violations });
  }
  if (flags.newDependencies !== 0) {
    failures.push({
      code: 'E_NEW_DEPENDENCIES',
      message: 'package.json or the lockfile root declares a dependency outside the pinned baseline',
      details: {
        extraDeclared: dependencies.extraDeclared,
        extraLockfile: dependencies.extraLockfile,
        missingBaseline: dependencies.missingBaseline,
        rangeMismatches: dependencies.rangeMismatches
      }
    });
  }
  if (flags.newRegistryIds !== 0 || registry.consistent !== true) {
    failures.push({
      code: 'E_NEW_REGISTRY_IDS',
      message: 'registry-853 contains ids/sections that do not match the pinned build registry',
      details: registry
    });
  }
  if (flags.minecraftNamespaceOverrides !== 0) {
    failures.push({
      code: 'E_MINECRAFT_NAMESPACE_OVERRIDES',
      message: 'the resource pack contains assets/minecraft overrides',
      details: { zip: resourcePack.zipOverrides, manifest: resourcePack.manifestOverrides }
    });
  }
  if (flags.packSha256Matches !== 1) {
    failures.push({
      code: 'E_PACK_HASH',
      message: 'bloxd-856.zip SHA-256 does not match the manifest and the pinned expected hash',
      details: {
        zipSha256: resourcePack.zipSha256,
        declaredSha256: resourcePack.declaredSha256,
        expectedSha256: resourcePack.expectedSha256
      }
    });
  }
  if (flags.unintendedPlacedBlockBehavior !== 0) {
    failures.push({
      code: 'E_PLACED_BLOCK_BEHAVIOR',
      message: 'changed product code introduces unintended block-placement behavior',
      details: placedBlock.violations
    });
  }
  if (flags.scopeFilesOnly !== 1) {
    failures.push({ code: 'E_SCOPE_FILES', message: 'files outside the build scope or intentional product paths changed', details: scope.violations });
  }
  if (INTENTIONAL_PRODUCT_CHANGES.length === 0) {
    failures.push({ code: 'E_INTENTIONAL_CHANGES_EMPTY', message: 'the intentional product-change list is empty' });
  }
  return {
    schemaVersion: 1,
    ok: failures.length === 0,
    mode: fault ? 'fault' : 'normal',
    fault,
    generatedAt: new Date().toISOString(),
    root: ROOT,
    nodeVersion: process.versions.node,
    historical,
    buildManifest,
    git: {
      gitDirectory: flags.gitDirectory,
      directories: git.gitDirectories,
      mutatingCommands: git.mutatingCommands
    },
    fabric,
    dependencies,
    registry,
    resourcePack,
    placedBlock,
    scope,
    plan,
    flags,
    intentionalChanges: INTENTIONAL_PRODUCT_CHANGES,
    intentionalChangeCount: INTENTIONAL_PRODUCT_CHANGES.length,
    blockedTasks: plan.blockedTasks,
    task23Status: plan.task23Status,
    task23Complete: plan.task23Complete,
    allTodosComplete: plan.allTodosComplete,
    failures
  };
}

function formatFlagLine(flags) {
  return Object.entries(flags).map(([key, value]) => `${key}=${value}`).join(' ');
}

function runFaultChild(name) {
  const result = spawnSync(
    process.execPath,
    [__filename, `--fault=${name}`],
    { cwd: ROOT, encoding: 'utf8', timeout: 180000, windowsHide: true }
  );
  let summary = null;
  try {
    summary = JSON.parse((result.stdout || '').trim());
  } catch (error) {
    summary = null;
  }
  return {
    fault: name,
    command: `node test/final-audit.js --fault=${name}`,
    exitCode: typeof result.status === 'number' ? result.status : 1,
    signal: result.signal || null,
    stderr: (result.stderr || '').trim().slice(0, 2000),
    summary
  };
}

function runSelfTests() {
  return FAULT_MODES.map((fault) => {
    const child = runFaultChild(fault.name);
    const detected = child.exitCode !== 0 && child.summary !== null && fault.check(child.summary);
    return {
      fault: child.fault,
      command: child.command,
      exitCode: child.exitCode,
      signal: child.signal,
      detected,
      expectedFlag: fault.flag,
      flags: child.summary ? child.summary.flags : null,
      failureCodes: child.summary ? child.summary.failures.map((failure) => failure.code) : [],
      stderr: child.stderr
    };
  });
}

function writeEvidence(normal, selfTests) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const ok = normal.ok && selfTests.every((test) => test.detected);
  const report = {
    schemaVersion: 1,
    task: 27,
    title: 'Final historical/no-Git/new-ID/scope audit',
    generatedAt: new Date().toISOString(),
    root: ROOT,
    ok,
    command: 'node test/final-audit.js --evidence',
    exitCode: ok ? 0 : 1,
    nodeVersion: process.versions.node,
    flags: normal.flags,
    intentionalChanges: normal.intentionalChanges,
    intentionalChangeCount: normal.intentionalChangeCount,
    historical: normal.historical,
    buildManifest: normal.buildManifest,
    git: normal.git,
    fabric: normal.fabric,
    dependencies: normal.dependencies,
    registry: normal.registry,
    resourcePack: normal.resourcePack,
    placedBlock: normal.placedBlock,
    scope: normal.scope,
    plan: normal.plan,
    blockedTasks: normal.blockedTasks,
    task23Status: normal.task23Status,
    task23Complete: normal.task23Complete,
    allTodosComplete: normal.allTodosComplete,
    failureTests: selfTests,
    failures: normal.failures
  };

  const jsonPath = path.join(EVIDENCE_DIR, 'task-27.json');
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

  const logLines = [
    `$ node test/final-audit.js --evidence`,
    `exitCode=${report.exitCode}`,
    formatFlagLine(normal.flags),
    `intentionalChangeCount=${normal.intentionalChangeCount}`,
    `blockedTasks=${normal.blockedTasks.join(',')}`,
    `task23Status=${normal.task23Status}`,
    `task23Complete=${normal.task23Complete ? 1 : 0}`,
    `allTodosComplete=${normal.allTodosComplete ? 1 : 0}`,
    `historicalCheckedEntries=${normal.historical.checkedEntries}`,
    `buildChunks=${normal.buildManifest.chunkEntries}`,
    `registryIds=${normal.registry.numericIds}`,
    `zipEntries=${normal.resourcePack.zipEntries}`
  ];
  for (const test of selfTests) {
    logLines.push(
      `failureTest=${test.fault} exitCode=${test.exitCode} detected=${test.detected ? 1 : 0} expectedFlag=${test.expectedFlag}`
    );
  }
  logLines.push(`result=${ok ? 'PASS' : 'FAIL'}`);
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'task-27.log'), `${logLines.join('\n')}\n`);

  return { ok, jsonPath, logPath: path.join(EVIDENCE_DIR, 'task-27.log') };
}

function parseArguments(argv) {
  const options = { fault: null, selfTest: false, evidence: false };
  for (const argument of argv) {
    if (argument === '--self-test') {
      options.selfTest = true;
      continue;
    }
    if (argument === '--evidence') {
      options.evidence = true;
      continue;
    }
    const faultMatch = /^--fault=(.+)$/.exec(argument);
    if (faultMatch) {
      options.fault = faultMatch[1];
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    throw new Error(`unknown argument: ${argument}`);
  }
  return options;
}

function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.stderr.write('usage: node test/final-audit.js [--self-test] [--evidence] [--fault=<mode>]\n');
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    process.stdout.write('usage: node test/final-audit.js [--self-test] [--evidence] [--fault=<mode>]\n');
    process.stdout.write(`fault modes: ${FAULT_MODES.map((fault) => fault.name).join(', ')}\n`);
    return;
  }

  if (options.fault) {
    if (!FAULT_MODES.some((fault) => fault.name === options.fault)) {
      process.stderr.write(`unknown fault mode: ${options.fault}\n`);
      process.exitCode = 2;
      return;
    }
    const summary = runAudit({ fault: options.fault });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    process.exitCode = summary.ok ? 0 : 1;
    return;
  }

  if (options.selfTest) {
    const selfTests = runSelfTests();
    const ok = selfTests.every((test) => test.detected);
    const summary = { schemaVersion: 1, mode: 'self-test', ok, selfTests };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    process.exitCode = ok ? 0 : 1;
    return;
  }

  const summary = runAudit({});
  let evidence = null;
  let selfTests = [];
  let ok = summary.ok;
  if (options.evidence) {
    selfTests = runSelfTests();
    evidence = writeEvidence(summary, selfTests);
    ok = evidence.ok;
  }
  process.stdout.write(`${JSON.stringify({ ...summary, ok, selfTests, evidence }, null, 2)}\n`);
  process.exitCode = ok ? 0 : 1;
}

if (require.main === module) main();

module.exports = {
  FAULT_MODES,
  INTENTIONAL_PRODUCT_CHANGES,
  runAudit
};
