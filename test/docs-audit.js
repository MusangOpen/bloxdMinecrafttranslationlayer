#!/usr/bin/env node
'use strict';

/*
 * Documentation audit for task 25.
 *
 * Normal mode:
 *   node test/docs-audit.js
 *
 * Self-tests (each must exit non-zero when the injected bad claim is detected):
 *   node test/docs-audit.js --self-test stale-840
 *   node test/docs-audit.js --self-test stale-846
 *   node test/docs-audit.js --self-test node-18
 *   node test/docs-audit.js --self-test fabric-tested
 *   node test/docs-audit.js --self-test resource-pack-adds-items
 *   node test/docs-audit.js --self-test all
 *
 * The audit is deliberately independent of the README wording: it reads the
 * target descriptor, package.json and package-lock.json, then checks that the
 * README and the two zh-CN guides state the same facts and do not make claims
 * the tests cannot prove.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const README_PATH = path.join(ROOT, 'README.md');
const PACKAGE_PATH = path.join(ROOT, 'package.json');
const LOCK_PATH = path.join(ROOT, 'package-lock.json');
const TARGET_PATH = path.join(ROOT, 'bloxd', 'protocol', 'target.js');
const GUIDE_PATHS = Object.freeze([
  path.join(ROOT, 'docs', 'USAGE.zh-CN.md'),
  path.join(ROOT, 'docs', 'MAINTENANCE.zh-CN.md')
]);

const EXPECTED = Object.freeze({
  build: '7rp1w',
  buildVersion: '57cd8edd',
  mainFile: '7rp1w.main.57cd8edd.js',
  version: 856,
  sha256: '5b55225a3b3758475fb4a6538ba3170c05a26394fcd878deacf649ecc94dd205',
  packName: 'bloxd-856.zip',
  nodeEngine: '>=22',
  nodeMajor: 22
});

const PINS = Object.freeze([
  ['minecraft-protocol', '1.68.0'],
  ['minecraft-data', '3.117.0'],
  ['prismarine-chunk', '1.41.0'],
  ['prismarine-nbt', '2.8.0']
]);

const SELF_TESTS = Object.freeze([
  'stale-840',
  'stale-846',
  'node-18',
  'fabric-tested',
  'resource-pack-adds-items'
]);

const INJECTIONS = Object.freeze({
  'stale-840': [
    '',
    '## Obsolete self-test injection',
    'The current descriptor targets build `9s8fb` (self-test injection).',
    'Protocol version `840` is still the documented target (self-test injection).',
    'Update `VERSION` in `bloxd/types/browser_info.js` (self-test injection).'
  ].join('\n'),
  'stale-846': [
    '',
    '## Obsolete self-test injection',
    'Build `tcwczu` is still the documented target (self-test injection).',
    'Protocol version `846` is still the documented target (self-test injection).',
    'Update `VERSION` in `bloxd/types/browser_info.js` (self-test injection).'
  ].join('\n'),
  'node-18': [
    '',
    '## Obsolete self-test injection',
    'Requirements: Node.js 18+ (self-test injection).'
  ].join('\n'),
  'fabric-tested': [
    '',
    '## Obsolete self-test injection',
    'Fabric tested on a real 1.21.11 client (self-test injection).'
  ].join('\n'),
  'resource-pack-adds-items': [
    '',
    '## Obsolete self-test injection',
    'The resource pack adds items (self-test injection).'
  ].join('\n')
});

const NEGATION_RE = /\b(?:not|never|no|none|cannot|can't|doesn't|does not|without|BLOCKED|UNVERIFIED)\b/i;

const STALE_VERSION_PATTERNS = Object.freeze([
  { code: 'E_STALE_9S8FB', regex: /\b9s8fb\b/i },
  {
    code: 'E_STALE_840_TARGET',
    regex: /\b(?:targets?|build|protocol\s+version|bloxd\s+version)\b[^.\n]{0,40}`?\b840\b`?/i
  },
  { code: 'E_STALE_840_VERSION', regex: /\bversion\s*`?840\b/i },
  {
    code: 'E_STALE_846_TARGET',
    regex: /\b(?:targets?|build|protocol\s+version|bloxd\s+version)\b[^.\n]{0,40}`?\b846\b`?/i
  },
  { code: 'E_STALE_846_VERSION', regex: /\bversion\s*`?846\b/i },
  {
    code: 'E_STALE_BROWSER_INFO',
    regex: /\b(?:VERSION\b[^.\n]{0,80}browser_info\.js|browser_info\.js[^.\n]{0,80}\bVERSION\b)/i
  }
]);

const NODE_18_PATTERNS = Object.freeze([
  { code: 'E_NODE_18_REQUIREMENT', regex: /\bNode(?:\.js)?\s*(?:version\s*)?v?18\s*\+?/i }
]);

const FABRIC_CLAIM_PATTERNS = Object.freeze([
  {
    code: 'E_FABRIC_TESTED',
    regex: /\bFabric\b[^.\n]{0,80}\b(?:tested|verified|validated|confirmed|working)\b/i
  },
  {
    code: 'E_FABRIC_TESTED_REVERSE',
    regex: /\b(?:tested|verified|validated|confirmed)\b[^.\n]{0,60}\bFabric\b/i
  },
  {
    code: 'E_FABRIC_UI_WORKS',
    regex: /\bFabric\s+UI\s+(?:works|renders?|downloads?|loads?)\b/i
  }
]);

const PACK_CLAIM_PATTERNS = Object.freeze([
  {
    code: 'E_PACK_ADDS_NEW_CONTENT',
    regex:
      /\b(?:resource\s+pack|the\s+pack|pack)\b[^.\n]{0,100}\b(?:adds?|registers?|introduces?|creates?|defines?)\b[^.\n]{0,60}\bnew\s+(?:items?|blocks?|ids?)\b/i
  },
  {
    code: 'E_PACK_ADDS_IDS',
    regex:
      /\b(?:resource\s+pack|the\s+pack|pack)\b[^.\n]{0,100}\b(?:adds?|registers?|introduces?|creates?|defines?)\b[^.\n]{0,60}\b(?:items?|blocks?)\s+ids?\b/i
  },
  {
    code: 'E_PACK_ADDS_ITEMS',
    regex:
      /\b(?:resource\s+pack|the\s+pack|pack)\b[^.\n]{0,100}\b(?:adds?|registers?|introduces?|creates?)\b[^.\n]{0,40}\bitems?\b(?![-\s]+(?:visuals?|names?|models?|textures?|components?|lore|behaviou?r))/i
  },
  {
    code: 'E_PACK_ADDS_BLOCKS',
    regex:
      /\b(?:resource\s+pack|the\s+pack|pack)\b[^.\n]{0,100}\b(?:adds?|registers?|introduces?|creates?)\b[^.\n]{0,40}\bblocks?\b(?![-\s]+(?:visuals?|appearance|states?|ids?|models?))/i
  },
  {
    code: 'E_PACK_PLACED_BLOCK_VISUALS',
    regex:
      /\b(?:resource\s+pack|the\s+pack|pack)\b[^.\n]{0,100}\b(?:adds?|provides?|renders?|changes?)\b[^.\n]{0,60}\bplaced-block\s+visuals?\b/i
  }
]);

const LIVE_CLAIM_PATTERNS = Object.freeze([
  {
    code: 'E_LIVE_BLOXD_CLAIM',
    regex:
      /\blive\s+Bloxd\b[^.\n]{0,100}\b(?:verified|validated|tested|confirmed|works?|working|logged\s+in)\b/i
  },
  {
    code: 'E_LIVE_BLOXD_CLAIM_REVERSE',
    regex: /\b(?:verified|validated|tested|confirmed)\b[^.\n]{0,60}\blive\s+Bloxd\b/i
  }
]);

const COMPLETION_CLAIM_PATTERNS = Object.freeze([
  {
    code: 'E_FULL_INTEGRATION_CLAIM',
    regex: /\b(?:full|complete)\s+integration\s+(?:is\s+)?(?:complete|done|verified|passed|green)\b/i
  },
  {
    code: 'E_TASK_23_COMPLETE_CLAIM',
    regex: /\bTask\s*23\s+(?:is\s+)?(?:complete|done|passed|verified|green)\b/i
  },
  {
    code: 'E_TASK23_COMPLETE_CLAIM',
    regex: /\btask23\s+(?:complete|done|passed|verified|green)\b/i
  },
  {
    code: 'E_FABRIC_UI_VERIFIED_CLAIM',
    regex: /\bactual\s+Fabric\s+UI[^.\n]{0,60}\b(?:verified|tested|confirmed|working)\b/i
  }
]);

function normalize(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function findPatternViolations(text, patterns) {
  const violations = [];
  let inFence = false;
  const lines = String(text).split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    for (const pattern of patterns) {
      if (pattern.regex.test(line)) {
        violations.push({
          code: pattern.code,
          line: index + 1,
          text: line.trim()
        });
        break;
      }
    }
  }
  return violations;
}

function findClaims(text, patterns) {
  const claims = [];
  let inFence = false;
  const lines = String(text).split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (NEGATION_RE.test(line)) continue;
    for (const pattern of patterns) {
      if (pattern.regex.test(line)) {
        claims.push({
          code: pattern.code,
          line: index + 1,
          text: line.trim()
        });
        break;
      }
    }
  }
  return claims;
}

function extractCommands(text) {
  const commands = [];
  let inFence = false;
  const lines = String(text).split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) continue;
    const command = line.trim();
    if (!command || command.startsWith('#')) continue;
    commands.push({ line: index + 1, command });
  }
  return commands;
}

function isInsideRoot(absolutePath) {
  return absolutePath === ROOT || absolutePath.startsWith(ROOT + path.sep);
}

function relativeLabel(absolutePath) {
  return path.relative(ROOT, absolutePath).split(path.sep).join('/');
}

function validateCommand(entry, scripts) {
  const tokens = entry.command.split(/\s+/);
  const head = tokens[0];

  if (head === 'npm') {
    const action = tokens[1];
    if (action === 'ci' || action === 'install') {
      if (!fs.existsSync(LOCK_PATH) || !fs.statSync(LOCK_PATH).isFile()) {
        return { ok: false, ...entry, code: 'E_LOCKFILE_MISSING' };
      }
      return { ok: true, ...entry, kind: 'npm-install' };
    }
    if (action === 'start' || action === 'test') {
      if (!Object.prototype.hasOwnProperty.call(scripts, action)) {
        return { ok: false, ...entry, code: 'E_NPM_SCRIPT_MISSING', script: action };
      }
      return { ok: true, ...entry, kind: 'npm-script', script: action };
    }
    if (action === 'run' && tokens[2]) {
      if (!Object.prototype.hasOwnProperty.call(scripts, tokens[2])) {
        return { ok: false, ...entry, code: 'E_NPM_SCRIPT_MISSING', script: tokens[2] };
      }
      return { ok: true, ...entry, kind: 'npm-script', script: tokens[2] };
    }
    return { ok: false, ...entry, code: 'E_NPM_COMMAND_UNSUPPORTED' };
  }

  if (head === 'node') {
    const relative = tokens[1];
    if (!relative || relative.startsWith('-')) {
      return { ok: false, ...entry, code: 'E_NODE_PATH_MISSING' };
    }
    const absolute = path.resolve(ROOT, relative);
    if (!isInsideRoot(absolute)) {
      return { ok: false, ...entry, code: 'E_NODE_PATH_OUTSIDE_ROOT' };
    }
    if (!relative.endsWith('.js')) {
      return { ok: false, ...entry, code: 'E_NODE_PATH_NOT_JS' };
    }
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      return { ok: false, ...entry, code: 'E_NODE_PATH_MISSING' };
    }
    return { ok: true, ...entry, kind: 'node-script', path: relative };
  }

  return { ok: false, ...entry, code: 'E_COMMAND_UNSUPPORTED' };
}

function collectDocumentedReferences(text) {
  const matches =
    String(text).match(
      /(?:test\/[A-Za-z0-9._/-]+\.js|bloxd\/resource_pack\/generate\.js|bloxd\/protocol\/target\.js)/g
    ) || [];
  return Array.from(new Set(matches));
}

function audit(readmeText) {
  const text = String(readmeText);
  const normalized = normalize(text);
  const failures = [];

  let target = null;
  try {
    target = require(TARGET_PATH);
  } catch (error) {
    failures.push({
      code: 'E_TARGET_LOAD_FAILED',
      message: error && error.message ? error.message : String(error)
    });
  }

  let pkg = null;
  try {
    pkg = readJson(PACKAGE_PATH);
  } catch (error) {
    failures.push({
      code: 'E_PACKAGE_LOAD_FAILED',
      message: error && error.message ? error.message : String(error)
    });
  }

  let lock = null;
  try {
    lock = readJson(LOCK_PATH);
  } catch (error) {
    failures.push({
      code: 'E_LOCKFILE_LOAD_FAILED',
      message: error && error.message ? error.message : String(error)
    });
  }

  const targetFileOk =
    Boolean(target) &&
    target.build === EXPECTED.build &&
    target.buildVersion === EXPECTED.buildVersion &&
    target.version === EXPECTED.version &&
    target.mainBundle &&
    target.mainBundle.filename === EXPECTED.mainFile &&
    target.mainBundle.sha256 === EXPECTED.sha256;

  const targetReadmeOk =
    text.includes(EXPECTED.mainFile) &&
    text.includes(String(EXPECTED.version)) &&
    text.includes(EXPECTED.sha256) &&
    /\bprotocol\s+version\s*:?\s*`?856\b/i.test(text);

  const target856 = targetFileOk && targetReadmeOk ? 1 : 0;
  if (!targetFileOk) {
    failures.push({
      code: 'E_TARGET_DESCRIPTOR_MISMATCH',
      message: 'bloxd/protocol/target.js does not match the documented 7rp1w/57cd8edd/856 target'
    });
  }
  if (!targetReadmeOk) {
    failures.push({
      code: 'E_TARGET_DOC_MISSING',
      message: 'README must state 7rp1w.main.57cd8edd.js, protocol version 856 and the full SHA-256'
    });
  }

  const enginesNode = pkg && pkg.engines ? pkg.engines.node : null;
  const packageNodeOk = enginesNode === EXPECTED.nodeEngine;
  const readmeNodeOk = /\bNode(?:\.js)?\s*(?:version\s*)?22\s*\+/i.test(text);
  const node22 = packageNodeOk && readmeNodeOk ? 1 : 0;
  if (!packageNodeOk) {
    failures.push({
      code: 'E_NODE_ENGINE_MISMATCH',
      message: `package.json engines.node must be exactly ${EXPECTED.nodeEngine}`
    });
  }
  if (!readmeNodeOk) {
    failures.push({
      code: 'E_NODE_DOC_MISSING',
      message: 'README must require Node.js 22+'
    });
  }

  const dependencies = (pkg && pkg.dependencies) || {};
  const lockRootDependencies =
    (lock && lock.packages && lock.packages[''] && lock.packages[''].dependencies) || {};
  const packagePinsOk = PINS.every(([name, version]) => dependencies[name] === version);
  const lockRootPinsOk = PINS.every(([name, version]) => lockRootDependencies[name] === version);
  const lockResolvedPinsOk = PINS.every(([name, version]) => {
    const entry = lock && lock.packages && lock.packages[`node_modules/${name}`];
    return Boolean(entry && entry.version === version);
  });
  const readmePinsOk = PINS.every(
    ([name, version]) => text.includes(name) && text.includes(version)
  );
  const exactPins =
    packagePinsOk && lockRootPinsOk && lockResolvedPinsOk && readmePinsOk ? 1 : 0;
  if (!packagePinsOk || !lockRootPinsOk || !lockResolvedPinsOk) {
    failures.push({
      code: 'E_PIN_MISMATCH',
      message: 'package.json/lockfile must keep the four exact pins 1.68.0/3.117.0/1.41.0/2.8.0'
    });
  }
  if (!readmePinsOk) {
    failures.push({
      code: 'E_PIN_DOC_MISSING',
      message: 'README must list all four exact dependency pins'
    });
  }

  const itemOnly = /item visuals and names only/i.test(text);
  const noNewIds =
    /(?:does not|doesn't|no)\s+(?:add|register|create)[^.\n]{0,80}(?:item|block)[^.\n]{0,40}ids?/i.test(
      text
    ) || /no new item(?:\/| or )block ids?/i.test(text);
  const noPlacedBlockVisuals =
    /(?:no|does not (?:add|provide)|doesn't (?:add|provide))[^.\n]{0,60}placed-block visuals?/i.test(
      text
    );
  const packScope =
    itemOnly && noNewIds && noPlacedBlockVisuals ? 'item-only' : 'invalid';
  if (!itemOnly) {
    failures.push({
      code: 'E_PACK_SCOPE_MISSING',
      message: 'README must state that the resource pack is item visuals and names only'
    });
  }
  if (!noNewIds) {
    failures.push({
      code: 'E_NO_NEW_IDS_MISSING',
      message: 'README must state that no new item/block ids are added or registered'
    });
  }
  if (!noPlacedBlockVisuals) {
    failures.push({
      code: 'E_NO_PLACED_VISUALS_MISSING',
      message: 'README must state that there are no placed-block visuals'
    });
  }

  const liveBlocked = /live\s+Bloxd[^.\n]{0,160}\bBLOCKED\b/i.test(text);
  const liveClaims = findClaims(text, LIVE_CLAIM_PATTERNS);
  const liveStatus = liveBlocked && liveClaims.length === 0 ? 'BLOCKED' : 'invalid';
  if (!liveBlocked) {
    failures.push({
      code: 'E_LIVE_BLOCKED_MISSING',
      message: 'README must state that live Bloxd is BLOCKED unless authorized/available'
    });
  }

  const fabricBlocked =
    /Fabric[^.\n]{0,160}BLOCKED_UNVERIFIED/i.test(text) ||
    /BLOCKED_UNVERIFIED[^.\n]{0,160}Fabric/i.test(text);
  const fabricUiStatus = fabricBlocked ? 'BLOCKED_UNVERIFIED' : 'invalid';
  if (!fabricBlocked) {
    failures.push({
      code: 'E_FABRIC_BLOCKED_MISSING',
      message: 'README must state that actual Fabric UI/download/render is BLOCKED_UNVERIFIED'
    });
  }

  const staleVersions = findPatternViolations(text, STALE_VERSION_PATTERNS);
  for (const guidePath of GUIDE_PATHS) {
    const label = relativeLabel(guidePath);
    let guideText;
    try {
      guideText = fs.readFileSync(guidePath, 'utf8');
    } catch (error) {
      failures.push({
        code: 'E_GUIDE_LOAD_FAILED',
        doc: label,
        message: error && error.message ? error.message : String(error)
      });
      continue;
    }
    const stale = findPatternViolations(guideText, STALE_VERSION_PATTERNS);
    if (stale.length > 0) {
      failures.push({
        code: 'E_STALE_GUIDE_TARGET',
        doc: label,
        message: 'guide states an obsolete 840/846 target instead of 856',
        violations: stale
      });
    }
    const missingFacts = [
      EXPECTED.build,
      EXPECTED.buildVersion,
      String(EXPECTED.version),
      EXPECTED.sha256,
      EXPECTED.packName
    ].filter((token) => !guideText.includes(token));
    if (missingFacts.length > 0) {
      failures.push({
        code: 'E_GUIDE_TARGET_FACTS_MISSING',
        doc: label,
        message: 'guide must state build, buildVersion, protocol version, main SHA-256 and pack name',
        missing: missingFacts
      });
    }
  }
  const node18 = findPatternViolations(text, NODE_18_PATTERNS);
  const fabricClaims = findClaims(text, FABRIC_CLAIM_PATTERNS);
  const packClaims = findClaims(text, PACK_CLAIM_PATTERNS);
  const completionClaims = findClaims(text, COMPLETION_CLAIM_PATTERNS);

  const falseClaimList = [
    ...staleVersions,
    ...node18,
    ...fabricClaims,
    ...packClaims,
    ...liveClaims,
    ...completionClaims
  ];
  const falseClaims = falseClaimList.length;

  const preflightIndex = normalized.search(/pack preflight/i);
  const packHttpIndex = normalized.search(/pack http/i);
  const minecraftIndex = normalized.search(/minecraft server/i);
  const startupOrderOk =
    preflightIndex !== -1 &&
    packHttpIndex > preflightIndex &&
    minecraftIndex > packHttpIndex;
  if (!startupOrderOk) {
    failures.push({
      code: 'E_STARTUP_ORDER_MISSING',
      message: 'README must document pack preflight -> pack HTTP -> Minecraft server order'
    });
  }

  const packDocsOk =
    text.includes('generate.js') &&
    text.includes('127.0.0.1') &&
    /\bforced\b/i.test(text) &&
    text.includes('SUCCESSFULLY_LOADED');
  if (!packDocsOk) {
    failures.push({
      code: 'E_PACK_DOCS_MISSING',
      message:
        'README must document resource-pack build, loopback serving, forced load and SUCCESSFULLY_LOADED gate'
    });
  }

  const commandsOk = text.includes('/play') && text.includes('/party');
  if (!commandsOk) {
    failures.push({
      code: 'E_COMMANDS_MISSING',
      message: 'README must document /play and /party'
    });
  }

  const headlessDisclaimerOk =
    /headless[^.\n]{0,120}\bnot\b[^.\n]{0,80}Fabric UI/i.test(text) ||
    /not Fabric UI tests/i.test(text);
  if (!headlessDisclaimerOk) {
    failures.push({
      code: 'E_HEADLESS_DISCLAIMER_MISSING',
      message: 'README must state that headless local protocol tests are not Fabric UI tests'
    });
  }

  const task23CompleteOk =
    /Task\s*23\s+is\s+no\s+longer\s+blocked/i.test(normalized) &&
    /\bset_title_text\b[^.]{0,120}\bset_title_subtitle\b/i.test(normalized) &&
    /\btitle,\s*subtitle\s+and\s+times\s+(?:are\s+now\s+real|now\s+real)\b/i.test(normalized) &&
    /not a full integration claim/i.test(normalized);
  const task23BlockedOk =
    /Task\s*23\s+remains\s+blocked/i.test(text) &&
    /does not emit title text/i.test(text) &&
    /does not assert title text/i.test(text) &&
    /not a full integration claim/i.test(text);
  const task23Status = task23CompleteOk
    ? 'complete'
    : task23BlockedOk
      ? 'blocked'
      : 'invalid';
  if (task23Status === 'invalid') {
    failures.push({
      code: 'E_TASK_23_STATUS_MISSING',
      message:
        'README must honestly state either that task 23 is no longer blocked with real title/subtitle/times, or that it remains blocked because title text is neither emitted nor asserted'
    });
  }

  const historicalNoteOk = /historical note/i.test(text) && /\bobsolete\b/i.test(text);
  if (!historicalNoteOk) {
    failures.push({
      code: 'E_HISTORICAL_NOTE_MISSING',
      message: 'README must keep a brief historical note and mark the old instructions obsolete'
    });
  }

  const scripts = (pkg && pkg.scripts) || {};
  const documentedCommands = extractCommands(text).map((entry) => validateCommand(entry, scripts));
  const invalidCommands = documentedCommands.filter((entry) => !entry.ok);
  const commandsValid = invalidCommands.length === 0 ? 1 : 0;
  if (invalidCommands.length > 0) {
    failures.push({
      code: 'E_INVALID_COMMAND',
      message: 'every documented command must exist in package.json scripts or be a runnable node path',
      commands: invalidCommands
    });
  }

  const brokenReferences = [];
  for (const relative of collectDocumentedReferences(text)) {
    const absolute = path.resolve(ROOT, relative);
    if (!isInsideRoot(absolute) || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      brokenReferences.push(relative);
    }
  }
  if (brokenReferences.length > 0) {
    failures.push({
      code: 'E_BROKEN_REFERENCE',
      message: 'README references files that do not exist',
      references: brokenReferences
    });
  }

  const ok =
    failures.length === 0 &&
    falseClaims === 0 &&
    target856 === 1 &&
    node22 === 1 &&
    exactPins === 1 &&
    packScope === 'item-only' &&
    liveStatus === 'BLOCKED' &&
    fabricUiStatus === 'BLOCKED_UNVERIFIED' &&
    commandsValid === 1;

  return {
    ok,
    mode: 'audit',
    target856,
    node22,
    exactPins,
    packScope,
    liveStatus,
    fabricUiStatus,
    falseClaims,
    commandsValid,
    commandCount: documentedCommands.length,
    startupOrder: startupOrderOk ? 1 : 0,
    task23Status: task23Status,
    commands: documentedCommands.map((entry) => ({
      line: entry.line,
      command: entry.command,
      ok: entry.ok,
      kind: entry.kind,
      code: entry.code,
      script: entry.script,
      path: entry.path
    })),
    falseClaimDetails: falseClaimList,
    failures
  };
}

function selfTest(name) {
  const readme = fs.readFileSync(README_PATH, 'utf8');
  const injection = INJECTIONS[name];
  if (!injection) {
    console.log(
      JSON.stringify({
        ok: false,
        mode: 'self-test',
        selfTest: name,
        code: 'E_UNKNOWN_SELF_TEST',
        known: SELF_TESTS
      })
    );
    process.exit(2);
  }

  const result = audit(readme + '\n' + injection);
  const codes = result.falseClaimDetails.map((entry) => entry.code);
  let detected = false;
  if (name === 'stale-840' || name === 'stale-846') {
    detected = codes.some((code) => code.startsWith('E_STALE_'));
  } else if (name === 'node-18') {
    detected = codes.includes('E_NODE_18_REQUIREMENT');
  } else if (name === 'fabric-tested') {
    detected = codes.some((code) => code.startsWith('E_FABRIC_'));
  } else if (name === 'resource-pack-adds-items') {
    detected = codes.some((code) => code.startsWith('E_PACK_'));
  }

  console.log(
    JSON.stringify(
      {
        ok: false,
        mode: 'self-test',
        selfTest: name,
        detected,
        codes,
        message: detected
          ? `${name} bad documentation was rejected`
          : `${name} bad documentation was NOT detected`
      },
      null,
      2
    )
  );
  process.exit(detected ? 1 : 2);
}

function selfTestAll() {
  const readme = fs.readFileSync(README_PATH, 'utf8');
  const results = SELF_TESTS.map((name) => {
    const result = audit(readme + '\n' + INJECTIONS[name]);
    const codes = result.falseClaimDetails.map((entry) => entry.code);
    let detected = false;
    if (name === 'stale-840' || name === 'stale-846') {
      detected = codes.some((code) => code.startsWith('E_STALE_'));
    }
    if (name === 'node-18') detected = codes.includes('E_NODE_18_REQUIREMENT');
    if (name === 'fabric-tested') detected = codes.some((code) => code.startsWith('E_FABRIC_'));
    if (name === 'resource-pack-adds-items')
      detected = codes.some((code) => code.startsWith('E_PACK_'));
    return { selfTest: name, detected, codes };
  });
  const detected = results.every((result) => result.detected);
  console.log(
    JSON.stringify(
      {
        ok: false,
        mode: 'self-test',
        selfTest: 'all',
        detected,
        results,
        message: detected
          ? 'all bad documentation injections were rejected'
          : 'at least one bad documentation injection was NOT detected'
      },
      null,
      2
    )
  );
  process.exit(detected ? 1 : 2);
}

function main(argv) {
  const selfIndex = argv.indexOf('--self-test');
  if (selfIndex !== -1) {
    const name = argv[selfIndex + 1];
    if (name === 'all') return selfTestAll();
    return selfTest(name);
  }

  const result = audit(fs.readFileSync(README_PATH, 'utf8'));
  console.log(
    `DOCS AUDIT ${result.ok ? 'PASS' : 'FAIL'} ` +
      `target856=${result.target856} ` +
      `node22=${result.node22} ` +
      `exactPins=${result.exactPins} ` +
      `packScope=${result.packScope} ` +
      `liveStatus=${result.liveStatus} ` +
      `fabricUiStatus=${result.fabricUiStatus} ` +
      `falseClaims=${result.falseClaims} ` +
      `commandsValid=${result.commandsValid}`
  );
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main(process.argv.slice(2));
