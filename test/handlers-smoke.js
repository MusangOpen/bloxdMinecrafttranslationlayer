'use strict';

const assert = require('assert');
const { EventEmitter } = require('events');
const handlers = require('../bloxd/handlers/init.js');
const { createHarness } = require('./lib/harness');

const harness = createHarness({ name: 'handlers-smoke' });
const writes = [];
const sends = [];

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

const mc = new EventEmitter();
mc.write = (name, data) => {
  writes.push({ name, data });
  return true;
};
mc.end = () => {};
mc.ended = false;
mc.username = 'Tester';
mc.uuid = '00000000-0000-0000-0000-000000000123';
mc.protocolVersion = 774;

const blox = new EventEmitter();
blox.room = { state: { entities: mapLike(), items: mapLike(), tickCounter: 0 } };
blox.stateCallbacks = (target) => {
  if (target === blox.room.state) {
    return { entities: blox.room.state.entities.proxy, items: blox.room.state.items.proxy };
  }
  return { listen() {} };
};
blox.settings = {
  canPickUpItems: true,
  runningSpeed: 7,
  walkingSpeed: 4,
  secsToRespawn: 5
};
blox.settingsEvent = new EventEmitter();
blox.send = (name, data) => {
  sends.push({ name, data });
};
blox.connected = true;
blox.gameName = 'skywars';
blox.lobbyName = 'lobby';
blox.ip = '';

function allWrites(name) {
  return writes.filter((entry) => entry.name === name);
}

function oneWrite(name) {
  const entries = allWrites(name);
  harness.assertEqual(entries.length, 1, `${name} write count`, { writes: writes.map((entry) => entry.name) });
  return entries[0] && entries[0].data;
}

function allSends(name) {
  return sends.filter((entry) => entry.name === name);
}

const originalFetch = global.fetch;
global.fetch = async () => {
  throw new Error('network disabled by handlers-smoke');
};

