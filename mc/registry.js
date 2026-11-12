'use strict';

/**
 * Converts the legacy Minecraft 1.8 numeric block/item ids used throughout the
 * handlers into Minecraft 1.21.11 registry ids.
 *
 * The handlers were written against 1.8 ids; keeping that vocabulary avoids a
 * risky rewrite of items.js. Every legacy name is resolved through an explicit
 * alias/variant map. Unknown names, ids and metadata return a typed failure
 * instead of silently becoming stone or armor_stand. Everything below is
 * cached and allocation free on the hot path.
 */

const mc18 = require('minecraft-data')('1.8.9');
const mc21 = require('minecraft-data')('1.21.11');
const { toNbtComponent } = require('./components');
const itemModels = require('./item_models');

/** Convert a Bloxd display name or lore line to an anonymous NBT component. */
function textComponent(value) {
	return toNbtComponent(value);
}

function hasComponentText(value) {
	if (value == null) return false;
	if (typeof value === 'string') return value.length > 0;
	if (typeof value === 'object') return true;
	return String(value).length > 0;
}

function displayNameFor(data) {
	for (const value of [data.displayName, data.name, data.bloxdName]) {
		if (hasComponentText(value)) return value;
	}
	return null;
}

/** Collision-checked resource-pack item_model identifier for a Bloxd item. */
function itemModelId(data) {
	if (!data) return null;
	const name = data.bloxdName || data.name;
	if (name == null) return null;
	const resolved = itemModels.resolveItemModel(
		itemModels.DEFAULT_MAPPING,
		name,
		data.nameKey || data.bloxdNameKey
	);
	return resolved.ok ? resolved.modelId : null;
}

const COLORS = [
	'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
	'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'
];

// 1.8 banner metadata is not in wool order: 0 is black and 15 is white.
const BANNER_COLORS = [
	'black', 'red', 'green', 'brown', 'blue', 'purple', 'cyan', 'light_gray',
	'gray', 'pink', 'lime', 'yellow', 'light_blue', 'magenta', 'orange', 'white'
];

const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak'];

const STONE_VARIANTS = [
	'stone', 'granite', 'polished_granite', 'diorite', 'polished_diorite',
	'andesite', 'polished_andesite'
];

const STONE_SLABS = [
	'smooth_stone_slab', 'sandstone_slab', 'petrified_oak_slab',
	'cobblestone_slab', 'brick_slab', 'stone_brick_slab',
	'nether_brick_slab', 'quartz_slab'
];

const RED_FLOWERS = [
	'poppy', 'blue_orchid', 'allium', 'azure_bluet', 'red_tulip',
	'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy'
];

const DOUBLE_PLANTS = ['sunflower', 'lilac', 'tall_grass', 'large_fern', 'rose_bush', 'peony'];

const SKULLS = [
	'skeleton_skull', 'wither_skeleton_skull', 'zombie_head', 'player_head',
	'creeper_head'
];

const DYES = [
	'ink_sac', 'red_dye', 'green_dye', 'cocoa_beans', 'lapis_lazuli',
	'purple_dye', 'cyan_dye', 'light_gray_dye', 'gray_dye', 'pink_dye',
	'lime_dye', 'yellow_dye', 'light_blue_dye', 'magenta_dye', 'orange_dye',
	'bone_meal'
];

const FISH = ['cod', 'salmon', 'tropical_fish', 'pufferfish'];
const COOKED_FISH = ['cooked_cod', 'cooked_salmon'];

const FLOWER_POTS = [
	'flower_pot', 'potted_poppy', 'potted_dandelion', 'potted_oak_sapling',
	'potted_spruce_sapling', 'potted_birch_sapling', 'potted_jungle_sapling',
	'potted_red_mushroom', 'potted_brown_mushroom', 'potted_cactus',
	'potted_dead_bush', 'potted_fern', 'potted_acacia_sapling',
	'potted_dark_oak_sapling'
];

