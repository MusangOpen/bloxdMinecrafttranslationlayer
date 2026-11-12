'use strict';

/**
 * LegacyClient
 *
 * Presents the Minecraft 1.8.9 `client.write/on` vocabulary that the existing
 * handlers were written against, backed by a real Minecraft 1.21.11 connection.
 *
 * This is intentionally an explicit port (not a monkey patch): every legacy
 * packet is translated in one place, so it can be unit tested.
 */

const { EventEmitter } = require('events');
const nbt = require('prismarine-nbt');
const Chunk18 = require('prismarine-chunk')('1.8.9');
const chunkCodec = require('./chunk.js');
const registry = require('./registry.js');
const { toNbtComponent } = require('./components.js');
const mc21 = registry.mc21;
const VIEW_DISTANCE_CHUNKS = 8;
const MAX_DEFERRED_CHUNKS = 512;

// Block entity type id used by the 1.21.11 tile_entity_data packet. The frozen
// fixture test/fixtures/846/block-entity-types.json records dispenser=7 and
// sign=8; the test compares this constant against that fixture instead of
// asserting the constant against itself.
const SIGN_BLOCK_ENTITY_TYPE = 8;

const SOUND_MAP = {
	'random.bow': 'entity.arrow.shoot',
	'random.pop': 'entity.item.pickup',
	'random.explode': 'entity.generic.explode',
	'random.burp': 'entity.player.burp',
	'random.click': 'ui.button.click',
	'random.break': 'entity.item.break',
	'random.successful_hit': 'entity.player.attack.strong',
	'random.chestopen': 'block.chest.open',
	'random.chestclosed': 'block.chest.close',
	'mob.enderdragon.growl': 'entity.ender_dragon.growl',
	'dig.cloth': 'block.wool.break',
	'dig.stone': 'block.stone.break',
	'dig.wood': 'block.wood.break',
	'dig.grass': 'block.grass.break',
	'dig.sand': 'block.sand.break',
	'dig.gravel': 'block.gravel.break',
	'dig.snow': 'block.snow.break',
	'step.stone': 'block.stone.step',
	'game.player.hurt': 'entity.player.hurt',
	'game.player.attack.strong': 'entity.player.attack.strong'
};

const PARTICLE_MAP = {
	crit: 'crit',
	magicCrit: 'enchanted_hit',
	flame: 'flame',
	smoke: 'smoke',
	explode: 'explosion',
	largeexplode: 'explosion_emitter',
	blockcrack: 'block',
	blockdust: 'block',
	reddust: 'dust'
};
const PARTICLE_FALLBACK = 'poof';

// Legacy 1.8 equipment slots: 0 held, 1 boots, 2 leggings, 3 chestplate,
// 4 helmet. 1.21.11: 0 main hand, 1 off hand, 2 boots, 3 leggings,
// 4 chestplate, 5 helmet.
const EQUIPMENT_SLOT_MAP = Object.freeze({ 0: 0, 1: 2, 2: 3, 3: 4, 4: 5 });

// Explicit legacy metadata index -> 1.21.11 index/type/name map. Every key the
// handlers emit is listed; anything else fails instead of being dropped.
const METADATA_KEY_MAP = Object.freeze({
	0: { key: 0, type: 'byte', name: 'shared_flags' },
	1: { key: 1, type: 'int', name: 'air_supply' },
	2: { key: 2, type: 'optional_component', name: 'custom_name' },
	3: { key: 3, type: 'boolean', name: 'custom_name_visible' },
	4: { key: 4, type: 'boolean', name: 'silent' },
	5: { key: 5, type: 'boolean', name: 'no_gravity' },
	6: { key: 9, type: 'float', name: 'health' },
	7: { key: 10, type: 'int', name: 'effect_particles' },
	8: { key: 11, type: 'boolean', name: 'effect_ambience' },
	9: { key: 12, type: 'int', name: 'arrow_count' },
	10: { key: 16, type: 'byte', name: 'player_mode_customisation' },
	16: { key: 15, type: 'int', name: 'player_main_hand' },
	17: { key: 17, type: 'float', name: 'player_absorption' },
	18: { key: 18, type: 'int', name: 'score' }
});
const ITEM_STACK_METADATA = Object.freeze({ key: 8, type: 'item_stack', name: 'item' });

// 1.21.11 changed serializers that 1.8 encoded as plain ints/bytes:
// field 10 (EFFECT_PARTICLES) is now a List, the player fields moved, and
// PLAYER_MAIN_HAND became a HUMANOID_ARM enum. Sending the legacy values makes
// the vanilla client abort with "Invalid entity data item type for field N"
// (captured 2026-11-11 from disconnect-2026-11-11_14.56.56-client.txt). These
// decorative keys stay dropped until the exact 1.21.11 layout is verified.
const IGNORED_METADATA_KEYS = Object.freeze(new Set([7, 10, 16, 17, 18]));

const TEAM_MODES = Object.freeze({ 0: 'add', 1: 'remove', 2: 'change', 3: 'join', 4: 'leave' });

// Legacy packets the adapter deliberately does not translate. Each entry must
// keep the arguments the handlers pass so the omission is auditable.
const NOOP_LEDGER = Object.freeze({
	update_time: Object.freeze({
		reason: '1.21.11 derives world time from the server tick loop; the adapter sends no world_time packet',
		args: Object.freeze({ worldAge: 'i64', timeOfDay: 'i64' })
	}),
	game_state_change: Object.freeze({
		reason: 'the Bloxd handlers emit no legacy game_state_change reasons; the adapter synthesizes reason 13 level_chunks_load_start at join so the client closes the Loading terrain screen',
		args: Object.freeze({ reason: 'u8', gameMode: 'f32' })
	})
});

