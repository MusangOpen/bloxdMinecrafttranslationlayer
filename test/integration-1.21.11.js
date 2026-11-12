#!/usr/bin/env node
'use strict';

/*
 * Full local Minecraft 1.21.11 integration scenario (plan task 23).
 *
 * Scope: real local protocol integration only. This test starts the actual
 * project server (`index.start`) with `online-mode:false`, a real local
 * `minecraft-protocol` 1.21.11 client, and the real localhost resource-pack
 * HTTP server. It does NOT contact Bloxd and does NOT claim a real Fabric
 * client, rendering or UI.
 *
 * Full project pipeline: `index.start()` registers the real handlers via
 * `onWorldReady -> handlers.minecraft(client)`. After the gate releases, the
 * test creates a local fake Bloxd EventEmitter and calls each real handler's
 * `bloxd(fake, joinData)` exactly like `index.connect()` does, then emits real
 * `SPacket*` events from fixtures. Handlers call the real adapter
 * (`mc/client.js`), which translates to real 1.21.11 packets that the real
 * client decodes. No handler or adapter output is injected directly for the
 * happy-path chunk/block/item/entity/chat/title/scoreboard/sound groups.
 *
 * Documented seam: `index.start({ joinGateFactory })` replaces only the gate's
 * `connect` callback with a local no-op, so no live Bloxd socket is ever
 * opened. The real `onWorldReady` callback is preserved and runs handler
 * registration. Nothing else in the server, gate, handlers, adapter or pack
 * server is stubbed.
 *
 * Modes:
 *   --happy                    full happy-path integration (exit 0)
 *   --mode <name>              one scenario (used by --all)
 *   --all                      run happy + every failure injection in fresh
 *                              child processes, write task-23 evidence, exit 0
 *                              only when happy=0 and every injection=1 with
 *                              zero forbidden traffic.
 *
 * Failure injections: missing-model, wrong-component-count, dropped-packet,
 * pack-decline, download-failure, timeout.
 *
 * "Forbidden traffic" means traffic the gate contract forbids before
 * SUCCESSFULLY_LOADED: any world/item packet before pack load and any live
 * Bloxd connect. Gate failures additionally must emit zero world/item packets
 * in total.
 */

const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const mc = require('minecraft-protocol');
const mcData = require('minecraft-data')('1.21.11');

const LegacyClient = require('../mc/client.js');
const handlers = require('../bloxd/handlers/init.js');
const { ITEMID } = require('../bloxd/types/items.js');
const index = require('../index.js');
const { createHarness } = require('./lib/harness');

const ROOT = path.resolve(__dirname, '..');
const EVIDENCE_DIR = process.env.BLOXD_EVIDENCE_DIR
  ? path.resolve(ROOT, process.env.BLOXD_EVIDENCE_DIR)
  : path.join(
      ROOT,
      '.omo',
      'evidence',
      'update-bloxd-mc-1-21-11-fabric'
    );
const MC_VERSION = '1.21.11';
const HAPPY_TIMEOUT_MS = 10000;
const INJECTION_PACK_TIMEOUT_MS = 250;

const MODES = [
  'happy',
  'missing-model',
  'wrong-component-count',
  'dropped-packet',
  'pack-decline',
  'download-failure',
  'timeout'
];
const FAILURE_MODES = MODES.filter((mode) => mode !== 'happy');
const GATE_FAILURE_MODES = new Set(['pack-decline', 'download-failure', 'timeout']);

// Same gate contract as test/resource-pack-protocol.js.
const WORLD_PACKET_NAMES = new Set([
  'map_chunk',
  'chunk_batch_start',
  'chunk_batch_finished',
  'position',
  'spawn_entity',
  'entity_metadata',
  'entity_equipment',
  'entity_teleport',
  'entity_velocity',
  'entity_head_rotation',
  'entity_destroy',
  'animation',
  'collect',
  'entity_status',
  'entity_effect',
  'remove_entity_effect',
  'update_health',
  'experience',
  'open_window',
  'close_window',
  'window_items',
  'set_slot',
  'set_cursor_item',
  'player_info',
  'playerlist_header',
  'teams',
  'scoreboard_objective',
  'scoreboard_score',
  'scoreboard_display_objective',
  'respawn',
  'sound_effect',
  'world_particles',
  'system_chat',
  'set_title_text',
  'set_title_subtitle',
  'set_title_time',
  'clear_titles',
  'tab_complete'
]);
const ITEM_PACKET_NAMES = new Set([
  'window_items',
  'set_slot',
  'set_cursor_item',
  'entity_equipment'
]);

const BLOXD_ITEM_NAME = 'Wood Pickaxe';
const BLOXD_ITEM_LORE = ['Line one', 'Line two'];
// Bloxd item name that resolves to a real 1.8 item but has no manifest model.
// It is used only by the missing-model injection.
const MISSING_MODEL_ITEM_NAME = 'Wheat Seeds';

const EXPECTED_ITEM_ID = 913; // minecraft:wooden_pickaxe in 1.21.11
const EXPECTED_ITEM_MODEL = 'bloxd:wooden_pickaxe_8110';
const GRASS_STATE_ID = 9; // minecraft:grass_block default state in 1.21.11
const PLAYER_ENTITY_ID = mcData.entitiesByName.player.id;
const GRASS_ITEM_INDEX = ITEMID.indexOf(2); // Bloxd id whose ITEMID is grass
const WOOD_PICKAXE_COMPONENT_COUNT = 4; // unbreakable + custom_name + lore + item_model
const EQUIPMENT_COMPONENT_COUNT = 3; // unbreakable + custom_name + item_model

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function varint(value) {
  const bytes = [];
  let remaining = value;
  while (remaining >= 0x80) {
    bytes.push((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  bytes.push(remaining);
  return bytes;
}

// Bloxd chunk sections are RLE pairs of (cellCount, bloxdItemId). One pair
// fills a whole 32x32x32 section, which keeps the fixture deterministic.
function chunkRle(itemIndex) {
  return Buffer.from([...varint(32 * 32 * 32), ...varint(itemIndex)]);
}

function mapLike() {
  const map = {
    onAdd: null,
    onRemove: null,
    listen() {}
  };
  map.proxy = {
    onAdd(callback) {
      map.onAdd = callback;
    },
    onRemove(callback) {
      map.onRemove = callback;
    }
  };
  return map;
}

function createFakeBloxd() {
  const fake = new EventEmitter();
  fake.room = { state: { entities: mapLike(), items: mapLike(), tickCounter: 0 } };
  fake.stateCallbacks = (target) => {
    if (target === fake.room.state) {
      return { entities: fake.room.state.entities.proxy, items: fake.room.state.items.proxy };
    }
    return { listen() {} };
  };
  fake.settings = {
    canPickUpItems: true,
    runningSpeed: 7,
    walkingSpeed: 4,
    secsToRespawn: 5,
    auraPerLevel: 1,
    _isAlive: true,
    autoRespawn: false,
    creative: false,
    currencyAmounts: undefined
  };
  fake.settingsEvent = new EventEmitter();
  fake.sends = [];
  fake.send = (name, data) => {
    fake.sends.push({ name, data });
  };
  fake.connected = true;
  fake.gameName = 'skywars';
  fake.lobbyName = 'lobby';
  fake.ip = '';
  fake.name = 'IntegrationTester';
  fake.pass = [1, 2, 3, 4, 5, 6, 7, 8];
  fake.emitInitialSettings = () => {};
  return fake;
}

function localPlayerEntity(heldItemName = 'Air') {
  return {
    type: 'Player',
    name: 'IntegrationTester',
    x: 0,
    y: 64,
    z: 0,
    heading: 0,
    cameraPitch: 0,
    heldItemName,
    listen() {}
  };
}

function otherPlayerEntity(heldItemName = BLOXD_ITEM_NAME) {
  return {
    type: 'Player',
    name: 'Other',
    x: 0,
    y: 2,
    z: 0,
    heading: 0,
    cameraPitch: 0,
    heldItemName,
    listen() {}
  };
}

function sha1(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

function withTimeout(promise, ms, label, timeouts) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`timeout: ${label}`);
      error.code = 'E_TIMEOUT';
      if (timeouts) timeouts.push({ label, ms });
      reject(error);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function downloadPack(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { headers: { Host: new URL(url).host } }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const bytes = Buffer.concat(chunks);
        resolve({
          statusCode: response.statusCode,
          contentType: response.headers['content-type'],
          bytes,
          sha1: sha1(bytes)
        });
      });
      response.on('error', reject);
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error('download timeout'));
    });
    request.on('error', reject);
  });
}

