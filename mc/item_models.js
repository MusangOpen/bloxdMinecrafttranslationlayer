'use strict';

/**
 * Collision-checked Bloxd name -> resource-pack item_model mapping.
 *
 * The mapping is generated from bloxd/resource_pack/manifest.json so the
 * adapter never invents a model id. Both the plain-name map (used by items
 * without a metadata variant) and the full name-key map are validated: two
 * different Bloxd names may not point at the same model id inside either map.
 */

const path = require('node:path');

const MANIFEST_PATH = path.join(__dirname, '..', 'bloxd', 'resource_pack', 'manifest.json');
const MODEL_ID = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

function mappingError(code, details) {
	const error = new Error(code + (details && details.modelId ? ' ' + details.modelId : ''));
	error.code = code;
	if (details) Object.assign(error, details);
	return error;
}

function addEntry(map, seen, name, modelId, source) {
	if (typeof name !== 'string' || name.length === 0) {
		throw mappingError('E_INVALID_ITEM_MODEL_NAME', { name, modelId, source });
	}
	if (typeof modelId !== 'string' || !MODEL_ID.test(modelId)) {
		throw mappingError('E_INVALID_ITEM_MODEL_ID', { name, modelId, source });
	}
	if (seen.has(modelId) && seen.get(modelId) !== name) {
		throw mappingError('E_DUPLICATE_ITEM_MODEL', {
			modelId,
			name,
			otherName: seen.get(modelId),
			source
		});
	}
	seen.set(modelId, name);
	map.set(name, modelId);
}

/**
 * Build the two lookup maps from a manifest-shaped object.
 * Throws a typed error on a missing map, malformed id or duplicate model id.
 */
function buildItemModelMap(manifest) {
	if (!manifest || typeof manifest !== 'object') {
		throw mappingError('E_ITEM_MODEL_MANIFEST_MISSING', {});
	}
	if (!manifest.nameToModel || typeof manifest.nameToModel !== 'object') {
		throw mappingError('E_ITEM_MODEL_MANIFEST_MISSING', { field: 'nameToModel' });
	}

	const byName = new Map();
	const nameIds = new Map();
	for (const [name, modelId] of Object.entries(manifest.nameToModel)) {
		addEntry(byName, nameIds, name, modelId, 'nameToModel');
	}

	const byKey = new Map();
	if (manifest.nameKeyToModel != null) {
		if (typeof manifest.nameKeyToModel !== 'object') {
			throw mappingError('E_ITEM_MODEL_MANIFEST_MISSING', { field: 'nameKeyToModel' });
		}
		const keyIds = new Map();
		for (const [nameKey, modelId] of Object.entries(manifest.nameKeyToModel)) {
			addEntry(byKey, keyIds, nameKey, modelId, 'nameKeyToModel');
		}
	}

	return Object.freeze({
		byName,
		byKey,
		size: byName.size,
		keySize: byKey.size,
		modelIds: new Set(nameIds.keys())
	});
}

/** Resolve a Bloxd name (and optional metadata name key) to a model id. */
function resolveItemModel(mapping, name, nameKey) {
	if (typeof nameKey === 'string' && nameKey.length && mapping.byKey.has(nameKey)) {
		return { ok: true, modelId: mapping.byKey.get(nameKey), name, nameKey };
	}
	if (typeof name === 'string' && name.length && mapping.byName.has(name)) {
		return { ok: true, modelId: mapping.byName.get(name), name };
	}
	return {
		ok: false,
		code: 'E_MISSING_ITEM_MODEL',
		name: name == null ? null : String(name),
		nameKey: nameKey == null ? null : String(nameKey)
	};
}

const manifest = require(MANIFEST_PATH);
const DEFAULT_MAPPING = buildItemModelMap(manifest);

module.exports = {
	MANIFEST_PATH,
	MODEL_ID,
	DEFAULT_MAPPING,
	buildItemModelMap,
	resolveItemModel
};
