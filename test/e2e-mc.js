'use strict';

const mc = require('minecraft-protocol');
const Chunk18 = require('prismarine-chunk')('1.8.9');
const Vec3 = require('vec3');
const LegacyClient = require('../mc/client.js');
const { createHarness } = require('./lib/harness');

const PORT = 25599;
const REQUIRED_PACKETS = ['login', 'position', 'game_state_change', 'map_chunk', 'system_chat', 'player_info', 'sound_effect'];
const selfTestIndex = process.argv.indexOf('--self-test');
const INJECT_MISSING_PACKET =
  selfTestIndex !== -1 && process.argv[selfTestIndex + 1] === 'missing-packet';

const harness = createHarness({ name: 'e2e-mc' });
harness.watchAdapterErrors();

const server = mc.createServer({ 'online-mode': false, port: PORT, version: '1.21.11', motd: 'test' });
const seen = new Set();
const packets = new Map();
let client;
const order = [];

function remember(name, packet) {
  order.push(name);
  seen.add(name);
  if (!packets.has(name)) packets.set(name, []);
  packets.get(name).push(packet);
}

function first(name) {
  const values = packets.get(name);
  return values && values[0];
}

server.on('error', (error) => harness.recordServerError(error, { source: 'mc-server' }));
server.on('playerJoin', (raw) => {
  const adapter = new LegacyClient(raw);
  adapter.on('error', (error) => harness.recordClientError(error, { source: 'legacy-adapter' }));

  adapter.write('login', {});
  if (!INJECT_MISSING_PACKET) {
    adapter.write('chat', {
      message: JSON.stringify({ text: 'hello from legacy adapter' }),
      position: 0
    });
  }
  adapter.write('player_info', {
    action: 0,
    data: [{
      UUID: '00000000-0000-0000-0000-000000000123',
      name: 'Tester',
      properties: [],
      gamemode: 0,
      ping: 0
    }]
  });

  const chunk = new Chunk18();
  const pos = new Vec3(0, 0, 0);
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = 0; y < 256; y++) chunk.setSkyLight(pos.set(x, y, z), 15);
    }
  }
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) chunk.setBlockType(new Vec3(x, 10, z), 2);
  }
  adapter.write('map_chunk', {
    x: 0,
    z: 0,
    groundUp: true,
    bitMap: chunk.getMask(),
    chunkData: chunk.dump()
  });
  adapter.write('named_sound_effect', {
    soundName: 'random.bow',
    x: 0,
    y: 80,
    z: 0,
    volume: 1,
    pitch: 1
  });
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
  for (const name of REQUIRED_PACKETS) {
    client.on(name, (packet) => {
      remember(name, packet);
      console.log('GOT', name, name === 'system_chat' ? JSON.stringify(packet.content).slice(0, 120) : '');
    });
  }

  await harness.waitForPackets(REQUIRED_PACKETS, seen, {
    timeoutMs: INJECT_MISSING_PACKET ? 4000 : 10000,
    intervalMs: 25,
    label: 'required Minecraft packets from LegacyClient'
  });

  console.log('SEEN', Array.from(seen).join(','));

  const login = first('login');
  if (login) {
    harness.assertEqual(login.entityId, 99999, 'login.entityId');
    harness.assertEqual(login.worldState && login.worldState.name, 'minecraft:overworld', 'login.worldState.name');
    harness.assertEqual(login.maxPlayers, 1, 'login.maxPlayers');
  }

  const position = first('position');
  if (position) {
    harness.assertEqual(position.x, 0, 'position.x');
    harness.assertEqual(position.y, 64, 'position.y');
    harness.assertEqual(position.z, 0, 'position.z');
    harness.assertEqual(position.yaw, 0, 'position.yaw');
    harness.assertEqual(position.pitch, 0, 'position.pitch');
  }

  const gameState = first('game_state_change');
  if (gameState) {
    harness.assertEqual(gameState.reason, 'level_chunks_load_start', 'game_state_change.level_chunks_load_start');
    harness.assert(
      order.indexOf('game_state_change') < order.indexOf('map_chunk'),
      'level_chunks_load_start precedes chunks'
    );
  }

  const chat = first('system_chat');
  if (chat) {
    harness.assertEqual(chat.content && chat.content.value.text.value, 'hello from legacy adapter', 'system_chat text');
    harness.assertEqual(chat.isActionBar, false, 'system_chat.isActionBar');
  }

  const chunk = first('map_chunk');
  if (chunk) {
    harness.assertEqual(chunk.x, 0, 'map_chunk.x');
    harness.assertEqual(chunk.z, 0, 'map_chunk.z');
    harness.assert(Buffer.isBuffer(chunk.chunkData) && chunk.chunkData.length > 0, 'map_chunk.chunkData is non-empty');
    const heightmaps = Array.isArray(chunk.heightmaps) ? chunk.heightmaps : [];
    harness.assertEqual(
      heightmaps.map((entry) => entry.type).join(','),
      'world_surface,motion_blocking_no_leaves,motion_blocking',
      'map_chunk.heightmaps types'
    );
    harness.assert(
      heightmaps.length === 3 && heightmaps.every((entry) => Array.isArray(entry.data) && entry.data.length === 37),
      'map_chunk.heightmaps packed'
    );
  }

  const info = first('player_info');
  if (info) {
    harness.assertEqual(
      info.data && info.data[0] && info.data[0].player && info.data[0].player.name,
      'Tester',
      'player_info name'
    );
    harness.assertEqual(
      info.data && info.data[0] && info.data[0].uuid,
      '00000000-0000-0000-0000-000000000123',
      'player_info uuid'
    );
    harness.assertEqual(info.action && info.action.add_player, true, 'player_info action.add_player');
  }

  const sound = first('sound_effect');
  if (sound) {
    harness.assert(sound.sound && typeof sound.sound.soundId === 'number' && sound.sound.soundId > 0, 'sound_effect soundId');
    harness.assertEqual(sound.x, 0, 'sound_effect.x');
    harness.assertEqual(sound.y, 640, 'sound_effect.y');
    harness.assertEqual(sound.z, 0, 'sound_effect.z');
    harness.assertEqual(sound.volume, 1, 'sound_effect.volume');
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
    harness.fail('E_UNCAUGHT', 'e2e-mc failed before completion', {
      error: { name: error.name, message: error.message, stack: error.stack }
    });
    const code = harness.finish();
    await close();
    process.exit(code);
  }
);