function nbtText(value) {
  if (!value) return undefined;
  if (value.value && value.value.text && value.value.text.value !== undefined) {
    return value.value.text.value;
  }
  if (value.text && value.text.value !== undefined) return value.text.value;
  return undefined;
}

function component(item, type) {
  if (!item || !Array.isArray(item.components)) return null;
  return item.components.find((entry) => entry && entry.type === type) || null;
}

// Drives the real handler pipeline exactly as index.connect() does: register
// every handler's bloxd() SPacket listeners on a local fake Bloxd client, then
// emit real SPacket* fixtures. Handlers call adapter.write; this function never
// calls adapter.write for the happy-path groups.
async function driveHandlerPipeline(adapter, fake, mode, trace) {
  const itemName = mode === 'missing-model' ? MISSING_MODEL_ITEM_NAME : BLOXD_ITEM_NAME;
  const itemLore = mode === 'wrong-component-count' ? [] : BLOXD_ITEM_LORE;

  Object.values(handlers).forEach((handler) =>
    handler.bloxd(fake, { eId: '1', pass: fake.pass })
  );
  fake.emitInitialSettings();
  trace.push('handler_bloxd');

  // Background loops are not part of this deterministic fixture; stop them
  // before adding entities so no late interval writes race the transcript.
  if (handlers.entity.swingInterval) clearInterval(handlers.entity.swingInterval);
  if (handlers.misc.currencyLoop) clearInterval(handlers.misc.currencyLoop);
  if (handlers.misc.friends && handlers.misc.friends.updateInterval) {
    clearInterval(handlers.misc.friends.updateInterval);
  }

  // Local player join: tablist/team registration through the real handler.
  fake.room.state.entities.onAdd(localPlayerEntity(), '1');
  // The real SPacketEntitySetting marks the local player alive/spawned; without
  // it entity.actions() returns before world.update().
  fake.emit('SPacketEntitySetting', {
    eId: '1',
    settings: { _isAlive: true, canSee: true }
  });

  // Simulated MC client position -> entity.actions -> world.update(), which
  // creates the Bloxd chunks and issues CPacketRequestChunk on the fake Bloxd
  // socket (recorded, no network).
  adapter.emit('position', { x: 0, y: 64, z: 0, onGround: true });

  // Three 32-high sections complete Bloxd chunk (0,0); world.write() emits the
  // real map_chunk packets through the adapter.
  for (const section of [0, 1, 2]) {
    fake.emit('SPacketChunkData', {
      id: `0|${section}|0|overworld`,
      RLEArr: chunkRle(GRASS_ITEM_INDEX),
      cancelled: false
    });
  }
  await delay(220);

  // Block change through world.setBlock.
  fake.emit('SPacketSetBlock', { pos: [0, 11, 0], newId: GRASS_ITEM_INDEX });

  // Inventory + item visuals through gui.
  const inventory = Array.from({ length: 52 }, (_unused, index) =>
    index === 0
      ? { name: itemName, amount: 1, displayName: itemName, lore: itemLore }
      : { name: 'Air', amount: null }
  );
  fake.emit('SPacketSyncInventory', {
    iOpsData: { playerInven: JSON.stringify(inventory), openChest: null }
  });
  fake.emit('SPacketSetSlot', {
    index: 0,
    name: itemName,
    amount: 1,
    displayName: itemName,
    lore: itemLore
  });

  // Second player spawns now that chunk (0,0) is loaded; this drives
  // player_info/team, named_entity_spawn metadata and entity_equipment.
  fake.room.state.entities.onAdd(otherPlayerEntity(), '2');

  // Chat rich component.
  fake.emit('SPacketChat', {
    content: [{ str: 'Hello world', style: { color: 'red' } }]
  });

  // Title/subtitle/times. middleTextUpper is the large text (title action 0);
  // middleTextLower is the small text (subtitle action 1).
  fake.settingsEvent.emit('middleTextUpper', [{ str: 'Main Title' }]);
  fake.settingsEvent.emit('middleTextLower', [{ str: 'Small Text' }]);

  // Scoreboard lines.
  fake.settingsEvent.emit('RightInfoText', [
    { str: 'alpha' },
    { str: '\n' },
    { str: 'beta' }
  ]);

  // Sound through world SPacketPlaySound -> misc.playSound.
  if (mode !== 'dropped-packet') {
    fake.emit('SPacketPlaySound', {
      namePrefix: 'bow',
      posSettings: { playerIdOrPos: [0, 10, 0] }
    });
  }

  if (handlers.entity.swingInterval) clearInterval(handlers.entity.swingInterval);
  if (handlers.misc.currencyLoop) clearInterval(handlers.misc.currencyLoop);
}

function expectedWire() {
  return [
    'login',
    'add_resource_pack',
    'position',
    'spawn_position',
    'game_state_change',
    'update_view_position',
    // index.onWorldReady -> handlers.minecraft, then handler.bloxd registration
    'custom_payload', // entity.bloxd -> resyncVelocity
    'playerlist_header', // tablist.bloxd
    // local player join
    'player_info',
    'teams',
    // SPacketChunkData x3 -> world.write() -> four quadrant map_chunk packets.
    // The adapter expands each legacy map_chunk into a chunk batch.
    'chunk_batch_start',
    'map_chunk',
    'chunk_batch_finished',
    'chunk_batch_start',
    'map_chunk',
    'chunk_batch_finished',
    'chunk_batch_start',
    'map_chunk',
    'chunk_batch_finished',
    'chunk_batch_start',
    'map_chunk',
    'chunk_batch_finished',
    // SPacketSetBlock
    'block_change',
    // SPacketSyncInventory -> replicateInv
    'set_cursor_item',
    'window_items',
    // SPacketSetSlot
    'set_slot',
    // second player join/spawn
    'player_info',
    'teams',
    'spawn_entity',
    'entity_metadata',
    'entity_head_rotation',
    'entity_equipment',
    // SPacketChat
    'system_chat',
    // middleTextUpper -> clear, time, title; middleTextLower -> subtitle
    'clear_titles',
    'set_title_time',
    'set_title_text',
    'set_title_subtitle',
    // RightInfoText -> objective, display, four score lines
    'scoreboard_objective',
    'scoreboard_display_objective',
    'scoreboard_score',
    'scoreboard_score',
    'scoreboard_score',
    'scoreboard_score',
    // SPacketPlaySound -> misc.playSound
    'sound_effect'
  ];
}