// Exact disposition for every legacy packet the handlers write. `packet` names
// a real 1.21.11 play-state packet; `expands` lists multi-packet translations;
// `noop` must be paired with a NOOP_LEDGER entry.
const WRITE_DISPOSITIONS = Object.freeze({
	login: { packet: 'login', fields: ['entityId', 'worldState'], expands: ['position'] },
	map_chunk: { packet: 'map_chunk', fields: ['x', 'z', 'heightmaps', 'chunkData', 'blockEntities', 'skyLightMask', 'blockLightMask', 'emptySkyLightMask', 'emptyBlockLightMask', 'skyLight', 'blockLight'], expands: ['unload_chunk', 'chunk_batch_start', 'chunk_batch_finished'] },
	block_change: { packet: 'block_change', fields: ['location', 'type'] },
	multi_block_change: { packet: 'block_change', expands: ['block_change'], fields: ['location', 'type'] },
	block_break_animation: { packet: 'block_break_animation', fields: ['entityId', 'location', 'destroyStage'] },
	update_sign: { packet: 'tile_entity_data', fields: ['location', 'action', 'nbtData'] },
	chat: { packet: 'system_chat', fields: ['content', 'isActionBar'] },
	title: { packet: 'set_title_text', expands: ['set_title_subtitle', 'set_title_time', 'clear_titles'] },
	tab_complete: { packet: 'tab_complete', fields: ['transactionId', 'start', 'length', 'matches'] },
	playerlist_header: { packet: 'playerlist_header', fields: ['header', 'footer'] },
	player_info: { packet: 'player_info', expands: ['player_remove'], fields: ['action', 'data'] },
	named_entity_spawn: { packet: 'spawn_entity', expands: ['entity_metadata'], fields: ['entityId', 'objectUUID', 'type', 'x', 'y', 'z', 'pitch', 'yaw'] },
	spawn_entity: { packet: 'spawn_entity', expands: ['entity_metadata'], fields: ['entityId', 'objectUUID', 'type', 'x', 'y', 'z', 'pitch', 'yaw'] },
	spawn_entity_living: { packet: 'spawn_entity', expands: ['entity_metadata'], fields: ['entityId', 'objectUUID', 'type', 'x', 'y', 'z', 'pitch', 'yaw'] },
	entity_metadata: { packet: 'entity_metadata', fields: ['entityId', 'metadata'] },
	entity_equipment: { packet: 'entity_equipment', fields: ['entityId', 'equipments'] },
	entity_teleport: { packet: 'entity_teleport', fields: ['entityId', 'x', 'y', 'z', 'yaw', 'pitch', 'onGround'] },
	entity_velocity: { packet: 'entity_velocity', fields: ['entityId', 'velocity'] },
	entity_head_rotation: { packet: 'entity_head_rotation', fields: ['entityId', 'headYaw'] },
	entity_destroy: { packet: 'entity_destroy', fields: ['entityIds'] },
	animation: { packet: 'animation', fields: ['entityId', 'animation'] },
	collect: { packet: 'collect', fields: ['collectedEntityId', 'collectorEntityId', 'pickupItemCount'] },
	entity_status: { packet: 'entity_status', fields: ['entityId', 'entityStatus'] },
	entity_effect: { packet: 'entity_effect', fields: ['entityId', 'effectId', 'amplifier', 'duration', 'flags'] },
	remove_entity_effect: { packet: 'remove_entity_effect', fields: ['entityId', 'effectId'] },
	update_health: { packet: 'update_health', fields: ['health', 'food', 'foodSaturation'] },
	experience: { packet: 'experience', fields: ['experienceBar', 'level', 'totalExperience'] },
	position: { packet: 'position', fields: ['teleportId', 'x', 'y', 'z', 'yaw', 'pitch', 'flags'] },
	respawn: { packet: 'respawn', fields: ['worldState', 'copyMetadata'] },
	custom_payload: { packet: 'custom_payload', fields: ['channel', 'data'] },
	named_sound_effect: { packet: 'sound_effect', fields: ['sound', 'soundCategory', 'x', 'y', 'z', 'volume', 'pitch', 'seed'] },
	world_particles: { packet: 'world_particles', fields: ['x', 'y', 'z', 'amount', 'particle'] },
	open_window: { packet: 'open_window', fields: ['windowId', 'inventoryType', 'windowTitle'] },
	close_window: { packet: 'close_window', fields: ['windowId'] },
	window_items: { packet: 'window_items', fields: ['windowId', 'stateId', 'items', 'carriedItem'] },
	set_slot: { packet: 'set_slot', expands: ['set_cursor_item'], fields: ['windowId', 'stateId', 'slot', 'item'] },
	scoreboard_objective: { packet: 'scoreboard_objective', fields: ['name', 'action', 'displayText', 'type', 'number_format', 'styling'] },
	scoreboard_score: { packet: 'scoreboard_score', fields: ['itemName', 'scoreName', 'value', 'display_name', 'number_format', 'styling'] },
	scoreboard_display_objective: { packet: 'scoreboard_display_objective', fields: ['position', 'name'] },
	scoreboard_team: { packet: 'teams', fields: ['team', 'mode', 'name', 'flags', 'nameTagVisibility', 'collisionRule', 'formatting', 'prefix', 'suffix', 'players'] },
	update_time: { noop: true, ledger: 'update_time' },
	game_state_change: { noop: true, ledger: 'game_state_change' }
});

// Legacy chat/title/tablist components are JSON (or plain text) and must reach
// 1.21.11 as anonymous NBT. Keep the full component tree (extra/translate/style/
// events); malformed input degrades to plain text inside the helper.
function component(message) {
	return toNbtComponent(message);
}

function nbtString(value) {
	return nbt.comp({ text: nbt.string(String(value ?? '')) });
}

