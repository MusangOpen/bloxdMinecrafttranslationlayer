'use strict';

const crypto = require('node:crypto');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIN_NODE_MAJOR = 22;
const EXPECTED_ENGINES_NODE = '>=22';
const EXPECTED_PINS = Object.freeze({
  'minecraft-protocol': '1.68.0',
  'minecraft-data': '3.117.0',
  'prismarine-chunk': '1.41.0',
  'prismarine-nbt': '2.8.0'
});
const PINS = Object.keys(EXPECTED_PINS);
const BASELINE_DEPENDENCY_NAMES = Object.freeze([
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
const BASELINE_DEPENDENCY_SET = new Set(BASELINE_DEPENDENCY_NAMES);
const FORBIDDEN_DIRECT_DEPENDENCY_NAMES = Object.freeze([
  'acorn',
  'adm-zip',
  'archiver',
  'ava',
  'axios',
  'got',
  'http-proxy',
  'jest',
  'jszip',
  'mocha',
  'node-fetch',
  'node-stream-zip',
  'request',
  'superagent',
  'tap',
  'tape',
  'undici',
  'unzipper',
  'vitest',
  'yauzl',
  'yazl'
]);
const HISTORICAL_MANIFEST = '.research/historical-before.sha256';
const HISTORICAL_DIRECTORIES = ['.research/live', 'game'];
// Product sources such as bloxd/protocol/live.js are intentionally upgraded and
// are therefore outside this captured-artifact immutability guard.
const HISTORICAL_FILES = ['bloxd/types/registry-840.json'];
const PATCH_SCRIPT_DIR = '.research';
const PATCH_SCRIPT_PATTERN = /^patch-.*\.js$/;

class PinError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'PinError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function absolutePath(relativePath) {
  return path.join(ROOT, ...relativePath.split('/'));
}

function relativePath(absoluteFilePath) {
  return path.relative(ROOT, absoluteFilePath).split(path.sep).join('/');
}

function compareStrings(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function walkDirectory(directory, files) {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => compareStrings(a.name, b.name));
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkDirectory(entryPath, files);
    } else if (entry.isSymbolicLink()) {
      throw new PinError('E_HISTORICAL_SYMLINK', `historical artifact is a symlink: ${relativePath(entryPath)}`);
    } else if (entry.isFile()) {
      files.push(entryPath);
    } else {
      throw new PinError('E_HISTORICAL_UNSUPPORTED_ENTRY', `unsupported historical artifact entry: ${relativePath(entryPath)}`);
    }
  }
}

function collectHistoricalEntries() {
  const files = [];
  for (const directory of HISTORICAL_DIRECTORIES) {
    const directoryPath = absolutePath(directory);
    if (!fs.existsSync(directoryPath)) {
      throw new PinError('E_HISTORICAL_DIRECTORY_MISSING', `historical directory is missing: ${directory}`);
    }
    walkDirectory(directoryPath, files);
  }
  for (const file of HISTORICAL_FILES) {
    const filePath = absolutePath(file);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new PinError('E_HISTORICAL_FILE_MISSING', `historical file is missing: ${file}`);
    }
    files.push(filePath);
  }
  const patchDirectory = absolutePath(PATCH_SCRIPT_DIR);
  for (const entry of fs.readdirSync(patchDirectory, { withFileTypes: true })) {
    if (entry.isFile() && PATCH_SCRIPT_PATTERN.test(entry.name)) {
      files.push(path.join(patchDirectory, entry.name));
    }
  }

  const hashes = new Map();
  for (const filePath of files) {
    const file = relativePath(filePath);
    if (hashes.has(file)) {
      throw new PinError('E_HISTORICAL_DUPLICATE_PATH', `historical artifact listed twice: ${file}`);
    }
    hashes.set(file, sha256File(filePath));
  }

  return Array.from(hashes, ([file, hash]) => ({ path: file, hash }))
    .sort((a, b) => compareStrings(a.path, b.path));
}

function formatHistoricalManifest(entries) {
  return entries.map((entry) => `${entry.hash}  ${entry.path}\n`).join('');
}

function parseHistoricalManifest(text) {
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const hashes = new Map();
  for (let index = 0; index < lines.length; index++) {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(lines[index]);
    if (!match) {
      throw new PinError('E_HISTORICAL_MANIFEST_FORMAT', `invalid historical manifest line ${index + 1}`);
    }
    if (hashes.has(match[2])) {
      throw new PinError('E_HISTORICAL_MANIFEST_FORMAT', `duplicate historical manifest path: ${match[2]}`);
    }
    hashes.set(match[2], match[1]);
  }
  return hashes;
}