// 1.8 block/item names that were actually renamed in later versions.
const LEGACY_BLOCK_ALIASES = Object.freeze({
	grass: 'grass_block',
	flowing_water: 'water',
	flowing_lava: 'lava',
	noteblock: 'note_block',
	golden_rail: 'powered_rail',
	web: 'cobweb',
	piston_extension: 'piston_head',
	deadbush: 'dead_bush',
	yellow_flower: 'dandelion',
	brick_block: 'bricks',
	mob_spawner: 'spawner',
	lit_furnace: 'furnace',
	standing_sign: 'oak_sign',
	wooden_door: 'oak_door',
	wall_sign: 'oak_wall_sign',
	wooden_pressure_plate: 'oak_pressure_plate',
	lit_redstone_ore: 'redstone_ore',
	unlit_redstone_torch: 'redstone_torch',
	snow_layer: 'snow',
	snow: 'snow_block',
	stone_stairs: 'cobblestone_stairs',
	reeds: 'sugar_cane',
	fence: 'oak_fence',
	portal: 'nether_portal',
	lit_pumpkin: 'jack_o_lantern',
	unpowered_repeater: 'repeater',
	powered_repeater: 'repeater',
	trapdoor: 'oak_trapdoor',
	melon_block: 'melon',
	fence_gate: 'oak_fence_gate',
	waterlily: 'lily_pad',
	nether_brick: 'nether_bricks',
	lit_redstone_lamp: 'redstone_lamp',
	wooden_button: 'oak_button',
	unpowered_comparator: 'comparator',
	powered_comparator: 'comparator',
	quartz_ore: 'nether_quartz_ore',
	hardened_clay: 'terracotta',
	daylight_detector_inverted: 'daylight_detector',
	slime: 'slime_block',
});

// Item-only renames (ids >= 256 that are not also block ids).
const LEGACY_ITEM_ALIASES = Object.freeze({
	grass: 'grass_block',
	brick_block: 'bricks',
	netherbrick: 'nether_brick',
	speckled_melon: 'glistering_melon_slice',
	fireworks: 'firework_rocket',
	firework_charge: 'firework_star',
	sign: 'oak_sign',
	wooden_door: 'oak_door',
	boat: 'oak_boat',
	reeds: 'sugar_cane',
	melon: 'melon_slice',
	record_13: 'music_disc_13',
	record_cat: 'music_disc_cat',
	record_blocks: 'music_disc_blocks',
	record_chirp: 'music_disc_chirp',
	record_far: 'music_disc_far',
	record_mall: 'music_disc_mall',
	record_mellohi: 'music_disc_mellohi',
	record_stal: 'music_disc_stal',
	record_strad: 'music_disc_strad',
	record_ward: 'music_disc_ward',
	record_11: 'music_disc_11',
	record_wait: 'music_disc_wait'
});

// 1.8 entity names (lowercased) that changed between 1.8 and 1.21.11.
const LEGACY_ENTITY_ALIASES = Object.freeze({
	boat: 'oak_boat',
	minecartrideable: 'minecart',
	primedtnt: 'tnt',
	endercrystal: 'end_crystal',
	pigzombie: 'zombified_piglin',
	cavespider: 'cave_spider',
	thrownegg: 'egg',
	smallfireball: 'small_fireball',
	thrownenderpearl: 'ender_pearl',
	witherskull: 'wither_skull',
	fallingsand: 'falling_block',
	itemframe: 'item_frame',
	eyeofendersignal: 'eye_of_ender',
	thrownpotion: 'splash_potion',
	thrownexpbottle: 'experience_bottle',
	fireworksrocketentity: 'firework_rocket',
	leashknot: 'leash_knot',
	armorstand: 'armor_stand',
	'fishing float': 'fishing_bobber',
	mushroomcow: 'mooshroom',
	snowman: 'snow_golem',
	ozelot: 'ocelot',
	villagergolem: 'iron_golem',
	entityhorse: 'horse'
});

// 1.8 spawn-egg metadata is not the entity id for several mobs.
const SPAWN_EGG_ENTITIES = Object.freeze({
	50: 'creeper',
	51: 'skeleton',
	52: 'spider',
	54: 'zombie',
	55: 'slime',
	56: 'ghast',
	57: 'zombified_piglin',
	58: 'enderman',
	59: 'cave_spider',
	60: 'silverfish',
	61: 'blaze',
	62: 'magma_cube',
	63: 'ender_dragon',
	64: 'wither',
	65: 'bat',
	66: 'witch',
	67: 'endermite',
	68: 'guardian',
	90: 'pig',
	91: 'sheep',
	92: 'cow',
	93: 'chicken',
	94: 'squid',
	95: 'wolf',
	96: 'mooshroom',
	97: 'snow_golem',
	98: 'ocelot',
	99: 'iron_golem',
	100: 'horse',
	101: 'rabbit',
	120: 'villager'
});