function turn(angle) {
	return Math.floor((((angle % 360) + 360) % 360) / 360 * 256) & 0xff;
}

function turnSigned(angle) {
	let v = turn(angle);
	return v > 127 ? v - 256 : v;
}

// 1.21.11 use_item carries no block position. Keep the legacy block_place
// field shape the handlers read, but leave every coordinate non-finite so the
// packet cannot be mistaken for a real block placement.
function useItemAsBlockPlace(packet) {
	return {
		location: { x: NaN, y: NaN, z: NaN },
		direction: -1,
		hand: packet.hand,
		sequence: packet.sequence
	};
}

// 1.21.5+ sign NBT stores plain text lines, while the legacy handler still
// passes JSON components. Flatten text/extra recursively and fall back to the
// raw string for malformed input (never throw on a decorative sign).
function signLineText(line) {
	if (line === undefined || line === null) return '';
	let parsed = line;
	if (typeof line === 'string') {
		const trimmed = line.trim();
		if (trimmed.startsWith('{') || trimmed.startsWith('"') || trimmed.startsWith('[')) {
			try {
				parsed = JSON.parse(trimmed);
			} catch (_error) {
				return line;
			}
		} else {
			return line;
		}
	}
	const flatten = (value) => {
		if (value === null || value === undefined) return '';
		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
			return String(value);
		}
		if (Array.isArray(value)) return value.map(flatten).join('');
		let text = value.text === undefined || value.text === null ? '' : flatten(value.text);
		if (Array.isArray(value.extra)) text += value.extra.map(flatten).join('');
		return text;
	};
	const result = flatten(parsed);
	return result === '' && typeof parsed === 'object' ? '' : result;
}

class LegacyClient extends EventEmitter {
	constructor(real, options = {}) {
		super();
		this.real = real;
		this.version = options.version || '1.21.11';
		this.ended = false;
		this.teleportId = 0;
		this.lastConfirmedTeleportId = 0;
		this.confirmSupported = false;
		this.positionRetryTimer = null;
		this.chunkCenter = { x: 0, z: 0 };
		this.deferredChunks = new Map();
		this.mapChunkWrites = 0;
		this.biomeId = mc21.biomesByName.plains.id;
		this.entityIds = new Map();
		this.entityUuids = new Map();
		this.nextEntityId = 1;
		this.nextUuid = 1;
		this.entityTypes = new Map();
		this.metadata = new Map();
		this.windowStateIds = new Map();
		this.registryFailures = [];
		this.reportedRegistryFailures = new Set();
		this.writeErrors = [];
		this.onWriteError = typeof options.onWriteError === 'function' ? options.onWriteError : null;
		this.username = real.username;
		this.uuid = real.uuid;
		this.protocolVersion = real.protocolVersion;
		// The login/pack gate enables these two options. In the default legacy
		// mode the adapter keeps sending the initial position with login so the
		// existing handler harnesses remain byte-for-byte compatible.
		this.deferInitialPosition = Boolean(options.deferInitialPosition);
		this.gateSession = Boolean(options.gateSession);
		this.sessionOpen = !this.gateSession;
		this.loginSent = false;

		real.on('end', () => {
			this.ended = true;
			this.emit('end');
		});
		real.on('error', (err) => this.emit('error', err));
		this._bindInbound();
	}

	end(reason) {
		if (this.positionRetryTimer) { clearTimeout(this.positionRetryTimer); this.positionRetryTimer = null; }
		const text = typeof reason === 'string' ? reason : (reason && reason.message ? reason.message : String(reason));
		this.real.end(text);
	}

	toEntityId(entityId) {
		if (typeof entityId === 'number') return entityId;
		const key = String(entityId);
		if (key === '99999') return 99999;
		let id = this.entityIds.get(key);
		if (id === undefined) {
			id = this.nextEntityId++;
			this.entityIds.set(key, id);
		}
		return id;
	}

	entityUuid(entityId) {
		const key = String(entityId);
		let uuid = this.entityUuids.get(key);
		if (uuid === undefined) {
			uuid = '00000000-0000-4000-8000-' + (this.nextUuid++).toString(16).padStart(12, '0');
			this.entityUuids.set(key, uuid);
		}
		return uuid;
	}

	_reportRegistryFailure(failure) {
		if (!failure || !failure.code) return;
		const key = failure.code + ':' + (failure.legacyId ?? '') + ':' + (failure.metadata ?? '');
		if (this.reportedRegistryFailures.has(key)) return;
		this.reportedRegistryFailures.add(key);
		this.registryFailures.push(failure);
		this.emit('registry_error', failure);
		console.warn('[mc] ' + failure.code + ' ' + JSON.stringify(failure));
	}

	_itemStack(data) {
		const stack = registry.itemStack(data);
		if (stack && stack.unresolved) this._reportRegistryFailure(stack.unresolved);
		return stack;
	}

	// A failed translation must be observable by the test harness and by the
	// client owner. Console output is kept only for backwards compatibility with
	// the existing harness watcher; the event/callback/array are authoritative.
	_recordWriteError(name, data, error) {
		const record = {
			name,
			message: error && error.message ? error.message : String(error),
			error,
			data
		};
		this.writeErrors.push(record);
		this.emit('write_error', record);
		if (this.onWriteError) {
			try {
				this.onWriteError(record);
			} catch (callbackError) {
				this.writeErrors.push({
					name: 'onWriteError',
					message: callbackError && callbackError.message ? callbackError.message : String(callbackError),
					error: callbackError,
					data: record
				});
			}
		}
		console.error(`[mc] failed to write ${name}:`, record.message);
		return record;
	}