function verifyHistoricalManifest(manifestText, entries) {
  if (manifestText === formatHistoricalManifest(entries)) {
    return { unchanged: true, fileCount: entries.length };
  }

  const expected = new Map(entries.map((entry) => [entry.path, entry.hash]));
  const actual = parseHistoricalManifest(manifestText);
  const missing = [];
  const added = [];
  const changed = [];

  for (const [file, hash] of expected) {
    if (!actual.has(file)) {
      missing.push(file);
    } else if (actual.get(file) !== hash) {
      changed.push({ path: file, expected: hash, actual: actual.get(file) });
    }
  }
  for (const file of actual.keys()) {
    if (!expected.has(file)) added.push(file);
  }

  const details = { missing, added, changed };
  if (changed.length > 0) {
    throw new PinError('E_HISTORICAL_HASH_CHANGED', `historical artifact hash changed: ${changed[0].path}`, details);
  }
  if (missing.length > 0) {
    throw new PinError('E_HISTORICAL_FILE_MISSING', `historical artifact missing from manifest: ${missing[0]}`, details);
  }
  if (added.length > 0) {
    throw new PinError('E_HISTORICAL_UNEXPECTED_FILE', `historical artifact not present in manifest: ${added[0]}`, details);
  }
  throw new PinError('E_HISTORICAL_MANIFEST_FORMAT', 'historical manifest is not in canonical sorted form', details);
}

function readText(relativeFilePath) {
  try {
    return fs.readFileSync(absolutePath(relativeFilePath), 'utf8');
  } catch (error) {
    throw new PinError('E_FILE_READ_FAILED', `cannot read ${relativeFilePath}: ${error.code || error.message}`);
  }
}

function readJson(relativeFilePath) {
  let text;
  try {
    text = readText(relativeFilePath);
  } catch (error) {
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new PinError('E_JSON_INVALID', `invalid JSON in ${relativeFilePath}: ${error.message}`);
  }
}

function readHistoricalManifestText() {
  const manifestPath = absolutePath(HISTORICAL_MANIFEST);
  if (!fs.existsSync(manifestPath)) {
    throw new PinError('E_HISTORICAL_MANIFEST_MISSING', `historical manifest is missing: ${HISTORICAL_MANIFEST}`);
  }
  return readText(HISTORICAL_MANIFEST);
}

function checkNodeVersion(version, minimumMajor) {
  const major = Number.parseInt(String(version).split('.')[0], 10);
  if (!Number.isInteger(major) || major < minimumMajor) {
    throw new PinError('E_NODE_MAJOR_TOO_OLD', `Node.js major ${major} is below required ${minimumMajor} (runtime ${version})`, {
      runtimeVersion: version,
      runtimeMajor: major,
      requiredMajor: minimumMajor
    });
  }
  return major;
}