const ABSTRACT_LEGACY_ENTITIES = new Set(['mob', 'monster']);

function failure(code, details) {
	return Object.assign({ ok: false, code }, details);
}

/** Returns the 1.21 block name for a legacy (id, metadata) pair. */
function blockName(id, data) {
	const block = mc18.blocks[id];
	if (!block) return null;
	const name = block.name;
	data = data | 0;
	if (data < 0 || data > 15) return null;

	switch (name) {
		case 'wool': return COLORS[data] + '_wool';
		case 'carpet': return COLORS[data] + '_carpet';
		case 'stained_hardened_clay': return COLORS[data] + '_terracotta';
		case 'stained_glass': return COLORS[data] + '_stained_glass';
		case 'stained_glass_pane': return COLORS[data] + '_stained_glass_pane';
		case 'concrete': return COLORS[data] + '_concrete';
		case 'concrete_powder': return COLORS[data] + '_concrete_powder';
		case 'bed': return 'red_bed';
		case 'banner': return BANNER_COLORS[data] + '_banner';
		case 'standing_banner': return BANNER_COLORS[data] + '_banner';
		case 'wall_banner': return BANNER_COLORS[data] + '_wall_banner';
		case 'dirt':
			return data === 0 ? 'dirt' : (data === 1 ? 'coarse_dirt' : (data === 2 ? 'podzol' : null));
		case 'sponge':
			return data === 0 ? 'sponge' : (data === 1 ? 'wet_sponge' : null);
		case 'log': {
			const type = data & 3;
			return (data & 12) === 12 ? WOODS[type] + '_wood' : WOODS[type] + '_log';
		}
		case 'log2': {
			if (data & 2) return null;
			const type = data & 1;
			return (data & 12) === 12
				? (type ? 'dark_oak_wood' : 'acacia_wood')
				: (type ? 'dark_oak_log' : 'acacia_log');
		}
		case 'planks':
			return data < 6 ? WOODS[data] + '_planks' : null;
		case 'sapling': {
			const type = data & 7;
			return type < 6 ? WOODS[type] + '_sapling' : null;
		}
		case 'leaves':
			return WOODS[data & 3] + '_leaves';
		case 'leaves2':
			if (data & 2) return null;
			return data & 1 ? 'dark_oak_leaves' : 'acacia_leaves';
		case 'stone':
			return STONE_VARIANTS[data] || null;
		case 'sand':
			return data === 0 ? 'sand' : (data === 1 ? 'red_sand' : null);
		case 'sandstone':
			return data === 0 ? 'sandstone'
				: (data === 1 ? 'chiseled_sandstone' : (data === 2 ? 'cut_sandstone' : null));
		case 'stonebrick':
			return ['stone_bricks', 'mossy_stone_bricks', 'cracked_stone_bricks', 'chiseled_stone_bricks'][data] || null;
		case 'quartz_block':
			return data === 0 ? 'quartz_block'
				: (data === 1 ? 'chiseled_quartz_block' : (data >= 2 && data <= 4 ? 'quartz_pillar' : null));
		case 'prismarine':
			return data === 0 ? 'prismarine'
				: (data === 1 ? 'prismarine_bricks' : (data === 2 ? 'dark_prismarine' : null));
		case 'red_sandstone':
			return data === 0 ? 'red_sandstone'
				: (data === 1 ? 'chiseled_red_sandstone' : (data === 2 ? 'cut_red_sandstone' : null));
		case 'double_stone_slab':
			if (data > 9 && data !== 15) return null;
			return STONE_SLABS[data & 7] || null;
		case 'stone_slab':
			return STONE_SLABS[data & 7] || null;
		case 'double_wooden_slab':
			return data < 6 ? WOODS[data] + '_slab' : null;
		case 'wooden_slab': {
			const type = data & 7;
			return type < 6 ? WOODS[type] + '_slab' : null;
		}
		case 'double_stone_slab2':
			return data === 0 || data === 8 ? 'red_sandstone_slab' : null;
		case 'stone_slab2':
			return data === 0 || data === 8 ? 'red_sandstone_slab' : null;
		case 'cobblestone_wall':
			return data === 0 ? 'cobblestone_wall'
				: (data === 1 ? 'mossy_cobblestone_wall' : null);
		case 'monster_egg':
			return [
				'infested_stone', 'infested_cobblestone', 'infested_stone_bricks',
				'infested_mossy_stone_bricks', 'infested_cracked_stone_bricks',
				'infested_chiseled_stone_bricks'
			][data] || null;
		case 'tallgrass':
			return data === 0 ? 'dead_bush'
				: (data === 1 ? 'short_grass' : (data === 2 ? 'fern' : null));
		case 'yellow_flower':
			return data === 0 ? 'dandelion' : null;
		case 'red_flower':
			return RED_FLOWERS[data] || null;
		case 'double_plant': {
			const type = data & 7;
			return type < 6 ? DOUBLE_PLANTS[type] : null;
		}
		case 'skull':
			return SKULLS[data] || null;
		case 'brown_mushroom_block':
			if (data === 10 || data === 15) return 'mushroom_stem';
			return data <= 10 || data === 14 ? 'brown_mushroom_block' : null;
		case 'red_mushroom_block':
			if (data === 10 || data === 15) return 'mushroom_stem';
			return data <= 10 || data === 14 ? 'red_mushroom_block' : null;
		case 'flower_pot':
			return FLOWER_POTS[data] || null;
		case 'anvil':
			return data <= 14 ? 'anvil' : null;
		default:
			return LEGACY_BLOCK_ALIASES[name] || name;
	}
}

