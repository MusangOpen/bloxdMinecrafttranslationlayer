'use strict';

const mc21 = require('minecraft-data')('1.21.11');
const STATIC_TAGS = require('./vanilla_tags_1_21_11.json');

const TAGS = {
	'minecraft:enchantment': {
		'minecraft:exclusive_set/armor': [
			'minecraft:protection',
			'minecraft:blast_protection',
			'minecraft:fire_protection',
			'minecraft:projectile_protection'
		],
		'minecraft:exclusive_set/boots': [
			'minecraft:frost_walker',
			'minecraft:depth_strider'
		],
		'minecraft:exclusive_set/bow': [
			'minecraft:infinity',
			'minecraft:mending'
		],
		'minecraft:exclusive_set/crossbow': [
			'minecraft:multishot',
			'minecraft:piercing'
		],
		'minecraft:exclusive_set/damage': [
			'minecraft:sharpness',
			'minecraft:smite',
			'minecraft:bane_of_arthropods',
			'minecraft:impaling',
			'minecraft:density',
			'minecraft:breach'
		],
		'minecraft:exclusive_set/mining': [
			'minecraft:fortune',
			'minecraft:silk_touch'
		],
		'minecraft:exclusive_set/riptide': [
			'minecraft:loyalty',
			'minecraft:channeling'
		]
	},
	'minecraft:dialog': {
		'minecraft:pause_screen_additions': [],
		'minecraft:quick_actions': []
	},
	'minecraft:timeline': {
		'minecraft:universal': [
			'minecraft:villager_schedule'
		],
		'minecraft:in_end': [
			'#minecraft:universal'
		],
		'minecraft:in_nether': [
			'#minecraft:universal'
		],
		'minecraft:in_overworld': [
			'#minecraft:universal',
			'minecraft:day',
			'minecraft:moon',
			'minecraft:early_game'
		]
	}
};

function resolveTagEntries(tagType, tagName, values, ids, allTags, stack) {
	if (stack.has(tagName)) {
		throw new Error(`E_REGISTRY_TAG_CYCLE ${tagType}/${tagName}`);
	}
	const nextStack = new Set(stack);
	nextStack.add(tagName);

	const entries = [];
	for (const value of values) {
		if (value.startsWith('#')) {
			const nestedName = value.slice(1);
			const nestedValues = allTags[nestedName];
			if (!nestedValues) {
				throw new Error(`E_REGISTRY_TAG_MISSING ${tagType}/${nestedName}`);
			}
			entries.push(...resolveTagEntries(tagType, nestedName, nestedValues, ids, allTags, nextStack));
			continue;
		}

		const id = ids.get(value);
		if (id === undefined) {
			throw new Error(`E_REGISTRY_ENTRY_MISSING ${tagType}/${value}`);
		}
		entries.push(id);
	}
	return entries;
}

function packetTagsFor(tagType, tags, ids) {
	const packetTags = [];
	for (const [tagName, values] of Object.entries(tags)) {
		packetTags.push({
			tagName,
			entries: resolveTagEntries(tagType, tagName, values, ids, tags, new Set())
		});
	}
	return packetTags;
}

function staticIds(tagType) {
	if (tagType === 'minecraft:damage_type') {
		const registry = mc21.loginPacket.dimensionCodec[tagType];
		if (!registry || !Array.isArray(registry.entries)) {
			throw new Error(`E_REGISTRY_MISSING ${tagType}`);
		}
		return new Map(registry.entries.map((entry, index) => [entry.key, index]));
	}

	const names = tagType === 'minecraft:block'
		? mc21.blocksByName
		: tagType === 'minecraft:item'
			? mc21.itemsByName
			: tagType === 'minecraft:entity_type'
				? mc21.entitiesByName
				: null;

	if (!names) throw new Error(`E_REGISTRY_MISSING ${tagType}`);
	return new Map(Object.entries(names).map(([name, entry]) => [`minecraft:${name}`, entry.id]));
}

function buildRegistryTags() {
	const codec = mc21.loginPacket.dimensionCodec;
	const result = [];

	for (const [tagType, tags] of Object.entries(STATIC_TAGS)) {
		result.push({ tagType, tags: packetTagsFor(tagType, tags, staticIds(tagType)) });
	}

	for (const [tagType, tags] of Object.entries(TAGS)) {
		const registry = codec[tagType];
		if (!registry || !Array.isArray(registry.entries)) {
			throw new Error(`E_REGISTRY_MISSING ${tagType}`);
		}
		const ids = new Map(registry.entries.map((entry, index) => [entry.key, index]));
		result.push({ tagType, tags: packetTagsFor(tagType, tags, ids) });
	}

	return result;
}

module.exports = { buildRegistryTags };