function captureFailure(failures, fn) {
  try {
    return fn();
  } catch (error) {
    failures.push({
      code: error.code || 'E_CHECK_FAILED',
      message: error.message,
      details: error.details
    });
    return null;
  }
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeDependencyMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function analyzeNodeRuntime(version) {
  const major = Number.parseInt(String(version).split('.')[0], 10);
  const atLeast22 = Number.isInteger(major) && major >= MIN_NODE_MAJOR;
  const failures = atLeast22 ? [] : [{
    code: 'E_NODE_MAJOR_TOO_OLD',
    message: `runtime Node.js major ${major} is below required ${MIN_NODE_MAJOR} (runtime ${version})`,
    details: { runtimeVersion: version, runtimeMajor: major, requiredMajor: MIN_NODE_MAJOR }
  }];
  return { version, major, atLeast22, failures };
}

function analyzePackageDependencies(packageJson) {
  const failures = [];
  const dependencies = normalizeDependencyMap(packageJson.dependencies);
  const packageVersions = {};
  let packageJsonExact = true;

  for (const name of PINS) {
    const expected = EXPECTED_PINS[name];
    const actual = hasOwn(dependencies, name) ? dependencies[name] : null;
    packageVersions[name] = actual;
    if (actual !== expected) {
      packageJsonExact = false;
      failures.push({
        code: 'E_PACKAGE_PIN_MISMATCH',
        message: `package.json dependency ${name} must be exactly ${expected}, found ${JSON.stringify(actual)}`,
        details: { package: name, expected, actual }
      });
    }
  }

  const dependencyNames = Object.keys(dependencies).sort(compareStrings);
  const extraDependencies = dependencyNames.filter((name) => !BASELINE_DEPENDENCY_SET.has(name));
  const missingDependencies = BASELINE_DEPENDENCY_NAMES.filter((name) => !hasOwn(dependencies, name));
  for (const name of extraDependencies) {
    failures.push({
      code: 'E_NEW_DEPENDENCY',
      message: `package.json has an unexpected direct dependency: ${name}`,
      details: { package: name, range: dependencies[name] }
    });
  }
  for (const name of missingDependencies) {
    failures.push({
      code: 'E_MISSING_DEPENDENCY',
      message: `package.json is missing an expected direct dependency: ${name}`,
      details: { package: name }
    });
  }

  const enginesNode = packageJson.engines && packageJson.engines.node !== undefined
    ? packageJson.engines.node
    : null;
  const enginesNodeExact = enginesNode === EXPECTED_ENGINES_NODE;
  if (!enginesNodeExact) {
    failures.push({
      code: 'E_ENGINES_NODE_MISMATCH',
      message: `package.json engines.node must be exactly ${JSON.stringify(EXPECTED_ENGINES_NODE)}, found ${JSON.stringify(enginesNode)}`,
      details: { expected: EXPECTED_ENGINES_NODE, actual: enginesNode }
    });
  }

  return {
    dependencies,
    dependencyNames,
    packageVersions,
    packageJsonExact,
    extraDependencies,
    missingDependencies,
    newDependencies: extraDependencies.length,
    forbiddenDependencies: extraDependencies.filter((name) => FORBIDDEN_DIRECT_DEPENDENCY_NAMES.includes(name)),
    enginesNode,
    enginesNodeExact,
    failures
  };
}

function analyzeLockfile(packageLock, packageDependencies) {
  const failures = [];
  const packages = normalizeDependencyMap(packageLock.packages);
  const root = normalizeDependencyMap(packages['']);
  const rootDependencies = normalizeDependencyMap(root.dependencies);
  const lockfileRootDeclarations = {};
  const lockfileResolvedVersions = {};
  let pinRootExact = true;
  let pinResolvedExact = true;

  for (const name of PINS) {
    const expected = EXPECTED_PINS[name];
    const rootActual = hasOwn(rootDependencies, name) ? rootDependencies[name] : null;
    lockfileRootDeclarations[name] = rootActual;
    if (rootActual !== expected) {
      pinRootExact = false;
      failures.push({
        code: 'E_LOCKFILE_ROOT_PIN_MISMATCH',
        message: `package-lock.json root dependency ${name} must be exactly ${expected}, found ${JSON.stringify(rootActual)}`,
        details: { package: name, expected, actual: rootActual }
      });
    }

    const resolvedEntry = packages[`node_modules/${name}`];
    const resolvedActual = resolvedEntry && typeof resolvedEntry.version === 'string'
      ? resolvedEntry.version
      : null;
    lockfileResolvedVersions[name] = resolvedActual;
    if (resolvedActual !== expected) {
      pinResolvedExact = false;
      failures.push({
        code: 'E_LOCKFILE_RESOLVED_MISMATCH',
        message: `package-lock.json resolved ${name} must be exactly ${expected}, found ${JSON.stringify(resolvedActual)}`,
        details: { package: name, expected, actual: resolvedActual }
      });
    }
  }

  const packageNames = Object.keys(packageDependencies).sort(compareStrings);
  const lockNames = Object.keys(rootDependencies).sort(compareStrings);
  const lockfileRootExtras = lockNames.filter((name) => !hasOwn(packageDependencies, name));
  const lockfileRootMissing = packageNames.filter((name) => !hasOwn(rootDependencies, name));
  const lockfileRangeMismatches = [];
  for (const name of packageNames) {
    if (!hasOwn(rootDependencies, name) || rootDependencies[name] === packageDependencies[name]) continue;
    // The four exact pins are already compared against their expected value above.
    if (EXPECTED_PINS[name] !== undefined) continue;
    lockfileRangeMismatches.push({
      package: name,
      packageJson: packageDependencies[name],
      lockfile: rootDependencies[name]
    });
    failures.push({
      code: 'E_LOCKFILE_ROOT_RANGE_MISMATCH',
      message: `package-lock.json root range for ${name} differs from package.json`,
      details: lockfileRangeMismatches[lockfileRangeMismatches.length - 1]
    });
  }
  for (const name of lockfileRootExtras) {
    failures.push({
      code: 'E_LOCKFILE_ROOT_EXTRA',
      message: `package-lock.json root declares an unexpected dependency: ${name}`,
      details: { package: name, range: rootDependencies[name] }
    });
  }
  for (const name of lockfileRootMissing) {
    failures.push({
      code: 'E_LOCKFILE_ROOT_MISSING',
      message: `package-lock.json root is missing a dependency from package.json: ${name}`,
      details: { package: name }
    });
  }

  const lockfileRootExact = pinRootExact
    && lockfileRootExtras.length === 0
    && lockfileRootMissing.length === 0
    && lockfileRangeMismatches.length === 0;

  return {
    packages,
    lockfileVersion: packageLock.lockfileVersion === undefined ? null : packageLock.lockfileVersion,
    rootDependencies,
    lockfileRootDeclarations,
    lockfileResolvedVersions,
    lockfileRootExtras,
    lockfileRootMissing,
    lockfileRangeMismatches,
    lockfileRootExact,
    lockfileResolvedExact: pinResolvedExact,
    lockfileExact: lockfileRootExact && pinResolvedExact,
    failures
  };
}

function analyzeGitignore(gitignoreText) {
  const ignored = gitignoreText.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return false;
    return trimmed.replace(/^\/+/, '') === 'package-lock.json';
  });
  const failures = ignored ? [{
    code: 'E_LOCKFILE_IGNORED',
    message: '.gitignore must not ignore package-lock.json',
    details: { path: '.gitignore' }
  }] : [];
  return { ignored, failures };
}

