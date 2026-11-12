'use strict';

/*
 * Chunk encoder pinned to Minecraft Java 1.21.11 (protocol 774).
 * The section, palette, heightmap and light layouts below are captured-verified
 * against a real vanilla server (test/fixtures/12111-chunk/vanilla-flat.json)
 * instead of relying on prismarine-chunk, whose 1.21 entry resolves to 1.18.
 */

const mcData = require('minecraft-data')('1.21.11');
const registry = require('./registry.js');

const MIN_Y = -64;
const WORLD_HEIGHT = 384;
const SECTION_COUNT = 24;
const HEIGHTMAP_LONG_COUNT = 37;
const LIGHT_SECTION_COUNT = 26;
const LIGHT_SECTION_OFFSET = 5;

const SECTION_HEIGHT = 16;
const BLOCK_CELLS = SECTION_HEIGHT * 16 * 16;
const BIOME_CELLS = 4 * 4 * 4;
const LIGHT_SECTION_END = LIGHT_SECTION_OFFSET + 20;
const HEIGHTMAP_BITS = 9;
const HEIGHTMAP_VALUES_PER_LONG = 7;

const BLOCK_CONTAINER = Object.freeze({ minBits: 4, maxIndirectBits: 8 });
const BIOME_CONTAINER = Object.freeze({ minBits: 1, maxIndirectBits: 3 });
const FLUID_NAMES = new Set(['water', 'lava', 'bubble_column', 'flowing_water', 'flowing_lava']);

function chunkError(code, message) {
	const error = new Error(message);
	error.code = code;
	return error;
}

function blockOfState(stateId) {
	const state = mcData.blocksByStateId[stateId];
	if (!state) return null;
	return mcData.blocks[state.id] || state;
}

function isAirLike(name) {
	return name === 'air' || name.endsWith('_air');
}

function isLeaves(stateId) {
	const block = blockOfState(stateId);
	return block !== null && block.name.endsWith('_leaves');
}

function blocksMotion(stateId) {
	const block = blockOfState(stateId);
	return block !== null && !isAirLike(block.name) && block.boundingBox === 'block';
}

function isFluid(stateId) {
	const block = blockOfState(stateId);
	return block !== null && FLUID_NAMES.has(block.name);
}

function motionBlocking(stateId) {
	return blocksMotion(stateId) || isFluid(stateId);
}

function blockCountOf(stateIds, offset) {
	let count = 0;
	for (let i = 0; i < BLOCK_CELLS; i++) {
		if (stateIds[offset + i] !== 0) count++;
	}
	return count;
}

function buildHeightmap(stateIds, accepts) {
	const packed = new Array(HEIGHTMAP_LONG_COUNT).fill(0n);
	for (let z = 0; z < 16; z++) {
		for (let x = 0; x < 16; x++) {
			let stored = 0;
			for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
				if (accepts(stateIds[y * 256 + z * 16 + x])) {
					stored = y + 1;
					break;
				}
			}
			const cell = z * 16 + x;
			const longIndex = Math.floor(cell / HEIGHTMAP_VALUES_PER_LONG);
			const shift = BigInt((cell % HEIGHTMAP_VALUES_PER_LONG) * HEIGHTMAP_BITS);
			packed[longIndex] |= BigInt(stored) << shift;
		}
	}
	return packed;
}

function bitsNeeded(value) {
	return value === 0 ? 0 : 32 - Math.clz32(value);
}

function varintLength(value) {
	let length = 1;
	let remaining = value >>> 0;
	while (remaining >= 0x80) {
		remaining >>>= 7;
		length++;
	}
	return length;
}

function writeVarint(buffer, offset, value) {
	let remaining = value >>> 0;
	while (remaining >= 0x80) {
		buffer[offset++] = (remaining & 0x7f) | 0x80;
		remaining >>>= 7;
	}
	buffer[offset++] = remaining;
	return offset;
}

function buildPalette(values) {
	const palette = [];
	const indexes = new Map();
	let maxValue = 0;
	for (let i = 0; i < values.length; i++) {
		const value = values[i];
		if (value > maxValue) maxValue = value;
		if (!indexes.has(value)) {
			indexes.set(value, palette.length);
			palette.push(value);
		}
	}
	return { palette, indexes, maxValue };
}

function containerBits(paletteLength, maxValue, config) {
	if (paletteLength === 1) return 0;
	if (paletteLength <= (1 << config.maxIndirectBits)) {
		return Math.max(config.minBits, bitsNeeded(paletteLength - 1));
	}
	return Math.max(9, bitsNeeded(maxValue));
}

function containerSize(cellCount, palette, bitsPerValue, indirect) {
	if (bitsPerValue === 0) return 1 + varintLength(palette[0]);

	let size = 1;
	if (indirect) {
		size += varintLength(palette.length);
		for (let i = 0; i < palette.length; i++) size += varintLength(palette[i]);
	}
	const valuesPerLong = Math.floor(64 / bitsPerValue);
	return size + Math.ceil(cellCount / valuesPerLong) * 8;
}