function expectedTrace() {
  return [
    'finish_configuration',
    'login',
    'add_resource_pack',
    'pack_download',
    'status:wrong_uuid_ignored',
    'status:accepted',
    'status:downloaded',
    'status:successfully_loaded',
    'success',
    'position',
    'world',
    'connect',
    'connected',
    'handler_bloxd',
    'assert:chunk_light',
    'assert:block_change',
    'assert:item_visuals',
    'assert:inventory',
    'assert:equipment',
    'assert:entity_metadata',
    'assert:chat',
    'assert:title',
    'assert:scoreboard_team',
    'assert:sound',
    'assert:negative'
  ];
}

async function runIntegration(mode) {
  const harness = createHarness({ name: `integration-1.21.11-${mode}` });
  const clientErrors = [];
  const serverErrors = [];
  const timeouts = [];
  const wire = [];
  const trace = [];
  const clientSeen = new Set();
  const clientPackets = new Map();
  const state = {
    gate: null,
    adapter: null,
    addPack: null,
    gateFailure: null,
    connectCalls: 0,
    realConnectProvided: false,
    realConnectCalled: false,
    handlersRegistered: false,
    registryFailures: [],
    clientLogins: 0,
    clientPositions: 0,
    clientEnded: false,
    download: null,
    sha1Match: false,
    bytesMatch: false,
    negative: null,
    title: null
  };
  let client = null;
  let runtime = null;
  let originalFetch = null;
  let resolveAddPack;
  let resolveConnected;
  let resolveTerminal;
  const addPackPromise = new Promise((resolve) => {
    resolveAddPack = resolve;
  });
  const connectedPromise = new Promise((resolve) => {
    resolveConnected = resolve;
  });
  const terminalPromise = new Promise((resolve) => {
    resolveTerminal = resolve;
  });

  const first = (name) => {
    const values = clientPackets.get(name);
    return values && values[0];
  };
  const all = (name) => clientPackets.get(name) || [];
  const remember = (name, packet) => {
    clientSeen.add(name);
    if (!clientPackets.has(name)) clientPackets.set(name, []);
    clientPackets.get(name).push(packet);
  };

  try {
    runtime = await index.start({
      port: 0,
      host: '127.0.0.1',
      packOptions: { port: 0 },
      timeoutMs:
        mode === 'timeout' ? INJECTION_PACK_TIMEOUT_MS : HAPPY_TIMEOUT_MS,
      installSignalHandlers: false,
      exitOnSignal: false,
      // Capture the real adapter created by the real server startup path.
      createLegacyClient: (raw, clientOptions) => {
        const adapter = new LegacyClient(raw, clientOptions);
        state.adapter = adapter;
        adapter.on('error', (error) => clientErrors.push(error));
        const rawWrite = raw.write.bind(raw);
        raw.write = (name, data) => {
          const loaded = Boolean(state.gate && state.gate.loaded);
          wire.push({ name, loaded });
          if (name === 'login' || name === 'add_resource_pack' || name === 'position') {
            trace.push(name);
          }
          return rawWrite(name, data);
        };
        return adapter;
      },
      // Keep the real JoinGate and the real onWorldReady callback. Only the
      // post-load `connect` is replaced with a local no-op so no live Bloxd
      // socket is opened. The real onWorldReady calls
      // index.js:367-369 -> handlers.minecraft(client), so the handler pipeline
      // is registered by the production startup path.
      joinGateFactory: (gateOptions) => {
        const { JoinGate } = require('../mc/join-gate.js');
        state.realConnectProvided = typeof gateOptions.connect === 'function';
        state.realConnectCalled = false;
        const gate = new JoinGate(
          Object.assign({}, gateOptions, {
            connect: async () => {
              state.connectCalls += 1;
              trace.push('connect');
              // Deliberately do not call gateOptions.connect: no Bloxd network.
            }
          })
        );
        state.gate = gate;
        gate.on('success', () => trace.push('success'));
        gate.on('world', () => trace.push('world'));
        gate.on('connected', () => {
          trace.push('connected');
          resolveConnected();
        });
        gate.on('failure', (failure) => {
          state.gateFailure = failure;
        });
        gate.on('terminal', (info) => resolveTerminal(info));
        return gate;
      }
    });

    // The real main() calls bootstrap() -> obtainHandlers() before accepting
    // clients. Do the same cross-handler wiring here, but disable the social
    // friends poller so this test cannot touch the network.
    originalFetch = global.fetch;
    // Local no-op fetch: handlers that fire analytics/social requests must not
    // touch the network, but must also not throw inside handler registration.
    global.fetch = async () => ({
      ok: false,
      status: 599,
      statusText: 'network disabled by integration-1.21.11',
      json: async () => ({}),
      text: async () => ''
    });
    Object.values(handlers).forEach((handler) =>
      handler.obtainHandlers(handlers, () => {})
    );
    if (handlers.misc.friends && handlers.misc.friends.updateInterval) {
      clearInterval(handlers.misc.friends.updateInterval);
    }

    const server = runtime.server;
    server.on('error', (error) => serverErrors.push(error));
    server.on('login', (raw) => {
      raw.once('finish_configuration', () => trace.push('finish_configuration'));
    });

    harness.assert(
      runtime.packServer && typeof runtime.packServer.sha1 === 'string',
      'real resource-pack server created'
    );
    harness.assert(
      typeof runtime.minecraftPort === 'number' && runtime.minecraftPort > 0,
      'real Minecraft server listening on an ephemeral port'
    );

    client = mc.createClient({
      host: '127.0.0.1',
      port: runtime.minecraftPort,
      username: 'IntegrationTester',
      version: MC_VERSION,
      auth: 'offline'
    });
    client.on('error', (error) => clientErrors.push(error));
    client.on('end', () => {
      state.clientEnded = true;
    });
    client.on('login', () => {
      state.clientLogins += 1;
    });
    client.on('packet', (packet, meta) => {
      if (!meta || !meta.name) return;
      if (meta.name === 'position') state.clientPositions += 1;
      remember(meta.name, packet);
    });
    client.on('add_resource_pack', (packet) => {
      state.addPack = packet;
      resolveAddPack(packet);
    });

    const addPack = await withTimeout(
      addPackPromise,
      HAPPY_TIMEOUT_MS,
      'add_resource_pack',
      timeouts
    );
    harness.assert(addPack, 'client received add_resource_pack');

    // Pack request came through the real local HTTP endpoint.
    harness.assertEqual(
      String(addPack.uuid).toLowerCase(),
      String(runtime.packUuid).toLowerCase(),
      'add_resource_pack.uuid matches pack server'
    );
    harness.assertEqual(addPack.url, runtime.packUrl, 'add_resource_pack.url');
    harness.assertEqual(addPack.hash, runtime.packSha1, 'add_resource_pack.hash');
    harness.assertEqual(addPack.forced, true, 'add_resource_pack.forced');
    harness.assert(
      addPack.promptMessage && typeof addPack.promptMessage === 'object',
      'add_resource_pack.promptMessage is NBT'
    );

    if (GATE_FAILURE_MODES.has(mode)) {
      if (mode === 'pack-decline') {
        client.write('resource_pack_receive', { uuid: addPack.uuid, result: 1 });
      } else if (mode === 'download-failure') {
        client.write('resource_pack_receive', { uuid: addPack.uuid, result: 2 });
      }
      // timeout: send nothing; the real gate timer must fail closed.

      await withTimeout(
        terminalPromise,
        mode === 'timeout' ? INJECTION_PACK_TIMEOUT_MS + 4000 : HAPPY_TIMEOUT_MS,
        `${mode} terminal`,
        timeouts
      );
      await delay(100);

      const expected = {
        'pack-decline': 'E_PACK_DECLINED',
        'download-failure': 'E_PACK_FAILED_DOWNLOAD',
        timeout: 'E_PACK_TIMEOUT'
      }[mode];
      harness.assertEqual(
        state.gateFailure && state.gateFailure.code,
        expected,
        `${mode} gate failure code`
      );
      harness.assertEqual(state.gate.state, 'failed', `${mode} gate failed`);
      // A failed gate ends the connection, so the only additional packet is
      // the protocol-level kick_disconnect control packet. No world/item data.
      const allowedGateWire = new Set(['login', 'add_resource_pack', 'kick_disconnect']);
      harness.assert(
        wire.every((entry) => allowedGateWire.has(entry.name)),
        `${mode} wire has no world/item packets`
      );
      harness.assertEqual(
        wire.filter((entry) => entry.name === 'login').length,
        1,
        `${mode} exactly one login`
      );
      harness.assertEqual(
        wire.filter((entry) => entry.name === 'add_resource_pack').length,
        1,
        `${mode} exactly one pack request`
      );
      const worldTotal = wire.filter((entry) => WORLD_PACKET_NAMES.has(entry.name)).length;
      const itemTotal = wire.filter((entry) => ITEM_PACKET_NAMES.has(entry.name)).length;
      harness.assertEqual(worldTotal, 0, `${mode} zero world packets total`);
      harness.assertEqual(itemTotal, 0, `${mode} zero item packets total`);
      harness.assertEqual(state.connectCalls, 0, `${mode} no Bloxd connect`);
    } else {
      // Happy path and adapter-level injections both download the real pack
      // from the real localhost HTTP endpoint and verify the exact bytes/SHA-1.
      state.download = await downloadPack(runtime.packUrl, HAPPY_TIMEOUT_MS);
      const serverBytes = runtime.packServer.getZipBytes();
      state.sha1Match = state.download.sha1 === runtime.packSha1;
      state.bytesMatch = state.download.bytes.equals(serverBytes);
      harness.assertEqual(state.download.statusCode, 200, 'pack HTTP status');
      harness.assertEqual(state.download.contentType, 'application/zip', 'pack content type');
      harness.assertEqual(
        state.download.bytes.length,
        serverBytes.length,
        'pack download size matches server'
      );
      harness.assertEqual(state.download.sha1, runtime.packSha1, 'pack download SHA-1');
      harness.assert(state.bytesMatch, 'pack download bytes match server bytes');
      trace.push('pack_download');

      // One negative resource-pack status: a wrong UUID is ignored and the
      // gate stays pending before the real status sequence.
      client.write('resource_pack_receive', {
        uuid: '11111111-2222-3333-4444-555555555555',
        result: 0
      });
      await harness.waitFor(
        'wrong UUID pack status ignored',
        () => state.gate.ignoredStatuses.some((entry) => entry.reason === 'uuid'),
        { timeoutMs: 2000, intervalMs: 20 }
      );
      harness.assertEqual(state.gate.state, 'packPending', 'wrong UUID leaves gate pending');
      trace.push('status:wrong_uuid_ignored');

      client.write('resource_pack_receive', {
        uuid: addPack.uuid,
        result: 3
      });
      trace.push('status:accepted');
      client.write('resource_pack_receive', {
        uuid: addPack.uuid,
        result: 4
      });
      trace.push('status:downloaded');
      client.write('resource_pack_receive', {
        uuid: addPack.uuid,
        result: 0
      });
      trace.push('status:successfully_loaded');

      await withTimeout(connectedPromise, HAPPY_TIMEOUT_MS, 'gate connected', timeouts);

      harness.assertEqual(state.gate.state, 'connected', 'gate connected');
      harness.assertEqual(state.gate.loaded, true, 'gate loaded');
      harness.assertEqual(state.gate.cleaned, true, 'gate cleaned after success');
      harness.assertEqual(state.gate.loginWrites, 1, 'gate sent one login');
      harness.assertEqual(state.gate.packWrites, 1, 'gate sent one pack request');
      harness.assertEqual(state.connectCalls, 1, 'local connect called once');
      harness.assertEqual(state.realConnectProvided, true, 'real Bloxd connect callback was provided');
      harness.assertEqual(state.realConnectCalled, false, 'real Bloxd connect callback was never called');

      // Wait for the post-load position before driving the handler pipeline.
      await harness.waitFor(
        'client received post-load position',
        () => clientSeen.has('position'),
        { timeoutMs: 3000, intervalMs: 20 }
      );

      // Real handler pipeline: handlers.minecraft(client) was registered by
      // index.onWorldReady; now register each handler's bloxd() listeners on a
      // local fake Bloxd client and emit real SPacket* fixtures.
      harness.assert(
        state.adapter.listenerCount('position') > 0,
        'index.onWorldReady registered handler position listener'
      );
      harness.assert(
        state.adapter.listenerCount('block_place') > 0,
        'index.onWorldReady registered handler world listener'
      );
      const fake = createFakeBloxd();
      await driveHandlerPipeline(state.adapter, fake, mode, trace);
      state.handlersRegistered = true;
      state.fakeBloxdSends = fake.sends.length;
      state.registryFailures = state.adapter.registryFailures.slice();

      const required = [
        'custom_payload',
        'playerlist_header',
        'player_info',
        'teams',
        'map_chunk',
        'block_change',
        'window_items',
        'set_slot',
        'spawn_entity',
        'entity_metadata',
        'entity_head_rotation',
        'entity_equipment',
        'system_chat',
        'clear_titles',
        'set_title_time',
        'set_title_text',
        'set_title_subtitle',
        'scoreboard_objective',
        'scoreboard_display_objective',
        'scoreboard_score',
        'sound_effect'
      ];
      await harness.waitForPackets(required, clientSeen, {
        timeoutMs: mode === 'dropped-packet' ? 2500 : HAPPY_TIMEOUT_MS,
        intervalMs: 20,
        label: 'decoded 1.21.11 packets after pack load'
      });

      // ------------------------------------------------------------------
      // chunk / light
      // ------------------------------------------------------------------
      const chunk = first('map_chunk');
      harness.assert(chunk, 'map_chunk decoded');
      if (chunk) {
        harness.assertEqual(chunk.x, 0, 'map_chunk.x');
        harness.assertEqual(chunk.z, 0, 'map_chunk.z');
        harness.assert(
          Buffer.isBuffer(chunk.chunkData) && chunk.chunkData.length > 0,
          'map_chunk.chunkData non-empty'
        );
        harness.assertEqual(
          (chunk.heightmaps || []).map((entry) => entry.type).join(','),
          'world_surface,motion_blocking_no_leaves,motion_blocking',
          'map_chunk heightmap types'
        );
        harness.assert(
          Array.isArray(chunk.heightmaps) &&
            chunk.heightmaps.length === 3 &&
            chunk.heightmaps.every((entry) => Array.isArray(entry.data) && entry.data.length === 37),
          'map_chunk heightmap long counts'
        );
        harness.assertEqual(chunk.skyLight && chunk.skyLight.length, 20, 'map_chunk skyLight sections');
        harness.assert(
          chunk.skyLight &&
            chunk.skyLight.every(
              (section) =>
                (Array.isArray(section) || Buffer.isBuffer(section)) &&
                section.length === 2048 &&
                Array.prototype.every.call(section, (byte) => byte === 0xff)
            ),
          'map_chunk skyLight section size and values'
        );
        harness.assert(
          Array.isArray(chunk.skyLightMask) && chunk.skyLightMask[0] > 0n,
          'map_chunk skyLightMask'
        );
        harness.assert(
          Array.isArray(chunk.emptyBlockLightMask) && chunk.emptyBlockLightMask[0] > 0n,
          'map_chunk emptyBlockLightMask'
        );
        const reader = require('./lib/chunk-1.21.11-reader.js');
        let decodedChunk = null;
        try {
          decodedChunk = reader.readChunkData(chunk.chunkData);
        } catch (error) {
          harness.fail('E_CHUNK_READ', 'independent chunk reader rejected chunkData', {
            error: error.code || error.message
          });
        }
        if (decodedChunk) {
          harness.assertEqual(decodedChunk.sections.length, 24, 'decoded chunk section count');
          harness.assertEqual(
            decodedChunk.bytesConsumed,
            chunk.chunkData.length,
            'decoded chunk consumes the whole buffer'
          );
          harness.assertEqual(
            decodedChunk.sections[4].blocks[10 * 256],
            GRASS_STATE_ID,
            'decoded chunk block state'
          );
          harness.assertEqual(
            decodedChunk.sections[4].biomes[0],
            40,
            'decoded chunk biome is plains'
          );
          harness.assertEqual(
            mcData.blocksByStateId[GRASS_STATE_ID] && mcData.blocksByStateId[GRASS_STATE_ID].name,
            'grass_block',
            'grass block oracle'
          );
        }
      }
      trace.push('assert:chunk_light');

      // ------------------------------------------------------------------
      // block changes
      // ------------------------------------------------------------------
      const block = first('block_change');
      harness.assert(block, 'block_change decoded');
      if (block) {
        harness.assertEqual(block.location, { x: 0, y: 11, z: 0 }, 'block_change.location');
        harness.assertEqual(
          mcData.blocksByStateId[block.type] && mcData.blocksByStateId[block.type].name,
          'grass_block',
          'block_change decoded state is grass_block'
        );
      }
      trace.push('assert:block_change');

      // ------------------------------------------------------------------
      // item visuals / names / lore / model
      // ------------------------------------------------------------------
      const assertItem = (item, label, expectedComponents, expectedLore) => {
        harness.assert(item, `${label} item present`);
        if (!item) return;
        harness.assertEqual(item.itemCount, 1, `${label} itemCount`);
        harness.assertEqual(item.itemId, EXPECTED_ITEM_ID, `${label} itemId`);
        harness.assertEqual(
          mcData.items[EXPECTED_ITEM_ID] && mcData.items[EXPECTED_ITEM_ID].name,
          'wooden_pickaxe',
          `${label} item oracle`
        );
        harness.assertEqual(item.addedComponentCount, expectedComponents, `${label} addedComponentCount`);
        harness.assertEqual(item.removedComponentCount, 0, `${label} removedComponentCount`);
        harness.assert(component(item, 'unbreakable'), `${label} unbreakable component`);
        const customName = component(item, 'custom_name');
        harness.assertEqual(nbtText(customName && customName.data), BLOXD_ITEM_NAME, `${label} custom_name`);
        const lore = component(item, 'lore');
        if (expectedLore) {
          harness.assert(Array.isArray(lore && lore.data), `${label} lore present`);
          harness.assertEqual(
            lore && lore.data && lore.data.map((line) => nbtText(line)),
            expectedLore,
            `${label} lore lines`
          );
        }
        const model = component(item, 'item_model');
        harness.assertEqual(model && model.data, EXPECTED_ITEM_MODEL, `${label} item_model`);
      };
      const setSlot = first('set_slot');
      harness.assert(setSlot, 'set_slot decoded');
      if (setSlot) {
        harness.assertEqual(setSlot.windowId, 0, 'set_slot.windowId');
        harness.assertEqual(setSlot.slot, 36, 'set_slot.slot');
        assertItem(setSlot.item, 'set_slot', WOOD_PICKAXE_COMPONENT_COUNT, BLOXD_ITEM_LORE);
      }
      trace.push('assert:item_visuals');

      // ------------------------------------------------------------------
      // inventory
      // ------------------------------------------------------------------
      const windowItems = first('window_items');
      harness.assert(windowItems, 'window_items decoded');
      if (windowItems) {
        harness.assertEqual(windowItems.windowId, 0, 'window_items.windowId');
        harness.assert(
          Array.isArray(windowItems.items) && windowItems.items.length === 45,
          'window_items item count'
        );
        assertItem(
          windowItems.items && windowItems.items[36],
          'window_items',
          WOOD_PICKAXE_COMPONENT_COUNT,
          BLOXD_ITEM_LORE
        );
      }
      trace.push('assert:inventory');

      // ------------------------------------------------------------------
      // equipment
      // ------------------------------------------------------------------
      const equipment = first('entity_equipment');
      harness.assert(equipment, 'entity_equipment decoded');
      if (equipment) {
        harness.assertEqual(equipment.entityId, 1, 'entity_equipment.entityId');
        harness.assertEqual(
          equipment.equipments && equipment.equipments[0] && equipment.equipments[0].slot,
          0,
          'entity_equipment slot'
        );
        assertItem(
          equipment.equipments && equipment.equipments[0] && equipment.equipments[0].item,
          'entity_equipment',
          EQUIPMENT_COMPONENT_COUNT,
          null
        );
      }
      trace.push('assert:equipment');

      // ------------------------------------------------------------------
      // entity metadata
      // ------------------------------------------------------------------
      const spawn = first('spawn_entity');
      harness.assert(spawn, 'spawn_entity decoded');
      if (spawn) {
        harness.assertEqual(spawn.entityId, 1, 'spawn_entity.entityId');
        harness.assertEqual(spawn.type, PLAYER_ENTITY_ID, 'spawn_entity.type');
        harness.assertEqual(
          mcData.entities[PLAYER_ENTITY_ID] && mcData.entities[PLAYER_ENTITY_ID].name,
          'player',
          'spawn_entity oracle'
        );
        harness.assertEqual(spawn.x, 0, 'spawn_entity.x');
        harness.assertEqual(spawn.y, 2, 'spawn_entity.y is in blocks');
        harness.assertEqual(spawn.z, 0, 'spawn_entity.z');
      }
      const metadataPackets = all('entity_metadata').filter((packet) => packet.entityId === 1);
      const metadata = metadataPackets[metadataPackets.length - 1];
      harness.assert(metadata, 'entity_metadata decoded');
      if (metadata) {
        const entries = metadata.metadata || [];
        const flags = entries.find((entry) => entry.key === 0);
        const health = entries.find((entry) => entry.key === 9);
        const air = entries.find((entry) => entry.key === 1);
        harness.assertEqual(flags && flags.value, 0, 'entity_metadata key 0 value');
        harness.assertEqual(health && health.value, 20, 'entity_metadata health value');
        harness.assertEqual(air && air.value, 300, 'entity_metadata air value');
      }
      trace.push('assert:entity_metadata');

      // ------------------------------------------------------------------
      // chat / rich components
      // ------------------------------------------------------------------
      const chat = first('system_chat');
      harness.assert(chat, 'system_chat decoded');
      if (chat) {
        const extra = chat.content && chat.content.value && chat.content.value.extra;
        const firstExtra =
          extra && extra.value && extra.value.value && extra.value.value[0];
        harness.assertEqual(nbtText(firstExtra), 'Hello world', 'system_chat extra text');
        harness.assertEqual(
          firstExtra && firstExtra.color && firstExtra.color.value,
          'red',
          'system_chat extra color'
        );
        harness.assertEqual(chat.isActionBar, false, 'system_chat isActionBar');
      }
      trace.push('assert:chat');

      // ------------------------------------------------------------------
      // title / subtitle / times
      // ------------------------------------------------------------------
      harness.assertEqual(
        first('clear_titles') && first('clear_titles').reset,
        true,
        'clear_titles reset'
      );
      harness.assertEqual(
        first('set_title_time'),
        { fadeIn: 0, stay: 2147483647, fadeOut: 0 },
        'set_title_time'
      );
      const titleText = nbtText(first('set_title_text') && first('set_title_text').text);
      const subtitleText = nbtText(
        first('set_title_subtitle') && first('set_title_subtitle').text
      );
      harness.assertEqual(titleText, 'Main Title', 'set_title_text');
      harness.assertEqual(subtitleText, 'Small Text', 'set_title_subtitle');
      harness.assert(
        titleText !== subtitleText,
        'title and subtitle are not duplicated'
      );
      state.title = {
        text: titleText,
        subtitle: subtitleText,
        time: first('set_title_time'),
        clearReset: first('clear_titles') && first('clear_titles').reset
      };
      trace.push('assert:title');

      // ------------------------------------------------------------------
      // scoreboard / team
      // ------------------------------------------------------------------
      const objective = first('scoreboard_objective');
      harness.assert(objective, 'scoreboard_objective decoded');
      if (objective) {
        harness.assertEqual(objective.name, 'scoreboard', 'scoreboard_objective.name');
        harness.assertEqual(objective.action, 0, 'scoreboard_objective.action');
        harness.assertEqual(
          nbtText(objective.displayText),
          'SKYWARS',
          'scoreboard_objective.displayText'
        );
      }
      harness.assertEqual(
        first('scoreboard_display_objective'),
        { position: 1, name: 'scoreboard' },
        'scoreboard_display_objective'
      );
      const scores = all('scoreboard_score');
      harness.assertEqual(
        scores.map((score) => ({
          itemName: score.itemName,
          scoreName: score.scoreName,
          value: score.value
        })),
        [
          { itemName: 'alpha', scoreName: 'scoreboard', value: 4 },
          { itemName: 'beta', scoreName: 'scoreboard', value: 3 },
          { itemName: '', scoreName: 'scoreboard', value: 2 },
          { itemName: '\u00a7ebloxd.io', scoreName: 'scoreboard', value: 1 }
        ],
        'scoreboard_score lines'
      );
      const team = all('teams').find(
        (packet) => Array.isArray(packet.players) && packet.players.includes('IntegrationTester')
      );
      harness.assert(team, 'local teams decoded');
      if (team) {
        harness.assertEqual(team.mode, 'add', 'teams.mode');
        harness.assertEqual(team.players, ['IntegrationTester'], 'teams.players');
        harness.assertEqual(team.flags && team.flags.friendly_fire, true, 'teams.friendly_fire');
        harness.assertEqual(team.nameTagVisibility, 'always', 'teams.nameTagVisibility');
        harness.assertEqual(nbtText(team.prefix), '', 'teams.prefix');
        harness.assertEqual(nbtText(team.suffix), '', 'teams.suffix');
      }
      trace.push('assert:scoreboard_team');

      // ------------------------------------------------------------------
      // sound
      // ------------------------------------------------------------------
      const sound = first('sound_effect');
      harness.assert(sound, 'sound_effect decoded');
      if (sound) {
        harness.assert(sound.sound && sound.sound.soundId > 0, 'sound_effect.soundId');
        harness.assertEqual(sound.x, 0, 'sound_effect.x');
        harness.assertEqual(sound.y, 640, 'sound_effect.y');
        harness.assertEqual(sound.z, 0, 'sound_effect.z');
        harness.assertEqual(sound.volume, 1, 'sound_effect.volume');
        harness.assert(
          Math.abs(sound.pitch - 1.2) < 1e-6,
          'sound_effect.pitch',
          { actual: sound.pitch }
        );
      }
      trace.push('assert:sound');

      // ------------------------------------------------------------------
      // negative packet / status
      // ------------------------------------------------------------------
      const soundCountBefore = all('sound_effect').length;
      const rejected = state.adapter.write('named_sound_effect', {
        soundName: 'bloxd.invalid.sound',
        x: 0,
        y: 0,
        z: 0,
        volume: 1,
        pitch: 1
      });
      harness.assertEqual(rejected, false, 'negative unknown sound rejected');
      harness.assert(
        state.adapter.writeErrors.some((entry) => entry.message.includes('E_UNKNOWN_SOUND')),
        'negative unknown sound error recorded'
      );
      harness.assertEqual(
        all('sound_effect').length,
        soundCountBefore,
        'negative unknown sound emitted no packet'
      );
      harness.assert(
        state.gate.ignoredStatuses.some((entry) => entry.reason === 'uuid'),
        'negative wrong UUID status ignored'
      );
      state.negative = {
        unknownSoundRejected: rejected === false,
        unknownSoundError: 'E_UNKNOWN_SOUND',
        wrongUuidIgnored: true
      };
      trace.push('assert:negative');

      // ------------------------------------------------------------------
      // transcript / traffic invariants
      // ------------------------------------------------------------------
      const loginWrites = wire.filter((entry) => entry.name === 'login').length;
      const packWrites = wire.filter((entry) => entry.name === 'add_resource_pack').length;
      const positionWrites = wire.filter((entry) => entry.name === 'position').length;
      harness.assertEqual(loginWrites, 1, 'exactly one play login on the wire');
      harness.assertEqual(packWrites, 1, 'exactly one pack request on the wire');
      harness.assertEqual(positionWrites, 1, 'exactly one initial position');
      harness.assertEqual(state.clientLogins, 1, 'client entered play exactly once');
      harness.assertEqual(state.clientPositions, 1, 'client received exactly one position');

      if (mode === 'happy') {
        harness.assertEqual(wire.map((entry) => entry.name), expectedWire(), 'exact wire transcript');
        harness.assertEqual(trace, expectedTrace(), 'exact event transcript');
      }
    }

    // Traffic invariants apply to every mode.
    const worldBeforeLoad = wire.filter(
      (entry) => !entry.loaded && WORLD_PACKET_NAMES.has(entry.name)
    ).length;
    const itemBeforeLoad = wire.filter(
      (entry) => !entry.loaded && ITEM_PACKET_NAMES.has(entry.name)
    ).length;
    harness.assertEqual(worldBeforeLoad, 0, 'zero world packets before pack load');
    harness.assertEqual(itemBeforeLoad, 0, 'zero item packets before pack load');
    harness.assertEqual(state.realConnectCalled, false, 'no live Bloxd connect attempted');
    harness.assertEqual(clientErrors.length, 0, 'clientErrors');
    harness.assertEqual(serverErrors.length, 0, 'serverErrors');

    if (mode === 'happy') {
      harness.assertEqual(timeouts.length, 0, 'timeout');
      harness.assertEqual(harness.timeouts.length, 0, 'harness timeouts');
    }
  } catch (error) {
    harness.fail('E_UNCAUGHT', `${mode} failed before completion`, {
      error: { name: error.name, message: error.message, stack: error.stack }
    });
  } finally {
    try {
      if (client && !client.ended) client.end('integration complete');
    } catch (_error) {
      // best-effort close
    }
    await delay(50);
    if (handlers.entity && handlers.entity.swingInterval) {
      clearInterval(handlers.entity.swingInterval);
    }
    if (handlers.misc && handlers.misc.currencyLoop) {
      clearInterval(handlers.misc.currencyLoop);
    }
    if (handlers.misc && handlers.misc.friends && handlers.misc.friends.updateInterval) {
      clearInterval(handlers.misc.friends.updateInterval);
    }
    if (handlers.anticheat && typeof handlers.anticheat.cleanup === 'function') {
      handlers.anticheat.cleanup();
    }
    if (originalFetch) global.fetch = originalFetch;
    try {
      await index.stop();
    } catch (error) {
      harness.fail('E_STOP', 'index.stop failed', { error: error.message });
    }
  }

  const worldBeforeLoad = wire.filter(
    (entry) => !entry.loaded && WORLD_PACKET_NAMES.has(entry.name)
  ).length;
  const itemBeforeLoad = wire.filter(
    (entry) => !entry.loaded && ITEM_PACKET_NAMES.has(entry.name)
  ).length;
  const worldTotal = wire.filter((entry) => WORLD_PACKET_NAMES.has(entry.name)).length;
  const itemTotal = wire.filter((entry) => ITEM_PACKET_NAMES.has(entry.name)).length;
  const loginWrites = wire.filter((entry) => entry.name === 'login').length;
  const packWrites = wire.filter((entry) => entry.name === 'add_resource_pack').length;

  const summary = {
    mode,
    ok: harness.failures.length === 0 && harness.skips.length === 0 && harness.timeouts.length === 0,
    assertions: harness.assertions,
    failures: harness.failures.map((failure) => ({
      code: failure.code,
      message: failure.message
    })),
    clientErrors: clientErrors.length,
    serverErrors: serverErrors.length,
    timeout: timeouts.length,
    harnessTimeouts: harness.timeouts.length,
    loginWrites,
    packWrites,
    clientLogins: state.clientLogins,
    clientPositions: state.clientPositions,
    worldPacketsBeforeLoad: worldBeforeLoad,
    itemPacketsBeforeLoad: itemBeforeLoad,
    worldPacketsTotal: worldTotal,
    itemPacketsTotal: itemTotal,
    connectCalls: state.connectCalls,
    realConnectProvided: state.realConnectProvided,
    realConnectCalled: state.realConnectCalled,
    realConnectSuppressed: state.realConnectProvided && !state.realConnectCalled,
    handlersRegistered: state.handlersRegistered,
    fakeBloxdSends: state.fakeBloxdSends || 0,
    registryFailures: state.registryFailures,
    sha1Match: state.sha1Match,
    bytesMatch: state.bytesMatch,
    download: state.download
      ? {
          statusCode: state.download.statusCode,
          contentType: state.download.contentType,
          bytes: state.download.bytes.length,
          sha1: state.download.sha1
        }
      : null,
    pack: state.addPack
      ? {
          uuid: state.addPack.uuid,
          url: state.addPack.url,
          hash: state.addPack.hash,
          forced: state.addPack.forced,
          promptMessageType: typeof state.addPack.promptMessage
        }
      : null,
    gate: state.gate
      ? {
          state: state.gate.state,
          loaded: state.gate.loaded,
          cleaned: state.gate.cleaned,
          loginWrites: state.gate.loginWrites,
          packWrites: state.gate.packWrites,
          acceptedStatuses: state.gate.acceptedStatuses.slice(),
          progressStatuses: state.gate.progressStatuses.slice(),
          ignoredStatuses: state.gate.ignoredStatuses.slice(),
          failure: state.gateFailure
        }
      : null,
    negative: state.negative,
    titles: state.title,
    wire: wire.map((entry) => ({ name: entry.name, loaded: entry.loaded })),
    trace,
    transcriptExact: mode === 'happy' ? harness.failures.length === 0 : null
  };

  return { harness, summary };
}