try {
  Object.values(handlers).forEach((handler) => handler.obtainHandlers(handlers, () => {}));
  Object.values(handlers).forEach((handler) => handler.minecraft(mc));

  const preJoinWriteCount = writes.length;
  const preJoinSendCount = sends.length;
  mc.emit('flying');
  mc.emit('position', { x: 1, y: 64, z: 1, onGround: true });
  mc.emit('look', { yaw: 0, pitch: 0, onGround: true });
  mc.emit('position_look', { x: 1, y: 64, z: 1, yaw: 0, pitch: 0, onGround: true });
  mc.emit('held_item_slot', { slotId: 1 });
  mc.emit('arm_animation');
  mc.emit('spectate');
  harness.assertEqual(writes.length, preJoinWriteCount, 'pre-join writes are suppressed');
  harness.assertEqual(sends.length, preJoinSendCount, 'pre-join Bloxd sends are suppressed');

  Object.values(handlers).forEach((handler) =>
    handler.bloxd(blox, { eId: '1', pass: [1, 2, 3, 4, 5, 6, 7, 8] })
  );

  blox.room.state.entities.onAdd(
    {
      type: 'Player',
      name: 'Tester',
      x: 0,
      y: 64,
      z: 0,
      heading: 0,
      cameraPitch: 0,
      heldItemName: 'Air',
      listen() {}
    },
    '1'
  );
  blox.room.state.entities.onAdd(
    {
      type: 'Player',
      name: 'Other',
      x: 2,
      y: 64,
      z: 2,
      heading: 0,
      cameraPitch: 0,
      heldItemName: 'Air',
      listen() {}
    },
    '2'
  );

  const spawnBlockDrop = { id: 1513, x: 1, y: 64, z: 1, amount: 1, listen() {} };
  let spawnBlockThrew = null;
  try {
    blox.room.state.items.onAdd(spawnBlockDrop, 'drop-1513');
  } catch (error) {
    spawnBlockThrew = error;
  }
  harness.assertEqual(spawnBlockThrew, null, 'air-backed Spawn Block drop does not throw');
  harness.assertEqual(
    handlers.entity.entities['drop-1513'] && handlers.entity.entities['drop-1513'].metadata[0].value.blockId,
    0,
    'air-backed Spawn Block drop keeps blockId 0'
  );

  let unknownDropThrew = null;
  try {
    blox.room.state.items.onAdd({ name: 'Nonexistent Test Item', x: 1, y: 64, z: 1, amount: 1, listen() {} }, 'drop-unknown');
  } catch (error) {
    unknownDropThrew = error;
  }
  harness.assertEqual(unknownDropThrew, null, 'unresolved drop is contained');
  harness.assertEqual(handlers.entity.entities['drop-unknown'], undefined, 'unresolved drop is not registered');

  blox.emit('SPacketEntitySetting', { eId: '1', settings: { _isAlive: true, canSee: true } });
  blox.emit('SPacketServerSetting', { canPickUpItems: true, walkingSpeed: 4 });

  mc.emit('held_item_slot', { slotId: 3 });
  mc.emit('arm_animation');
  mc.emit('position', { x: 2, y: 64, z: 2, onGround: true });
  mc.emit('spectate');
  blox.emit('SPacketPlayerTeleport', { x: 120, y: 70, z: -240, id: 5 });
  const teleportPosition = allWrites('position').slice(-1)[0].data;
  harness.assertEqual(teleportPosition.x, 120, 'teleport position x');
  harness.assertEqual(teleportPosition.y, 70, 'teleport position y');
  harness.assertEqual(teleportPosition.z, -240, 'teleport position z');
  harness.assertEqual(handlers.entity.local.pos.x, 120, 'teleport updates local pos x');
  harness.assertEqual(handlers.entity.local.pos.z, -240, 'teleport updates local pos z');
  blox.emit('SPacketViewAngles', [0, 0, 1]);
  const viewPosition = allWrites('position').slice(-1)[0].data;
  harness.assertEqual(viewPosition.x, 120, 'view angles keeps teleported x');
  harness.assertEqual(viewPosition.y, 70, 'view angles keeps teleported y');
  harness.assertEqual(viewPosition.z, -240, 'view angles keeps teleported z');
  const sendsBeforeLook = allSends('CPacketMovePlayer').length;
  mc.emit('look', { yaw: 0, pitch: 0, onGround: true });
  harness.assertEqual(allSends('CPacketMovePlayer').length, sendsBeforeLook, 'pending teleport blocks move packets');
  mc.emit('position', { x: 2, y: 64, z: 2, onGround: true });
  harness.assertEqual(handlers.entity.local.pos.x, 120, 'stale position echo ignored while teleport pending');
  harness.assertEqual(handlers.entity.local.pos.z, -240, 'stale position echo keeps teleported z');
  mc.emit('position', { x: 120, y: 70, z: -240, onGround: true });
  harness.assertEqual(handlers.entity.teleport, undefined, 'matching position clears the pending teleport');
  handlers.entity.ignoreTeleport = 0;
  blox.emit('SPacketLogError', 'Position corrected');
  blox.emit('SPacketLogError', 'boom');
  blox.settingsEvent.emit('_health', 50);
  blox.settingsEvent.emit('RightInfoText', [{ str: 'alpha' }, { str: '\n' }, { str: 'beta' }]);
  blox.settingsEvent.emit('middleTextUpper', 'Hello');
  blox.settingsEvent.emit('middleTextLower', 'Small');
  blox.emit('SPacketEntityDamage', {
    eId: '2',
    yourAttack: false,
    kbParticles: false,
    critParticles: false,
    damageAmount: 1,
    damageAngle: null,
    healthFrac: null
  });

  blox.emit('SPacketPlaySound', { namePrefix: 'cannonFire', posSettings: { playerIdOrPos: [1, 64, 1] } });
  const cannonSounds = writes.filter((entry) => entry.name === 'named_sound_effect' && entry.data.soundName === 'random.explode');
  harness.assertEqual(cannonSounds.length, 1, 'cannonFire emits exactly one explosion sound');
  harness.assertEqual(
    writes.some((entry) => entry.name === 'named_sound_effect' && entry.data.soundName === 'dig.cannonFire'),
    false,
    'cannonFire does not fall through to dig.cannonFire'
  );

  for (const entry of writes) {
    harness.assert(typeof entry.name === 'string' && entry.name.length > 0, 'every mc.write has a packet name', entry);
    harness.assert(entry.data !== undefined, `mc.write ${entry.name} has payload`, entry.name);
  }

  const header = oneWrite('playerlist_header');
  if (header) {
    harness.assertEqual(JSON.parse(header.header), { text: '\u00A7bYou are playing on \u00A7abloxd.io' }, 'playerlist_header.header');
    harness.assertEqual(JSON.parse(header.footer), { text: '\u00A76Translation layer made by 7GrandDad' }, 'playerlist_header.footer');
  }

  const infos = allWrites('player_info');
  harness.assertEqual(infos.length, 2, 'player_info write count');
  const localInfo = infos.find((entry) => entry.data.data && entry.data.data[0].name === 'Tester');
  const otherInfo = infos.find((entry) => entry.data.data && entry.data.data[0].name === 'Other');
  if (localInfo) {
    harness.assertEqual(localInfo.data.action, 0, 'local player_info action');
    harness.assertEqual(localInfo.data.data[0].UUID, mc.uuid, 'local player_info UUID');
  } else {
    harness.assert(false, 'local player_info captured');
  }
  if (otherInfo) {
    harness.assertEqual(otherInfo.data.action, 0, 'other player_info action');
    harness.assert(otherInfo.data.data[0].UUID !== mc.uuid, 'other player_info UUID is distinct');
  } else {
    harness.assert(false, 'other player_info captured');
  }

  const teams = allWrites('scoreboard_team');
  harness.assertEqual(teams.length, 2, 'scoreboard_team write count');
  harness.assertEqual(teams.map((entry) => entry.data.players[0]).sort(), ['Other', 'Tester'], 'scoreboard_team players');
  harness.assertEqual(teams.every((entry) => entry.data.mode === 0 && entry.data.friendlyFire === true), true, 'scoreboard_team mode');

  harness.assertEqual(oneWrite('update_health'), { health: 10, food: 19, foodSaturation: 20 }, 'update_health after _health');

  harness.assertEqual(
    oneWrite('chat'),
    { message: JSON.stringify({ extra: ['\u00A7cSErr: boom'], text: '' }), position: 0 },
    'chat after SPacketLogError'
  );

  const titles = allWrites('title');
  harness.assertEqual(titles.length, 4, 'title write count');
  if (titles.length === 4) {
    harness.assertEqual(titles[0].data, { action: 4, fadeIn: -1, stay: -1, fadeOut: -1 }, 'title clear');
    harness.assertEqual(titles[1].data, { action: 2, fadeIn: 0, stay: 2147483647, fadeOut: 0 }, 'title time');
    harness.assertEqual(titles[2].data, { action: 0, text: JSON.stringify({ text: 'Hello' }) }, 'title text');
    harness.assertEqual(titles[3].data, { action: 1, text: JSON.stringify({ text: 'Small' }) }, 'subtitle text');
  }

  const objective = oneWrite('scoreboard_objective');
  if (objective) {
    harness.assertEqual(objective.name, 'scoreboard', 'scoreboard_objective.name');
    harness.assertEqual(objective.action, 0, 'scoreboard_objective.action');
    harness.assertEqual(objective.displayText, '\u00A7e\u00A7lSKYWARS', 'scoreboard_objective.displayText');
  }
  harness.assertEqual(
    oneWrite('scoreboard_display_objective'),
    { position: 1, name: 'scoreboard' },
    'scoreboard_display_objective'
  );
  const scores = allWrites('scoreboard_score');
  harness.assertEqual(
    scores.map((entry) => ({ itemName: entry.data.itemName, value: entry.data.value })),
    [
      { itemName: 'alpha', value: 4 },
      { itemName: 'beta', value: 3 },
      { itemName: '', value: 2 },
      { itemName: '\u00A7ebloxd.io', value: 1 }
    ],
    'scoreboard_score lines'
  );

  harness.assertEqual(
    oneWrite('entity_status'),
    { entityId: '2', entityStatus: 2 },
    'entity_status after SPacketEntityDamage'
  );

  const selects = allSends('CPacketSelectSlot');
  harness.assertEqual(selects.length, 1, 'CPacketSelectSlot send count');
  harness.assertEqual(selects[0] && selects[0].data, 3, 'CPacketSelectSlot slot');
  const moves = allSends('CPacketMovePlayer');
  harness.assertEqual(moves.length, 1, 'post-ready CPacketMovePlayer send count');
  harness.assertEqual(
    moves[0] && moves[0].data.x,
    2,
    'post-ready CPacketMovePlayer x'
  );
  harness.assertEqual(
    moves[0] && moves[0].data.speed,
    4,
    'post-ready CPacketMovePlayer walking speed'
  );

  const swings = allSends('CPacketSwingItem');
  harness.assertEqual(swings.length, 2, 'CPacketSwingItem send count');
  harness.assertEqual(
    swings[0] && swings[0].data,
    { type: 2, doubleClick: false, targetPos: null, targetBlock: null },
    'CPacketSwingItem payload'
  );
  harness.assertEqual(
    swings[1] && swings[1].data,
    { type: 1, doubleClick: false, targetPos: null, targetBlock: null },
    'spectate CPacketSwingItem payload'
  );

  const sentinel = new Error('sentinel-move-failure');
  const originalSend = blox.send;
  blox.send = (name, data) => {
    if (name === 'CPacketMovePlayer') throw sentinel;
    return originalSend(name, data);
  };
  try {
    assert.throws(
      () => mc.emit('position', { x: 3, y: 64, z: 3, onGround: true }),
      (error) => error === sentinel
    );
  } finally {
    blox.send = originalSend;
  }

  harness.assertEqual(blox.settings.walkingSpeed, 4, 'SPacketServerSetting walkingSpeed');
  harness.assertEqual(blox.settings.canPickUpItems, true, 'SPacketServerSetting canPickUpItems');
} catch (error) {
  harness.fail('E_HANDLER_EXCEPTION', 'handler smoke threw', {
    error: { name: error.name, message: error.message, stack: error.stack }
  });
} finally {
  for (const handler of Object.values(handlers)) {
    try {
      handler.cleanup();
    } catch (error) {
      harness.fail('E_CLEANUP', 'handler cleanup threw', {
        error: { name: error.name, message: error.message, stack: error.stack }
      });
    }
  }
  if (handlers.entity.respawnTimeout) clearTimeout(handlers.entity.respawnTimeout);
  global.fetch = originalFetch;
  harness.cleanup();
  process.exit(harness.finish());
}