function itemName(id, data) {
	const legacy = mc18.items[id] || mc18.blocks[id];
	if (!legacy) return null;
	if (mc18.blocks[id]) return blockName(id, data);
	const name = legacy.name;
	data = data | 0;

	switch (name) {
		case 'fish': return FISH[data] || null;
		case 'cooked_fish': return COOKED_FISH[data] || null;
		case 'dye': return DYES[data] || null;
		case 'coal':
			return data === 0 ? 'coal' : (data === 1 ? 'charcoal' : null);
		case 'golden_apple':
			return data === 0 ? 'golden_apple' : (data === 1 ? 'enchanted_golden_apple' : null);
		case 'potion':
			return (data & 0x4000) ? 'splash_potion' : 'potion';
		case 'bed':
			return data === 0 ? 'red_bed' : null;
		case 'banner':
			return data >= 0 && data <= 15 ? BANNER_COLORS[data] + '_banner' : null;
		case 'skull':
			return SKULLS[data] || null;
		case 'spawn_egg': {
			const entity = SPAWN_EGG_ENTITIES[data];
			return entity ? entity + '_spawn_egg' : null;
		}
		default:
			return LEGACY_ITEM_ALIASES[name] || name;
	}
}

function entityName(id) {
	const entity = mc18.entities[id];
	if (!entity) return null;
	const key = String(entity.name).toLowerCase();
	return LEGACY_ENTITY_ALIASES[key] || key;
}

const blockCache = new Map();

/** Typed 1.8 (id, metadata) -> 1.21.11 block resolution. */
function resolveBlock(id, data = 0) {
	const legacyId = Number(id);
	const metadata = Number(data);
	if (!Number.isInteger(legacyId) || legacyId < 0) {
		return failure('E_UNRESOLVED_BLOCK', {
			legacyId: id,
			metadata: data,
			reason: 'invalid-legacy-id'
		});
	}
	if (!Number.isInteger(metadata) || metadata < 0 || metadata > 15) {
		return failure('E_UNRESOLVED_BLOCK', {
			legacyId,
			metadata: data,
			legacyName: mc18.blocks[legacyId] && mc18.blocks[legacyId].name,
			reason: 'invalid-legacy-metadata'
		});
	}

	const key = legacyId * 16 + metadata;
	const cached = blockCache.get(key);
	if (cached !== undefined) return cached;

	const legacy = mc18.blocks[legacyId];
	if (!legacy) {
		const result = failure('E_UNRESOLVED_BLOCK', {
			legacyId,
			metadata,
			reason: 'unknown-legacy-id'
		});
		blockCache.set(key, result);
		return result;
	}
	const name = blockName(legacyId, metadata);
	if (!name) {
		const result = failure('E_UNRESOLVED_BLOCK', {
			legacyId,
			metadata,
			legacyName: legacy.name,
			reason: 'unmapped-legacy-metadata'
		});
		blockCache.set(key, result);
		return result;
	}
	const block = mc21.blocksByName[name];
	if (!block) {
		const result = failure('E_UNRESOLVED_BLOCK', {
			legacyId,
			metadata,
			legacyName: legacy.name,
			targetName: name,
			reason: 'no-modern-block'
		});
		blockCache.set(key, result);
		return result;
	}

	const result = {
		ok: true,
		legacyId,
		metadata,
		legacyName: legacy.name,
		name,
		id: block.id,
		stateId: block.defaultState
	};
	blockCache.set(key, result);
	return result;
}