	_bindInbound() {
		const r = this.real;
		const emit = (name, data) => this.emit(name, data);

		r.on('position', (p) => emit('position', { x: p.x, y: p.y, z: p.z, onGround: p.onGround }));
		r.on('look', (p) => emit('look', { yaw: p.yaw, pitch: p.pitch, onGround: p.onGround }));
		r.on('position_look', (p) => emit('position_look', { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, onGround: p.onGround }));
		r.on('flying', (p) => emit('flying', p));
		r.on('held_item_slot', (p) => {
			if (!Number.isInteger(p.slotId)) {
				console.warn('[mc] ignored held_item_slot without an integer slotId');
				return;
			}
			emit('held_item_slot', { slotId: p.slotId });
		});
		r.on('arm_animation', (p) => emit('arm_animation', p));
		r.on('entity_action', (p) => emit('entity_action', { actionId: p.actionId, entityId: this.toEntityId(p.entityId) }));
		r.on('use_entity', (p) => emit('use_entity', { target: String(p.target), mouse: p.mouse, sneaking: p.sneaking }));
		r.on('block_place', (p) => emit('block_place', p));
		r.on('use_item', (p) => emit('block_place', useItemAsBlockPlace(p)));
		r.on('block_dig', (p) => emit('block_dig', p));
		r.on('window_click', (p) => emit('window_click', p));
		r.on('close_window', (p) => emit('close_window', p));
		r.on('tab_complete', (p) => emit('tab_complete', { text: p.text ?? '' }));
		r.on('spectate', (p) => emit('spectate', p));
		r.on('chat_message', (p) => emit('chat', { message: p.message }));
		r.on('chat_command', (p) => emit('chat', { message: p.command?.startsWith('/') ? p.command : '/' + p.command }));
		r.on('teleport_confirm', (p) => {
			this.confirmSupported = true;
			this.lastConfirmedTeleportId = p.teleportId;
			emit('teleport_confirm', p);
		});
	}

	openSession() {
		this.sessionOpen = true;
	}

	write(name, data) {
		try {
			// While the resource-pack gate is pending only the login packet may
			// leave the adapter. Every world/item/UI packet fails closed, which
			// makes an accidental pre-success write observable instead of
			// reaching the client.
			if (this.gateSession && !this.sessionOpen && name !== 'login') {
				throw new Error(`E_SESSION_NOT_READY ${name}`);
			}
			switch (name) {
				case 'login': return this._login(data);
				case 'map_chunk': return this._mapChunk(data);
				case 'block_change': return this._blockChange(data);
				case 'multi_block_change': return this._multiBlockChange(data);
				case 'block_break_animation': return this._blockBreakAnimation(data);
				case 'chat': return this._chat(data);
				case 'title': return this._title(data);
				case 'tab_complete': return this._tabComplete(data);
				case 'player_info': return this._playerInfo(data);
				case 'named_entity_spawn': return this._spawnPlayer(data);
				case 'spawn_entity_living':
				case 'spawn_entity': return this._spawnEntity(data);
				case 'entity_metadata': return this._entityMetadata(data);
				case 'entity_equipment': return this._entityEquipment(data);
				case 'entity_teleport': return this._entityTeleport(data);
				case 'entity_velocity': return this._entityVelocity(data);
				case 'entity_head_rotation': return this._headRotation(data);
				case 'entity_destroy': return this._entityDestroy(data);
				case 'animation': return this._animation(data);
				case 'collect': return this._collect(data);
				case 'entity_status': return this._entityStatus(data);
				case 'entity_effect': return this._entityEffect(data);
				case 'remove_entity_effect': return this._removeEntityEffect(data);
				case 'update_health': return this._updateHealth(data);
				case 'experience': return this._experience(data);
				case 'position': return this._position(data);
				case 'respawn': return this._respawn(data);
				case 'custom_payload': return this._customPayload(data);
				case 'named_sound_effect': return this._sound(data);
				case 'world_particles': return this._particles(data);
				case 'open_window': return this._openWindow(data);
				case 'close_window': return this.real.write('close_window', { windowId: data.windowId });
				case 'window_items': return this._windowItems(data);
				case 'set_slot': return this._setSlot(data);
				case 'playerlist_header': return this._playerlistHeader(data);
				case 'scoreboard_objective': return this._scoreboardObjective(data);
				case 'scoreboard_score': return this._scoreboardScore(data);
				case 'scoreboard_display_objective': return this.real.write('scoreboard_display_objective', data);
				case 'scoreboard_team': return this._team(data);
				case 'update_sign': return this._updateSign(data);
				case 'update_time':
				case 'game_state_change':
					// Ledger-listed no-ops; see NOOP_LEDGER for reason and args.
					return;
				default:
					throw new Error(`E_UNHANDLED_LEGACY_PACKET ${name}`);
			}
		} catch (err) {
			this._recordWriteError(name, data, err);
			return false;
		}
	}

	// -----------------------------------------------------------------------
	// session
	// -----------------------------------------------------------------------

	_login() {
		if (this.loginSent) throw new Error('E_DUPLICATE_LOGIN');
		this.loginSent = true;
		this.real.write('login', {
			entityId: 99999,
			isHardcore: false,
			worldNames: ['minecraft:overworld'],
			maxPlayers: 1,
			viewDistance: 8,
			simulationDistance: 8,
			reducedDebugInfo: false,
			enableRespawnScreen: true,
			doLimitedCrafting: false,
			worldState: this._spawnInfo(),
			enforcesSecureChat: false
		});
		if (!this.deferInitialPosition) {
			this.sendInitialPosition();
		}
	}