function analyzeNpmLs(data) {
  const dependencies = normalizeDependencyMap(data.dependencies);
  const topLevelProblems = Array.isArray(data.problems) ? data.problems.map(String) : [];
  const criticalProblems = [];

  for (const name of BASELINE_DEPENDENCY_NAMES) {
    const entry = hasOwn(dependencies, name) ? dependencies[name] : null;
    if (!entry || typeof entry !== 'object') {
      criticalProblems.push({ package: name, problem: 'missing' });
      continue;
    }
    if (entry.missing === true) criticalProblems.push({ package: name, problem: 'missing' });
    if (entry.invalid === true) criticalProblems.push({ package: name, problem: 'invalid', version: entry.version });
    if (entry.extraneous === true) {
      criticalProblems.push({ package: name, problem: 'extraneous', version: entry.version });
    }
    if (EXPECTED_PINS[name] !== undefined) {
      const actual = typeof entry.version === 'string' ? entry.version : null;
      if (actual !== EXPECTED_PINS[name]) {
        criticalProblems.push({
          package: name,
          problem: 'version-mismatch',
          expected: EXPECTED_PINS[name],
          actual
        });
      }
    }
  }

  for (const name of Object.keys(dependencies).sort(compareStrings)) {
    if (!BASELINE_DEPENDENCY_SET.has(name)) {
      criticalProblems.push({ package: name, problem: 'extraneous' });
    }
  }

  const problemMessages = topLevelProblems.concat(
    criticalProblems.map((problem) => `${problem.problem}: ${problem.package}`)
  );
  return {
    dependencies,
    npmLsTopLevelProblems: topLevelProblems,
    npmLsCriticalProblems: criticalProblems,
    npmLsProblemMessages: problemMessages,
    npmLsProblems: topLevelProblems.length + criticalProblems.length
  };
}

function runNpmLs() {
  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  try {
    stdout = execSync('npm ls --depth=0 --json', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000,
      windowsHide: true
    });
  } catch (error) {
    exitCode = typeof error.status === 'number' ? error.status : 1;
    stdout = error.stdout ? String(error.stdout) : '';
    stderr = error.stderr ? String(error.stderr) : '';
  }

  let data = null;
  let parseError = null;
  try {
    data = JSON.parse(stdout.trim() || '{}');
  } catch (error) {
    parseError = error.message;
  }

  const analysis = analyzeNpmLs(data || {});
  const failures = [];
  if (parseError !== null) {
    failures.push({
      code: 'E_NPM_LS_UNPARSEABLE',
      message: `cannot parse npm ls --depth=0 --json output: ${parseError}`,
      details: { stderr: stderr.trim().slice(0, 2000) }
    });
  }
  if (exitCode !== 0) {
    failures.push({
      code: 'E_NPM_LS_EXIT_NONZERO',
      message: `npm ls --depth=0 --json exited ${exitCode}`,
      details: { exitCode, stderr: stderr.trim().slice(0, 2000) }
    });
  }
  if (analysis.npmLsProblems > 0) {
    failures.push({
      code: 'E_NPM_LS_PROBLEMS',
      message: `npm ls --depth=0 --json reported ${analysis.npmLsProblems} problem(s)`,
      details: { problems: analysis.npmLsProblemMessages }
    });
  }

  return {
    command: 'npm ls --depth=0 --json',
    exitCode,
    stderr: stderr.trim(),
    data,
    ...analysis,
    failures
  };
}