function writePaletteContainer(values, config) {
	const { palette, indexes, maxValue } = buildPalette(values);
	const bitsPerValue = containerBits(palette.length, maxValue, config);
	const indirect = palette.length <= (1 << config.maxIndirectBits);
	const out = Buffer.allocUnsafe(containerSize(values.length, palette, bitsPerValue, indirect));
	let offset = writeVarint(out, 0, bitsPerValue);
	if (bitsPerValue === 0) {
		writeVarint(out, offset, palette[0]);
		return out;
	}

	if (indirect) {
		offset = writeVarint(out, offset, palette.length);
		for (let i = 0; i < palette.length; i++) offset = writeVarint(out, offset, palette[i]);
	}

	const valuesPerLong = Math.floor(64 / bitsPerValue);
	const longCount = Math.ceil(values.length / valuesPerLong);
	for (let i = 0; i < longCount; i++) {
		let packed = 0n;
		const base = i * valuesPerLong;
		const end = Math.min(base + valuesPerLong, values.length);
		for (let j = base; j < end; j++) {
			const value = indirect ? indexes.get(values[j]) : values[j];
			packed |= BigInt(value) << BigInt((j - base) * bitsPerValue);
		}
		out.writeBigUInt64BE(packed, offset);
		offset += 8;
	}
	return out;
}

function encodeSection(stateIds, offset, biomeValues) {
	const states = stateIds.subarray(offset, offset + BLOCK_CELLS);
	const blockContainer = writePaletteContainer(states, BLOCK_CONTAINER);
	const biomeContainer = writePaletteContainer(biomeValues, BIOME_CONTAINER);
	const out = Buffer.allocUnsafe(2 + blockContainer.length + biomeContainer.length);
	out.writeInt16BE(blockCountOf(stateIds, offset), 0);
	blockContainer.copy(out, 2);
	biomeContainer.copy(out, 2 + blockContainer.length);
	return out;
}

function legacyPosition() {
	const local = { x: 0, y: 0, z: 0 };
	const position = {
		x: 0,
		y: 0,
		z: 0,
		modulus(other) {
			local.x = position.x % other.x;
			local.y = position.y % other.y;
			local.z = position.z % other.z;
			return local;
		}
	};
	return position;
}

function legacyColumnToStates(legacyColumn) {
	const states = new Uint32Array(SECTION_COUNT * BLOCK_CELLS);
	const pos = legacyPosition();

	for (let y = 0; y < 256; y++) {
		pos.y = y;
		for (let z = 0; z < 16; z++) {
			pos.z = z;
			for (let x = 0; x < 16; x++) {
				pos.x = x;
				const type = legacyColumn.getBlockType(pos);
				const data = legacyColumn.getBlockData(pos);
				const resolved = registry.resolveBlock(type, data);
				if (!resolved.ok) {
					throw chunkError(
						'E_CHUNK_UNMAPPED_BLOCK',
						`unmapped legacy block x=${x} y=${y} z=${z} type=${type} data=${data}`
					);
				}
				states[(y - MIN_Y) * 256 + z * 16 + x] = resolved.stateId;
			}
		}
	}

	return states;
}

function encodeMapChunk({ x, z, stateIds, biomeId }) {
	const expectedStates = SECTION_COUNT * BLOCK_CELLS;
	if (!(stateIds instanceof Uint32Array) || stateIds.length !== expectedStates) {
		throw chunkError(
			'E_CHUNK_INVALID_STATE_IDS',
			`stateIds must be a Uint32Array of ${expectedStates} entries`
		);
	}

	for (let i = 0; i < stateIds.length; i++) {
		const stateId = stateIds[i];
		if (!Object.prototype.hasOwnProperty.call(mcData.blocksByStateId, stateId)) {
			const cell = i % 256;
			const y = Math.floor(i / 256) + MIN_Y;
			throw chunkError(
				'E_CHUNK_UNKNOWN_STATE',
				`unknown block state id ${stateId} at x=${cell % 16} y=${y} z=${Math.floor(cell / 16)}`
			);
		}
	}

	if (!Number.isInteger(biomeId) ||
		!Object.prototype.hasOwnProperty.call(mcData.biomes, biomeId)) {
		throw chunkError('E_CHUNK_UNKNOWN_BIOME', `unknown biome id ${biomeId}`);
	}

	const biomeValues = new Uint32Array(BIOME_CELLS);
	biomeValues.fill(biomeId);

	const sections = [];
	for (let section = 0; section < SECTION_COUNT; section++) {
		sections.push(encodeSection(stateIds, section * BLOCK_CELLS, biomeValues));
	}
	const chunkData = Buffer.concat(sections);

	const heightmaps = [
		{ type: 'world_surface', data: buildHeightmap(stateIds, (stateId) => stateId !== 0) },
		{
			type: 'motion_blocking_no_leaves',
			data: buildHeightmap(stateIds, (stateId) => motionBlocking(stateId) && !isLeaves(stateId))
		},
		{ type: 'motion_blocking', data: buildHeightmap(stateIds, motionBlocking) }
	];

	const skyLightMask = ((1n << BigInt(LIGHT_SECTION_END)) - 1n) ^
		((1n << BigInt(LIGHT_SECTION_OFFSET)) - 1n);
	const skyLight = [];
	for (let i = LIGHT_SECTION_OFFSET; i < LIGHT_SECTION_END; i++) {
		skyLight.push(Buffer.alloc(2048, 0xff));
	}
	const emptyBlockLightMask = (1n << BigInt(LIGHT_SECTION_COUNT)) - 1n;

	return {
		x,
		z,
		heightmaps,
		chunkData,
		blockEntities: [],
		skyLightMask: [skyLightMask],
		blockLightMask: [],
		emptySkyLightMask: [],
		emptyBlockLightMask: [emptyBlockLightMask],
		skyLight,
		blockLight: []
	};
}

module.exports = {
	MIN_Y,
	WORLD_HEIGHT,
	SECTION_COUNT,
	HEIGHTMAP_LONG_COUNT,
	LIGHT_SECTION_COUNT,
	LIGHT_SECTION_OFFSET,
	legacyColumnToStates,
	encodeMapChunk
};