function printResult(summary) {
  console.log(`RUN_RESULT ${JSON.stringify(summary)}`);
}

async function runSingle(mode) {
  const { harness, summary } = await runIntegration(mode);

  // Failure injection modes are expected to fail the run. Record that as an
  // explicit harness failure so the printed PASS/FAIL line agrees with the
  // process exit code (no misleading success).
  let detected = null;
  if (mode !== 'happy') {
    detected = detectInjection(mode, summary);
    summary.injectionDetected = detected;
    summary.ok = detected;
    if (detected) {
      harness.fail('E_INJECTION', `${mode} injection detected; run exits non-zero by design`);
    } else {
      harness.fail('E_INJECTION_NOT_DETECTED', `${mode} injection was not detected`);
    }
  }

  const harnessCode = harness.finish();
  summary.harnessOk = harnessCode === 0;

  if (mode === 'happy') {
    summary.ok = harnessCode === 0;
    printResult(summary);
    if (harnessCode !== 0) process.exit(1);
    const packTranscript = {
      mode,
      mcVersion: MC_VERSION,
      login: {
        wireLoginWrites: summary.loginWrites,
        gateLoginWrites: summary.gate && summary.gate.loginWrites,
        clientPlayLogins: summary.clientLogins
      },
      pack: summary.pack,
      download: summary.download,
      sha1Match: summary.sha1Match,
      bytesMatch: summary.bytesMatch,
      statuses: {
        wrongUuidIgnored: Boolean(
          summary.gate &&
            summary.gate.ignoredStatuses.some((entry) => entry.reason === 'uuid')
        ),
        accepted: 3,
        downloaded: 4,
        successfullyLoaded: 0
      },
      gate: summary.gate,
      zeroWorldBeforeLoad: summary.worldPacketsBeforeLoad,
      zeroItemBeforeLoad: summary.itemPacketsBeforeLoad,
      clientErrors: summary.clientErrors,
      serverErrors: summary.serverErrors,
      timeout: summary.timeout,
      connectCalls: summary.connectCalls,
      realConnectProvided: summary.realConnectProvided,
      realConnectCalled: summary.realConnectCalled,
      realConnectSuppressed: summary.realConnectSuppressed,
      handlersRegistered: summary.handlersRegistered,
      fakeBloxdSends: summary.fakeBloxdSends,
      registryFailures: summary.registryFailures,
      titles: summary.titles,
      wire: summary.wire,
      trace: summary.trace
    };
    console.log(`PACK_TRANSCRIPT ${JSON.stringify(packTranscript)}`);
    process.exit(0);
  }

  // Failure injection modes must prove the fault was detected and must exit
  // non-zero. The parent --all run checks the marker plus exit code.
  printResult(summary);
  if (detected) console.log(`INJECTION_DETECTED ${mode}`);
  else console.log(`INJECTION_NOT_DETECTED ${mode}`);
  process.exit(1);
}