	// Sent by the load gate only after SUCCESSFULLY_LOADED. In default legacy
	// mode _login() calls this immediately after the play login packet.
	sendInitialPosition() {
		this.chunkCenter = { x: 0, z: 0 };
		this._sendPosition(0, 64, 0, 0, 0);
		this.real.write('spawn_position', {
			globalPos: { dimensionName: 'minecraft:overworld', location: { x: 0, y: 64, z: 0 } },
			yaw: 0,
			pitch: 0
		});
		// 1.21.11 closes the "Loading terrain" screen only after the server
		// announces level_chunks_load_start and the player's chunk arrives.
		this.real.write('game_state_change', { reason: 13, gameMode: 0 });
		this.real.write('update_view_position', { chunkX: 0, chunkZ: 0 });
		this._flushDeferredChunks();
	}

	_spawnInfo() {
		return {
			dimension: 0,
			name: 'minecraft:overworld',
			hashedSeed: 0n,
			gamemode: 'survival',
			previousGamemode: 255,
			isDebug: false,
			isFlat: false,
			death: null,
			portalCooldown: 0,
			seaLevel: 63
		};
	}

	_positionPacket(x, y, z, yaw, pitch, flags) {
		return {
			teleportId: ++this.teleportId,
			x, y, z,
			dx: 0, dy: 0, dz: 0,
			yaw, pitch,
			flags,
			dismountVehicle: false
		};
	}

	_position(data) {
		const chunkX = Math.floor(data.x / 16);
		const chunkZ = Math.floor(data.z / 16);
		this._sendPosition(data.x, data.y, data.z, data.yaw ?? 0, data.pitch ?? 0);
		this.chunkCenter = { x: chunkX, z: chunkZ };
		this.real.write('update_view_position', { chunkX, chunkZ });
		this._flushDeferredChunks();
	}

	_sendPosition(x, y, z, yaw, pitch) {
		const packet = this._positionPacket(x, y, z, yaw, pitch, 0);
		this.real.write('position', packet);
		if (!this.confirmSupported) { return; }
		const chunkX = Math.floor(x / 16);
		const chunkZ = Math.floor(z / 16);
		if (this.positionRetryTimer) { clearTimeout(this.positionRetryTimer); }
		this.positionRetryTimer = setTimeout(() => {
			this.positionRetryTimer = null;
			if (this.lastConfirmedTeleportId >= packet.teleportId) { return; }
			const retry = this._positionPacket(x, y, z, yaw, pitch, 0);
			console.log('[mc] position retry teleportId=' + retry.teleportId + ' unconfirmed=' + packet.teleportId);
			this.real.write('position', retry);
			this.real.write('update_view_position', { chunkX, chunkZ });
			this._flushDeferredChunks();
		}, 700);
		if (typeof this.positionRetryTimer.unref === 'function') { this.positionRetryTimer.unref(); }
	}

	_respawn() {
		this.real.write('respawn', { worldState: this._spawnInfo(), copyMetadata: 0 });
	}

	// -----------------------------------------------------------------------
	// world
	// -----------------------------------------------------------------------

	_mapChunk(data) {
		if (!data.bitMap) {
			this.real.write('unload_chunk', { chunkZ: data.z, chunkX: data.x });
			return;
		}

		const col8 = new Chunk18();
		try {
			col8.load(Buffer.from(data.chunkData));
		} catch (e) {
			this._recordWriteError('map_chunk', data, e);
			return;
		}

		const packet = chunkCodec.encodeMapChunk({
			x: data.x,
			z: data.z,
			stateIds: chunkCodec.legacyColumnToStates(col8),
			biomeId: this.biomeId
		});
		if (!this._chunkInViewRange(packet.x, packet.z)) {
			this._deferChunk(packet);
			return;
		}
		this._sendChunk(packet);
	}

	_chunkInViewRange(x, z) {
		return Math.abs(x - this.chunkCenter.x) <= VIEW_DISTANCE_CHUNKS &&
			Math.abs(z - this.chunkCenter.z) <= VIEW_DISTANCE_CHUNKS;
	}

	_deferChunk(packet) {
		const key = packet.x + ',' + packet.z;
		if (this.deferredChunks.size >= MAX_DEFERRED_CHUNKS && !this.deferredChunks.has(key)) {
			this.deferredChunks.delete(this.deferredChunks.keys().next().value);
		}
		this.deferredChunks.set(key, packet);
	}

	_flushDeferredChunks() {
		for (const [key, packet] of this.deferredChunks) {
			if (!this._chunkInViewRange(packet.x, packet.z)) continue;
			this.deferredChunks.delete(key);
			this._sendChunk(packet);
		}
	}

	_sendChunk(packet) {
		this.real.write('chunk_batch_start', {});
		this.real.write('map_chunk', packet);
		this.mapChunkWrites += 1;
		this.real.write('chunk_batch_finished', { batchSize: 1 });
	}

	_blockChange(data) {
		const resolved = registry.resolveBlock(data.type >> 4, data.type & 15);
		if (!resolved.ok) {
			this._reportRegistryFailure(resolved);
			return;
		}
		this.real.write('block_change', {
			location: data.location,
			type: resolved.stateId
		});
	}

	_multiBlockChange(data) {
		// 1.8 packs records differently; send individual updates (rare + small).
		for (const record of data.records || []) {
			this.write('block_change', record);
		}
	}

	_blockBreakAnimation(data) {
		this.real.write('block_break_animation', {
			entityId: this.toEntityId(data.entityId),
			location: data.location,
			destroyStage: data.destroyStage
		});
	}

	_updateSign(data) {
		// 1.21.5+ sign messages are plain strings (not JSON) inside front_text /
		// back_text. The legacy handler passes four JSON text components.
		const lines = [data.text1, data.text2, data.text3, data.text4]
			.map((line) => signLineText(line));
		const side = (messages) => nbt.comp({
			has_glowing_text: nbt.byte(0),
			color: nbt.string('black'),
			messages: nbt.list(nbt.string(messages))
		});
		this.real.write('tile_entity_data', {
			location: data.location,
			action: SIGN_BLOCK_ENTITY_TYPE,
			nbtData: nbt.comp({
				id: nbt.string('minecraft:sign'),
				isWaxed: nbt.byte(0),
				front_text: side(lines),
				back_text: side(['', '', '', ''])
			})
		});
	}