const itemCache = new Map();

/** Typed 1.8 item/block id -> 1.21.11 item resolution (0 = air). */
function resolveItem(id, data = 0) {
	const legacyId = Number(id);
	const metadata = Number(data);
	if (!Number.isInteger(legacyId) || legacyId < 0) {
		return failure('E_UNRESOLVED_ITEM', {
			legacyId: id,
			metadata: data,
			reason: 'invalid-legacy-id'
		});
	}
	if (legacyId === 0) {
		return {
			ok: true,
			legacyId: 0,
			metadata: 0,
			legacyName: 'air',
			name: 'air',
			itemId: 0,
			air: true
		};
	}

	const key = legacyId + ':' + (metadata | 0);
	const cached = itemCache.get(key);
	if (cached !== undefined) return cached;

	const legacy = mc18.items[legacyId] || mc18.blocks[legacyId];
	if (!legacy) {
		const result = failure('E_UNRESOLVED_ITEM', {
			legacyId,
			metadata,
			reason: 'unknown-legacy-id'
		});
		itemCache.set(key, result);
		return result;
	}
	const name = itemName(legacyId, metadata);
	if (!name) {
		const result = failure('E_UNRESOLVED_ITEM', {
			legacyId,
			metadata,
			legacyName: legacy.name,
			reason: mc18.blocks[legacyId] ? 'block-has-no-item' : 'unmapped-legacy-metadata'
		});
		itemCache.set(key, result);
		return result;
	}
	const item = mc21.itemsByName[name];
	if (!item) {
		const result = failure('E_UNRESOLVED_ITEM', {
			legacyId,
			metadata,
			legacyName: legacy.name,
			targetName: name,
			reason: mc18.blocks[legacyId] ? 'block-has-no-item' : 'no-modern-item'
		});
		itemCache.set(key, result);
		return result;
	}

	const result = {
		ok: true,
		legacyId,
		metadata,
		legacyName: legacy.name,
		name,
		itemId: item.id
	};
	itemCache.set(key, result);
	return result;
}

const entityCache = new Map();

/** Typed 1.8 entity type id -> 1.21.11 entity resolution. */
function resolveEntity(id) {
	const legacyId = Number(id);
	if (!Number.isInteger(legacyId) || legacyId < 0) {
		return failure('E_UNRESOLVED_ENTITY', {
			legacyId: id,
			reason: 'invalid-legacy-id'
		});
	}
	const cached = entityCache.get(legacyId);
	if (cached !== undefined) return cached;

	const legacy = mc18.entities[legacyId];
	if (!legacy) {
		const result = failure('E_UNRESOLVED_ENTITY', {
			legacyId,
			reason: 'unknown-legacy-id'
		});
		entityCache.set(legacyId, result);
		return result;
	}
	const key = String(legacy.name).toLowerCase();
	if (ABSTRACT_LEGACY_ENTITIES.has(key)) {
		const result = failure('E_UNSUPPORTED_ENTITY', {
			legacyId,
			legacyName: legacy.name,
			reason: 'abstract-legacy-entity'
		});
		entityCache.set(legacyId, result);
		return result;
	}
	const name = LEGACY_ENTITY_ALIASES[key] || key;
	const entity = mc21.entitiesByName[name];
	if (!entity) {
		const result = failure('E_UNRESOLVED_ENTITY', {
			legacyId,
			legacyName: legacy.name,
			targetName: name,
			reason: 'no-modern-entity'
		});
		entityCache.set(legacyId, result);
		return result;
	}

	const result = {
		ok: true,
		legacyId,
		legacyName: legacy.name,
		name,
		id: entity.id
	};
	entityCache.set(legacyId, result);
	return result;
}