function runNormal() {
  const failures = [];
  const summary = {
    ok: false,
    mode: 'normal',
    nodeVersion: process.versions.node,
    nodeMajor: null,
    nodeMajorAtLeast22: false,
    enginesNode: null,
    enginesNodeExact: false,
    expectedPins: EXPECTED_PINS,
    packageVersions: {},
    packageJsonExact: false,
    lockfileVersion: null,
    lockfileRootDeclarations: {},
    lockfileResolvedVersions: {},
    lockfileRootExact: false,
    lockfileResolvedExact: false,
    lockfileExact: false,
    lockfileIgnored: null,
    historicalManifest: HISTORICAL_MANIFEST,
    historicalManifestSha256: null,
    historicalFileCount: 0,
    historicalUnchanged: false,
    selfTestModes: ['wrong-node-version', 'historical-hash-change'],
    failures
  };

  summary.nodeMajor = Number.parseInt(String(process.versions.node).split('.')[0], 10);
  summary.nodeMajorAtLeast22 = Number.isInteger(summary.nodeMajor) && summary.nodeMajor >= MIN_NODE_MAJOR;
  if (!summary.nodeMajorAtLeast22) {
    failures.push({
      code: 'E_NODE_MAJOR_TOO_OLD',
      message: `runtime Node.js major ${summary.nodeMajor} is below required ${MIN_NODE_MAJOR}`,
      details: { runtimeVersion: process.versions.node, runtimeMajor: summary.nodeMajor, requiredMajor: MIN_NODE_MAJOR }
    });
  }

  const packageJson = captureFailure(failures, () => readJson('package.json'));
  if (packageJson !== null) {
    const dependencies = packageJson.dependencies && typeof packageJson.dependencies === 'object'
      ? packageJson.dependencies
      : {};
    let packageJsonExact = true;
    for (const name of PINS) {
      const expected = EXPECTED_PINS[name];
      const actual = hasOwn(dependencies, name) ? dependencies[name] : null;
      summary.packageVersions[name] = actual;
      if (actual !== expected) {
        packageJsonExact = false;
        failures.push({
          code: 'E_PACKAGE_PIN_MISMATCH',
          message: `package.json dependency ${name} must be exactly ${expected}, found ${JSON.stringify(actual)}`,
          details: { package: name, expected, actual }
        });
      }
    }
    summary.packageJsonExact = packageJsonExact;

    summary.enginesNode = packageJson.engines && packageJson.engines.node !== undefined
      ? packageJson.engines.node
      : null;
    summary.enginesNodeExact = summary.enginesNode === EXPECTED_ENGINES_NODE;
    if (!summary.enginesNodeExact) {
      failures.push({
        code: 'E_ENGINES_NODE_MISMATCH',
        message: `package.json engines.node must be exactly ${JSON.stringify(EXPECTED_ENGINES_NODE)}, found ${JSON.stringify(summary.enginesNode)}`,
        details: { expected: EXPECTED_ENGINES_NODE, actual: summary.enginesNode }
      });
    }
  }

  const packageLock = captureFailure(failures, () => readJson('package-lock.json'));
  if (packageLock !== null) {
    const packages = packageLock.packages && typeof packageLock.packages === 'object'
      ? packageLock.packages
      : {};
    const root = packages[''] && typeof packages[''] === 'object' ? packages[''] : {};
    const rootDependencies = root.dependencies && typeof root.dependencies === 'object'
      ? root.dependencies
      : {};
    summary.lockfileVersion = packageLock.lockfileVersion === undefined ? null : packageLock.lockfileVersion;

    let rootExact = true;
    let resolvedExact = true;
    for (const name of PINS) {
      const expected = EXPECTED_PINS[name];
      const rootActual = hasOwn(rootDependencies, name) ? rootDependencies[name] : null;
      summary.lockfileRootDeclarations[name] = rootActual;
      if (rootActual !== expected) {
        rootExact = false;
        failures.push({
          code: 'E_LOCKFILE_ROOT_PIN_MISMATCH',
          message: `package-lock.json root dependency ${name} must be exactly ${expected}, found ${JSON.stringify(rootActual)}`,
          details: { package: name, expected, actual: rootActual }
        });
      }

      const resolvedEntry = packages[`node_modules/${name}`];
      const resolvedActual = resolvedEntry && typeof resolvedEntry.version === 'string'
        ? resolvedEntry.version
        : null;
      summary.lockfileResolvedVersions[name] = resolvedActual;
      if (resolvedActual !== expected) {
        resolvedExact = false;
        failures.push({
          code: 'E_LOCKFILE_RESOLVED_MISMATCH',
          message: `package-lock.json resolved ${name} must be exactly ${expected}, found ${JSON.stringify(resolvedActual)}`,
          details: { package: name, expected, actual: resolvedActual }
        });
      }
    }
    summary.lockfileRootExact = rootExact;
    summary.lockfileResolvedExact = resolvedExact;
    summary.lockfileExact = rootExact && resolvedExact;
  }

  const gitignoreText = captureFailure(failures, () => readText('.gitignore'));
  if (gitignoreText !== null) {
    const ignored = gitignoreText.split(/\r?\n/).some((line) => {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) return false;
      return trimmed.replace(/^\/+/, '') === 'package-lock.json';
    });
    summary.lockfileIgnored = ignored;
    if (ignored) {
      failures.push({
        code: 'E_LOCKFILE_IGNORED',
        message: '.gitignore must not ignore package-lock.json',
        details: { path: '.gitignore' }
      });
    }
  }

  const manifestText = captureFailure(failures, readHistoricalManifestText);
  if (manifestText !== null) {
    summary.historicalManifestSha256 = crypto.createHash('sha256').update(manifestText).digest('hex');
    const entries = captureFailure(failures, collectHistoricalEntries);
    if (entries !== null) {
      summary.historicalFileCount = entries.length;
      try {
        verifyHistoricalManifest(manifestText, entries);
        summary.historicalUnchanged = true;
      } catch (error) {
        failures.push({
          code: error.code || 'E_HISTORICAL_CHECK_FAILED',
          message: error.message,
          details: error.details
        });
      }
    }
  }

  summary.ok = failures.length === 0;
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = summary.ok ? 0 : 1;
}