	// -----------------------------------------------------------------------
	// chat / ui
	// -----------------------------------------------------------------------

	_chat(data) {
		this.real.write('system_chat', {
			content: component(data.message),
			isActionBar: data.position === 2
		});
	}

	_title(data) {
		switch (data.action) {
			case 0:
				this.real.write('set_title_text', { text: component(data.text) });
				break;
			case 1:
				this.real.write('set_title_subtitle', { text: component(data.text) });
				break;
			case 2:
				// 1.21.11 i32 times: pass the legacy values through unchanged so
				// int sentinels (for example 2147483647) are not clamped.
				this.real.write('set_title_time', {
					fadeIn: data.fadeIn,
					stay: data.stay,
					fadeOut: data.fadeOut
				});
				break;
			case 3:
				this.real.write('clear_titles', { reset: false });
				break;
			case 4:
				this.real.write('clear_titles', { reset: true });
				break;
		}
	}

	_tabComplete(data) {
		this.real.write('tab_complete', {
			transactionId: 0,
			start: 0,
			length: 0,
			matches: (data.matches || []).map((m) => ({ match: String(m), tooltip: null }))
		});
	}

	_playerlistHeader(data) {
		this.real.write('playerlist_header', {
			header: component(data.header),
			footer: component(data.footer)
		});
	}

	// -----------------------------------------------------------------------
	// players / entities
	// -----------------------------------------------------------------------

	_playerInfo(data) {
		if (data.action === 4) {
			this.real.write('player_remove', { players: data.data.map((entry) => entry.UUID) });
			return;
		}
		if (data.action === 2) {
			this.real.write('player_info', {
				action: { update_latency: true },
				data: data.data.map((entry) => ({ uuid: entry.UUID, latency: entry.ping || 0 }))
			});
			return;
		}
		this.real.write('player_info', {
			action: {
				add_player: true,
				update_listed: true,
				update_latency: true,
				update_game_mode: true,
				update_display_name: false
			},
			data: data.data.map((entry) => ({
				uuid: entry.UUID,
				player: { name: entry.name, properties: entry.properties || [] },
				listed: true,
				latency: entry.ping || 0,
				gamemode: entry.gamemode ?? 0
			}))
		});
	}

	_spawnPlayer(data) {
		const entityId = this.toEntityId(data.entityId);
		this.entityTypes.set(entityId, 'player');
		const uuid = data.playerUUID || this.entityUuid(entityId);
		this.real.write('spawn_entity', {
			entityId,
			objectUUID: uuid,
			type: mc21.entitiesByName.player.id,
			x: data.x, y: data.y, z: data.z,
			velocity: { x: 0, y: 0, z: 0 },
			pitch: turnSigned(data.pitch || 0),
			yaw: turnSigned(data.yaw || 0),
			headPitch: turnSigned(data.yaw || 0),
			objectData: 0
		});
		this._entityMetadata({ entityId, metadata: data.metadata });
	}

	_spawnEntity(data) {
		const entityId = this.toEntityId(data.entityId);
		const resolved = registry.resolveEntity(data.type);
		if (!resolved.ok) {
			this._reportRegistryFailure(resolved);
			return;
		}
		this.entityTypes.set(entityId, resolved.name);
		this.real.write('spawn_entity', {
			entityId,
			objectUUID: this.entityUuid(entityId),
			type: resolved.id,
			x: data.x, y: data.y, z: data.z,
			velocity: { x: 0, y: 0, z: 0 },
			pitch: turnSigned(data.pitch || 0),
			yaw: turnSigned(data.yaw || 0),
			headPitch: turnSigned(data.yaw || 0),
			objectData: 0
		});
		this._entityMetadata({ entityId, metadata: data.metadata });
	}

	_entityMetadata(data) {
		const entityId = this.toEntityId(data.entityId);
		const entityType = data.entityType || this.entityTypes.get(entityId);
		const metadata = normalizeMetadata(
			data.metadata,
			(failure) => this._reportRegistryFailure(failure),
			entityType
		);
		this.real.write('entity_metadata', { entityId, metadata });
	}

	_entityEquipment(data) {
		const legacySlot = Number(data.slot);
		const slot = EQUIPMENT_SLOT_MAP[legacySlot];
		if (!Number.isInteger(slot)) {
			throw new Error(`E_UNKNOWN_EQUIPMENT_SLOT ${data.slot}`);
		}
		this.real.write('entity_equipment', {
			entityId: this.toEntityId(data.entityId),
			equipments: [{ slot, item: this._itemStack(data.item) }]
		});
	}

	_entityTeleport(data) {
		this.real.write('entity_teleport', {
			entityId: this.toEntityId(data.entityId),
			x: data.x, y: data.y, z: data.z,
			dx: 0, dy: 0, dz: 0,
			yaw: data.yaw ?? 0,
			pitch: data.pitch ?? 0,
			flags: 0,
			onGround: !!data.onGround
		});
	}

	_entityVelocity(data) {
		this.real.write('entity_velocity', {
			entityId: this.toEntityId(data.entityId),
			velocity: { x: data.velocityX, y: data.velocityY, z: data.velocityZ }
		});
	}

	_headRotation(data) {
		this.real.write('entity_head_rotation', {
			entityId: this.toEntityId(data.entityId),
			headYaw: data.headYaw
		});
	}

	_entityDestroy(data) {
		this.real.write('entity_destroy', {
			entityIds: (data.entityIds || []).map((id) => this.toEntityId(id))
		});
	}