/** Legacy (id, metadata) -> 1.21.11 global block state id, or null. */
function blockState(id, data = 0) {
	const result = resolveBlock(id, data);
	return result.ok ? result.stateId : null;
}

/** Legacy 1.8 item/block id -> 1.21.11 item id (0 = air), or null. */
function itemId(id, data = 0) {
	const result = resolveItem(id, data);
	return result.ok ? result.itemId : null;
}

/** Convert a 1.8 item stack produced by utils.translateItem(). */
function itemStack(data) {
	if (!data || data.blockId === undefined || data.blockId === null) return { itemCount: 0 };
	const legacyId = Number(data.blockId);
	if (!Number.isFinite(legacyId) || legacyId < 0 || legacyId === 0) return { itemCount: 0 };
	const legacyData = data.itemDamage | 0;
	const resolved = resolveItem(legacyId, legacyData);
	if (!resolved.ok) {
		return {
			itemCount: 0,
			itemId: 0,
			addedComponentCount: 0,
			removedComponentCount: 0,
			components: [],
			removeComponents: [],
			unresolved: resolved
		};
	}

	// A translated Bloxd item must have a real manifest model. Returning an
	// unresolved stack (rather than inventing a slug or silently omitting the
	// model) makes the failure visible to the client owner and the tests.
	let itemModel = null;
	const bloxdName = data.bloxdName != null ? data.bloxdName : data.name;
	if (bloxdName != null) {
		const model = itemModels.resolveItemModel(
			itemModels.DEFAULT_MAPPING,
			bloxdName,
			data.nameKey || data.bloxdNameKey
		);
		if (!model.ok) {
			// Explicit block-item exemption: manifest models describe Bloxd ITEMS.
			// A legacy block-derived stack (Dirt, Stone, ...) has no manifest item
			// model, so it keeps the valid vanilla base item id and vanilla model
			// without emitting an invented item_model component. Existing
			// custom_name/lore are still preserved below.
			if (!mc18.blocks[legacyId]) {
				return {
					itemCount: 0,
					itemId: 0,
					addedComponentCount: 0,
					removedComponentCount: 0,
					components: [],
					removeComponents: [],
					unresolved: model
				};
			}
		} else {
			itemModel = model.modelId;
		}
	}

	const components = [];
	const nbtValue = data.nbtData && data.nbtData.value;
	if (nbtValue) {
		if (nbtValue.Unbreakable) components.push({ type: 'unbreakable' });
		const enchList = nbtValue.ench && nbtValue.ench.value && nbtValue.ench.value.value;
		if (Array.isArray(enchList) && enchList.length) {
			const enchantments = [];
			for (const entry of enchList) {
				const legacyEnchantId = entry.id && entry.id.value;
				const level = entry.lvl && entry.lvl.value;
				const legacy = Object.values(mc18.enchantments).find((e) => e.id === legacyEnchantId);
				const modern = legacy && mc21.enchantmentsByName[legacy.name];
				if (modern) enchantments.push({ id: modern.id, level: level || 1 });
			}
			if (enchantments.length) components.push({ type: 'enchantments', data: { enchantments } });
		}
	}

	const displayName = displayNameFor(data);
	if (displayName != null) {
		components.push({ type: 'custom_name', data: textComponent(displayName) });
	}

	if (Array.isArray(data.lore) && data.lore.length) {
		components.push({ type: 'lore', data: data.lore.map(textComponent) });
	}

	if (itemModel) components.push({ type: 'item_model', data: itemModel });

	return {
		itemCount: Math.max(0, data.itemCount || 1),
		itemId: resolved.itemId,
		addedComponentCount: components.length,
		removedComponentCount: 0,
		components,
		removeComponents: []
	};
}

function entityType(name) {
	const type = mc21.entitiesByName[name];
	return type ? type.id : null;
}

module.exports = {
	COLORS,
	WOODS,
	LEGACY_BLOCK_ALIASES,
	LEGACY_ITEM_ALIASES,
	LEGACY_ENTITY_ALIASES,
	SPAWN_EGG_ENTITIES,
	ABSTRACT_LEGACY_ENTITIES,
	blockName,
	blockState,
	itemId,
	itemStack,
	itemModelId,
	entityType,
	resolveBlock,
	resolveItem,
	resolveEntity,
	mc18,
	mc21
};