function detectInjection(mode, summary) {
  if (mode === 'pack-decline') {
    return (
      summary.gate &&
      summary.gate.failure &&
      summary.gate.failure.code === 'E_PACK_DECLINED' &&
      summary.worldPacketsTotal === 0 &&
      summary.itemPacketsTotal === 0
    );
  }
  if (mode === 'download-failure') {
    return (
      summary.gate &&
      summary.gate.failure &&
      summary.gate.failure.code === 'E_PACK_FAILED_DOWNLOAD' &&
      summary.worldPacketsTotal === 0 &&
      summary.itemPacketsTotal === 0
    );
  }
  if (mode === 'timeout') {
    return (
      summary.gate &&
      summary.gate.failure &&
      summary.gate.failure.code === 'E_PACK_TIMEOUT' &&
      summary.worldPacketsTotal === 0 &&
      summary.itemPacketsTotal === 0
    );
  }
  if (mode === 'missing-model') {
    const registryMissingModel = (summary.registryFailures || []).some(
      (failure) => failure.code === 'E_MISSING_ITEM_MODEL'
    );
    const itemFieldFailure = summary.failures.some(
      (failure) =>
        /^(set_slot|window_items) (itemId|itemCount|addedComponentCount)$/.test(
          failure.message
        )
    );
    return registryMissingModel && itemFieldFailure;
  }
  if (mode === 'wrong-component-count') {
    return summary.failures.some((failure) =>
      /^(set_slot|window_items) addedComponentCount$/.test(failure.message)
    );
  }
  if (mode === 'dropped-packet') {
    return (
      summary.harnessTimeouts > 0 &&
      summary.failures.some(
        (failure) => failure.code === 'E_TIMEOUT' || failure.code === 'E_MISSING_PACKET'
      )
    );
  }
  return false;
}