	_animation(data) {
		const map = { 0: 0, 1: 1, 4: 3, 5: 4 };
		this.real.write('animation', {
			entityId: this.toEntityId(data.entityId),
			animation: map[data.animation] ?? data.animation
		});
	}

	_collect(data) {
		this.real.write('collect', {
			collectedEntityId: this.toEntityId(data.collectedEntityId),
			collectorEntityId: this.toEntityId(data.collectorEntityId),
			pickupItemCount: 1
		});
	}

	_entityStatus(data) {
		this.real.write('entity_status', {
			entityId: this.toEntityId(data.entityId),
			entityStatus: data.entityStatus
		});
	}

	_entityEffect(data) {
		this.real.write('entity_effect', {
			entityId: this.toEntityId(data.entityId),
			effectId: data.effectId,
			amplifier: data.amplifier,
			duration: data.duration,
			flags: data.hideParticles ? 0 : 2
		});
	}

	_removeEntityEffect(data) {
		this.real.write('remove_entity_effect', {
			entityId: this.toEntityId(data.entityId),
			effectId: data.effectId
		});
	}

	_updateHealth(data) {
		this.real.write('update_health', {
			health: data.health ?? data.hp ?? 20,
			food: data.food ?? 19,
			foodSaturation: data.foodSaturation ?? 20
		});
	}

	_experience(data) {
		this.real.write('experience', {
			experienceBar: data.experienceBar ?? 0,
			level: data.level ?? 0,
			totalExperience: data.totalExperience ?? 0
		});
	}

	// -----------------------------------------------------------------------
	// inventory
	// -----------------------------------------------------------------------

	_menuType(data) {
		if (data.inventoryType === 'minecraft:chest') return 2; // generic_9x3
		if (Number.isInteger(data.slotCount)) {
			const rows = Math.ceil(Math.max(data.slotCount, 9) / 9);
			return Math.min(Math.max(rows - 1, 0), 5);
		}
		return 5;
	}

	_openWindow(data) {
		this.real.write('open_window', {
			windowId: data.windowId,
			inventoryType: this._menuType(data),
			windowTitle: component(data.windowTitle)
		});
	}

	_nextStateId(windowId) {
		const next = (this.windowStateIds.get(windowId) || 0) + 1;
		this.windowStateIds.set(windowId, next);
		return next;
	}

	_currentStateId(windowId) {
		return this.windowStateIds.get(windowId) || 0;
	}

	_windowItems(data) {
		this.real.write('window_items', {
			windowId: data.windowId,
			stateId: this._nextStateId(data.windowId),
			items: (data.items || []).map((item) => this._itemStack(item)),
			carriedItem: { itemCount: 0 }
		});
	}

	_setSlot(data) {
		// 1.8 uses windowId=-1/slot=-1 to clear the carried cursor item.
		if (data.windowId === -1 && data.slot === -1) {
			this.real.write('set_cursor_item', { contents: this._itemStack(data.item) });
			return;
		}
		this.real.write('set_slot', {
			windowId: data.windowId,
			stateId: this._currentStateId(data.windowId),
			slot: data.slot,
			item: this._itemStack(data.item)
		});
	}

	// -----------------------------------------------------------------------
	// scoreboard / teams
	// -----------------------------------------------------------------------

	_objectiveType(value) {
		if (value === 'INTEGER') return 0;
		if (value === 'HEARTS') return 1;
		if (Number.isInteger(value)) return value;
		return 0;
	}

	_scoreboardObjective(data) {
		if (data.action === 1) {
			this.real.write('scoreboard_objective', { name: data.name, action: 1 });
			return;
		}
		if (data.action !== 0 && data.action !== 2) {
			throw new Error(`E_UNKNOWN_SCOREBOARD_OBJECTIVE_ACTION ${data.action}`);
		}
		this.real.write('scoreboard_objective', {
			name: data.name,
			action: data.action,
			displayText: component(data.displayText),
			type: this._objectiveType(data.type),
			number_format: null,
			styling: undefined
		});
	}

	_scoreboardScore(data) {
		this.real.write('scoreboard_score', {
			itemName: data.itemName,
			scoreName: data.scoreName,
			value: data.value,
			display_name: null,
			number_format: null,
			styling: undefined
		});
	}

	_teamFormatting(value) {
		if (Number.isInteger(value)) return value;
		const colors = [
			'black', 'dark_blue', 'dark_green', 'dark_aqua', 'dark_red', 'dark_purple',
			'gold', 'gray', 'dark_gray', 'blue', 'green', 'aqua', 'red',
			'light_purple', 'yellow', 'white'
		];
		const index = colors.indexOf(value);
		return index === -1 ? 0 : index;
	}

	_team(data) {
		const mode = TEAM_MODES[data.mode];
		if (!mode) throw new Error(`E_UNKNOWN_TEAM_MODE ${data.mode}`);
		const packet = { team: data.team, mode };
		if (mode === 'add' || mode === 'change') {
			packet.name = component(data.name ?? '');
			packet.flags = { friendly_fire: !!data.friendlyFire, see_friendly_invisible: false };
			packet.nameTagVisibility = data.nameTagVisibility === 'all' || data.nameTagVisibility === undefined
				? 'always'
				: data.nameTagVisibility;
			packet.collisionRule = 'always';
			packet.formatting = this._teamFormatting(data.color ?? 0);
			packet.prefix = component(data.prefix ?? '');
			packet.suffix = component(data.suffix ?? '');
		}
		if (mode === 'add' || mode === 'join' || mode === 'leave') {
			packet.players = data.players || [];
		}
		this.real.write('teams', packet);
	}

	// -----------------------------------------------------------------------
	// misc
	// -----------------------------------------------------------------------

