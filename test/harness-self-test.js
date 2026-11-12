'use strict';

/**
 * Proves that the shared harness turns silent success paths into non-zero exits.
 *
 * Each rejection mode runs in its own child process so a local process.exit()
 * cannot be mistaken for a passing parent process.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const HARNESS = path.join(__dirname, 'lib', 'harness.js');
const BASELINE = path.join(ROOT, '.research', 'builds', 'tcwczu-357faec1', 'baseline-defects.json');

let checks = 0;

function check(label, fn) {
  try {
    fn();
    checks++;
  } catch (error) {
    throw new Error(`${label}: ${error.message}`);
  }
}

function run(mode) {
  const result = spawnSync(process.execPath, [HARNESS, '--self-test', mode], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30000
  });
  return {
    mode,
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function expectRejected(mode, expectedCode) {
  const result = run(mode);
  check(`${mode} rejects`, () => {
    assert.notStrictEqual(result.status, 0, `${mode} exited 0\n${result.stdout}\n${result.stderr}`);
    assert.ok(
      result.stdout.includes(expectedCode) || result.stderr.includes(expectedCode),
      `${mode} did not report ${expectedCode}\n${result.stdout}\n${result.stderr}`
    );
  });
  return result;
}

function expectAccepted(mode) {
  const result = run(mode);
  check(`${mode} accepts control`, () => {
    assert.strictEqual(result.status, 0, `${mode} exited ${result.status}\n${result.stdout}\n${result.stderr}`);
  });
  return result;
}

try {
  expectRejected('missingPacket', 'E_MISSING_PACKET');
  expectRejected('skip', 'E_REQUIRED_SKIP');
  expectRejected('writeError', 'E_ADAPTER_WRITE');
  expectRejected('zeroAssertions', 'E_ZERO_ASSERTIONS');
  expectRejected('unregisteredAnomaly', 'E_UNREGISTERED_DEFECT');

  expectAccepted('pass');
  expectAccepted('knownDefect');

  check('baseline ledger exists', () => {
    assert.ok(fs.existsSync(BASELINE), `missing ${BASELINE}`);
  });

  const ledger = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  check('baseline ledger schema', () => {
    assert.strictEqual(ledger.schemaVersion, 1);
    assert.ok(Array.isArray(ledger.defects) && ledger.defects.length > 0);
  });

  const ids = new Set();
  const categories = new Set();
  for (const defect of ledger.defects) {
    check(`defect ${defect && defect.id} shape`, () => {
      assert.match(defect.id, /^BLX-[A-Z0-9]+-\d{3}$/);
      assert.ok(defect.category, 'category is required');
      assert.ok(defect.title, 'title is required');
      assert.ok(Array.isArray(defect.evidence) && defect.evidence.length > 0, 'evidence is required');
      for (const item of defect.evidence) {
        assert.ok(typeof item.path === 'string' && item.path.length > 0, 'evidence.path is required');
        assert.ok(
          typeof item.fact === 'string' && item.fact.length > 0,
          `evidence.fact is required for ${defect.id}`
        );
        assert.ok(
          typeof item.lines === 'string' || typeof item.pointer === 'string',
          `evidence lines/pointer is required for ${defect.id}`
        );
      }
    });
    check(`defect ${defect.id} unique`, () => assert.ok(!ids.has(defect.id), `duplicate ${defect.id}`));
    ids.add(defect.id);
    categories.add(defect.category);
  }

  for (const category of [
    'schema-field-mismatch',
    'handler-schema-mismatch',
    'missing-codec',
    'payload-mismatch',
    'incomplete-vocabulary',
    'component-loss',
    'registry-fallback'
  ]) {
    check(`baseline category ${category}`, () => assert.ok(categories.has(category), `missing ${category}`));
  }

  assert.ok(checks > 0);
  console.log(
    `HARNESS SELF-TEST PASS missingPacket=nonzero skip=nonzero writeError=nonzero zeroAssertions=nonzero ` +
      `unregisteredAnomaly=nonzero knownDefect=zero pass=zero defectCount=${ledger.defects.length} checks=${checks}`
  );
  process.exit(0);
} catch (error) {
  console.error('HARNESS SELF-TEST FAIL', error && error.stack ? error.stack : error);
  process.exit(1);
}
