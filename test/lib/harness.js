'use strict';

/**
 * Shared assertion harness for the offline tests.
 *
 * The historical tests printed FAIL/SKIP and still exited 0, so their exit
 * codes could not be trusted. This module makes the checks and the process exit
 * code agree:
 *   - a missing required packet/schema, timeout, adapter write failure, client
 *     error, server error or required SKIP is always a failure;
 *   - a test that asserted nothing is always a failure;
 *   - a new anomaly must be registered in baseline-defects.json before it can be
 *     reported as known.
 *
 * It is deliberately dependency-free (Node built-ins only).
 */

const fs = require('fs');
const path = require('path');
const util = require('util');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_BASELINE_PATH = path.join(
  ROOT,
  '.research',
  'builds',
  'tcwczu-357faec1',
  'baseline-defects.json'
);
const DEFECT_ID_RE = /^BLX-[A-Z0-9]+-\d{3}$/;

const ADAPTER_ERROR_PATTERNS = [
  /\[mc\] failed to write/i,
  /\[protocol\] failed to encode/i,
  /\[protocol\] unknown outbound packet/i
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stringify(value) {
  try {
    return JSON.stringify(value, (_key, entry) => (typeof entry === 'bigint' ? entry.toString() : entry));
  } catch (_error) {
    return String(value);
  }
}

function errorDetails(error) {
  if (!error) return null;
  return {
    name: error.name || 'Error',
    message: error.message || String(error),
    stack: typeof error.stack === 'string' ? error.stack : undefined
  };
}

function getPath(object, dottedPath) {
  return dottedPath.split('.').reduce((value, key) => (value === undefined || value === null ? undefined : value[key]), object);
}

class Harness {
  constructor(options = {}) {
    this.name = options.name || path.basename(process.argv[1] || 'test');
    this.verbose = Boolean(options.verbose);
    this.assertions = 0;
    this.failures = [];
    this.skips = [];
    this.timeouts = [];
    this.adapterWriteErrors = [];
    this.knownDefects = [];
    this.baseline = null;
    this.baselineById = new Map();
    this._cleanups = [];
    this._cleaned = false;
    this._finished = false;
    this._watchingAdapterErrors = false;
  }

  fail(code, message, details) {
    this.failures.push({ code, message, details: details === undefined ? undefined : details });
    return false;
  }

  assert(condition, label, details) {
    this.assertions += 1;
    if (!condition) this.fail('E_ASSERTION', label, details);
    return Boolean(condition);
  }

  check(label, fn) {
    this.assertions += 1;
    try {
      const result = fn();
      if (result === false) throw new Error('check returned false');
      return true;
    } catch (error) {
      this.fail('E_ASSERTION', label, { error: errorDetails(error) });
      return false;
    }
  }

  assertEqual(actual, expected, label, details) {
    this.assertions += 1;
    if (!util.isDeepStrictEqual(actual, expected)) {
      this.fail('E_ASSERTION', label, { expected, actual, ...details });
      return false;
    }
    return true;
  }

  assertField(object, dottedPath, expected, label, details) {
    return this.assertEqual(getPath(object, dottedPath), expected, label, { field: dottedPath, ...details });
  }

  requirePackets(required, seen, label = 'required packets') {
    const observed = seen instanceof Set ? Array.from(seen) : Object.keys(seen || {});
    const missing = required.filter((name) => (seen instanceof Set ? !seen.has(name) : !(name in seen)));
    this.assertions += 1;
    if (missing.length > 0) {
      this.fail('E_MISSING_PACKET', `${label}: missing ${missing.join(', ')}`, {
        required: Array.from(required),
        missing,
        observed
      });
    }
    return missing;
  }

  async waitFor(label, predicate, options = {}) {
    this.assertions += 1;
    const timeoutMs = options.timeoutMs === undefined ? 5000 : options.timeoutMs;
    const intervalMs = options.intervalMs === undefined ? 20 : options.intervalMs;
    const startedAt = Date.now();
    let lastError = null;

    while (true) {
      try {
        if (await predicate()) return true;
      } catch (error) {
        lastError = error;
      }
      const elapsed = Date.now() - startedAt;
      if (elapsed >= timeoutMs) break;
      await delay(Math.min(intervalMs, timeoutMs - elapsed));
    }

    this.timeouts.push({ label, timeoutMs, lastError: errorDetails(lastError) });
    this.fail('E_TIMEOUT', `${label}: timed out after ${timeoutMs}ms`, {
      label,
      timeoutMs,
      lastError: errorDetails(lastError)
    });
    return false;
  }

  async waitForPackets(required, seen, options = {}) {
    const label = options.label || 'required packets';
    const arrived = await this.waitFor(
      label,
      () => required.every((name) => seen.has(name)),
      options
    );
    if (!arrived) this.requirePackets(required, seen, label);
    return arrived;
  }

  requireSchema(raw, name, id, direction = 'inbound') {
    const schema = raw && Object.prototype.hasOwnProperty.call(raw, 'schema') ? raw.schema : raw;
    this.assertions += 1;
    if (schema === undefined || schema === null) {
      this.fail('E_MISSING_SCHEMA', `${direction} ${name} (id ${id}) has no bundle schema`, {
        direction,
        name,
        id
      });
      return false;
    }
    return true;
  }

  skip(label, reason) {
    this.skips.push({ label, reason });
    this.fail('E_REQUIRED_SKIP', `required check skipped: ${label}`, { reason });
    return false;
  }

  recordClientError(error, details) {
    return this.fail('E_CLIENT_ERROR', `client error: ${error && error.message ? error.message : String(error)}`, {
      error: errorDetails(error),
      ...details
    });
  }

  recordServerError(error, details) {
    return this.fail('E_SERVER_ERROR', `server error: ${error && error.message ? error.message : String(error)}`, {
      error: errorDetails(error),
      ...details
    });
  }

  recordAdapterWriteError(message, details) {
    this.adapterWriteErrors.push({ message, details });
    return this.fail('E_ADAPTER_WRITE', message, details);
  }

  watchAdapterErrors() {
    if (this._watchingAdapterErrors) return null;
    this._watchingAdapterErrors = true;
    const original = console.error;
    const harness = this;
    const wrapped = function wrappedConsoleError(...args) {
      const message = args
        .map((arg) => (typeof arg === 'string' ? arg : (arg && arg.message) || stringify(arg)))
        .join(' ');
      if (ADAPTER_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
        harness.recordAdapterWriteError(message);
      }
      original.apply(console, args);
    };
    console.error = wrapped;
    const restore = () => {
      if (console.error === wrapped) console.error = original;
      harness._watchingAdapterErrors = false;
    };
    this.onCleanup(restore);
    return restore;
  }

  onCleanup(fn) {
    this._cleanups.push(fn);
  }

  async cleanup() {
    if (this._cleaned) return;
    this._cleaned = true;
    const cleanups = this._cleanups.splice(0).reverse();
    for (const fn of cleanups) {
      try {
        await fn();
      } catch (error) {
        this.fail('E_CLEANUP', 'cleanup failed', { error: errorDetails(error) });
      }
    }
  }

  loadBaseline(file = DEFAULT_BASELINE_PATH) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      this.fail('E_BASELINE_MISSING', `cannot read baseline ledger ${file}`, { error: errorDetails(error) });
      return null;
    }

    const problems = [];
    if (data.schemaVersion !== 1) problems.push('schemaVersion must be 1');
    if (!Array.isArray(data.defects) || data.defects.length === 0) problems.push('defects must be a non-empty array');

    const byId = new Map();
    for (const defect of data.defects || []) {
      if (!defect || typeof defect !== 'object') {
        problems.push('defect must be an object');
        continue;
      }
      if (!DEFECT_ID_RE.test(defect.id || '')) problems.push(`invalid defect id ${defect.id}`);
      if (byId.has(defect.id)) problems.push(`duplicate defect id ${defect.id}`);
      if (!defect.category) problems.push(`${defect.id}: category is required`);
      if (!defect.title) problems.push(`${defect.id}: title is required`);
      if (!Array.isArray(defect.evidence) || defect.evidence.length === 0) {
        problems.push(`${defect.id}: evidence is required`);
      } else {
        for (const item of defect.evidence) {
          if (!item || typeof item.path !== 'string' || item.path.length === 0) {
            problems.push(`${defect.id}: evidence.path is required`);
          }
          if (!item || typeof item.fact !== 'string' || item.fact.length === 0) {
            problems.push(`${defect.id}: evidence.fact is required`);
          }
          if (!item || (typeof item.lines !== 'string' && typeof item.pointer !== 'string')) {
            problems.push(`${defect.id}: evidence.lines or evidence.pointer is required`);
          }
        }
      }
      byId.set(defect.id, defect);
    }

    if (problems.length > 0) {
      this.fail('E_BASELINE_INVALID', 'baseline ledger is invalid', { file, problems });
      return null;
    }

    this.baseline = data;
    this.baselineById = byId;
    return data;
  }

  noteDefect(id, observation, label) {
    if (!this.baselineById || this.baselineById.size === 0) {
      this.fail('E_BASELINE_NOT_LOADED', 'noteDefect called before loadBaseline', { id });
      return false;
    }
    const defect = this.baselineById.get(id);
    if (!defect) {
      this.fail('E_UNREGISTERED_DEFECT', `unregistered anomaly ${id}`, {
        id,
        label,
        observation
      });
      return false;
    }
    this.knownDefects.push({ id, category: defect.category, observation });
    if (this.verbose) console.log(`KNOWN_DEFECT ${id} ${defect.title}`);
    return true;
  }

  result(extra = {}) {
    const ok =
      this.failures.length === 0 &&
      this.skips.length === 0 &&
      this.timeouts.length === 0 &&
      this.adapterWriteErrors.length === 0;
    return {
      test: this.name,
      ok,
      assertions: this.assertions,
      failures: this.failures,
      skips: this.skips,
      timeouts: this.timeouts,
      adapterWriteErrors: this.adapterWriteErrors,
      knownDefects: this.knownDefects,
      pendingCleanups: this._cleanups.length,
      ...extra
    };
  }

  writeEvidence(file, extra = {}) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(this.result(extra), null, 2)}\n`);
    return file;
  }

  finish(options = {}) {
    if (this.assertions === 0 && !this._finished) {
      this.fail('E_ZERO_ASSERTIONS', 'test completed without asserting anything');
    }
    this._finished = true;

    const result = this.result();
    const ok = result.ok;

    if (options.print !== false) {
      console.log(`HARNESS_RESULT ${stringify(result)}`);
      console.log(
        `${ok ? 'PASS' : 'FAIL'} ${this.name} assertions=${this.assertions} ` +
          `failures=${this.failures.length} skips=${this.skips.length} ` +
          `timeouts=${this.timeouts.length} adapterWriteErrors=${this.adapterWriteErrors.length} ` +
          `knownDefects=${this.knownDefects.length}`
      );
    }

    return ok ? 0 : 1;
  }
}

function createHarness(options) {
  return new Harness(options);
}

function runSelfTest(mode) {
  const harness = createHarness({ name: `harness-selftest-${mode}`, verbose: true });

  switch (mode) {
    case 'missingPacket':
      harness.requirePackets(['login'], new Set(), 'self-test packets');
      break;
    case 'skip':
      harness.skip('bundle schema', 'self-test deliberately missing schema');
      break;
    case 'writeError':
      harness.recordAdapterWriteError('[mc] failed to write system_chat: injected self-test failure');
      break;
    case 'zeroAssertions':
      break;
    case 'unregisteredAnomaly': {
      harness.loadBaseline();
      harness.noteDefect('BLX-999-999', { injected: true }, 'self-test unregistered anomaly');
      harness.assert(true, 'self-test continued after anomaly');
      break;
    }
    case 'knownDefect': {
      harness.loadBaseline();
      harness.noteDefect('BLX-840-001', { injected: 'self-test baseline read' }, 'self-test known defect');
      harness.assert(true, 'self-test known defect is registered');
      break;
    }
    case 'pass':
      harness.assert(true, 'self-test control assertion');
      break;
    default:
      console.error(`unknown harness self-test mode: ${mode}`);
      return 2;
  }

  return harness.finish();
}

if (require.main === module) {
  const index = process.argv.indexOf('--self-test');
  if (index === -1 || !process.argv[index + 1]) {
    console.error('usage: node test/lib/harness.js --self-test <missingPacket|skip|writeError|zeroAssertions|unregisteredAnomaly|knownDefect|pass>');
    process.exit(2);
  }
  process.exit(runSelfTest(process.argv[index + 1]));
}

module.exports = {
  Harness,
  createHarness,
  DEFAULT_BASELINE_PATH
};
