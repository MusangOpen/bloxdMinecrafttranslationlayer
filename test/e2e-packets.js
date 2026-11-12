'use strict';

const mc = require('minecraft-protocol');
const Vec3 = require('vec3');
const Chunk18 = require('prismarine-chunk')('1.8.9');
const LegacyClient = require('../mc/client.js');
const { createHarness } = require('./lib/harness');

const PORT = 25601;
const UUID = '00000000-0000-0000-0000-000000000123';
const REQUIRED_PACKETS = [
  'login',
  'position',
  'system_chat',
  'set_title_text',
  'set_title_subtitle',
  'set_title_time',
  'clear_titles',
  'tab_complete',
  'playerlist_header',
  'player_info',
  'scoreboard_objective',
  'scoreboard_display_objective',
  'scoreboard_score',
  'teams',
  'sound_effect',
  'spawn_entity',
  'entity_metadata',
  'entity_equipment',
  'entity_teleport',
  'entity_velocity',
  'entity_head_rotation',
  'animation',
  'entity_status',
  'entity_effect',
  'remove_entity_effect',
  'update_health',
  'experience',
  'collect',
  'entity_destroy',
  'block_change',
  'block_break_animation',
  'open_window',
  'window_items',
  'set_slot',
  'close_window',
  'respawn',
  'custom_payload',
  'world_particles'
];
const selfTestIndex = process.argv.indexOf('--self-test');
const INJECT_WRITE_ERROR =
  selfTestIndex !== -1 && process.argv[selfTestIndex + 1] === 'write-error';

const harness = createHarness({ name: 'e2e-packets' });
harness.loadBaseline();
harness.watchAdapterErrors();

const server = mc.createServer({ 'online-mode': false, port: PORT, version: '1.21.11', motd: 'packets' });
const seen = new Set();
const packets = new Map();
let client;

function remember(name, packet) {
  seen.add(name);
  if (!packets.has(name)) packets.set(name, []);
  packets.get(name).push(packet);
}

function all(name) {
  return packets.get(name) || [];
}

function first(name) {
  return all(name)[0];
}

server.on('error', (error) => harness.recordServerError(error, { source: 'mc-server' }));
server.on('playerJoin', (raw) => {
  if (INJECT_WRITE_ERROR) {
    const realWrite = raw.write.bind(raw);
    raw.write = (name, data) => {
      if (name === 'system_chat') throw new Error('injected adapter write failure');
      return realWrite(name, data);
    };
  }

  const adapter = new LegacyClient(raw);
  adapter.on('error', (error) => harness.recordClientError(error, { source: 'legacy-adapter' }));
  const write = (name, data) => adapter.write(name, data);

  write('login', {});
  write('chat', { message: JSON.stringify({ text: 'hi' }), position: 0 });
  write('title', { action: 0, text: JSON.stringify({ text: 'title' }) });
  write('title', { action: 1, text: JSON.stringify({ text: 'subtitle' }) });
  write('title', { action: 2, fadeIn: 0, stay: 1000, fadeOut: 0 });
  write('title', { action: 3 });
  write('title', { action: 4 });
  write('tab_complete', { matches: ['a', 'b'] });
  write('playerlist_header', { header: JSON.stringify({ text: 'H' }), footer: JSON.stringify({ text: 'F' }) });
  write('player_info', {
    action: 0,
    data: [{ UUID, name: 'Tester', properties: [], gamemode: 0, ping: 0 }]
  });
  write('player_info', { action: 2, data: [{ UUID, ping: 12 }] });
  write('scoreboard_objective', { name: 'sb', action: 0, displayText: 'Title', type: 'INTEGER' });
  write('scoreboard_display_objective', { position: 1, name: 'sb' });
  write('scoreboard_score', { scoreName: 'sb', itemName: 'line', action: 0, value: 3 });
  write('scoreboard_team', {
    team: 't1',
    mode: 0,
    name: 'Team',
    prefix: 'P',
    suffix: 'S',
    friendlyFire: true,
    nameTagVisibility: 'all',
    color: 0,
    players: ['Tester']
  });
  write('named_sound_effect', { soundName: 'random.bow', x: 0, y: 80, z: 0, volume: 1, pitch: 1 });
  write('named_entity_spawn', {
    entityId: '42',
    playerUUID: UUID,
    x: 1,
    y: 70,
    z: 1,
    yaw: 0,
    pitch: 0,
    currentItem: 0,
    metadata: { 0: { key: 0, value: 0, type: 0 }, 2: { key: 6, value: 20, type: 3 } }
  });
  write('spawn_entity_living', {
    entityId: '43',
    type: 54,
    x: 2,
    y: 70,
    z: 2,
    yaw: 0,
    pitch: 0,
    metadata: { 0: { key: 0, value: 0, type: 0 } }
  });
  write('entity_metadata', { entityId: '42', metadata: [{ key: 0, value: 8, type: 0 }] });
  write('entity_equipment', { entityId: '42', slot: 0, item: { blockId: 276, itemCount: 1, itemDamage: 0 } });
  write('entity_teleport', { entityId: '42', x: 3, y: 70, z: 3, yaw: 0, pitch: 0, onGround: true });
  write('entity_velocity', { entityId: '42', velocityX: 0, velocityY: 0, velocityZ: 0 });
  write('entity_head_rotation', { entityId: '42', headYaw: 0 });
  write('animation', { entityId: '42', animation: 0 });
  write('entity_status', { entityId: '42', entityStatus: 2 });
  write('entity_effect', { entityId: '42', effectId: 1, amplifier: 0, duration: 200, hideParticles: true });
  write('remove_entity_effect', { entityId: '42', effectId: 1 });
  write('update_health', { health: 20, food: 19, foodSaturation: 20 });
  write('experience', { experienceBar: 0.5, level: 3, totalExperience: 30 });
  write('collect', { collectedEntityId: '44', collectorEntityId: '42' });
  write('entity_destroy', { entityIds: ['43'] });
  write('block_change', { location: new Vec3(0, 11, 0), type: 2 });
  write('block_break_animation', { entityId: 0, location: new Vec3(0, 10, 0), destroyStage: 3 });
  write('open_window', {
    windowId: 1,
    inventoryType: 'minecraft:chest',
    windowTitle: JSON.stringify({ text: 'Chest' }),
    slotCount: 27,
    entityId: 99999
  });
  write('window_items', { windowId: 1, items: [{ blockId: 1, itemCount: 5, itemDamage: 0 }] });
  write('set_slot', { windowId: 0, slot: 36, item: { blockId: 1, itemCount: 1, itemDamage: 0 } });
  write('close_window', { windowId: 1 });
  write('position', { x: 0, y: 70, z: 0, yaw: 0, pitch: 0, flags: 0 });
  write('respawn', {});
  write('custom_payload', { channel: 'bloxd:resyncphysics', data: Buffer.from([1, 2, 3]) });
  write('world_particles', { texture: 'crit', pos1: [1, 70, 1], manualEmitCount: 4 });
  write('window_items', { windowId: 0, items: [] });
});