	_sound(data) {
		const name = SOUND_MAP[data.soundName] || data.soundName;
		const sound = mc21.soundsByName[name];
		if (!sound) throw new Error(`E_UNKNOWN_SOUND ${data.soundName}`);
		this.real.write('sound_effect', {
			sound: { soundId: sound.id },
			soundCategory: 'master',
			x: Math.floor((data.x ?? 0) * 8),
			y: Math.floor((data.y ?? 0) * 8),
			z: Math.floor((data.z ?? 0) * 8),
			volume: data.volume ?? 1,
			pitch: (data.pitch ?? 1) / 63,
			seed: 0n
		});
	}

	_particles(data) {
		// Bloxd emits a rich emitter description; vanilla only accepts concrete
		// particles. Emit a small burst of the closest vanilla particle instead
		// of dropping the effect entirely.
		const name = PARTICLE_MAP[data.texture] || PARTICLE_FALLBACK;
		const particle = { type: name };
		if (name === 'block') {
			const stateId = Number.isInteger(data.blockState)
				? data.blockState
				: (Number.isInteger(data.blockId) ? registry.resolveBlock(data.blockId, data.blockData ?? 0).stateId : undefined);
			if (!Number.isInteger(stateId)) {
				throw new Error('E_PARTICLE_BLOCK_STATE');
			}
			particle.data = stateId;
		} else if (name === 'dust') {
			particle.data = {
				color: Number.isInteger(data.color) ? data.color : 0xff0000,
				scale: typeof data.scale === 'number' ? data.scale : 1
			};
		}
		this.real.write('world_particles', {
			longDistance: false,
			alwaysShow: false,
			x: data.pos1?.[0] ?? 0,
			y: data.pos1?.[1] ?? 0,
			z: data.pos1?.[2] ?? 0,
			offsetX: 0.5, offsetY: 0.5, offsetZ: 0.5,
			velocityOffset: 0,
			amount: Math.min(Math.max(data.manualEmitCount || 4, 1), 32),
			particle
		});
	}

	_customPayload(data) {
		let channel = data.channel;
		if (!channel.includes(':')) channel = 'minecraft:' + channel;
		this.real.write('custom_payload', { channel, data: data.data });
	}
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function isItemStackValue(value) {
	return !!value && typeof value === 'object' &&
		(typeof value.blockId === 'number' || value.nbtData !== undefined ||
			value.bloxdName !== undefined || value.itemCount !== undefined);
}

function normalizeMetadata(metadata, onUnresolved, entityType) {
	if (!metadata) return [];
	const entries = Array.isArray(metadata) ? metadata : Object.values(metadata);
	const out = [];
	const itemStack = (value) => {
		const stack = registry.itemStack(value);
		if (stack && stack.unresolved && typeof onUnresolved === 'function') {
			onUnresolved(stack.unresolved);
		}
		return stack;
	};
	const metadataKeys = entityType && mc21.entitiesByName[entityType]
		? mc21.entitiesByName[entityType].metadataKeys
		: null;
	const push = (mapping, type, value) => {
		if (metadataKeys && metadataKeys[mapping.key] !== mapping.name) {
			throw new Error(
				`E_METADATA_KEY_UNVERIFIED ${entityType} ${mapping.key} ${metadataKeys[mapping.key]} != ${mapping.name}`
			);
		}
		out.push({ key: mapping.key, type, value });
	};

	for (const entry of entries) {
		const legacyKey = Number(entry.key ?? entry.index);
		const value = entry.value;
		// Legacy type 5 is a slot/item stack (the dropped-item entity). The
		// 1.21.11 item entity carries it at metadata key 8 as a Slot.
		if (entry.type === 5) {
			if (!isItemStackValue(value)) {
				throw new Error(`E_METADATA_ITEM_STACK_EXPECTED ${legacyKey}`);
			}
			push(ITEM_STACK_METADATA, 'item_stack', itemStack(value));
			continue;
		}
		if (IGNORED_METADATA_KEYS.has(legacyKey)) continue;
		const mapping = METADATA_KEY_MAP[legacyKey];
		if (!mapping) {
			throw new Error(`E_UNMAPPED_METADATA_KEY ${legacyKey}`);
		}
		switch (mapping.type) {
			case 'byte': push(mapping, 'byte', value & 0xff); break;
			case 'int': push(mapping, 'int', value | 0); break;
			case 'float': push(mapping, 'float', Number(value)); break;
			case 'boolean': push(mapping, 'boolean', !!value); break;
			case 'optional_component':
				if (value !== undefined && value !== null && value !== '') {
					push(mapping, 'optional_component', nbtString(value));
				}
				break;
			case 'item_stack': push(mapping, 'item_stack', itemStack(value)); break;
			default: throw new Error(`E_METADATA_TYPE_UNKNOWN ${mapping.type}`);
		}
	}
	return out;
}


LegacyClient.WRITE_DISPOSITIONS = WRITE_DISPOSITIONS;
LegacyClient.NOOP_LEDGER = NOOP_LEDGER;
LegacyClient.SOUND_MAP = Object.freeze({ ...SOUND_MAP });
LegacyClient.PARTICLE_MAP = Object.freeze({ ...PARTICLE_MAP });
LegacyClient.PARTICLE_FALLBACK = PARTICLE_FALLBACK;
LegacyClient.EQUIPMENT_SLOT_MAP = EQUIPMENT_SLOT_MAP;
LegacyClient.METADATA_KEY_MAP = METADATA_KEY_MAP;
LegacyClient.ITEM_STACK_METADATA = ITEM_STACK_METADATA;
LegacyClient.SIGN_BLOCK_ENTITY_TYPE = SIGN_BLOCK_ENTITY_TYPE;
LegacyClient.normalizeMetadata = normalizeMetadata;
LegacyClient.signLineText = signLineText;

module.exports = LegacyClient;


