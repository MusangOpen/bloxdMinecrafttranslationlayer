'use strict';

/**
 * Required offline/local suite aggregator.
 *
 * This runner is intentionally strict: it executes every suite in the manifest
 * exactly once (no retry-until-pass), captures stdout/stderr/exit code, parses a
 * machine-readable summary, rejects SKIP/TODO/pending markers, rejects zero
 * assertion evidence, verifies the resource-pack SHA-256/SHA-1 pair, writes a
 * timestamped aggregate report and records per-suite evidence with hashes.
 *
 * Live Bloxd and actual Fabric UI/render are external BLOCKED reports. They are
 * never part of the manifest suite list and cannot turn the required suite green.
 *
 * Usage:
 *   node test/required-suite.js
 *   node test/required-suite.js --manifest <file>
 *   node test/required-suite.js --self-test
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const util = require('util');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_MANIFEST = path.join(__dirname, 'required-suites.json');
const EVIDENCE_ROOT = path.join(ROOT, '.omo', 'evidence', 'update-bloxd-mc-1-21-11-fabric');
const SELFTEST_FIXTURE_DIR = path.join(ROOT, 'test', 'fixtures', 'required-selftest');
const FORBIDDEN_MARKER_RE = /(?<![A-Za-z0-9_=])(SKIP|TODO|PENDING)(?![A-Za-z0-9_=])|\bit\.todo\b/i;
const MAX_BUFFER = 64 * 1024 * 1024;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha1(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function getPath(value, dottedPath) {
  if (!dottedPath) return value;
  return dottedPath.split('.').reduce((current, key) => {
    if (current === undefined || current === null) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(key)) return current[Number(key)];
    return current[key];
  }, value);
}

function compactTimestamp(date) {
  return date.toISOString().replace(/[-:.]/g, '');
}

function normalizeCommand(command) {
  if (!Array.isArray(command) || command.length === 0) {
    throw new Error('suite.command must be a non-empty array');
  }
  const normalized = command.slice();
  if (normalized[0] === 'node' || normalized[0] === 'node.exe') {
    normalized[0] = process.execPath;
  }
  return normalized;
}

function findJsonEnd(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const character = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === '{' || character === '[') {
      depth += 1;
    } else if (character === '}' || character === ']') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function extractJsonValues(text) {
  const values = [];
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character !== '{' && character !== '[') continue;
    const end = findJsonEnd(text, index);
    if (end < 0) continue;
    try {
      values.push(JSON.parse(text.slice(index, end + 1)));
    } catch (_error) {
      // Not a complete JSON value; continue scanning.
    }
    index = end;
  }
  return values;
}

function parseKeyValue(text) {
  const result = {};
  const pattern = /\b([A-Za-z][A-Za-z0-9_]*)=([^\s]+)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const key = match[1];
    const raw = match[2].replace(/[,;]+$/, '');
    result[key] = /^-?\d+$/.test(raw) ? Number(raw) : raw;
  }
  return result;
}

function parseHarnessResult(text) {
  const match = /^HARNESS_RESULT\s+(\{.*\})\s*$/m.exec(text);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (_error) {
    return null;
  }
}

function parseSummary(suite, context) {
  const config = suite.summary || {};
  let sourceText;
  if (config.source === 'file') {
    const file = path.resolve(context.runDir, config.path || '');
    if (!fs.existsSync(file)) {
      return { value: null, error: `summary file missing: ${file}` };
    }
    try {
      return { value: JSON.parse(fs.readFileSync(file, 'utf8')), error: null };
    } catch (error) {
      return { value: null, error: `summary file is not JSON: ${error.message}` };
    }
  }

  sourceText = context.stdout;
  if (config.format === 'harness-result') {
    const value = parseHarnessResult(sourceText);
    return value === null
      ? { value: null, error: 'HARNESS_RESULT line missing or invalid' }
      : { value, error: null };
  }
  if (config.format === 'keyvalue') {
    const value = parseKeyValue(`${context.stdout}\n${context.stderr}`);
    return Object.keys(value).length > 0
      ? { value, error: null }
      : { value: null, error: 'no key=value summary found' };
  }

  const values = extractJsonValues(sourceText);
  if (values.length === 0) {
    return { value: null, error: 'no machine-readable JSON summary found on stdout' };
  }
  const value = config.pick === 'first' ? values[0] : values[values.length - 1];
  return { value, error: null };
}

function assertionValue(summary, descriptor) {
  const raw = getPath(summary, descriptor.path);
  if (descriptor.mode === 'length') {
    if (Array.isArray(raw) || typeof raw === 'string') return raw.length;
    return null;
  }
  if (descriptor.mode === 'objectKeys') {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return Object.keys(raw).length;
    return null;
  }
  if (descriptor.mode === 'sumField') {
    if (!Array.isArray(raw) || !descriptor.field) return null;
    return raw.reduce((total, entry) => {
      const value = Number(getPath(entry, descriptor.field));
      return total + (Number.isFinite(value) ? value : 0);
    }, 0);
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function checkSummary(summary, suite, packInfo) {
  const checks = [];

  if (!suite.assertions || !suite.assertions.path) {
    checks.push({ name: 'assertions-declared', ok: false, expected: 'manifest assertions descriptor', actual: null });
    return checks;
  }
  const assertionCount = assertionValue(summary, suite.assertions);
  const minimum = suite.assertions.min === undefined ? 1 : suite.assertions.min;
  checks.push({
    name: 'assertions>0',
    ok: assertionCount !== null && assertionCount >= minimum,
    expected: `>=${minimum}`,
    actual: assertionCount
  });

  for (const check of suite.checks || []) {
    const actual = getPath(summary, check.path);
    if (check.type === 'equals') {
      checks.push({
        name: `equals:${check.path}`,
        ok: util.isDeepStrictEqual(actual, check.value),
        expected: check.value,
        actual
      });
    } else if (check.type === 'min') {
      checks.push({
        name: `min:${check.path}`,
        ok: typeof actual === 'number' && actual >= check.value,
        expected: `>=${check.value}`,
        actual
      });
    } else if (check.type === 'max') {
      checks.push({
        name: `max:${check.path}`,
        ok: typeof actual === 'number' && actual <= check.value,
        expected: `<=${check.value}`,
        actual
      });
    } else if (check.type === 'length') {
      checks.push({
        name: `length:${check.path}`,
        ok: Array.isArray(actual) && actual.length === check.value,
        expected: check.value,
        actual: Array.isArray(actual) ? actual.length : actual
      });
    } else if (check.type === 'lengthMin') {
      checks.push({
        name: `lengthMin:${check.path}`,
        ok: Array.isArray(actual) && actual.length >= check.value,
        expected: `>=${check.value}`,
        actual: Array.isArray(actual) ? actual.length : actual
      });
    } else if (check.type === 'equalsPath') {
      const other = getPath(summary, check.other);
      checks.push({
        name: `equalsPath:${check.path}`,
        ok: util.isDeepStrictEqual(actual, other),
        expected: other,
        actual
      });
    } else if (check.type === 'equalsPackSha256') {
      checks.push({
        name: 'packSha256',
        ok: actual === packInfo.sha256,
        expected: packInfo.sha256,
        actual
      });
    } else if (check.type === 'equalsPackSha1') {
      checks.push({
        name: 'packSha1',
        ok: actual === packInfo.sha1,
        expected: packInfo.sha1,
        actual
      });
    } else {
      checks.push({ name: `unknown:${check.type}`, ok: false, expected: 'known check type', actual: check.type });
    }
  }

  return checks;
}

function countSkips(summary) {
  let count = 0;
  if (Array.isArray(summary && summary.skips)) count += summary.skips.length;
  if (typeof (summary && summary.skipped) === 'number') count += summary.skipped;
  if (summary && summary.summary) count += countSkips(summary.summary);
  return count;
}

function collectStringValues(value, output) {
  if (typeof value === 'string') {
    output.push(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) collectStringValues(entry, output);
  } else if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) collectStringValues(entry, output);
  }
  return output;
}

function validateManifest(manifest) {
  const problems = [];
  if (!manifest || typeof manifest !== 'object') {
    return ['manifest is not an object'];
  }
  if (manifest.schemaVersion !== 1) problems.push('schemaVersion must be 1');
  if (!Array.isArray(manifest.suites) || manifest.suites.length === 0) {
    problems.push('suites must be a non-empty array');
    return problems;
  }
  if (!Number.isInteger(manifest.suiteCount) || manifest.suiteCount !== manifest.suites.length) {
    problems.push(`suiteCount ${manifest.suiteCount} must equal suites.length ${manifest.suites.length}`);
  }
  if (!manifest.report || typeof manifest.report.evidenceDir !== 'string') {
    problems.push('report.evidenceDir is required');
  }
  if (!manifest.pack || typeof manifest.pack.zip !== 'string' || typeof manifest.pack.manifest !== 'string') {
    problems.push('pack.zip and pack.manifest are required');
  }

  const ids = new Set();
  let lastOrder = -Infinity;
  const positions = new Map();
  manifest.suites.forEach((suite, index) => {
    if (!suite || typeof suite.id !== 'string' || suite.id.length === 0) {
      problems.push(`suite ${index}: id is required`);
      return;
    }
    if (ids.has(suite.id)) problems.push(`duplicate suite id ${suite.id}`);
    ids.add(suite.id);
    positions.set(suite.id, index);
    if (!Number.isInteger(suite.order)) {
      problems.push(`${suite.id}: order must be an integer`);
    } else {
      if (suite.order <= lastOrder) problems.push(`${suite.id}: order must be strictly increasing`);
      lastOrder = suite.order;
    }
    if (!Array.isArray(suite.command) || suite.command.length === 0) {
      problems.push(`${suite.id}: command must be a non-empty array`);
    }
    if (!suite.summary || !suite.summary.source) problems.push(`${suite.id}: summary descriptor is required`);
    if (!suite.assertions || !suite.assertions.path) problems.push(`${suite.id}: assertions descriptor is required`);
  });

  manifest.suites.forEach((suite) => {
    for (const dependency of suite.dependsOn || []) {
      if (!positions.has(dependency)) {
        problems.push(`${suite.id}: unknown dependency ${dependency}`);
      } else if (positions.get(dependency) >= positions.get(suite.id)) {
        problems.push(`${suite.id}: dependency ${dependency} must appear before it`);
      }
    }
  });

  return problems;
}

function inspectPack(manifest) {
  const config = manifest.pack || {};
  const zipPath = path.resolve(ROOT, config.zip || '');
  const manifestPath = path.resolve(ROOT, config.manifest || '');
  const result = {
    zipPath,
    manifestPath,
    zipExists: fs.existsSync(zipPath),
    manifestExists: fs.existsSync(manifestPath),
    sha256: null,
    sha1: null,
    size: null,
    entries: null,
    manifestSha256: null,
    expectedSha256: null,
    expectedSize: null,
    expectedEntries: null,
    hashMatches: false,
    sizeMatches: false,
    entriesMatch: false,
    valid: false,
    error: null
  };

  try {
    if (result.zipExists) {
      const bytes = fs.readFileSync(zipPath);
      result.sha256 = sha256(bytes);
      result.sha1 = sha1(bytes);
      result.size = bytes.length;
    }
    if (result.manifestExists) {
      const manifestBytes = fs.readFileSync(manifestPath);
      result.manifestSha256 = sha256(manifestBytes);
      const packManifest = JSON.parse(manifestBytes.toString('utf8'));
      result.expectedSha256 = getPath(packManifest, config.expectedSha256Path || 'pack.zipSha256');
      result.expectedSize = getPath(packManifest, config.expectedSizePath || 'pack.zipSize');
      result.expectedEntries = getPath(packManifest, config.expectedEntriesPath || 'pack.zipEntries');
      result.entries = Array.isArray(packManifest.files) ? packManifest.files.length : null;
      result.hashMatches = result.sha256 !== null && result.sha256 === result.expectedSha256;
      result.sizeMatches = result.size !== null && result.size === result.expectedSize;
      result.entriesMatch = result.entries !== null && result.entries === result.expectedEntries;
    }
  } catch (error) {
    result.error = error.message;
  }

  result.valid =
    result.zipExists &&
    result.manifestExists &&
    result.error === null &&
    result.hashMatches &&
    result.sizeMatches &&
    result.entriesMatch;
  return result;
}

function writeExternalStatusReports(manifest, runDir, timestamp) {
  const statuses = manifest.externalStatuses || {};
  const reports = {};
  for (const [key, config] of Object.entries(statuses)) {
    const value = config && config.value;
    const report = {
      status: value,
      reason: config && config.reason,
      timestamp,
      canAffectRequiredSuite: false,
      suiteIncluded: false
    };
    reports[key] = report;
    const fileName = (config && config.report) || `${key}.json`;
    fs.writeFileSync(path.join(runDir, fileName), `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(path.join(runDir, fileName.replace(/\.json$/, '.log')), `${key}=${value} ${report.reason}\n`);
    if (manifest.report && manifest.report.writeTask26) {
      fs.writeFileSync(path.join(EVIDENCE_ROOT, fileName), `${JSON.stringify(report, null, 2)}\n`);
      fs.writeFileSync(path.join(EVIDENCE_ROOT, fileName.replace(/\.json$/, '.log')), `${key}=${value} ${report.reason}\n`);
    }
  }
  return reports;
}

function executeSuite(suite, context) {
  const startedAt = new Date();
  const command = normalizeCommand(suite.command);
  const environment = Object.assign({}, process.env, {
    BLOXD_EVIDENCE_DIR: context.runDir
  });
  const spawned = spawnSync(command[0], command.slice(1), {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: suite.timeoutMs || 180000,
    maxBuffer: MAX_BUFFER,
    env: environment,
    windowsHide: true
  });
  const finishedAt = new Date();
  const stdout = spawned.stdout || '';
  const stderr = spawned.stderr || '';
  const exitCode = spawned.status;
  const durationMs = finishedAt.getTime() - startedAt.getTime();
  const timedOut = Boolean(spawned.error && (spawned.error.code === 'ETIMEDOUT' || spawned.error.killed));

  const logPath = path.join(context.runDir, `${suite.id}.log`);
  const logText = [
    `COMMAND ${command.join(' ')}`,
    `CWD ${ROOT}`,
    `STARTED ${startedAt.toISOString()}`,
    `FINISHED ${finishedAt.toISOString()}`,
    `EXIT ${exitCode === null ? 'null' : exitCode}`,
    `TIMED_OUT ${timedOut ? 1 : 0}`,
    '--- STDOUT ---',
    stdout,
    '--- STDERR ---',
    stderr
  ].join('\n');
  fs.writeFileSync(logPath, `${logText}\n`);

  const checks = [];
  if (timedOut) {
    checks.push({ name: 'child-timeout', ok: false, expected: `<=${suite.timeoutMs || 180000}ms`, actual: durationMs });
  }
  if (exitCode !== 0) {
    checks.push({ name: 'child-exit', ok: false, expected: 0, actual: exitCode });
  }

  const parsed = parseSummary(suite, { stdout, stderr, runDir: context.runDir });
  if (parsed.error) {
    checks.push({ name: 'summary', ok: false, expected: 'machine-readable summary', actual: parsed.error });
  } else {
    checks.push(...checkSummary(parsed.value, suite, context.pack));
  }

  const summaryStrings = collectStringValues(parsed.value, []);
  const markerText = `${stdout}\n${stderr}\n${summaryStrings.join('\n')}`;
  const markerHit = FORBIDDEN_MARKER_RE.test(markerText);
  if (markerHit) {
    checks.push({ name: 'forbidden-marker', ok: false, expected: 'no SKIP/TODO/pending marker', actual: markerHit });
  }
  const skips = countSkips(parsed.value) + (markerHit ? 1 : 0);
  if (skips !== 0) {
    checks.push({ name: 'skips', ok: false, expected: 0, actual: skips });
  }

  const ok = checks.every((check) => check.ok);
  const recordPath = path.join(context.runDir, `${suite.id}.json`);
  const record = {
    suiteId: suite.id,
    order: suite.order,
    command,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs,
    exitCode,
    timedOut,
    ok,
    assertions: parsed.value === null ? null : assertionValue(parsed.value, suite.assertions),
    skips,
    checks,
    summary: parsed.value,
    summaryError: parsed.error,
    logPath,
    logSha256: sha256(fs.readFileSync(logPath)),
    logBytes: fs.statSync(logPath).size
  };
  fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);

  if (context.fault === 'delete-evidence') {
    fs.rmSync(recordPath, { force: true });
  }

  return {
    record,
    logPath,
    recordPath,
    stdout,
    stderr,
    checkFailures: checks.filter((check) => !check.ok).length
  };
}

function buildEvidenceIndex(suiteRuns, runDir) {
  const entries = [];
  for (const run of suiteRuns) {
    for (const kind of ['log', 'json']) {
      const file = kind === 'log' ? run.logPath : run.recordPath;
      const present = fs.existsSync(file);
      entries.push({
        suiteId: run.record.suiteId,
        kind,
        path: path.relative(runDir, file),
        present,
        size: present ? fs.statSync(file).size : null,
        sha256: present ? sha256(fs.readFileSync(file)) : null
      });
    }
  }
  const indexPath = path.join(runDir, 'evidence-index.json');
  fs.writeFileSync(indexPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2)}\n`);
  return { entries, indexPath };
}

function verifyEvidenceIndex(index) {
  const missing = [];
  const invalid = [];
  for (const entry of index.entries) {
    if (!entry.present) {
      missing.push(entry.path);
      continue;
    }
    const file = path.resolve(path.dirname(index.indexPath), entry.path);
    if (!fs.existsSync(file)) {
      missing.push(entry.path);
      continue;
    }
    if (fs.statSync(file).size !== entry.size || sha256(fs.readFileSync(file)) !== entry.sha256) {
      invalid.push(entry.path);
    }
  }
  return { missing, invalid };
}

function readDependencyVersions() {
  const packageJson = readJson(path.join(ROOT, 'package.json'));
  const dependencies = {};
  for (const [name, declared] of Object.entries(packageJson.dependencies || {})) {
    let installed = null;
    try {
      installed = readJson(path.join(ROOT, 'node_modules', name, 'package.json')).version;
    } catch (_error) {
      installed = null;
    }
    dependencies[name] = { declared, installed };
  }
  return dependencies;
}

function readPlanStatus(manifest) {
  const planConfig = manifest.plan || {};
  const planPath = path.resolve(ROOT, planConfig.path || '');
  const requested = Array.isArray(planConfig.blockedTaskIds) ? planConfig.blockedTaskIds : [];
  const statuses = {};
  let lines = [];
  try {
    lines = fs.readFileSync(planPath, 'utf8').split(/\r?\n/);
  } catch (_error) {
    lines = [];
  }
  for (const id of requested) {
    const pattern = new RegExp(`^-\\s*\\[([ x~])\\]\\s*${id}\\.`);
    const line = lines.find((candidate) => pattern.test(candidate));
    if (!line) {
      statuses[id] = 'missing';
      continue;
    }
    const marker = pattern.exec(line)[1];
    statuses[id] = marker === '~' ? 'blocked' : marker === 'x' ? 'completed' : 'pending';
  }
  const blocked = requested.filter((id) => statuses[id] === 'blocked');
  return { statuses, blocked, planPath };
}

function reportFlags(manifest, state) {
  return {
    requiredSuites: manifest.suiteCount,
    executedSuites: state.executedSuites,
    allExecuted: state.allExecuted,
    skips: state.skips,
    failures: state.failures,
    missingEvidence: state.missingEvidence,
    artifactsValid: state.artifactsValid,
    liveStatus: state.liveStatus,
    fabricUiStatus: state.fabricUiStatus,
    planBlockedTasks: state.planBlockedTasks,
    task23Status: state.task23Status,
    nodeVersion: process.version,
    nodeMajor: Number.parseInt(process.versions.node.split('.')[0], 10),
    packSha256: state.pack.sha256,
    packSha1: state.pack.sha1,
    assertions: state.assertions
  };
}

function flagsLine(ok, manifest, state) {
  const flags = reportFlags(manifest, state);
  const display = Object.entries(flags)
    .map(([key, value]) => `${key}=${value === null ? 'null' : value}`)
    .join(' ');
  return `REQUIRED SUITE ${ok ? 'PASS' : 'FAIL'} ${display}`;
}

function writeAggregate(manifest, state, runDir, reportPath, reportLogPath, exitCode) {
  const report = {
    schemaVersion: 1,
    ok: state.ok,
    exitCode,
    timestamp: state.timestamp,
    durationMs: state.durationMs,
    manifest: state.manifestPath,
    runDir,
    reportPath,
    reportLogPath,
    requiredSuites: manifest.suiteCount,
    executedSuites: state.executedSuites,
    allExecuted: state.allExecuted,
    skips: state.skips,
    failures: state.failures,
    missingEvidence: state.missingEvidence,
    artifactsValid: state.artifactsValid,
    liveStatus: state.liveStatus,
    fabricUiStatus: state.fabricUiStatus,
    planBlockedTasks: state.planBlockedTasks.map(Number),
    planBlockedTasksDisplay: state.planBlockedTasks.join(','),
    task23Status: state.task23Status,
    task23Complete: false,
    nodeVersion: process.version,
    nodeMajor: Number.parseInt(process.versions.node.split('.')[0], 10),
    platform: process.platform,
    arch: process.arch,
    dependencies: state.dependencies,
    pack: state.pack,
    manifestProblems: state.manifestProblems,
    excluded: manifest.excluded || [],
    suiteResults: state.suiteRuns.map((run) => ({
      suiteId: run.record.suiteId,
      order: run.record.order,
      command: run.record.command,
      exitCode: run.record.exitCode,
      timedOut: run.record.timedOut,
      durationMs: run.record.durationMs,
      ok: run.record.ok,
      assertions: run.record.assertions,
      skips: run.record.skips,
      checkFailures: run.checkFailures,
      logPath: run.record.logPath,
      logSha256: run.record.logSha256
    })),
    evidenceIndex: state.index ? { path: state.index.indexPath, entries: state.index.entries } : null,
    evidenceVerification: state.evidenceVerification,
    externalStatusReports: state.externalStatusReports
  };

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  const logLines = [
    `COMMAND npm run test:required`,
    `MANIFEST ${state.manifestPath}`,
    `TIMESTAMP ${state.timestamp}`,
    `EXIT ${exitCode}`,
    '',
    ...state.suiteRuns.map(
      (run) =>
        `SUITE ${run.record.ok ? 'PASS' : 'FAIL'} ${run.record.suiteId} ` +
        `exit=${run.record.exitCode} assertions=${run.record.assertions} durationMs=${run.record.durationMs}`
    ),
    '',
    flagsLine(state.ok, manifest, state),
    `REQUIRED_SUITE_RESULT ${JSON.stringify(reportFlags(manifest, state))}`,
    `REPORT ${reportPath}`,
    `LIVE_STATUS ${state.liveStatus}`,
    `FABRIC_UI_STATUS ${state.fabricUiStatus}`,
    `PLAN_BLOCKED_TASKS ${state.planBlockedTasks.join(',')}`,
    `TASK23_STATUS ${state.task23Status}`
  ];
  fs.writeFileSync(reportLogPath, `${logLines.join('\n')}\n`);

  if (manifest.report && manifest.report.writeTask26) {
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'task-26.json'), `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'task-26.log'), `${logLines.join('\n')}\n`);
  }

  return { report, logLines };
}

function runManifest(manifest, manifestPath, options) {
  const started = Date.now();
  const startDate = new Date(started);
  const timestamp = startDate.toISOString();
  const stamp = compactTimestamp(startDate);
  const evidenceRoot = path.resolve(ROOT, (manifest.report && manifest.report.evidenceDir) || path.join('.omo', 'evidence', 'required'));
  const runDir = path.join(evidenceRoot, stamp);
  fs.mkdirSync(runDir, { recursive: true });

  const externalStatusReports = writeExternalStatusReports(manifest, runDir, timestamp);
  const manifestProblems = validateManifest(manifest);
  const plan = readPlanStatus(manifest);
  const packBefore = inspectPack(manifest);
  const suiteRuns = [];
  let skips = 0;
  let assertions = 0;

  if (manifestProblems.length === 0) {
    for (const suite of manifest.suites) {
      const run = executeSuite(suite, {
        runDir,
        pack: packBefore,
        fault: options.fault || null
      });
      suiteRuns.push(run);
      skips += run.record.skips;
      assertions += Number.isFinite(run.record.assertions) ? run.record.assertions : 0;
    }
  }

  const packAfter = inspectPack(manifest);
  const pack = {
    ...packBefore,
    after: packAfter,
    stable: packBefore.sha256 === packAfter.sha256 && packBefore.sha1 === packAfter.sha1,
    valid: packBefore.valid && packAfter.valid && packBefore.sha256 === packAfter.sha256
  };
  const index = suiteRuns.length > 0 ? buildEvidenceIndex(suiteRuns, runDir) : null;
  const evidenceVerification = index ? verifyEvidenceIndex(index) : { missing: [], invalid: [] };

  const packMissing = (pack.zipExists ? 0 : 1) + (pack.manifestExists ? 0 : 1);
  const missingEvidence = packMissing + evidenceVerification.missing.length;
  const invalidEvidence = evidenceVerification.invalid.length;
  const executedSuites = suiteRuns.length;
  const failedSuites = suiteRuns.filter((run) => !run.record.ok).length;
  const failures = failedSuites + missingEvidence + invalidEvidence + (pack.valid ? 0 : 1) + (manifestProblems.length > 0 ? 1 : 0) + skips;
  const allExecuted = manifestProblems.length === 0 && executedSuites === manifest.suiteCount ? 1 : 0;
  const artifactsValid = pack.valid && missingEvidence === 0 && invalidEvidence === 0 ? 1 : 0;
  const liveStatus = getPath(manifest, 'externalStatuses.liveStatus.value') || 'BLOCKED';
  const fabricUiStatus = getPath(manifest, 'externalStatuses.fabricUiStatus.value') || 'BLOCKED_UNVERIFIED';
  const planBlockedTasks = plan.blocked.map(String);
  const task23Status = plan.statuses[23] || 'not-tracked';
  const ok =
    manifestProblems.length === 0 &&
    allExecuted === 1 &&
    failures === 0 &&
    skips === 0 &&
    missingEvidence === 0 &&
    artifactsValid === 1;

  const state = {
    ok,
    timestamp,
    durationMs: Date.now() - started,
    manifestPath,
    runDir,
    pack,
    suiteRuns,
    index,
    evidenceVerification,
    externalStatusReports,
    executedSuites,
    allExecuted,
    skips,
    failures,
    missingEvidence,
    artifactsValid,
    liveStatus,
    fabricUiStatus,
    planBlockedTasks,
    task23Status,
    dependencies: readDependencyVersions(),
    manifestProblems,
    assertions
  };

  const reportPath = path.join(runDir, `required-suite-${stamp}.json`);
  const reportLogPath = path.join(runDir, `required-suite-${stamp}.log`);
  const exitCode = ok ? 0 : 1;
  const { report, logLines } = writeAggregate(manifest, state, runDir, reportPath, reportLogPath, exitCode);

  for (const line of logLines.filter((line) => line.startsWith('SUITE ') || line.startsWith('REQUIRED SUITE '))) {
    console.log(line);
  }
  for (const run of suiteRuns) {
    if (run.record.ok) continue;
    for (const check of run.record.checks) {
      if (check.ok) continue;
      console.log(
        `FAILURE ${run.record.suiteId} ${check.name} expected=${JSON.stringify(check.expected)} actual=${JSON.stringify(check.actual)}`
      );
    }
  }
  if (manifestProblems.length > 0) {
    for (const problem of manifestProblems) console.log(`MANIFEST_PROBLEM ${problem}`);
  }
  console.log(flagsLine(ok, manifest, state));
  console.log(`REQUIRED_SUITE_RESULT ${JSON.stringify(reportFlags(manifest, state))}`);
  console.log(`REPORT ${reportPath}`);
  console.log(`LIVE_STATUS ${liveStatus}`);
  console.log(`FABRIC_UI_STATUS ${fabricUiStatus}`);
  console.log(`PLAN_BLOCKED_TASKS ${planBlockedTasks.join(',')}`);
  console.log(`TASK23_STATUS ${task23Status}`);
  return { ok, exitCode, report };
}

function runSelfTests() {
  const cases = [
    { key: 'childExit', manifest: 'child-exit.json', extra: [] },
    { key: 'skipMarker', manifest: 'skip-marker.json', extra: [] },
    { key: 'deletedEvidence', manifest: 'delete-evidence.json', extra: ['--fault', 'delete-evidence'] },
    { key: 'staleHash', manifest: 'stale-hash.json', extra: [] }
  ];
  const results = [];
  for (const testCase of cases) {
    const manifestPath = path.join(SELFTEST_FIXTURE_DIR, testCase.manifest);
    const spawned = spawnSync(
      process.execPath,
      [__filename, '--manifest', manifestPath, ...testCase.extra],
      {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 180000,
        maxBuffer: MAX_BUFFER,
        env: Object.assign({}, process.env, { BLOXD_REQUIRED_SUITE_SELFTEST: '1' }),
        windowsHide: true
      }
    );
    const output = `${spawned.stdout || ''}\n${spawned.stderr || ''}`;
    const rejected = spawned.status !== 0 && output.includes('REQUIRED SUITE FAIL');
    results.push({
      name: testCase.key,
      exitCode: spawned.status,
      rejected,
      outputTail: output.trim().split(/\r?\n/).slice(-4)
    });
  }

  const ok = results.every((result) => result.rejected);
  const values = {};
  for (const result of results) values[result.name] = result.rejected ? 'nonzero' : 'zero';
  console.log(
    `SELFTEST ${ok ? 'PASS' : 'FAIL'} childExit=${values.childExit} skipMarker=${values.skipMarker} ` +
      `deletedEvidence=${values.deletedEvidence} staleHash=${values.staleHash} checks=${results.length}`
  );
  console.log(JSON.stringify({ ok, checks: results.length, results }));
  return ok ? 0 : 1;
}

function parseArguments(argv) {
  const options = { manifestPath: DEFAULT_MANIFEST, fault: null, selfTest: false };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--self-test') {
      options.selfTest = true;
    } else if (argument === '--manifest') {
      options.manifestPath = path.resolve(ROOT, argv[++index] || '');
    } else if (argument === '--fault') {
      options.fault = argv[++index] || '';
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

function main(argv) {
  const options = parseArguments(argv);
  if (options.selfTest) return runSelfTests();

  let manifest;
  try {
    manifest = readJson(options.manifestPath);
  } catch (error) {
    console.error(`REQUIRED SUITE FAIL manifest-unreadable expected=valid-json actual=${error.message}`);
    return 1;
  }

  const fixtureRoot = path.resolve(SELFTEST_FIXTURE_DIR) + path.sep;
  if (options.fault && !path.resolve(options.manifestPath).startsWith(fixtureRoot)) {
    console.error('REQUIRED SUITE FAIL fault-injection is only allowed with required-selftest fixtures');
    return 2;
  }

  const result = runManifest(manifest, options.manifestPath, options);
  return result.exitCode;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = {
  extractJsonValues,
  parseKeyValue,
  parseHarnessResult,
  validateManifest,
  inspectPack
};