function parseMode(argv) {
  const modeIndex = argv.indexOf('--mode');
  if (modeIndex !== -1) {
    const mode = argv[modeIndex + 1];
    if (!MODES.includes(mode)) {
      console.error(`unknown mode: ${mode}`);
      process.exit(2);
    }
    return mode;
  }
  if (argv.includes('--happy')) return 'happy';
  if (argv.includes('--all')) return 'all';
  console.error(
    'usage: node test/integration-1.21.11.js [--all | --happy | --mode <' +
      MODES.join('|') +
      '>]'
  );
  process.exit(2);
}

function parseRunResult(stdout) {
  const line = stdout
    .split(/\r?\n/)
    .reverse()
    .find((entry) => entry.startsWith('RUN_RESULT '));
  if (!line) return null;
  try {
    return JSON.parse(line.slice('RUN_RESULT '.length));
  } catch (_error) {
    return null;
  }
}

function parsePackTranscript(stdout) {
  const line = stdout
    .split(/\r?\n/)
    .reverse()
    .find((entry) => entry.startsWith('PACK_TRANSCRIPT '));
  if (!line) return null;
  try {
    return JSON.parse(line.slice('PACK_TRANSCRIPT '.length));
  } catch (_error) {
    return null;
  }
}

function runAll() {
  const runs = [];
  const logParts = [];
  let packTranscript = null;
  let ok = true;
  const problems = [];

  for (const mode of MODES) {
    const result = spawnSync(process.execPath, [__filename, '--mode', mode], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 60000,
      env: Object.assign({}, process.env, { BLOXD_INTEGRATION_CHILD: '1' })
    });
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    const summary = parseRunResult(stdout);
    const expectedExit = mode === 'happy' ? 0 : 1;
    const injected = stdout.includes(`INJECTION_DETECTED ${mode}`);
    if (mode === 'happy') packTranscript = parsePackTranscript(stdout);

    logParts.push(`=== RUN ${mode} (exit ${result.status}) ===`);
    logParts.push(stdout.trimEnd());
    if (stderr.trim().length > 0) logParts.push(`--- stderr ---`);
    if (stderr.trim().length > 0) logParts.push(stderr.trimEnd());
    logParts.push('');

    runs.push({
      mode,
      exitCode: result.status,
      expectedExit,
      injected: mode === 'happy' ? null : injected,
      summary
    });

    if (result.status !== expectedExit) {
      ok = false;
      problems.push(`${mode}: exit ${result.status}, expected ${expectedExit}`);
    }
    if (mode !== 'happy' && !injected) {
      ok = false;
      problems.push(`${mode}: injection was not detected`);
    }
    if (!summary) {
      ok = false;
      problems.push(`${mode}: missing RUN_RESULT`);
      continue;
    }
    if (summary.ok !== true) {
      ok = false;
      problems.push(`${mode}: summary.ok = ${summary.ok}`);
    }
    if (summary.worldPacketsBeforeLoad !== 0) {
      ok = false;
      problems.push(`${mode}: world packets before load = ${summary.worldPacketsBeforeLoad}`);
    }
    if (summary.itemPacketsBeforeLoad !== 0) {
      ok = false;
      problems.push(`${mode}: item packets before load = ${summary.itemPacketsBeforeLoad}`);
    }
    if (summary.realConnectCalled !== false) {
      ok = false;
      problems.push(`${mode}: real Bloxd connect callback was called`);
    }
    if (summary.realConnectSuppressed !== true) {
      ok = false;
      problems.push(`${mode}: real Bloxd connect was not explicitly suppressed`);
    }
    if (GATE_FAILURE_MODES.has(mode)) {
      if (summary.connectCalls !== 0) {
        ok = false;
        problems.push(`${mode}: local connect calls = ${summary.connectCalls}`);
      }
      if (summary.worldPacketsTotal !== 0) {
        ok = false;
        problems.push(`${mode}: world packets total = ${summary.worldPacketsTotal}`);
      }
      if (summary.itemPacketsTotal !== 0) {
        ok = false;
        problems.push(`${mode}: item packets total = ${summary.itemPacketsTotal}`);
      }
    }
    if (mode === 'happy') {
      if (summary.clientErrors !== 0) {
        ok = false;
        problems.push(`happy: clientErrors = ${summary.clientErrors}`);
      }
      if (summary.serverErrors !== 0) {
        ok = false;
        problems.push(`happy: serverErrors = ${summary.serverErrors}`);
      }
      if (summary.timeout !== 0) {
        ok = false;
        problems.push(`happy: timeout = ${summary.timeout}`);
      }
      if (!summary.sha1Match || !summary.bytesMatch) {
        ok = false;
        problems.push('happy: pack download did not match the server bytes/SHA-1');
      }
      if (summary.loginWrites !== 1) {
        ok = false;
        problems.push(`happy: loginWrites = ${summary.loginWrites}`);
      }
      if (summary.connectCalls !== 1) {
        ok = false;
        problems.push(`happy: connectCalls = ${summary.connectCalls}`);
      }
      if (summary.realConnectProvided !== true) {
        ok = false;
        problems.push('happy: real Bloxd connect callback was not provided');
      }
      if (summary.handlersRegistered !== true) {
        ok = false;
        problems.push('happy: handler bloxd() pipeline was not registered');
      }
      if (!summary.fakeBloxdSends || summary.fakeBloxdSends <= 0) {
        ok = false;
        problems.push('happy: fake Bloxd client received no handler sends');
      }
      if (summary.worldPacketsBeforeLoad !== 0 || summary.itemPacketsBeforeLoad !== 0) {
        ok = false;
        problems.push('happy: forbidden pre-load traffic');
      }
      if (summary.transcriptExact !== true) {
        ok = false;
        problems.push('happy: exact transcript was not verified');
      }
      if (!packTranscript) {
        ok = false;
        problems.push('happy: missing pack transcript');
      }
    }
  }

  const happyRun = runs.find((run) => run.mode === 'happy');

  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'task-23.log'), logParts.join('\n') + '\n');
  fs.writeFileSync(
    path.join(EVIDENCE_DIR, 'task-23.json'),
    `${JSON.stringify(
      {
        ok,
        mode: 'all',
        mcVersion: MC_VERSION,
        note:
          'Local 1.21.11 protocol integration only; no live Bloxd and no real Fabric UI/render claim. Real index.onWorldReady registered handlers.minecraft; the test then registered each handler bloxd() on a local fake Bloxd EventEmitter and emitted real SPacket* fixtures. Handlers drove the real adapter; no direct adapter.write for the happy-path groups.',
        problems,
        runs
      },
      null,
      2
    )}\n`
  );
  fs.writeFileSync(
    path.join(EVIDENCE_DIR, 'task-23-pack-transcript.json'),
    `${JSON.stringify(packTranscript, null, 2)}\n`
  );

  console.log(
    `INTEGRATION-1.21.11 ${ok ? 'PASS' : 'FAIL'} runs=${runs.length} ` +
      `happy=${happyRun ? happyRun.exitCode : 'missing'} ` +
      `injections=${runs.filter((run) => run.mode !== 'happy' && run.injected).length}/${FAILURE_MODES.length}`
  );
  if (problems.length > 0) {
    for (const problem of problems) console.log(`PROBLEM ${problem}`);
  }
  return ok ? 0 : 1;
}

if (require.main === module) {
  const mode = parseMode(process.argv.slice(2));
  if (mode === 'all') {
    process.exit(runAll());
  }
  runSingle(mode).catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}