async function waitForListening() {
  if (server.listening) return;
  await new Promise((resolve, reject) => {
    const onListening = () => {
      server.removeListener('error', onError);
      resolve();
    };
    const onError = (error) => {
      server.removeListener('listening', onListening);
      reject(error);
    };
    server.once('listening', onListening);
    server.once('error', onError);
  });
}

async function close() {
  try {
    if (client && !client.ended) client.end();
  } catch (_error) {
    /* the process exit code is already final */
  }
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    try {
      server.close(() => {
        clearTimeout(timer);
        resolve();
      });
    } catch (_error) {
      clearTimeout(timer);
      resolve();
    }
  });
  await harness.cleanup();
}

function assertNbtText(value, expected, label) {
  harness.assertEqual(
    value && value.value && value.value.text && value.value.text.value,
    expected,
    label
  );
}

async function main() {
  await waitForListening();

  client = mc.createClient({
    host: 'localhost',
    port: PORT,
    username: 'Tester',
    version: '1.21.11',
    auth: 'offline'
  });
  client.on('error', (error) => harness.recordClientError(error, { source: 'mc-client' }));
  client.on('end', () => {});
  client.on('packet', (packet, meta) => {
    if (!meta || !meta.name) return;
    if (REQUIRED_PACKETS.includes(meta.name)) remember(meta.name, packet);
  });

  await harness.waitForPackets(REQUIRED_PACKETS, seen, {
    timeoutMs: INJECT_WRITE_ERROR ? 4000 : 12000,
    intervalMs: 25,
    label: 'required translated Minecraft packets'
  });

  console.log('packets received', Array.from(seen).length, 'errors', harness.failures.filter((f) => f.code === 'E_CLIENT_ERROR').length);

  const login = first('login');
  if (login) {
    harness.assertEqual(login.entityId, 99999, 'login.entityId');
    harness.assertEqual(login.worldState && login.worldState.gamemode, 'survival', 'login.worldState.gamemode');
  }

  const chat = first('system_chat');
  if (chat) assertNbtText(chat.content, 'hi', 'system_chat text');

  const title = first('set_title_text');
  if (title) assertNbtText(title.text, 'title', 'set_title_text text');
  const subtitle = first('set_title_subtitle');
  if (subtitle) assertNbtText(subtitle.text, 'subtitle', 'set_title_subtitle text');
  harness.assertEqual(first('set_title_time'), { fadeIn: 0, stay: 1000, fadeOut: 0 }, 'set_title_time');
  harness.assertEqual(
    all('clear_titles').map((packet) => packet.reset),
    [false, true],
    'clear_titles reset flags'
  );

  const complete = first('tab_complete');
  if (complete) {
    harness.assertEqual(complete.matches && complete.matches.map((entry) => entry.match), ['a', 'b'], 'tab_complete matches');
  }

  const header = first('playerlist_header');
  if (header) {
    assertNbtText(header.header, 'H', 'playerlist_header.header');
    assertNbtText(header.footer, 'F', 'playerlist_header.footer');
  }

  const infos = all('player_info');
  if (infos[0]) {
    harness.assertEqual(infos[0].data && infos[0].data[0].player && infos[0].data[0].player.name, 'Tester', 'player_info name');
    harness.assertEqual(infos[0].data && infos[0].data[0].uuid, UUID, 'player_info uuid');
    harness.assertEqual(infos[0].action && infos[0].action.add_player, true, 'player_info add_player');
  }
  if (infos[1]) {
    harness.assertEqual(infos[1].action && infos[1].action.update_latency, true, 'player_info update_latency');
    harness.assertEqual(infos[1].data && infos[1].data[0].latency, 12, 'player_info latency');
  }

  const objective = first('scoreboard_objective');
  if (objective) {
    harness.assertEqual(objective.name, 'sb', 'scoreboard_objective.name');
    harness.assertEqual(objective.action, 0, 'scoreboard_objective.action');
    assertNbtText(objective.displayText, 'Title', 'scoreboard_objective.displayText');
  }
  harness.assertEqual(first('scoreboard_display_objective'), { position: 1, name: 'sb' }, 'scoreboard_display_objective');
  harness.assertEqual(
    first('scoreboard_score') && {
      itemName: first('scoreboard_score').itemName,
      scoreName: first('scoreboard_score').scoreName,
      value: first('scoreboard_score').value
    },
    { itemName: 'line', scoreName: 'sb', value: 3 },
    'scoreboard_score'
  );

  const team = first('teams');
  if (team) {
    harness.assertEqual(team.team, 't1', 'teams.team');
    harness.assertEqual(team.mode, 'add', 'teams.mode');
    harness.assertEqual(team.players, ['Tester'], 'teams.players');
    harness.assertEqual(team.flags && team.flags.friendly_fire, true, 'teams.friendly_fire');
  }

  const sound = first('sound_effect');
  if (sound) {
    harness.assert(sound.sound && sound.sound.soundId > 0, 'sound_effect soundId');
    harness.assertEqual(sound.y, 640, 'sound_effect.y');
    harness.assertEqual(sound.volume, 1, 'sound_effect.volume');
  }

  const spawns = all('spawn_entity');
  if (spawns[0]) {
    harness.assertEqual(spawns[0].entityId, 1, 'spawn_entity first entityId');
    harness.assertEqual(spawns[0].objectUUID, UUID, 'spawn_entity first objectUUID');
    harness.assertEqual(spawns[0].x, 1, 'spawn_entity first x');
    harness.assertEqual(spawns[0].y, 70, 'spawn_entity first y');
  }
  if (spawns[1]) {
    harness.assertEqual(spawns[1].entityId, 2, 'spawn_entity second entityId');
    harness.assertEqual(spawns[1].x, 2, 'spawn_entity second x');
  }

  const metadata = all('entity_metadata').filter((packet) => packet.entityId === 1);
  const lastMetadata = metadata[metadata.length - 1];
  if (lastMetadata) {
    harness.assertEqual(lastMetadata.metadata && lastMetadata.metadata[0].key, 0, 'entity_metadata key');
    harness.assertEqual(lastMetadata.metadata && lastMetadata.metadata[0].value, 8, 'entity_metadata value');
  }

  const equipment = first('entity_equipment');
  if (equipment) {
    harness.assertEqual(equipment.entityId, 1, 'entity_equipment entityId');
    harness.assertEqual(equipment.equipments && equipment.equipments[0].slot, 0, 'entity_equipment slot');
    harness.assertEqual(equipment.equipments && equipment.equipments[0].item.itemCount, 1, 'entity_equipment itemCount');
    harness.assert(equipment.equipments && equipment.equipments[0].item.itemId > 0, 'entity_equipment itemId');
    harness.noteDefect('BLX-840-007', {
      case: 'entity_equipment',
      item: equipment.equipments && equipment.equipments[0].item
    });
  }

  const teleport = first('entity_teleport');
  if (teleport) {
    harness.assertEqual(teleport.x, 3, 'entity_teleport.x');
    harness.assertEqual(teleport.y, 70, 'entity_teleport.y');
    harness.assertEqual(teleport.z, 3, 'entity_teleport.z');
  }
  harness.assertEqual(
    first('entity_velocity') && {
      x: first('entity_velocity').velocity.x,
      y: first('entity_velocity').velocity.y,
      z: first('entity_velocity').velocity.z
    },
    { x: 0, y: 0, z: 0 },
    'entity_velocity'
  );
  harness.assertEqual(first('entity_head_rotation') && first('entity_head_rotation').headYaw, 0, 'entity_head_rotation.headYaw');
  harness.assertEqual(first('animation') && first('animation').animation, 0, 'animation.animation');
  harness.assertEqual(first('entity_status') && first('entity_status').entityStatus, 2, 'entity_status');
  harness.assertEqual(first('entity_effect') && first('entity_effect').effectId, 1, 'entity_effect.effectId');
  harness.assertEqual(first('entity_effect') && first('entity_effect').duration, 200, 'entity_effect.duration');
  harness.assertEqual(
    first('remove_entity_effect') && first('remove_entity_effect').effectId,
    1,
    'remove_entity_effect.effectId'
  );
  harness.assertEqual(first('update_health'), { health: 20, food: 19, foodSaturation: 20 }, 'update_health');
  harness.assertEqual(first('experience'), { experienceBar: 0.5, level: 3, totalExperience: 30 }, 'experience');

  const collect = first('collect');
  if (collect) {
    harness.assertEqual(collect.collectedEntityId, 3, 'collect.collectedEntityId');
    harness.assertEqual(collect.collectorEntityId, 1, 'collect.collectorEntityId');
  }
  harness.assertEqual(first('entity_destroy') && first('entity_destroy').entityIds, [2], 'entity_destroy');

  const block = first('block_change');
  if (block) {
    harness.assertEqual(block.location && block.location.x, 0, 'block_change.x');
    harness.assertEqual(block.location && block.location.y, 11, 'block_change.y');
    harness.assertEqual(block.location && block.location.z, 0, 'block_change.z');
    harness.assert(typeof block.type === 'number', 'block_change.type is a number');
  }
  const breakAnimation = first('block_break_animation');
  if (breakAnimation) {
    harness.assertEqual(breakAnimation.location && breakAnimation.location.y, 10, 'block_break_animation.y');
    harness.assertEqual(breakAnimation.destroyStage, 3, 'block_break_animation.destroyStage');
  }

  const window = first('open_window');
  if (window) {
    harness.assertEqual(window.windowId, 1, 'open_window.windowId');
    harness.assertEqual(window.inventoryType, 2, 'open_window.inventoryType');
    assertNbtText(window.windowTitle, 'Chest', 'open_window.windowTitle');
  }
  const windowItems = all('window_items');
  const filledWindow = windowItems.find((packet) => packet.items && packet.items.length === 1);
  if (filledWindow) {
    harness.assertEqual(filledWindow.items[0].itemCount, 5, 'window_items itemCount');
    harness.assert(filledWindow.items[0].itemId > 0, 'window_items itemId');
    harness.noteDefect('BLX-840-007', { case: 'window_items', item: filledWindow.items[0] });
  }
  const setSlot = first('set_slot');
  if (setSlot) {
    harness.assertEqual(setSlot.windowId, 0, 'set_slot.windowId');
    harness.assertEqual(setSlot.slot, 36, 'set_slot.slot');
    harness.assert(setSlot.item && setSlot.item.itemId > 0, 'set_slot.itemId');
    harness.noteDefect('BLX-840-007', { case: 'set_slot', item: setSlot.item });
  }
  harness.assertEqual(first('close_window') && first('close_window').windowId, 1, 'close_window.windowId');

  const positions = all('position');
  const lastPosition = positions[positions.length - 1];
  if (lastPosition) {
    harness.assertEqual(lastPosition.y, 70, 'position.y');
  }

  const respawn = first('respawn');
  if (respawn) {
    harness.assertEqual(respawn.worldState && respawn.worldState.gamemode, 'survival', 'respawn.gamemode');
  }
  const payload = first('custom_payload');
  if (payload) {
    harness.assertEqual(payload.channel, 'bloxd:resyncphysics', 'custom_payload.channel');
    harness.assert(Buffer.isBuffer(payload.data) && payload.data.equals(Buffer.from([1, 2, 3])), 'custom_payload.data');
  }
  const particles = first('world_particles');
  if (particles) {
    harness.assertEqual(particles.amount, 4, 'world_particles.amount');
    harness.assertEqual(particles.particle && particles.particle.type, 'crit', 'world_particles.type');
  }

  await harness.cleanup();
  return harness.finish();
}

main().then(
  async (code) => {
    await close();
    process.exit(code);
  },
  async (error) => {
    harness.fail('E_UNCAUGHT', 'e2e-packets failed before completion', {
      error: { name: error.name, message: error.message, stack: error.stack }
    });
    const code = harness.finish();
    await close();
    process.exit(code);
  }
);