function runFinal() {
  const failures = [];
  const node = analyzeNodeRuntime(process.versions.node);
  failures.push(...node.failures);

  let packageAnalysis = {
    dependencies: {},
    dependencyNames: [],
    packageVersions: {},
    packageJsonExact: false,
    extraDependencies: [],
    missingDependencies: [],
    newDependencies: null,
    forbiddenDependencies: [],
    enginesNode: null,
    enginesNodeExact: false
  };
  const packageJson = captureFailure(failures, () => readJson('package.json'));
  if (packageJson !== null) {
    packageAnalysis = analyzePackageDependencies(packageJson);
    failures.push(...packageAnalysis.failures);
  }

  let lockAnalysis = {
    lockfileVersion: null,
    lockfileRootDeclarations: {},
    lockfileResolvedVersions: {},
    lockfileRootExtras: [],
    lockfileRootMissing: [],
    lockfileRangeMismatches: [],
    lockfileRootExact: false,
    lockfileResolvedExact: false,
    lockfileExact: false
  };
  const packageLock = captureFailure(failures, () => readJson('package-lock.json'));
  if (packageLock !== null) {
    lockAnalysis = analyzeLockfile(packageLock, packageAnalysis.dependencies);
    failures.push(...lockAnalysis.failures);
  }

  let gitignoreAnalysis = { ignored: null };
  const gitignoreText = captureFailure(failures, () => readText('.gitignore'));
  if (gitignoreText !== null) {
    gitignoreAnalysis = analyzeGitignore(gitignoreText);
    failures.push(...gitignoreAnalysis.failures);
  }

  const npmLs = runNpmLs();
  failures.push(...npmLs.failures);

  const exactVersions = {};
  for (const name of PINS) {
    exactVersions[name] = {
      expected: EXPECTED_PINS[name],
      packageJson: hasOwn(packageAnalysis.packageVersions, name) ? packageAnalysis.packageVersions[name] : null,
      lockfileRoot: hasOwn(lockAnalysis.lockfileRootDeclarations, name) ? lockAnalysis.lockfileRootDeclarations[name] : null,
      lockfileResolved: hasOwn(lockAnalysis.lockfileResolvedVersions, name) ? lockAnalysis.lockfileResolvedVersions[name] : null,
      npmLs: hasOwn(npmLs.dependencies, name) && typeof npmLs.dependencies[name].version === 'string'
        ? npmLs.dependencies[name].version
        : null
    };
  }
  const allFourExact = PINS.every((name) => {
    const pin = exactVersions[name];
    return pin.packageJson === pin.expected
      && pin.lockfileRoot === pin.expected
      && pin.lockfileResolved === pin.expected
      && pin.npmLs === pin.expected;
  });
  if (!allFourExact) {
    failures.push({
      code: 'E_EXACT_VERSIONS_MISMATCH',
      message: 'not all four exact dependency versions agree across package.json, lockfile root, resolved lockfile entry and npm ls',
      details: { exactVersions }
    });
  }

  const summary = {
    ok: failures.length === 0,
    mode: 'final',
    nodeVersion: node.version,
    nodeMajor: node.major,
    nodeMajorAtLeast22: node.atLeast22,
    enginesNode: packageAnalysis.enginesNode,
    enginesNodeExact: packageAnalysis.enginesNodeExact,
    expectedPins: EXPECTED_PINS,
    exactVersions,
    allFourExact,
    packageVersions: packageAnalysis.packageVersions,
    packageJsonExact: packageAnalysis.packageJsonExact,
    dependencies: packageAnalysis.dependencyNames,
    dependencyCount: packageAnalysis.dependencyNames.length,
    newDependencies: packageAnalysis.newDependencies,
    newDependencyNames: packageAnalysis.extraDependencies,
    missingDependencies: packageAnalysis.missingDependencies.length,
    missingDependencyNames: packageAnalysis.missingDependencies,
    forbiddenDependencies: packageAnalysis.forbiddenDependencies,
    lockfileVersion: lockAnalysis.lockfileVersion,
    lockfileRootDeclarations: lockAnalysis.lockfileRootDeclarations,
    lockfileResolvedVersions: lockAnalysis.lockfileResolvedVersions,
    lockfileRootExact: lockAnalysis.lockfileRootExact,
    lockfileResolvedExact: lockAnalysis.lockfileResolvedExact,
    lockfileExact: lockAnalysis.lockfileExact,
    lockfileIgnored: gitignoreAnalysis.ignored,
    npmLsCommand: npmLs.command,
    npmLsExitCode: npmLs.exitCode,
    npmLsProblems: npmLs.npmLsProblems,
    npmLsProblemMessages: npmLs.npmLsProblemMessages,
    npmLsCriticalProblems: npmLs.npmLsCriticalProblems,
    selfTestModes: ['pin-drift', 'node-21', 'extra-dependency', 'missing-package'],
    failures
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = summary.ok ? 0 : 1;
}

function runPinDriftSelfTest() {
  const packageJson = cloneJson(readJson('package.json'));
  const packageLock = cloneJson(readJson('package-lock.json'));

  packageJson.dependencies['minecraft-protocol'] = '^1.68.0';
  const packageAnalysis = analyzePackageDependencies(packageJson);
  const caretDetected = packageAnalysis.failures.some((failure) => (
    failure.code === 'E_PACKAGE_PIN_MISMATCH' && failure.details.package === 'minecraft-protocol'
  ));

  packageLock.packages[''].dependencies['minecraft-data'] = '^3.117.0';
  packageLock.packages['node_modules/prismarine-chunk'].version = '1.40.0';
  const lockAnalysis = analyzeLockfile(packageLock, packageJson.dependencies);
  const lockRootDriftDetected = lockAnalysis.failures.some((failure) => (
    failure.code === 'E_LOCKFILE_ROOT_PIN_MISMATCH' && failure.details.package === 'minecraft-data'
  ));
  const lockResolvedDriftDetected = lockAnalysis.failures.some((failure) => (
    failure.code === 'E_LOCKFILE_RESOLVED_MISMATCH' && failure.details.package === 'prismarine-chunk'
  ));

  const detected = caretDetected && lockRootDriftDetected && lockResolvedDriftDetected;
  process.stdout.write(`${JSON.stringify({
    ok: !detected,
    selfTest: true,
    mode: 'pin-drift',
    detected,
    caretDetected,
    lockRootDriftDetected,
    lockResolvedDriftDetected,
    codes: [
      ...packageAnalysis.failures.map((failure) => failure.code),
      ...lockAnalysis.failures.map((failure) => failure.code)
    ],
    message: detected
      ? 'caret range and lockfile drift were rejected'
      : 'pin-drift self-test did not reject every simulated drift'
  }, null, 2)}\n`);
  process.exitCode = detected ? 1 : 2;
}

function runNode21SelfTest() {
  const simulatedVersion = '21.9.0';
  let detected = false;
  let code = null;
  let message = null;
  try {
    checkNodeVersion(simulatedVersion, MIN_NODE_MAJOR);
  } catch (error) {
    detected = error.code === 'E_NODE_MAJOR_TOO_OLD';
    code = error.code || 'E_UNKNOWN';
    message = error.message;
  }

  process.stdout.write(`${JSON.stringify({
    ok: !detected,
    selfTest: true,
    mode: 'node-21',
    detected,
    code: detected ? code : 'E_SELF_TEST_NOT_DETECTED',
    message: detected ? message : 'node-21 self-test did not reject the simulated Node.js version',
    simulatedVersion,
    requiredMajor: MIN_NODE_MAJOR
  }, null, 2)}\n`);
  process.exitCode = detected ? 1 : 2;
}

function runExtraDependencySelfTest() {
  const packageJson = cloneJson(readJson('package.json'));
  packageJson.dependencies.acorn = '^8.15.0';
  const packageAnalysis = analyzePackageDependencies(packageJson);
  const packageDetected = packageAnalysis.newDependencies === 1
    && packageAnalysis.extraDependencies.includes('acorn')
    && packageAnalysis.failures.some((failure) => (
      failure.code === 'E_NEW_DEPENDENCY' && failure.details.package === 'acorn'
    ));
  const forbiddenDetected = packageAnalysis.forbiddenDependencies.includes('acorn');

  const installed = {};
  for (const name of BASELINE_DEPENDENCY_NAMES) {
    installed[name] = { version: EXPECTED_PINS[name] || '0.0.0' };
  }
  installed.acorn = { version: '8.15.0', extraneous: true };
  const npmAnalysis = analyzeNpmLs({
    dependencies: installed,
    problems: ['extraneous: acorn@8.15.0']
  });
  const npmLsDetected = npmAnalysis.npmLsProblems > 0
    && npmAnalysis.npmLsCriticalProblems.some((problem) => problem.package === 'acorn');

  const detected = packageDetected && forbiddenDetected && npmLsDetected;
  process.stdout.write(`${JSON.stringify({
    ok: !detected,
    selfTest: true,
    mode: 'extra-dependency',
    detected,
    packageDetected,
    forbiddenDetected,
    npmLsDetected,
    newDependencies: packageAnalysis.newDependencies,
    extraDependencies: packageAnalysis.extraDependencies,
    forbiddenDependencies: packageAnalysis.forbiddenDependencies,
    npmLsProblems: npmAnalysis.npmLsProblems,
    message: detected
      ? 'extra direct dependency acorn was rejected by every check'
      : 'extra-dependency self-test did not reject the simulated acorn dependency'
  }, null, 2)}\n`);
  process.exitCode = detected ? 1 : 2;
}

function runMissingPackageSelfTest() {
  const packageJson = cloneJson(readJson('package.json'));
  const packageLock = cloneJson(readJson('package-lock.json'));
  delete packageJson.dependencies['prismarine-nbt'];
  delete packageLock.packages[''].dependencies['prismarine-nbt'];
  delete packageLock.packages['node_modules/prismarine-nbt'];

  const packageAnalysis = analyzePackageDependencies(packageJson);
  const packageDetected = packageAnalysis.missingDependencies.includes('prismarine-nbt')
    && packageAnalysis.failures.some((failure) => (
      failure.code === 'E_PACKAGE_PIN_MISMATCH' && failure.details.package === 'prismarine-nbt'
    ));

  const lockAnalysis = analyzeLockfile(packageLock, packageJson.dependencies);
  const lockRootDetected = lockAnalysis.failures.some((failure) => (
    failure.code === 'E_LOCKFILE_ROOT_PIN_MISMATCH' && failure.details.package === 'prismarine-nbt'
  ));
  const lockResolvedDetected = lockAnalysis.failures.some((failure) => (
    failure.code === 'E_LOCKFILE_RESOLVED_MISMATCH' && failure.details.package === 'prismarine-nbt'
  ));

  const installed = {};
  for (const name of BASELINE_DEPENDENCY_NAMES) {
    if (name === 'prismarine-nbt') continue;
    installed[name] = { version: EXPECTED_PINS[name] || '0.0.0' };
  }
  const npmAnalysis = analyzeNpmLs({ dependencies: installed });
  const npmLsDetected = npmAnalysis.npmLsProblems > 0
    && npmAnalysis.npmLsCriticalProblems.some((problem) => (
      problem.package === 'prismarine-nbt' && problem.problem === 'missing'
    ));

  const detected = packageDetected && lockRootDetected && lockResolvedDetected && npmLsDetected;
  process.stdout.write(`${JSON.stringify({
    ok: !detected,
    selfTest: true,
    mode: 'missing-package',
    detected,
    packageDetected,
    lockRootDetected,
    lockResolvedDetected,
    npmLsDetected,
    missingDependencies: packageAnalysis.missingDependencies,
    npmLsProblems: npmAnalysis.npmLsProblems,
    message: detected
      ? 'missing package prismarine-nbt was rejected by package, lockfile and npm ls checks'
      : 'missing-package self-test did not reject every simulated missing package case'
  }, null, 2)}\n`);
  process.exitCode = detected ? 1 : 2;
}

function runWrongNodeVersionSelfTest() {
  const simulatedVersion = '20.19.0';
  let detected = false;
  let code = null;
  let message = null;
  try {
    checkNodeVersion(simulatedVersion, MIN_NODE_MAJOR);
  } catch (error) {
    detected = error.code === 'E_NODE_MAJOR_TOO_OLD';
    code = error.code || 'E_UNKNOWN';
    message = error.message;
  }

  process.stdout.write(`${JSON.stringify({
    ok: !detected,
    selfTest: true,
    mode: 'wrong-node-version',
    detected,
    code: detected ? code : 'E_SELF_TEST_NOT_DETECTED',
    message: detected ? message : 'wrong-node-version self-test did not reject the simulated Node.js version',
    simulatedVersion,
    requiredMajor: MIN_NODE_MAJOR
  }, null, 2)}\n`);
  process.exitCode = detected ? 1 : 2;
}

function runHistoricalHashChangeSelfTest() {
  const entries = collectHistoricalEntries();
  const firstHash = entries.length > 0 ? entries[0].hash : '';
  const replacement = firstHash === '0'.repeat(64) ? '1'.repeat(64) : '0'.repeat(64);
  const mutatedEntries = entries.map((entry, index) => (
    index === 0 ? { path: entry.path, hash: replacement } : entry
  ));
  const mutatedManifest = formatHistoricalManifest(mutatedEntries);

  let detected = false;
  let code = null;
  let message = null;
  let pathWithChangedHash = null;
  try {
    verifyHistoricalManifest(mutatedManifest, entries);
  } catch (error) {
    detected = error.code === 'E_HISTORICAL_HASH_CHANGED';
    code = error.code || 'E_UNKNOWN';
    message = error.message;
    if (error.details && Array.isArray(error.details.changed) && error.details.changed.length > 0) {
      pathWithChangedHash = error.details.changed[0].path;
    }
  }

  process.stdout.write(`${JSON.stringify({
    ok: !detected,
    selfTest: true,
    mode: 'historical-hash-change',
    detected,
    code: detected ? code : 'E_SELF_TEST_NOT_DETECTED',
    message: detected ? message : 'historical-hash-change self-test did not reject a changed hash',
    pathWithChangedHash,
    fileCount: entries.length
  }, null, 2)}\n`);
  process.exitCode = detected ? 1 : 2;
}

function writeHistoricalManifest() {
  const entries = collectHistoricalEntries();
  const text = formatHistoricalManifest(entries);
  const manifestPath = absolutePath(HISTORICAL_MANIFEST);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, text, 'utf8');
  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: 'write-manifest',
    manifest: HISTORICAL_MANIFEST,
    fileCount: entries.length,
    manifestSha256: crypto.createHash('sha256').update(text).digest('hex')
  }, null, 2)}\n`);
}

function printUsageAndFail() {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    mode: 'usage',
    code: 'E_USAGE',
    message: 'usage: node test/version-pins.js [--final | --write-manifest | --self-test wrong-node-version | --self-test historical-hash-change | --self-test pin-drift | --self-test node-21 | --self-test extra-dependency | --self-test missing-package]'
  }, null, 2)}\n`);
  process.exitCode = 2;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    runNormal();
  } else if (args.length === 1 && args[0] === '--final') {
    runFinal();
  } else if (args.length === 1 && args[0] === '--write-manifest') {
    writeHistoricalManifest();
  } else if (args.length === 2 && args[0] === '--self-test' && args[1] === 'wrong-node-version') {
    runWrongNodeVersionSelfTest();
  } else if (args.length === 2 && args[0] === '--self-test' && args[1] === 'historical-hash-change') {
    runHistoricalHashChangeSelfTest();
  } else if (args.length === 2 && args[0] === '--self-test' && args[1] === 'pin-drift') {
    runPinDriftSelfTest();
  } else if (args.length === 2 && args[0] === '--self-test' && args[1] === 'node-21') {
    runNode21SelfTest();
  } else if (args.length === 2 && args[0] === '--self-test' && args[1] === 'extra-dependency') {
    runExtraDependencySelfTest();
  } else if (args.length === 2 && args[0] === '--self-test' && args[1] === 'missing-package') {
    runMissingPackageSelfTest();
  } else {
    printUsageAndFail();
  }
}

main();
