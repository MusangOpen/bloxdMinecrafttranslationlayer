#!/usr/bin/env node
'use strict';

/*
 * 1.21.11 adapter tests.
 *
 * --only item-components exercises the four item paths the legacy adapter
 * exposes (set_slot, window_items, entity_equipment, dropped-item
 * entity_metadata). Every captured adapter write is serialized with the real
 * minecraft-protocol 1.21.11 serializer and decoded with its real deserializer.
 *
 * --only item-visuals asserts the collision-checked manifest model mapping plus
 * exact anonymous-NBT custom_name/lore on set_slot, window_items,
 * set_cursor_item, entity_equipment and dropped-item entity metadata, while
 * keeping the vanilla base item id and requiring zero missing/duplicate models.
 *
 * --only inbound drives a real local 1.21.11 minecraft-protocol server and
 * client. The client sends real held_item_slot/chat_message/chat_command/
 * use_item/block_place packets over TCP; assertions cover both the raw packet
 * fields received by the server and the normalized legacy events emitted by
 * LegacyClient.
 *
 * --only components serializes legacy JSON chat components through the real
 * 1.21.11 system_chat packet and decodes the anonymous NBT back. It asserts
 * exact NBT for text/extra, translate/with, style flags, events, legacy §
 * codes, malformed-JSON fallback, depth cap and cycle guard, and requires
 * lossyTextOnly=0.
 *
 * --only titles drives a real local 1.21.11 minecraft-protocol server and
 * client. The adapter writes legacy title actions 0..4 and the test decodes the
 * actual server->client packets, asserting distinct set_title_text /
 * set_title_subtitle packet names, exact anonymous NBT and exact int32
 * fadeIn/stay/fadeOut values (including -2147483648 and 2147483647) plus the
 * clear (reset=false) / reset (reset=true) distinction.
 *
 * --only registry-map audits the explicit 1.8 -> 1.21.11 block/item/entity
 * alias map against minecraft-data 1.8.9 and 1.21.11. It requires
 * unresolvedExisting=0, silentStoneFallback=0, silentArmorStandFallback=0,
 * newRegistryIds=0, exact IDs for representative metadata variants and typed
 * failures (never stone/armor_stand) for unknown inputs.
 *
 * --only vocabulary statically enumerates every client.write/client.on call
 * site in bloxd/handlers/impl/*.js with its exact source line, requires an
 * explicit 1.21.11 packet mapping or ledger-listed no-op for every write, and
 * decodes exact chunk/light/heightmap, sign tile-entity, equipment, inventory
 * state, scoreboard/team, sound/particle and entity-metadata fields through
 * both the real 1.21.11 serializer and a real local server/client connection.
 *
 * Modes:
 *   node test/mc-adapter.js --only item-components
 *     Positive run; exit 0 only when every expected component is present and
 *     the component counts match the decoded component arrays.
 *   node test/mc-adapter.js --only item-visuals
 *     Positive run; exit 0 only when inventoryModels>0, equipmentModels>0,
 *     droppedItemModels>0, missingModels=0, duplicateModelIds=0, newItemIds=0,
 *     exactNameNbt=1 and every decoded path has its manifest model/name/lore.
 *   node test/mc-adapter.js --only inbound
 *     Positive run; exit 0 only when slotId=5, chatMessageForwarded=1,
 *     useItemAsBlockPlace=1 and fabricatedPosition=0.
 *   node test/mc-adapter.js --only components
 *     Positive run; exit 0 only when every rich component survives as exact
 *     anonymous NBT and lossyTextOnly=0.
 *   node test/mc-adapter.js --only titles
 *     Positive run; exit 0 only when titleText=1, subtitleText=1, timesExact=1
 *     and clearReset=1 with distinct title/subtitle packets and exact times.
 *   node test/mc-adapter.js --only registry-map
 *     Positive run; exit 0 only when unresolvedExisting=0,
 *     silentStoneFallback=0, silentArmorStandFallback=0, newRegistryIds=0,
 *     representative block/item/entity/metadata cases hit exact 1.21.11 ids,
 *     and unknown inputs return typed failures instead of stone/armor_stand.
 *   node test/mc-adapter.js --only vocabulary
 *     Positive run; exit 0 only when handlerWrites=manifest.handlerWriteCount,
 *     handlerWrites>0, mapped=handlerWrites, unhandled=0,
 *     swallowedWriteErrors=0, noopsAllLedgerListed=1 and every chunk/sign/
 *     equipment/inventory/scoreboard/sound/particle/metadata field matches.
 *   node test/mc-adapter.js --self-test missing-component-count
 *   node test/mc-adapter.js --self-test string-lore
 *   node test/mc-adapter.js --self-test named-entity-fallback
 *   node test/mc-adapter.js --self-test missing-model
 *   node test/mc-adapter.js --self-test duplicate-model
 *   node test/mc-adapter.js --self-test new-item-id
 *   node test/mc-adapter.js --self-test dropped-item-metadata
 *   node test/mc-adapter.js --self-test inbound-missing-slot
 *   node test/mc-adapter.js --self-test inbound-slot-default-zero
 *   node test/mc-adapter.js --self-test inbound-missing-chat
 *   node test/mc-adapter.js --self-test inbound-use-item-drop
 *   node test/mc-adapter.js --self-test drop-extra
 *   node test/mc-adapter.js --self-test malformed-json
 *   node test/mc-adapter.js --self-test deep-cycle
 *   node test/mc-adapter.js --self-test subtitle-as-title
 *   node test/mc-adapter.js --self-test hardcoded-time
 *   node test/mc-adapter.js --self-test unknown-block
 *   node test/mc-adapter.js --self-test silent-fallback
 *   node test/mc-adapter.js --self-test missing-case
 *   node test/mc-adapter.js --self-test swallowed-write
 *   node test/mc-adapter.js --self-test wrong-equipment-slot
 *     Each injects one specific fault and exits non-zero when that fault is
 *     detected. Exit 0 means the test failed to detect the injected fault.
 */

const path = require('node:path');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const assert = require('node:assert/strict');
const nbt = require('prismarine-nbt');
const Vec3 = require('vec3');
const Chunk18 = require('prismarine-chunk')('1.8.9');
const mc21 = require('minecraft-data')('1.21.11');
const {
  createSerializer,
  createDeserializer,
  createServer,
  createClient
} = require('minecraft-protocol');

const ROOT = path.resolve(__dirname, '..');
const utils = require(path.join(ROOT, 'bloxd', 'utils.js'));
const registry = require(path.join(ROOT, 'mc', 'registry.js'));
const itemModels = require(path.join(ROOT, 'mc', 'item_models.js'));
const packManifest = require(path.join(ROOT, 'bloxd', 'resource_pack', 'manifest.json'));
const LegacyClient = require(path.join(ROOT, 'mc', 'client.js'));

const EXPECTED = Object.freeze({
  source: 'Diamond Sword',
  displayName: 'Diamond Sword',
  lore: ['A shiny blade', 'Deals 7 damage'],
  model: 'bloxd:diamond_sword_8133',
  legacyId: 276,
  modernName: 'diamond_sword',
  enchantment: 'sharpness',
  enchantmentLevel: 3
});

const INBOUND = Object.freeze({
  slotId: 5,
  chatMessage: 'ordinary inbound chat',
  chatCommand: 'queue lobby',
  chatCommandNormalized: '/queue lobby',
  useItemHand: 0,
  useItemSequence: 42,
  nativeLocation: Object.freeze({ x: 2, y: 70, z: -3 }),
  nativeDirection: 1,
  nativeSequence: 43
});

const INBOUND_SELF_TESTS = Object.freeze([
  'inbound-missing-slot',
  'inbound-slot-default-zero',
  'inbound-missing-chat',
  'inbound-use-item-drop'
]);

function freshItem() {
  return {
    name: EXPECTED.source,
    amount: 1,
    displayName: EXPECTED.displayName,
    lore: EXPECTED.lore.slice(),
    attributes: { customAttributes: { enchantments: { Damage: EXPECTED.enchantmentLevel } } }
  };
}

const serializer = createSerializer({ state: 'play', isServer: true, version: '1.21.11' });
const deserializer = createDeserializer({ state: 'play', isServer: false, version: '1.21.11' });

function createStubReal() {
  const writes = [];
  return {
    writes,
    username: 'component-test',
    uuid: '00000000-0000-0000-0000-000000000011',
    protocolVersion: 774,
    on() {},
    end() {},
    write(name, data) {
      writes.push({ name, data });
    }
  };
}

function decodeWrite(write) {
  const buffer = serializer.createPacketBuffer({ name: write.name, params: write.data });
  return deserializer.parsePacketBuffer(buffer).data.params;
}

function capture(legacyName, legacyData) {
  const real = createStubReal();
  const client = new LegacyClient(real);
  client.write(legacyName, legacyData);
  const write = real.writes.find((entry) => entry.name === legacyName);
  if (!write) {
    throw new Error('adapter did not write ' + legacyName + ' (writes: ' +
      real.writes.map((entry) => entry.name).join(',') + ')');
  }
  return decodeWrite(write);
}

function findComponent(stack, type) {
  const components = stack && Array.isArray(stack.components) ? stack.components : [];
  return components.find((component) => component && component.type === type);
}

function componentText(component) {
  if (!component || !component.data || component.data.type !== 'compound') return null;
  const value = component.data.value || {};
  const text = value.text;
  return text && text.type === 'string' ? text.value : null;
}

function componentLore(component) {
  if (!component || !Array.isArray(component.data)) return null;
  const lines = [];
  for (const entry of component.data) {
    if (!entry || entry.type !== 'compound') return null;
    const text = entry.value && entry.value.text;
    if (!text || text.type !== 'string') return null;
    lines.push(text.value);
  }
  return lines;
}

function validateStack(input, stack, options) {
  const failures = [];
  const expectedId = mc21.itemsByName[EXPECTED.modernName].id;
  const fail = (code, detail) => failures.push({ code, detail });

  if (!input || (!input.name && !input.bloxdName)) {
    fail('E_NAMED_ENTITY_FALLBACK', 'item lacks structured name/bloxdName');
  }

  if (!stack || typeof stack !== 'object') {
    fail('E_ADDED_COUNT_MISMATCH', 'missing item stack');
    return failures;
  }

  const components = Array.isArray(stack.components) ? stack.components : [];
  if (!Number.isInteger(stack.addedComponentCount) ||
      stack.addedComponentCount !== components.length) {
    fail('E_ADDED_COUNT_MISMATCH', {
      addedComponentCount: stack.addedComponentCount,
      componentCount: components.length
    });
  }
  const removeComponents = Array.isArray(stack.removeComponents) ? stack.removeComponents : [];
  if (!Number.isInteger(stack.removedComponentCount) ||
      stack.removedComponentCount !== removeComponents.length) {
    fail('E_REMOVED_COUNT_MISMATCH', {
      removedComponentCount: stack.removedComponentCount,
      removeComponentCount: removeComponents.length
    });
  }

  if (stack.itemId !== expectedId) {
    fail('E_ITEM_ID_CHANGED', { expected: expectedId, actual: stack.itemId });
  }
  const table = mc21.items[stack.itemId];
  if (!table || table.name !== EXPECTED.modernName) {
    fail('E_ITEM_ID_CHANGED', { tableName: table && table.name, expectedName: EXPECTED.modernName });
  }

  const unbreakable = findComponent(stack, 'unbreakable');
  if (!unbreakable) fail('E_UNBREAKABLE_LOST', 'unbreakable component missing');

  const enchantments = findComponent(stack, 'enchantments');
  const expectedEnchant = mc21.enchantmentsByName[EXPECTED.enchantment].id;
  const decodedEnchant = enchantments && enchantments.data && enchantments.data.enchantments;
  if (!Array.isArray(decodedEnchant) ||
      !decodedEnchant.some((entry) => entry.id === expectedEnchant && entry.level === EXPECTED.enchantmentLevel)) {
    fail('E_ENCHANT_LOST', { expectedEnchant, decodedEnchant });
  }

  const customName = findComponent(stack, 'custom_name');
  const customText = componentText(customName);
  if (!customName || typeof customName.data === 'string' || customText !== EXPECTED.displayName) {
    fail('E_CUSTOM_NAME_NBT', {
      type: customName && customName.data && customName.data.type,
      text: customText
    });
  }

  const lore = findComponent(stack, 'lore');
  const loreLines = componentLore(lore);
  if (!lore || !Array.isArray(lore.data) || !loreLines ||
      JSON.stringify(loreLines) !== JSON.stringify(EXPECTED.lore) ||
      lore.data.some((entry) => typeof entry === 'string')) {
    fail('E_LORE_NBT', { lines: loreLines, raw: lore && lore.data });
  }

  const model = findComponent(stack, 'item_model');
  if (!model || typeof model.data !== 'string' || model.data !== EXPECTED.model) {
    fail('E_ITEM_MODEL_STRING', { model: model && model.data, type: typeof (model && model.data) });
  }

  if (options && options.dropped) {
    const meta = options.meta;
    if (!meta || meta.key !== 8 || meta.type !== 'item_stack') {
      fail('E_DROPPED_ITEM_KEY', { key: meta && meta.key, type: meta && meta.type });
    }
  }

  return failures;
}

function runItemComponents() {
  const paths = {};
  const failures = [];

  const item = () => utils.translateItem(freshItem());
  const record = (name, decoded, extra) => {
    const found = validateStack(extra && extra.input, decoded, extra);
    paths[name] = { failures: found.map((entry) => entry.code) };
    for (const entry of found) failures.push({ path: name, code: entry.code, detail: entry.detail });
  };

  try {
    const setSlot = capture('set_slot', { windowId: 0, slot: 36, item: item() });
    record('set_slot', setSlot.item, { input: item() });

    const windowItems = capture('window_items', { windowId: 0, items: [item(), { blockId: -1 }] });
    record('window_items', windowItems.items[0], { input: item() });
    if (!windowItems.items[1] || windowItems.items[1].itemCount !== 0) {
      failures.push({ path: 'window_items', code: 'E_EMPTY_SLOT', detail: windowItems.items[1] });
    }

    const equipment = capture('entity_equipment', { entityId: 42, slot: 0, item: item() });
    record('entity_equipment', equipment.equipments[0] && equipment.equipments[0].item, { input: item() });

    const metadata = capture('entity_metadata', {
      entityId: 7,
      metadata: { 0: { key: 10, value: item(), type: 5 } }
    });
    const meta = (metadata.metadata || []).find((entry) => entry.key === 8 || entry.key === 16);
    const droppedInput = item();
    record('dropped_item', meta && meta.value, { input: droppedInput, dropped: true, meta });
  } catch (error) {
    failures.push({ path: 'adapter', code: 'E_PATH_FAILURE', detail: error.message });
  }

  const allPaths = (code) => ['set_slot', 'window_items', 'entity_equipment', 'dropped_item']
    .every((name) => paths[name] && !paths[name].failures.includes(code));
  const droppedVisual = ['set_slot', 'window_items', 'entity_equipment', 'dropped_item']
    .reduce((seen, name) => seen + (paths[name] ? paths[name].failures.length : 1), 0) === 0 &&
    paths.dropped_item !== undefined
    ? 1
    : 0;

  const flags = {
    addedCountMatches: allPaths('E_ADDED_COUNT_MISMATCH') ? 1 : 0,
    customNameNbt: allPaths('E_CUSTOM_NAME_NBT') ? 1 : 0,
    loreNbt: allPaths('E_LORE_NBT') ? 1 : 0,
    itemModelString: allPaths('E_ITEM_MODEL_STRING') ? 1 : 0,
    unchangedItemIds: allPaths('E_ITEM_ID_CHANGED') ? 1 : 0,
    droppedItemVisual: droppedVisual
  };

  const ok = failures.length === 0;
  const result = {
    ok,
    mode: 'item-components',
    expected: {
      itemId: mc21.itemsByName[EXPECTED.modernName].id,
      name: EXPECTED.displayName,
      lore: EXPECTED.lore,
      model: EXPECTED.model,
      addedComponentCount: 5
    },
    flags,
    paths,
    failures
  };
  printJson(result);
  process.exit(ok ? 0 : 1);
}

// ---------------------------------------------------------------------------
// item-visuals: manifest model + exact NBT name/lore on every item path
// ---------------------------------------------------------------------------

const ITEM_VISUAL_SELF_TESTS = Object.freeze([
  'missing-model',
  'duplicate-model',
  'new-item-id',
  'dropped-item-metadata'
]);

// Frozen oracle: expected item_model ids are independent of the production
// manifest. If a Bloxd name -> model mapping changes, this test must fail
// instead of silently following the generated manifest.
const FROZEN_ITEM_MODELS = Object.freeze({
  'Diamond Sword': 'bloxd:diamond_sword_8133',
  'Wood Pickaxe': 'bloxd:wooden_pickaxe_8110',
  'Apple': 'bloxd:apple_8422'
});

function capturePacket(legacyName, legacyData, packetName) {
  const real = createStubReal();
  const client = new LegacyClient(real);
  client.write(legacyName, legacyData);
  const write = real.writes.find((entry) => entry.name === packetName);
  if (!write) {
    throw new Error('adapter did not write ' + packetName + ' for ' + legacyName +
      ' (writes: ' + real.writes.map((entry) => entry.name).join(',') + ')');
  }
  return decodeWrite(write);
}

function visualInput(name, lore) {
  return utils.translateItem({
    name,
    amount: 1,
    displayName: name,
    lore: lore.slice()
  });
}

function visualExpected(itemName, modernName, lore) {
  const model = FROZEN_ITEM_MODELS[itemName];
  if (!model) throw new Error('no frozen expected model for ' + itemName);
  const item = mc21.itemsByName[modernName];
  if (!item) throw new Error('1.21.11 has no item ' + modernName);
  return { displayName: itemName, lore, model, itemId: item.id };
}

function blockVisualExpected(itemName, modernName, lore) {
  const item = mc21.itemsByName[modernName];
  if (!item) throw new Error('1.21.11 has no item ' + modernName);
  return { displayName: itemName, lore, model: null, itemId: item.id, blockItem: true };
}

function manifestModelIdSet() {
  return new Set([
    ...Object.values(packManifest.nameToModel || {}),
    ...Object.values(packManifest.nameKeyToModel || {})
  ]);
}

function exactTextComponent(component, expected) {
  if (!component || !component.data || component.data.type !== 'compound') return false;
  const value = component.data.value || {};
  const text = value.text;
  if (!text || text.type !== 'string' || text.value !== expected) return false;
  return Object.keys(value).length === 1;
}

function validateVisualStack(stack, expected) {
  const failures = [];
  if (!stack || typeof stack !== 'object') {
    failures.push({ code: 'E_ITEM_STACK_MISSING', detail: stack });
    return failures;
  }

  const components = Array.isArray(stack.components) ? stack.components : [];
  const model = findComponent(stack, 'item_model');
  if (!model) {
    failures.push({ code: 'E_MISSING_ITEM_MODEL', item: expected.displayName });
  } else if (typeof model.data !== 'string' || model.data !== expected.model) {
    failures.push({
      code: 'E_ITEM_MODEL_STRING',
      expected: expected.model,
      actual: model.data,
      type: typeof model.data
    });
  }

  const customName = findComponent(stack, 'custom_name');
  if (!exactTextComponent(customName, expected.displayName)) {
    failures.push({
      code: 'E_CUSTOM_NAME_NBT',
      expected: expected.displayName,
      actual: customName && customName.data
    });
  }

  const lore = findComponent(stack, 'lore');
  const lines = Array.isArray(lore && lore.data) ? lore.data : null;
  const loreOk = !!lines &&
    lines.length === expected.lore.length &&
    lines.every((entry, index) => exactTextComponent({ data: entry }, expected.lore[index]));
  if (!loreOk) {
    failures.push({ code: 'E_LORE_NBT', expected: expected.lore, actual: lore && lore.data });
  }

  if (stack.itemId !== expected.itemId) {
    failures.push({
      code: 'E_NEW_ITEM_ID',
      expected: expected.itemId,
      actual: stack.itemId
    });
  }

  return failures;
}

function validateBlockItemStack(stack, expected) {
  const failures = [];
  if (!stack || typeof stack !== 'object') {
    failures.push({ code: 'E_ITEM_STACK_MISSING', detail: stack });
    return failures;
  }

  // Policy A: block-derived stacks keep the vanilla base item/model and must
  // not carry an invented manifest-style item_model.
  const model = findComponent(stack, 'item_model');
  if (model) {
    failures.push({ code: 'E_BLOCK_ITEM_INVENTED_MODEL', actual: model.data });
  }

  const customName = findComponent(stack, 'custom_name');
  if (!exactTextComponent(customName, expected.displayName)) {
    failures.push({
      code: 'E_CUSTOM_NAME_NBT',
      expected: expected.displayName,
      actual: customName && customName.data
    });
  }

  const lore = findComponent(stack, 'lore');
  const lines = Array.isArray(lore && lore.data) ? lore.data : null;
  const loreOk = !!lines &&
    lines.length === expected.lore.length &&
    lines.every((entry, index) => exactTextComponent({ data: entry }, expected.lore[index]));
  if (!loreOk) {
    failures.push({ code: 'E_LORE_NBT', expected: expected.lore, actual: lore && lore.data });
  }

  if (stack.itemId !== expected.itemId) {
    failures.push({
      code: 'E_NEW_ITEM_ID',
      expected: expected.itemId,
      actual: stack.itemId
    });
  }

  return failures;
}

function validateDroppedMetadata(metadata, expected) {
  const entries = Array.isArray(metadata) ? metadata : [];
  const entry = entries.find((candidate) => candidate && candidate.key === 8);
  if (!entry || entry.type !== 'item_stack') {
    return [{
      code: 'E_DROPPED_ITEM_METADATA',
      expected: { key: 8, type: 'item_stack' },
      actual: entry ? { key: entry.key, type: entry.type } : null
    }];
  }
  return validateVisualStack(entry.value, expected);
}

function countDuplicateModelIds() {
  const ids = Object.values(packManifest.nameToModel || {});
  return ids.length - new Set(ids).size;
}

function runItemVisuals() {
  const failures = [];
  const paths = {};
  const cases = [
    {
      path: 'set_slot',
      legacy: 'set_slot',
      packet: 'set_slot',
      itemName: 'Diamond Sword',
      modernName: 'diamond_sword',
      lore: ['A shiny blade', 'Deals 7 damage'],
      data: () => ({ windowId: 0, slot: 36, item: visualInput('Diamond Sword', ['A shiny blade', 'Deals 7 damage']) }),
      pick: (packet) => packet.item
    },
    {
      path: 'window_items',
      legacy: 'window_items',
      packet: 'window_items',
      itemName: 'Wood Pickaxe',
      modernName: 'wooden_pickaxe',
      lore: ['Mines stone'],
      data: () => ({ windowId: 0, items: [visualInput('Wood Pickaxe', ['Mines stone']), { blockId: -1 }] }),
      pick: (packet) => packet.items[0]
    },
    {
      path: 'set_cursor_item',
      legacy: 'set_slot',
      packet: 'set_cursor_item',
      itemName: 'Apple',
      modernName: 'apple',
      lore: ['Restores hunger'],
      data: () => ({ windowId: -1, slot: -1, item: visualInput('Apple', ['Restores hunger']) }),
      pick: (packet) => packet.contents
    },
    {
      path: 'entity_equipment',
      legacy: 'entity_equipment',
      packet: 'entity_equipment',
      itemName: 'Diamond Sword',
      modernName: 'diamond_sword',
      lore: ['A shiny blade', 'Deals 7 damage'],
      data: () => ({ entityId: 42, slot: 0, item: visualInput('Diamond Sword', ['A shiny blade', 'Deals 7 damage']) }),
      pick: (packet) => packet.equipments[0] && packet.equipments[0].item
    },
    {
      path: 'dropped_item',
      legacy: 'entity_metadata',
      packet: 'entity_metadata',
      itemName: 'Apple',
      modernName: 'apple',
      lore: ['Restores hunger'],
      data: () => ({
        entityId: 7,
        metadata: { 0: { key: 10, value: visualInput('Apple', ['Restores hunger']), type: 5 } }
      }),
      pick: (packet) => packet.metadata
    },
    {
      path: 'block_item_dirt',
      legacy: 'set_slot',
      packet: 'set_slot',
      itemName: 'Dirt',
      modernName: 'dirt',
      lore: ['Block item: dirt'],
      blockItem: true,
      data: () => ({ windowId: 0, slot: 10, item: visualInput('Dirt', ['Block item: dirt']) }),
      pick: (packet) => packet.item
    },
    {
      path: 'block_item_stone',
      legacy: 'set_slot',
      packet: 'set_slot',
      itemName: 'Stone',
      modernName: 'stone',
      lore: ['Block item: stone'],
      blockItem: true,
      data: () => ({ windowId: 0, slot: 11, item: visualInput('Stone', ['Block item: stone']) }),
      pick: (packet) => packet.item
    },
    {
      path: 'block_item_grass_block',
      legacy: 'set_slot',
      packet: 'set_slot',
      itemName: 'Grass Block',
      modernName: 'grass_block',
      lore: ['Block item: grass'],
      blockItem: true,
      data: () => ({ windowId: 0, slot: 12, item: visualInput('Grass Block', ['Block item: grass']) }),
      pick: (packet) => packet.item
    }
  ];

  if (itemModels.DEFAULT_MAPPING.byName.size !== Object.keys(packManifest.nameToModel).length) {
    failures.push({
      path: 'mapping',
      code: 'E_ITEM_MODEL_MAP_SIZE',
      expected: Object.keys(packManifest.nameToModel).length,
      actual: itemModels.DEFAULT_MAPPING.byName.size
    });
  }

  for (const testCase of cases) {
    let expected;
    let found;
    try {
      expected = testCase.blockItem
        ? blockVisualExpected(testCase.itemName, testCase.modernName, testCase.lore)
        : visualExpected(testCase.itemName, testCase.modernName, testCase.lore);
      const decoded = capturePacket(testCase.legacy, testCase.data(), testCase.packet);
      const value = testCase.pick(decoded);
      found = testCase.path === 'dropped_item'
        ? validateDroppedMetadata(value, expected)
        : (testCase.blockItem ? validateBlockItemStack(value, expected) : validateVisualStack(value, expected));
      const displayStack = testCase.path === 'dropped_item'
        ? (Array.isArray(value) ? (value.find((entry) => entry && entry.key === 8) || {}).value : value)
        : value;
      paths[testCase.path] = {
        model: findComponent(displayStack, 'item_model') && findComponent(displayStack, 'item_model').data,
        name: findComponent(displayStack, 'custom_name') && findComponent(displayStack, 'custom_name').data,
        lore: findComponent(displayStack, 'lore') && findComponent(displayStack, 'lore').data,
        itemId: displayStack && displayStack.itemId,
        expected,
        failures: found.map((failure) => failure.code)
      };
    } catch (error) {
      found = [{ code: 'E_ITEM_VISUAL_PATH_FAILURE', detail: error.message }];
      paths[testCase.path] = { failures: found.map((failure) => failure.code), error: error.message };
    }
    for (const failure of found) {
      failures.push(Object.assign({ path: testCase.path }, failure));
    }
  }

  const allFailures = Object.values(paths).flatMap((path) => path.failures || []);
  const inventoryPaths = ['set_slot', 'window_items', 'set_cursor_item'];
  const inventoryModels = inventoryPaths
    .filter((name) => paths[name] && paths[name].failures.length === 0).length;
  const equipmentModels = paths.entity_equipment && paths.entity_equipment.failures.length === 0 ? 1 : 0;
  const droppedItemModels = paths.dropped_item && paths.dropped_item.failures.length === 0 ? 1 : 0;
  const missingModels = allFailures.filter((code) => code === 'E_MISSING_ITEM_MODEL').length;
  const newItemIds = allFailures.filter((code) => code === 'E_NEW_ITEM_ID').length;
  const blockCases = cases.filter((testCase) => testCase.blockItem);
  const blockItemsWithoutModel = blockCases
    .filter((testCase) => paths[testCase.path] && paths[testCase.path].failures.length === 0).length;
  const knownModels = manifestModelIdSet();
  const nonManifestModels = Object.entries(paths)
    .filter(([, path]) => typeof path.model === 'string' && !knownModels.has(path.model))
    .map(([name, path]) => ({ path: name, model: path.model })).length;
  for (const [name, path] of Object.entries(paths)) {
    if (typeof path.model === 'string' && !knownModels.has(path.model)) {
      failures.push({ path: name, code: 'E_NON_MANIFEST_MODEL', model: path.model });
    }
  }
  const exactNameNbt = cases.every((testCase) => {
    const path = paths[testCase.path];
    return path &&
      !path.failures.includes('E_CUSTOM_NAME_NBT') &&
      !path.failures.includes('E_LORE_NBT');
  }) ? 1 : 0;

  const flags = {
    inventoryModels,
    equipmentModels,
    droppedItemModels,
    missingModels,
    duplicateModelIds: countDuplicateModelIds(),
    newItemIds,
    exactNameNbt,
    blockItemsWithoutModel,
    nonManifestModels
  };

  const ok = failures.length === 0 &&
    flags.inventoryModels > 0 &&
    flags.equipmentModels > 0 &&
    flags.droppedItemModels > 0 &&
    flags.missingModels === 0 &&
    flags.duplicateModelIds === 0 &&
    flags.newItemIds === 0 &&
    flags.exactNameNbt === 1 &&
    flags.blockItemsWithoutModel === blockCases.length &&
    blockCases.length > 0 &&
    flags.nonManifestModels === 0;

  printJson({
    ok,
    mode: 'item-visuals',
    flags,
    paths,
    failures
  });
  process.exit(ok ? 0 : 1);
}

function itemVisualsSelfTest(name) {
  let code;
  let detected = false;
  let observed = {};

  if (name === 'missing-model') {
    code = 'E_MISSING_ITEM_MODEL';
    const translated = utils.translateItem(freshItem());
    translated.bloxdName = 'Bloxd Item Without Pack Model';
    translated.name = translated.bloxdName;
    const stack = registry.itemStack(translated);
    observed = {
      unresolved: stack && stack.unresolved,
      itemId: stack && stack.itemId,
      componentTypes: (stack && stack.components || []).map((component) => component.type)
    };
    detected = !!stack && !!stack.unresolved &&
      stack.unresolved.code === code &&
      stack.itemId === 0 &&
      !observed.componentTypes.includes('item_model');
  } else if (name === 'duplicate-model') {
    code = 'E_DUPLICATE_ITEM_MODEL';
    try {
      itemModels.buildItemModelMap({
        nameToModel: {
          'Bloxd Name A': 'bloxd:collision_model',
          'Bloxd Name B': 'bloxd:collision_model'
        }
      });
    } catch (error) {
      detected = error.code === code;
      observed = { error: error.code, message: error.message };
    }
  } else if (name === 'new-item-id') {
    code = 'E_NEW_ITEM_ID';
    const expected = visualExpected('Diamond Sword', 'diamond_sword', ['A shiny blade', 'Deals 7 damage']);
    const stack = baseStack();
    stack.itemId = mc21.itemsByName.apple.id;
    const found = validateVisualStack(stack, expected);
    detected = found.some((failure) => failure.code === code);
    observed = { failures: found.map((failure) => failure.code), itemId: stack.itemId };
  } else if (name === 'dropped-item-metadata') {
    code = 'E_DROPPED_ITEM_METADATA';
    const expected = visualExpected('Apple', 'apple', ['Restores hunger']);
    const found = validateDroppedMetadata(
      [{ key: 0, type: 'compound', value: baseStack() }],
      expected
    );
    detected = found.some((failure) => failure.code === code);
    observed = { failures: found.map((failure) => failure.code) };
  } else {
    printJson({ ok: false, mode: 'self-test', selfTest: name, code: 'E_UNKNOWN_SELF_TEST' });
    process.exit(2);
  }

  printJson({
    ok: false,
    mode: 'self-test',
    selfTest: name,
    code,
    detected,
    observed
  });
  process.exit(detected ? 1 : 0);
}

// ---------------------------------------------------------------------------
// components: recursive JSON -> anonymous NBT chat components
// ---------------------------------------------------------------------------

const COMPONENTS = Object.freeze({
  baseInput: {
    text: '',
    extra: [{ text: 'A', color: 'red' }]
  },
  translateInput: {
    translate: 'chat.type.text',
    with: [
      { text: 'Alice' },
      { text: 'hello', bold: true, color: 'gold' }
    ],
    fallback: 'Alice: hello'
  },
  styleInput: {
    text: 'Styled',
    color: '#12ab34',
    font: 'minecraft:uniform',
    bold: true,
    italic: false,
    underlined: true,
    strikethrough: true,
    obfuscated: true,
    insertion: 'tip',
    clickEvent: { action: 'run_command', value: '/play skywars' },
    hoverEvent: { action: 'show_text', value: { text: 'Hover' } }
  },
  openUrlInput: {
    text: '',
    clickEvent: { action: 'open_url', value: 'https://example.com/doc' }
  },
  suggestCommandInput: {
    text: '',
    clickEvent: { action: 'suggest_command', value: '/msg ' }
  },
  runCommandInput: {
    text: '',
    clickEvent: { action: 'run_command', value: '/play skywars' }
  },
  showTextInput: {
    text: '',
    hoverEvent: { action: 'show_text', value: { text: 'Hover', color: 'gold' } }
  },
  showEntityInput: {
    text: '',
    hoverEvent: {
      action: 'show_entity',
      value: {
        type: 'minecraft:zombie',
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: { text: 'Zombie', color: 'green' }
      }
    }
  },
  malformedInput: '{"text": "broken",',
  legacyInput: '\u00a7cRed \u00a7lBold \u00a7rPlain',
  depthInput: 200,
  depthLevels: 65,
  depthLeafText: 'deep'
});

const COMPONENT_SELF_TESTS = Object.freeze(['drop-extra', 'malformed-json', 'deep-cycle']);

function buildDepthInput(depth) {
  let node = { text: COMPONENTS.depthLeafText };
  for (let i = 0; i < depth; i++) node = { text: '', extra: [node] };
  return node;
}

function buildCycleInput() {
  const cyclic = { text: '' };
  cyclic.extra = [cyclic];
  return cyclic;
}

function anonComp(value) {
  return { type: 'compound', value };
}

function expectedBaseNbt() {
  return anonComp({
    text: nbt.string(''),
    extra: nbt.list(nbt.comp([{ text: nbt.string('A'), color: nbt.string('red') }]))
  });
}

function expectedTranslateNbt() {
  return anonComp({
    translate: nbt.string('chat.type.text'),
    with: nbt.list(nbt.comp([
      { text: nbt.string('Alice') },
      { text: nbt.string('hello'), bold: nbt.byte(1), color: nbt.string('gold') }
    ])),
    fallback: nbt.string('Alice: hello')
  });
}

function expectedStyleNbt() {
  return anonComp({
    text: nbt.string('Styled'),
    color: nbt.string('#12ab34'),
    font: nbt.string('minecraft:uniform'),
    bold: nbt.byte(1),
    italic: nbt.byte(0),
    underlined: nbt.byte(1),
    strikethrough: nbt.byte(1),
    obfuscated: nbt.byte(1),
    insertion: nbt.string('tip'),
    click_event: anonComp({ action: nbt.string('run_command'), command: nbt.string('/play skywars') }),
    hover_event: anonComp({ action: nbt.string('show_text'), value: anonComp({ text: nbt.string('Hover') }) })
  });
}

function expectedOpenUrlNbt() {
  return anonComp({
    text: nbt.string(''),
    click_event: anonComp({ action: nbt.string('open_url'), url: nbt.string('https://example.com/doc') })
  });
}

function expectedSuggestCommandNbt() {
  return anonComp({
    text: nbt.string(''),
    click_event: anonComp({ action: nbt.string('suggest_command'), command: nbt.string('/msg ') })
  });
}

function expectedRunCommandNbt() {
  return anonComp({
    text: nbt.string(''),
    click_event: anonComp({ action: nbt.string('run_command'), command: nbt.string('/play skywars') })
  });
}

function expectedShowTextNbt() {
  return anonComp({
    text: nbt.string(''),
    hover_event: anonComp({
      action: nbt.string('show_text'),
      value: anonComp({ text: nbt.string('Hover'), color: nbt.string('gold') })
    })
  });
}

function expectedShowEntityNbt() {
  return anonComp({
    text: nbt.string(''),
    hover_event: anonComp({
      action: nbt.string('show_entity'),
      id: nbt.string('minecraft:zombie'),
      uuid: nbt.intArray([306070887, -392490285, -1537850778, 337068032]),
      name: anonComp({ text: nbt.string('Zombie'), color: nbt.string('green') })
    })
  });
}

function expectedLegacyNbt() {
  return anonComp({
    text: nbt.string(''),
    extra: nbt.list(nbt.comp([
      { text: nbt.string('Red '), color: nbt.string('red') },
      { text: nbt.string('Bold '), color: nbt.string('red'), bold: nbt.byte(1) },
      { text: nbt.string('Plain') }
    ]))
  });
}

function expectedMalformedNbt() {
  return anonComp({ text: nbt.string(COMPONENTS.malformedInput) });
}

function sameNbt(actual, expected) {
  try {
    assert.deepStrictEqual(actual, expected);
    return true;
  } catch (_error) {
    return false;
  }
}

function asCompound(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.type === 'compound' && value.value && typeof value.value === 'object') return value;
  if (value.type !== undefined) return null;
  return { type: 'compound', value };
}

function componentChain(decoded, limit) {
  let node = asCompound(decoded);
  let levels = 0;
  if (!node) return { levels, node: null, broken: true };
  const maxLevels = limit || 512;
  while (node.value && node.value.extra) {
    const list = node.value.extra;
    const entries = list.type === 'list' && list.value && Array.isArray(list.value.value)
      ? list.value.value
      : null;
    if (!entries || entries.length !== 1) return { levels, node, broken: true };
    node = asCompound(entries[0]);
    levels += 1;
    if (!node) return { levels, node: null, broken: true };
    if (levels > maxLevels) return { levels, node, broken: true };
  }
  return { levels, node, broken: false };
}

function componentTextValue(decoded) {
  if (!decoded || decoded.type !== 'compound' || !decoded.value || !decoded.value.text) return null;
  const text = decoded.value.text;
  return text.type === 'string' ? text.value : null;
}

function roundtripComponent(convert, input) {
  const content = convert(input);
  const buffer = serializer.createPacketBuffer({
    name: 'system_chat',
    params: { content, isActionBar: false }
  });
  return deserializer.parsePacketBuffer(buffer).data.params.content;
}

function captureChatComponent(legacyData) {
  const real = createStubReal();
  const client = new LegacyClient(real);
  client.write('chat', legacyData);
  const write = real.writes.find((entry) => entry.name === 'system_chat');
  if (!write) {
    throw new Error('adapter did not write system_chat (writes: ' +
      real.writes.map((entry) => entry.name).join(',') + ')');
  }
  return decodeWrite(write).content;
}

function observeComponents(convert, viaAdapter) {
  const observed = { cases: {}, runtime: [] };
  const record = (name, input, runtimeCode) => {
    try {
      const content = viaAdapter
        ? captureChatComponent({ message: input, position: 0 })
        : roundtripComponent(convert, input);
      observed.cases[name] = content;
    } catch (error) {
      observed.runtime.push({
        case: name,
        code: runtimeCode || 'E_COMPONENT_RUNTIME',
        error: error.message
      });
    }
  };

  record('base', JSON.stringify(COMPONENTS.baseInput));
  record('translate', JSON.stringify(COMPONENTS.translateInput));
  record('style', JSON.stringify(COMPONENTS.styleInput));
  record('openUrl', JSON.stringify(COMPONENTS.openUrlInput));
  record('suggestCommand', JSON.stringify(COMPONENTS.suggestCommandInput));
  record('runCommand', JSON.stringify(COMPONENTS.runCommandInput));
  record('showText', JSON.stringify(COMPONENTS.showTextInput));
  record('showEntity', JSON.stringify(COMPONENTS.showEntityInput));
  record('malformed', COMPONENTS.malformedInput, 'E_MALFORMED_JSON_CRASH');
  record('legacy', COMPONENTS.legacyInput);
  record('depth', JSON.stringify(buildDepthInput(COMPONENTS.depthInput)));
  record('cycle', buildCycleInput(), 'E_DEPTH_CYCLE');

  return observed;
}

function validateComponentObservations(observed) {
  const failures = [];
  const cases = observed && observed.cases ? observed.cases : {};
  const fail = (code, detail) => failures.push({ code, detail });

  for (const error of (observed && observed.runtime) || []) {
    if (error && error.code) failures.push(error);
  }

  const expectExact = (name, expected, code) => {
    if (!cases[name]) {
      fail('E_CASE_MISSING', name);
      return false;
    }
    if (!sameNbt(cases[name], expected)) {
      fail(code, { case: name, actual: cases[name], expected });
      return false;
    }
    return true;
  };

  const baseOk = expectExact('base', expectedBaseNbt(), 'E_BASE_NBT');
  const translateOk = expectExact('translate', expectedTranslateNbt(), 'E_TRANSLATE_NBT');
  const styleOk = expectExact('style', expectedStyleNbt(), 'E_STYLE_NBT');
  const openUrlOk = expectExact('openUrl', expectedOpenUrlNbt(), 'E_CLICK_OPEN_URL_NBT');
  const suggestCommandOk = expectExact('suggestCommand', expectedSuggestCommandNbt(), 'E_CLICK_SUGGEST_COMMAND_NBT');
  const runCommandOk = expectExact('runCommand', expectedRunCommandNbt(), 'E_CLICK_RUN_COMMAND_NBT');
  const showTextOk = expectExact('showText', expectedShowTextNbt(), 'E_HOVER_SHOW_TEXT_NBT');
  const showEntityOk = expectExact('showEntity', expectedShowEntityNbt(), 'E_HOVER_SHOW_ENTITY_NBT');
  const malformedOk = expectExact('malformed', expectedMalformedNbt(), 'E_MALFORMED_FALLBACK');
  const legacyOk = expectExact('legacy', expectedLegacyNbt(), 'E_LEGACY_CODES');

  const richCases = [
    'base', 'translate', 'style',
    'openUrl', 'suggestCommand', 'runCommand', 'showText', 'showEntity', 'legacy'
  ];

  let lossyTextOnly = 0;
  for (const name of richCases) {
    const decoded = cases[name];
    if (!decoded) continue;
    const keys = decoded.type === 'compound' ? Object.keys(decoded.value || {}) : [];
    if (keys.length === 1 && keys[0] === 'text') {
      lossyTextOnly += 1;
      fail('E_LOSSY_TEXT_ONLY', { case: name, keys });
    }
  }

  let rawJsonText = 0;
  for (const name of ['base', 'translate', 'style', 'openUrl', 'suggestCommand', 'runCommand', 'showText', 'showEntity']) {
    const source = JSON.stringify(COMPONENTS[name + 'Input']);
    if (componentTextValue(cases[name]) === source) {
      rawJsonText += 1;
      fail('E_RAW_JSON_TEXT', { case: name });
    }
  }

  let depthCapped = 0;
  if (!cases.depth) {
    fail('E_DEPTH_CAP', 'depth case missing');
  } else {
    const walk = componentChain(cases.depth, COMPONENTS.depthLevels + 1);
    if (walk.broken || walk.levels !== COMPONENTS.depthLevels) {
      fail('E_DEPTH_CAP', {
        levels: walk.levels,
        expectedLevels: COMPONENTS.depthLevels,
        broken: walk.broken
      });
    } else if (!sameNbt(walk.node, anonComp({ text: nbt.string(COMPONENTS.depthLeafText) }))) {
      fail('E_DEPTH_CAP', { levels: walk.levels, terminal: walk.node });
    } else {
      depthCapped = 1;
    }
  }

  let cycleGuarded = 0;
  if (!cases.cycle) {
    fail('E_CYCLE_GUARD', 'cycle case missing or crashed');
  } else {
    const extra = cases.cycle.value && cases.cycle.value.extra;
    const entries = extra && extra.type === 'list' && extra.value && Array.isArray(extra.value.value)
      ? extra.value.value
      : null;
    if (!Array.isArray(entries) ||
        entries.length !== 1 ||
        !sameNbt(asCompound(entries[0]), anonComp({ text: nbt.string('') }))) {
      fail('E_CYCLE_GUARD', { decoded: cases.cycle });
    } else {
      cycleGuarded = 1;
    }
  }

  const flags = {
    exactBase: baseOk ? 1 : 0,
    exactTranslate: translateOk ? 1 : 0,
    exactStyle: styleOk ? 1 : 0,
    exactOpenUrl: openUrlOk ? 1 : 0,
    exactSuggestCommand: suggestCommandOk ? 1 : 0,
    exactRunCommand: runCommandOk ? 1 : 0,
    exactShowText: showTextOk ? 1 : 0,
    exactShowEntity: showEntityOk ? 1 : 0,
    exactMalformed: malformedOk ? 1 : 0,
    exactLegacy: legacyOk ? 1 : 0,
    exactDepth: depthCapped,
    cycleGuarded,
    lossyTextOnly: lossyTextOnly > 0 ? 1 : 0,
    rawJsonText: rawJsonText > 0 ? 1 : 0,
    lossyTextOnlyCases: lossyTextOnly
  };

  return { flags, failures };
}

function describeComponentCase(decoded) {
  if (!decoded || decoded.type !== 'compound') return decoded;
  const value = decoded.value || {};
  const chain = componentChain(decoded, 1024);
  return {
    keys: Object.keys(value),
    text: value.text && value.text.type === 'string' ? value.text.value : null,
    translate: value.translate && value.translate.type === 'string' ? value.translate.value : null,
    color: value.color && value.color.type === 'string' ? value.color.value : null,
    hasExtra: !!value.extra,
    chainLevels: chain.levels,
    chainBroken: chain.broken,
    terminalText: chain.node && chain.node.value && chain.node.value.text
      ? chain.node.value.text.value
      : null
  };
}

function describeComponentObservation(observed) {
  const cases = {};
  for (const [name, decoded] of Object.entries(observed.cases)) {
    cases[name] = describeComponentCase(decoded);
  }
  return { cases, runtime: observed.runtime };
}

function runComponents() {
  const observed = observeComponents(null, true);
  const validation = validateComponentObservations(observed);
  const ok = validation.failures.length === 0 &&
    validation.flags.exactBase === 1 &&
    validation.flags.exactTranslate === 1 &&
    validation.flags.exactStyle === 1 &&
    validation.flags.exactOpenUrl === 1 &&
    validation.flags.exactSuggestCommand === 1 &&
    validation.flags.exactRunCommand === 1 &&
    validation.flags.exactShowText === 1 &&
    validation.flags.exactShowEntity === 1 &&
    validation.flags.exactMalformed === 1 &&
    validation.flags.exactLegacy === 1 &&
    validation.flags.exactDepth === 1 &&
    validation.flags.cycleGuarded === 1 &&
    validation.flags.lossyTextOnly === 0 &&
    validation.flags.rawJsonText === 0;

  printJson({
    ok,
    mode: 'components',
    expected: {
      base: '{text:"",extra:[{text:"A",color:"red"}]}',
      translate: 'chat.type.text with 2 arguments + fallback',
      style: 'color/font/bold/italic/underlined/strikethrough/obfuscated/insertion/click_event/hover_event',
      clickEvents: 'open_url.url, run_command.command, suggest_command.command, change_page.page, copy_to_clipboard.value, show_dialog.dialog',
      hoverEvents: 'show_text.value, show_item.id/count, show_entity.id/uuid/name',
      malformed: 'plain text fallback, no throw',
      depthLevels: COMPONENTS.depthLevels,
      depthInputDepth: COMPONENTS.depthInput,
      terminalFallback: COMPONENTS.depthLeafText
    },
    flags: validation.flags,
    observed: describeComponentObservation(observed),
    failures: validation.failures
  });
  process.exit(ok ? 0 : 1);
}

// Fault-injecting converters for the component self-tests. Each mirrors one
// specific way the old adapter could lose information.

function dropExtraConverter(input) {
  let parsed = input;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch (_error) {
      parsed = input;
    }
  }
  const text = parsed && typeof parsed === 'object' ? (parsed.text == null ? '' : parsed.text) : parsed;
  return nbt.comp({ text: nbt.string(String(text == null ? '' : text)) });
}

function malformedJsonConverter(input) {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;
  const text = parsed && typeof parsed === 'object' ? (parsed.text == null ? '' : parsed.text) : parsed;
  return nbt.comp({ text: nbt.string(String(text == null ? '' : text)) });
}

function naiveComponentConverter(input) {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;
  if (parsed == null) return nbt.comp({ text: nbt.string('') });
  if (typeof parsed !== 'object') return nbt.comp({ text: nbt.string(String(parsed)) });
  const value = { text: nbt.string(parsed.text == null ? '' : String(parsed.text)) };
  if (Array.isArray(parsed.extra)) {
    value.extra = nbt.list(nbt.comp(parsed.extra.map((child) => naiveComponentConverter(child).value)));
  }
  if (parsed.translate != null) value.translate = nbt.string(String(parsed.translate));
  if (Array.isArray(parsed.with)) {
    value.with = nbt.list(nbt.comp(parsed.with.map((child) => naiveComponentConverter(child).value)));
  }
  for (const flag of ['bold', 'italic', 'underlined', 'strikethrough', 'obfuscated']) {
    if (typeof parsed[flag] === 'boolean') value[flag] = nbt.byte(parsed[flag] ? 1 : 0);
  }
  if (parsed.color != null) value.color = nbt.string(String(parsed.color));
  return nbt.comp(value);
}

function componentsSelfTest(name) {
  let observed;
  let code;

  if (name === 'drop-extra') {
    code = 'E_LOSSY_TEXT_ONLY';
    observed = observeComponents(dropExtraConverter, false);
  } else if (name === 'malformed-json') {
    code = 'E_MALFORMED_JSON_CRASH';
    observed = observeComponents(malformedJsonConverter, false);
  } else if (name === 'deep-cycle') {
    code = 'E_DEPTH_CYCLE';
    observed = observeComponents(naiveComponentConverter, false);
  } else {
    printJson({ ok: false, mode: 'self-test', selfTest: name, code: 'E_UNKNOWN_SELF_TEST' });
    process.exit(2);
  }

  const validation = validateComponentObservations(observed);
  const detected = validation.failures.some((failure) => failure.code === code);
  printJson({
    ok: false,
    mode: 'self-test',
    selfTest: name,
    code,
    detected,
    runtime: observed.runtime,
    failures: validation.failures
  });
  process.exit(detected ? 1 : 0);
}

// ---------------------------------------------------------------------------
// inbound: held_item_slot / chat_message / use_item
// ---------------------------------------------------------------------------

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFinitePosition(location) {
  return !!location && typeof location === 'object' &&
    [location.x, location.y, location.z]
      .every((value) => typeof value === 'number' && Number.isFinite(value));
}

function validateInbound(observed) {
  const failures = [];
  const slotEvents = Array.isArray(observed.held_item_slot) ? observed.held_item_slot : [];
  const chatEvents = Array.isArray(observed.chat) ? observed.chat : [];
  const placeEvents = Array.isArray(observed.block_place) ? observed.block_place : [];

  let slotId = null;
  if (slotEvents.length === 0) {
    failures.push({ code: 'E_SLOT_ID_MISSING', detail: 'no held_item_slot event was emitted' });
  }
  for (const event of slotEvents) {
    if (!event || typeof event !== 'object' || !Number.isInteger(event.slotId)) {
      failures.push({ code: 'E_SLOT_ID_INVALID', slotId: event && event.slotId });
      continue;
    }
    slotId = event.slotId;
    if (event.slotId !== INBOUND.slotId) {
      failures.push({ code: 'E_SLOT_ID_VALUE', expected: INBOUND.slotId, actual: event.slotId });
    }
    const extra = Object.keys(event).filter((key) => key !== 'slotId');
    if (extra.length > 0) {
      failures.push({ code: 'E_SLOT_ID_EXTRA_FIELDS', extra });
    }
  }

  const messages = chatEvents
    .filter((event) => event && typeof event.message === 'string')
    .map((event) => event.message);
  if (!messages.includes(INBOUND.chatMessage)) {
    failures.push({ code: 'E_CHAT_MESSAGE_MISSING', expected: INBOUND.chatMessage, actual: messages });
  }
  if (!messages.includes(INBOUND.chatCommandNormalized)) {
    failures.push({
      code: 'E_CHAT_COMMAND_MISSING',
      expected: INBOUND.chatCommandNormalized,
      actual: messages
    });
  }
  if (chatEvents.some((event) => !event || typeof event.message !== 'string')) {
    failures.push({ code: 'E_CHAT_MESSAGE_INVALID', events: chatEvents });
  }

  const mapped = placeEvents.filter((event) => event && event.direction === -1);
  if (mapped.length === 0) {
    failures.push({
      code: 'E_USE_ITEM_MISSING',
      expectedDirection: -1,
      actualDirections: placeEvents.map((event) => event && event.direction)
    });
  }
  if (mapped.length > 1) {
    failures.push({ code: 'E_USE_ITEM_DUPLICATE', count: mapped.length });
  }
  let fabricatedPosition = 0;
  for (const event of mapped) {
    if (event.hand !== INBOUND.useItemHand) {
      failures.push({ code: 'E_USE_ITEM_HAND', expected: INBOUND.useItemHand, actual: event.hand });
    }
    if (event.sequence !== INBOUND.useItemSequence) {
      failures.push({
        code: 'E_USE_ITEM_SEQUENCE',
        expected: INBOUND.useItemSequence,
        actual: event.sequence
      });
    }
    if (!event.location || typeof event.location !== 'object') {
      failures.push({ code: 'E_USE_ITEM_LOCATION_SHAPE', location: event.location });
    } else if (isFinitePosition(event.location)) {
      fabricatedPosition += 1;
      failures.push({ code: 'E_USE_ITEM_FABRICATED_POSITION', location: event.location });
    }
  }

  const native = placeEvents.filter((event) => event && event.direction === INBOUND.nativeDirection);
  if (native.length === 0) {
    failures.push({ code: 'E_NATIVE_BLOCK_PLACE_MISSING', expectedDirection: INBOUND.nativeDirection });
  } else if (!isFinitePosition(native[0].location) ||
      native[0].location.x !== INBOUND.nativeLocation.x ||
      native[0].location.y !== INBOUND.nativeLocation.y ||
      native[0].location.z !== INBOUND.nativeLocation.z ||
      native[0].sequence !== INBOUND.nativeSequence) {
    failures.push({
      code: 'E_NATIVE_BLOCK_PLACE_FIELDS',
      expected: {
        location: INBOUND.nativeLocation,
        direction: INBOUND.nativeDirection,
        sequence: INBOUND.nativeSequence
      },
      actual: native[0]
    });
  }

  const flags = {
    slotId,
    chatMessageForwarded: messages.includes(INBOUND.chatMessage) ? 1 : 0,
    useItemAsBlockPlace: mapped.length === 1 &&
      mapped[0].hand === INBOUND.useItemHand &&
      mapped[0].sequence === INBOUND.useItemSequence &&
      !!mapped[0].location &&
      !isFinitePosition(mapped[0].location)
      ? 1
      : 0,
    fabricatedPosition: fabricatedPosition > 0 ? 1 : 0
  };
  return { flags, failures };
}

function validateRawInbound(raw) {
  const failures = [];
  const slot = raw.held_item_slot || [];
  if (slot.length !== 1 || slot[0].slotId !== INBOUND.slotId) {
    failures.push({ code: 'E_RAW_HELD_ITEM_SLOT', expected: { slotId: INBOUND.slotId }, actual: slot });
  }
  const chat = raw.chat_message || [];
  if (chat.length !== 1 || chat[0].message !== INBOUND.chatMessage) {
    failures.push({ code: 'E_RAW_CHAT_MESSAGE', expected: INBOUND.chatMessage, actual: chat });
  }
  const command = raw.chat_command || [];
  if (command.length !== 1 || command[0].command !== INBOUND.chatCommand) {
    failures.push({ code: 'E_RAW_CHAT_COMMAND', expected: INBOUND.chatCommand, actual: command });
  }
  const useItem = raw.use_item || [];
  if (useItem.length !== 1 ||
      useItem[0].hand !== INBOUND.useItemHand ||
      useItem[0].sequence !== INBOUND.useItemSequence) {
    failures.push({
      code: 'E_RAW_USE_ITEM',
      expected: { hand: INBOUND.useItemHand, sequence: INBOUND.useItemSequence },
      actual: useItem
    });
  }
  const place = raw.block_place || [];
  if (place.length !== 1 ||
      place[0].direction !== INBOUND.nativeDirection ||
      place[0].sequence !== INBOUND.nativeSequence ||
      (place[0].location || {}).x !== INBOUND.nativeLocation.x ||
      (place[0].location || {}).y !== INBOUND.nativeLocation.y ||
      (place[0].location || {}).z !== INBOUND.nativeLocation.z) {
    failures.push({
      code: 'E_RAW_BLOCK_PLACE',
      expected: {
        direction: INBOUND.nativeDirection,
        sequence: INBOUND.nativeSequence,
        location: INBOUND.nativeLocation
      },
      actual: place
    });
  }
  return failures;
}

function describeNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  return value === undefined ? 'undefined' : value;
}

function describeInbound(observed) {
  return {
    held_item_slot: (observed.held_item_slot || []).map((event) => ({ ...event })),
    chat: (observed.chat || []).map((event) => ({ ...event })),
    block_place: (observed.block_place || []).map((event) => ({
      direction: event && event.direction,
      hand: event && event.hand,
      sequence: event && event.sequence,
      location: event && event.location
        ? {
            x: describeNumber(event.location.x),
            y: describeNumber(event.location.y),
            z: describeNumber(event.location.z)
          }
        : null
    }))
  };
}

function waitUntil(predicate, timeoutMs, label) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      let satisfied = false;
      try {
        satisfied = predicate();
      } catch (error) {
        reject(error);
        return;
      }
      if (satisfied) {
        resolve();
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('timeout waiting for ' + label));
        return;
      }
      setTimeout(poll, 20);
    };
    poll();
  });
}

async function runInbound() {
  const raw = {
    held_item_slot: [],
    chat_message: [],
    chat_command: [],
    use_item: [],
    block_place: []
  };
  const observed = {
    held_item_slot: [],
    chat: [],
    block_place: []
  };
  const runtimeErrors = [];
  let server;
  let client;
  let port = null;

  try {
    server = createServer({
      'online-mode': false,
      port: 0,
      version: '1.21.11',
      motd: 'inbound-test'
    });
    server.on('error', (error) => {
      runtimeErrors.push({ source: 'server', message: error.message });
    });
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
    port = server.socketServer.address().port;

    server.on('playerJoin', (rawClient) => {
      rawClient.on('held_item_slot', (packet) => {
        raw.held_item_slot.push({ slotId: packet.slotId });
      });
      rawClient.on('chat_message', (packet) => {
        raw.chat_message.push({ message: packet.message });
      });
      rawClient.on('chat_command', (packet) => {
        raw.chat_command.push({ command: packet.command });
      });
      rawClient.on('use_item', (packet) => {
        raw.use_item.push({ hand: packet.hand, sequence: packet.sequence });
      });
      rawClient.on('block_place', (packet) => {
        raw.block_place.push({
          hand: packet.hand,
          location: { x: packet.location.x, y: packet.location.y, z: packet.location.z },
          direction: packet.direction,
          sequence: packet.sequence
        });
      });

      const adapter = new LegacyClient(rawClient);
      adapter.on('held_item_slot', (event) => observed.held_item_slot.push(event));
      adapter.on('chat', (event) => observed.chat.push(event));
      adapter.on('block_place', (event) => observed.block_place.push(event));
      adapter.on('error', (error) => {
        runtimeErrors.push({ source: 'adapter', message: error.message });
      });
      adapter.write('login', {});
    });

    client = createClient({
      host: 'localhost',
      port,
      username: 'InboundTester',
      version: '1.21.11',
      auth: 'offline'
    });
    client.on('error', (error) => {
      runtimeErrors.push({ source: 'client', message: error.message });
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('timeout waiting for client login'));
      }, 8000);
      const onLogin = () => {
        cleanup();
        resolve();
      };
      const onError = (error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        clearTimeout(timer);
        client.removeListener('login', onLogin);
        client.removeListener('error', onError);
      };
      client.once('login', onLogin);
      client.once('error', onError);
    });

    client.write('held_item_slot', { slotId: INBOUND.slotId });
    client.write('chat_message', {
      message: INBOUND.chatMessage,
      timestamp: 1n,
      salt: 0n,
      signature: null,
      offset: 0,
      acknowledged: Buffer.alloc(3),
      checksum: 0
    });
    client.write('chat_command', { command: INBOUND.chatCommand });
    client.write('use_item', {
      hand: INBOUND.useItemHand,
      sequence: INBOUND.useItemSequence,
      rotation: { x: 0, y: 0 }
    });
    client.write('block_place', {
      hand: 0,
      location: { ...INBOUND.nativeLocation },
      direction: INBOUND.nativeDirection,
      cursorX: 0.5,
      cursorY: 0.5,
      cursorZ: 0.5,
      insideBlock: false,
      worldBorderHit: false,
      sequence: INBOUND.nativeSequence
    });

    await waitUntil(
      () => Object.values(raw).every((packets) => packets.length >= 1),
      6000,
      'raw inbound packets'
    );
    await delay(100);
  } catch (error) {
    runtimeErrors.push({ source: 'harness', message: error.message });
  } finally {
    if (client) {
      try {
        client.end();
      } catch (_error) { /* process exit code is already final */ }
    }
    await delay(50);
    if (server) {
      try {
        server.close();
      } catch (_error) { /* process exit code is already final */ }
    }
  }

  const validation = validateInbound(observed);
  const failures = [];
  for (const error of runtimeErrors) {
    failures.push({ code: 'E_INBOUND_RUNTIME', ...error });
  }
  failures.push(...validateRawInbound(raw), ...validation.failures);

  const ok = failures.length === 0 &&
    validation.flags.slotId === INBOUND.slotId &&
    validation.flags.chatMessageForwarded === 1 &&
    validation.flags.useItemAsBlockPlace === 1 &&
    validation.flags.fabricatedPosition === 0;

  printJson({
    ok,
    mode: 'inbound',
    port,
    expected: {
      slotId: INBOUND.slotId,
      chatMessage: INBOUND.chatMessage,
      chatCommandNormalized: INBOUND.chatCommandNormalized,
      useItemHand: INBOUND.useItemHand,
      useItemSequence: INBOUND.useItemSequence,
      nativeBlockPlace: {
        direction: INBOUND.nativeDirection,
        location: INBOUND.nativeLocation,
        sequence: INBOUND.nativeSequence
      }
    },
    flags: validation.flags,
    raw,
    observed: describeInbound(observed),
    failures
  });
  return ok ? 0 : 1;
}

function goodInboundObserved() {
  return {
    held_item_slot: [{ slotId: INBOUND.slotId }],
    chat: [
      { message: INBOUND.chatMessage },
      { message: INBOUND.chatCommandNormalized }
    ],
    block_place: [
      {
        hand: 0,
        location: { ...INBOUND.nativeLocation },
        direction: INBOUND.nativeDirection,
        sequence: INBOUND.nativeSequence
      },
      {
        hand: INBOUND.useItemHand,
        location: { x: NaN, y: NaN, z: NaN },
        direction: -1,
        sequence: INBOUND.useItemSequence
      }
    ]
  };
}

function emitInboundEvents(events) {
  const real = new EventEmitter();
  real.username = 'inbound-self-test';
  real.uuid = '00000000-0000-0000-0000-000000000012';
  real.protocolVersion = 774;
  real.writes = [];
  real.write = (name, data) => real.writes.push({ name, data });
  real.end = () => {};
  const client = new LegacyClient(real);
  const observed = { held_item_slot: [], chat: [], block_place: [] };
  client.on('held_item_slot', (event) => observed.held_item_slot.push(event));
  client.on('chat', (event) => observed.chat.push(event));
  client.on('block_place', (event) => observed.block_place.push(event));
  for (const [name, packet] of events) {
    real.emit(name, packet);
  }
  return observed;
}

function inboundSelfTest(name) {
  const observed = goodInboundObserved();
  let code = null;
  let codePrefix = null;

  if (name === 'inbound-missing-slot') {
    // Drive the real adapter binding with an absent slotId. A default of 0, a
    // legacy `slot` read or a missing event must all be detected.
    const emitted = emitInboundEvents([['held_item_slot', {}]]);
    observed.held_item_slot = emitted.held_item_slot;
    codePrefix = 'E_SLOT_ID_';
  } else if (name === 'inbound-slot-default-zero') {
    code = 'E_SLOT_ID_VALUE';
    observed.held_item_slot = [{ slotId: 0 }];
  } else if (name === 'inbound-missing-chat') {
    code = 'E_CHAT_MESSAGE_MISSING';
    observed.chat = [{ message: INBOUND.chatCommandNormalized }];
  } else if (name === 'inbound-use-item-drop') {
    code = 'E_USE_ITEM_MISSING';
    observed.block_place = observed.block_place.filter((event) => event.direction !== -1);
  } else {
    printJson({ ok: false, mode: 'self-test', selfTest: name, code: 'E_UNKNOWN_SELF_TEST' });
    process.exit(2);
  }

  const failures = validateInbound(observed).failures;
  const detected = failures.some((failure) =>
    codePrefix ? failure.code.startsWith(codePrefix) : failure.code === code);
  printJson({
    ok: false,
    mode: 'self-test',
    selfTest: name,
    code: codePrefix || code,
    detected,
    failures
  });
  process.exit(detected ? 1 : 0);
}

// ---------------------------------------------------------------------------
// titles: title text, subtitle text, exact times, clear vs reset
// ---------------------------------------------------------------------------

const TITLES = Object.freeze({
  titleInput: JSON.stringify({ text: '', extra: [{ text: 'Legacy title', color: 'gold' }] }),
  subtitleInput: JSON.stringify({ text: 'Legacy subtitle', color: 'aqua' }),
  timeEdge: Object.freeze({ fadeIn: -2147483648, stay: 2147483647, fadeOut: 0 }),
  timeNonDefault: Object.freeze({ fadeIn: 17, stay: 600, fadeOut: 23 }),
  clearAction: 3,
  resetAction: 4
});

const TITLE_SELF_TESTS = Object.freeze(['subtitle-as-title', 'hardcoded-time']);

const TITLE_PACKET_NAMES = Object.freeze([
  'set_title_text',
  'set_title_subtitle',
  'set_title_time',
  'clear_titles'
]);

function expectedTitleNbt() {
  return anonComp({
    text: nbt.string(''),
    extra: nbt.list(nbt.comp([
      { text: nbt.string('Legacy title'), color: nbt.string('gold') }
    ]))
  });
}

function expectedSubtitleNbt() {
  return anonComp({
    text: nbt.string('Legacy subtitle'),
    color: nbt.string('aqua')
  });
}

function expectedTitleTimes() {
  return [TITLES.timeEdge, TITLES.timeNonDefault];
}

function validateTitles(raw) {
  const failures = [];
  const packets = Array.isArray(raw && raw.packets) ? raw.packets : [];
  const titles = packets.filter((packet) => packet.name === 'set_title_text').map((packet) => packet.data);
  const subtitles = packets
    .filter((packet) => packet.name === 'set_title_subtitle')
    .map((packet) => packet.data);
  const times = packets.filter((packet) => packet.name === 'set_title_time').map((packet) => packet.data);
  const clears = packets.filter((packet) => packet.name === 'clear_titles').map((packet) => packet.data);
  const expectedTitle = expectedTitleNbt();
  const expectedSubtitle = expectedSubtitleNbt();
  const expectedTimes = expectedTitleTimes();

  if (titles.length !== 1) {
    failures.push({
      code: titles.length === 0 ? 'E_TITLE_TEXT_MISSING' : 'E_TITLE_TEXT_COUNT',
      count: titles.length
    });
  }
  if (titles.length > 0 && !sameNbt(titles[0].text, expectedTitle)) {
    failures.push({ code: 'E_TITLE_TEXT_NBT', actual: titles[0].text });
  }
  if (titles.some((packet) => sameNbt(packet.text, expectedSubtitle))) {
    failures.push({
      code: 'E_SUBTITLE_AS_TITLE',
      detail: 'subtitle component arrived in set_title_text'
    });
  }
  if (subtitles.length === 0) {
    failures.push({
      code: 'E_SUBTITLE_AS_TITLE',
      detail: 'no set_title_subtitle packet was received'
    });
  } else if (subtitles.length > 1) {
    failures.push({ code: 'E_SUBTITLE_COUNT', count: subtitles.length });
  } else if (!sameNbt(subtitles[0].text, expectedSubtitle)) {
    failures.push({ code: 'E_SUBTITLE_TEXT_NBT', actual: subtitles[0].text });
  }

  if (times.length !== expectedTimes.length) {
    failures.push({
      code: 'E_TITLE_TIME_COUNT',
      expected: expectedTimes.length,
      actual: times.length
    });
  }
  for (let index = 0; index < Math.min(times.length, expectedTimes.length); index++) {
    const actual = times[index] || {};
    const expected = expectedTimes[index];
    if (actual.fadeIn !== expected.fadeIn ||
        actual.stay !== expected.stay ||
        actual.fadeOut !== expected.fadeOut) {
      const detail = {
        fadeIn: actual.fadeIn,
        stay: actual.stay,
        fadeOut: actual.fadeOut
      };
      failures.push({ code: 'E_TITLE_TIME_FIELDS', index, expected, actual: detail });
      if (actual.fadeIn === 0 && actual.stay === 1000 && actual.fadeOut === 0) {
        failures.push({ code: 'E_TITLE_TIME_HARDCODED', index, expected, actual: detail });
      }
    }
  }

  if (clears.length !== 2) {
    failures.push({
      code: clears.length === 0 ? 'E_CLEAR_MISSING' : 'E_CLEAR_COUNT',
      count: clears.length
    });
  }
  if (clears.length > 0 && clears[0].reset !== false) {
    failures.push({ code: 'E_CLEAR_RESET', index: 0, expected: false, actual: clears[0].reset });
  }
  if (clears.length > 1 && clears[1].reset !== true) {
    failures.push({ code: 'E_CLEAR_RESET', index: 1, expected: true, actual: clears[1].reset });
  }

  const flags = {
    titleText: titles.length === 1 && sameNbt(titles[0].text, expectedTitle) ? 1 : 0,
    subtitleText: subtitles.length === 1 && sameNbt(subtitles[0].text, expectedSubtitle) ? 1 : 0,
    timesExact: times.length === expectedTimes.length &&
      expectedTimes.every((expected, index) => {
        const actual = times[index] || {};
        return actual.fadeIn === expected.fadeIn &&
          actual.stay === expected.stay &&
          actual.fadeOut === expected.fadeOut;
      })
      ? 1
      : 0,
    clearReset: clears.length === 2 &&
      clears[0].reset === false &&
      clears[1].reset === true
      ? 1
      : 0,
    distinctTitleSubtitlePackets: titles.length === 1 && subtitles.length === 1 ? 1 : 0
  };

  return {
    flags,
    failures,
    decoded: {
      title: titles.length > 0 ? titles[0].text : null,
      subtitle: subtitles.length > 0 ? subtitles[0].text : null,
      times,
      clears,
      packetNames: packets.map((packet) => packet.name)
    }
  };
}

function sendLegacyTitles(adapter) {
  adapter.write('title', { action: 0, text: TITLES.titleInput });
  adapter.write('title', { action: 1, text: TITLES.subtitleInput });
  adapter.write('title', { action: 2, ...TITLES.timeEdge });
  adapter.write('title', { action: 2, ...TITLES.timeNonDefault });
  adapter.write('title', { action: TITLES.clearAction });
  adapter.write('title', { action: TITLES.resetAction });
}

async function runTitles() {
  const raw = { packets: [] };
  const runtimeErrors = [];
  let server;
  let client;
  let port = null;
  let sendTitles = null;
  let signalPlayerJoin;
  const playerJoin = new Promise((resolve) => {
    signalPlayerJoin = resolve;
  });

  try {
    server = createServer({
      'online-mode': false,
      port: 0,
      version: '1.21.11',
      motd: 'titles-test'
    });
    server.on('error', (error) => {
      runtimeErrors.push({ source: 'server', message: error.message });
    });
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
    port = server.socketServer.address().port;

    server.on('playerJoin', (rawClient) => {
      const adapter = new LegacyClient(rawClient);
      adapter.on('error', (error) => {
        runtimeErrors.push({ source: 'adapter', message: error.message });
      });
      adapter.write('login', {});
      sendTitles = () => sendLegacyTitles(adapter);
      signalPlayerJoin();
    });

    client = createClient({
      host: 'localhost',
      port,
      username: 'TitlesTester',
      version: '1.21.11',
      auth: 'offline'
    });
    client.on('packet', (data, meta) => {
      if (meta && TITLE_PACKET_NAMES.includes(meta.name)) {
        raw.packets.push({ name: meta.name, data });
      }
    });
    client.on('error', (error) => {
      runtimeErrors.push({ source: 'client', message: error.message });
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('timeout waiting for client login'));
      }, 8000);
      const onLogin = () => {
        cleanup();
        resolve();
      };
      const onError = (error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        clearTimeout(timer);
        client.removeListener('login', onLogin);
        client.removeListener('error', onError);
      };
      client.once('login', onLogin);
      client.once('error', onError);
    });

    await Promise.race([
      playerJoin,
      delay(8000).then(() => {
        throw new Error('timeout waiting for server playerJoin');
      })
    ]);
    if (typeof sendTitles !== 'function') {
      throw new Error('server title writer was not initialized');
    }
    sendTitles();

    await waitUntil(() => raw.packets.length >= 6, 6000, 'title packets');
    await delay(100);
  } catch (error) {
    runtimeErrors.push({ source: 'harness', message: error.message });
  } finally {
    if (client) {
      try {
        client.end();
      } catch (_error) { /* process exit code is already final */ }
    }
    await delay(50);
    if (server) {
      try {
        server.close();
      } catch (_error) { /* process exit code is already final */ }
    }
  }

  const validation = validateTitles(raw);
  const failures = [];
  for (const error of runtimeErrors) {
    failures.push({ code: 'E_TITLE_RUNTIME', ...error });
  }
  failures.push(...validation.failures);

  const ok = failures.length === 0 &&
    validation.flags.titleText === 1 &&
    validation.flags.subtitleText === 1 &&
    validation.flags.timesExact === 1 &&
    validation.flags.clearReset === 1 &&
    validation.flags.distinctTitleSubtitlePackets === 1;

  printJson({
    ok,
    mode: 'titles',
    port,
    expected: {
      titleAction: 0,
      titlePacket: 'set_title_text',
      titleComponent: TITLES.titleInput,
      subtitleAction: 1,
      subtitlePacket: 'set_title_subtitle',
      subtitleComponent: TITLES.subtitleInput,
      timeAction: 2,
      times: expectedTitleTimes(),
      clearAction: TITLES.clearAction,
      clearReset: false,
      resetAction: TITLES.resetAction,
      resetReset: true
    },
    flags: validation.flags,
    decoded: validation.decoded,
    failures
  });
  return ok ? 0 : 1;
}

function titleFaultCapture(kind) {
  const packets = [];
  const push = (name, params) => {
    packets.push({ name, data: decodeWrite({ name, data: params }) });
  };

  push('set_title_text', { text: expectedTitleNbt() });
  push(
    kind === 'subtitle-as-title' ? 'set_title_text' : 'set_title_subtitle',
    { text: expectedSubtitleNbt() }
  );
  if (kind === 'hardcoded-time') {
    push('set_title_time', { fadeIn: 0, stay: 1000, fadeOut: 0 });
    push('set_title_time', { fadeIn: 0, stay: 1000, fadeOut: 0 });
  } else {
    for (const time of expectedTitleTimes()) push('set_title_time', time);
  }
  push('clear_titles', { reset: false });
  push('clear_titles', { reset: true });
  return { packets };
}

function titlesSelfTest(name) {
  let code;
  if (name === 'subtitle-as-title') {
    code = 'E_SUBTITLE_AS_TITLE';
  } else if (name === 'hardcoded-time') {
    code = 'E_TITLE_TIME_HARDCODED';
  } else {
    printJson({ ok: false, mode: 'self-test', selfTest: name, code: 'E_UNKNOWN_SELF_TEST' });
    process.exit(2);
  }

  const validation = validateTitles(titleFaultCapture(name));
  const detected = validation.failures.some((failure) => failure.code === code);
  printJson({
    ok: false,
    mode: 'self-test',
    selfTest: name,
    code,
    detected,
    flags: validation.flags,
    failures: validation.failures
  });
  process.exit(detected ? 1 : 0);
}

// ---------------------------------------------------------------------------
// registry-map: explicit 1.8 -> 1.21.11 block/item/entity aliases
// ---------------------------------------------------------------------------

const REGISTRY_CASES = Object.freeze({
  blocks: Object.freeze([
    { id: 35, meta: 14, name: 'red_wool' },
    { id: 159, meta: 12, name: 'brown_terracotta' },
    { id: 95, meta: 3, name: 'light_blue_stained_glass' },
    { id: 160, meta: 8, name: 'light_gray_stained_glass_pane' },
    { id: 171, meta: 4, name: 'yellow_carpet' },
    { id: 17, meta: 1, name: 'spruce_log' },
    { id: 17, meta: 12, name: 'oak_wood' },
    { id: 162, meta: 13, name: 'dark_oak_wood' },
    { id: 5, meta: 5, name: 'dark_oak_planks' },
    { id: 6, meta: 2, name: 'birch_sapling' },
    { id: 18, meta: 3, name: 'jungle_leaves' },
    { id: 161, meta: 1, name: 'dark_oak_leaves' },
    { id: 1, meta: 1, name: 'granite' },
    { id: 1, meta: 6, name: 'polished_andesite' },
    { id: 44, meta: 1, name: 'sandstone_slab' },
    { id: 44, meta: 2, name: 'petrified_oak_slab' },
    { id: 43, meta: 7, name: 'quartz_slab' },
    { id: 126, meta: 4, name: 'acacia_slab' },
    { id: 125, meta: 5, name: 'dark_oak_slab' },
    { id: 182, meta: 0, name: 'red_sandstone_slab' },
    { id: 181, meta: 8, name: 'red_sandstone_slab' },
    { id: 97, meta: 1, name: 'infested_cobblestone' },
    { id: 31, meta: 0, name: 'dead_bush' },
    { id: 31, meta: 1, name: 'short_grass' },
    { id: 31, meta: 2, name: 'fern' },
    { id: 38, meta: 8, name: 'oxeye_daisy' },
    { id: 37, meta: 0, name: 'dandelion' },
    { id: 175, meta: 3, name: 'large_fern' },
    { id: 26, meta: 0, name: 'red_bed' },
    { id: 176, meta: 0, name: 'black_banner' },
    { id: 176, meta: 15, name: 'white_banner' },
    { id: 177, meta: 1, name: 'red_wall_banner' },
    { id: 144, meta: 2, name: 'zombie_head' },
    { id: 144, meta: 4, name: 'creeper_head' },
    { id: 2, meta: 0, name: 'grass_block' },
    { id: 98, meta: 3, name: 'chiseled_stone_bricks' },
    { id: 155, meta: 2, name: 'quartz_pillar' },
    { id: 168, meta: 2, name: 'dark_prismarine' },
    { id: 172, meta: 0, name: 'terracotta' },
    { id: 165, meta: 0, name: 'slime_block' },
    { id: 3, meta: 2, name: 'podzol' },
    { id: 19, meta: 1, name: 'wet_sponge' },
    { id: 140, meta: 11, name: 'potted_fern' },
    { id: 99, meta: 10, name: 'mushroom_stem' },
    { id: 45, meta: 0, name: 'bricks' },
    { id: 112, meta: 0, name: 'nether_bricks' },
    { id: 153, meta: 0, name: 'nether_quartz_ore' },
    { id: 30, meta: 0, name: 'cobweb' },
    { id: 25, meta: 0, name: 'note_block' },
    { id: 27, meta: 0, name: 'powered_rail' },
    { id: 52, meta: 0, name: 'spawner' },
    { id: 62, meta: 0, name: 'furnace' },
    { id: 63, meta: 0, name: 'oak_sign' },
    { id: 68, meta: 2, name: 'oak_wall_sign' },
    { id: 64, meta: 0, name: 'oak_door' },
    { id: 72, meta: 0, name: 'oak_pressure_plate' },
    { id: 74, meta: 0, name: 'redstone_ore' },
    { id: 75, meta: 0, name: 'redstone_torch' },
    { id: 78, meta: 0, name: 'snow', label: 'snow_layer' },
    { id: 80, meta: 0, name: 'snow_block', label: 'snow' },
    { id: 67, meta: 0, name: 'cobblestone_stairs', label: 'stone_stairs' },
    { id: 83, meta: 0, name: 'sugar_cane' },
    { id: 85, meta: 0, name: 'oak_fence' },
    { id: 90, meta: 0, name: 'nether_portal' },
    { id: 91, meta: 0, name: 'jack_o_lantern' },
    { id: 93, meta: 0, name: 'repeater' },
    { id: 96, meta: 0, name: 'oak_trapdoor' },
    { id: 103, meta: 0, name: 'melon' },
    { id: 107, meta: 0, name: 'oak_fence_gate' },
    { id: 111, meta: 0, name: 'lily_pad' },
    { id: 124, meta: 0, name: 'redstone_lamp' },
    { id: 143, meta: 0, name: 'oak_button' },
    { id: 149, meta: 0, name: 'comparator' },
    { id: 178, meta: 0, name: 'daylight_detector' },
    { id: 36, meta: 0, name: 'piston_head' },
    { id: 8, meta: 0, name: 'water' },
    { id: 10, meta: 0, name: 'lava' }
  ]),
  items: Object.freeze([
    { id: 276, meta: 0, name: 'diamond_sword' },
    { id: 278, meta: 0, name: 'diamond_pickaxe' },
    { id: 80, meta: 0, name: 'snow_block', label: 'snow' },
    { id: 78, meta: 0, name: 'snow', label: 'snow_layer' },
    { id: 67, meta: 0, name: 'cobblestone_stairs', label: 'stone_stairs' },
    { id: 35, meta: 14, name: 'red_wool' },
    { id: 5, meta: 5, name: 'dark_oak_planks' },
    { id: 17, meta: 1, name: 'spruce_log' },
    { id: 17, meta: 12, name: 'oak_wood' },
    { id: 162, meta: 13, name: 'dark_oak_wood' },
    { id: 6, meta: 2, name: 'birch_sapling' },
    { id: 18, meta: 3, name: 'jungle_leaves' },
    { id: 44, meta: 1, name: 'sandstone_slab' },
    { id: 126, meta: 4, name: 'acacia_slab' },
    { id: 182, meta: 0, name: 'red_sandstone_slab' },
    { id: 349, meta: 1, name: 'salmon' },
    { id: 350, meta: 0, name: 'cooked_cod' },
    { id: 351, meta: 15, name: 'bone_meal' },
    { id: 351, meta: 0, name: 'ink_sac' },
    { id: 355, meta: 0, name: 'red_bed' },
    { id: 425, meta: 0, name: 'black_banner' },
    { id: 425, meta: 15, name: 'white_banner' },
    { id: 397, meta: 2, name: 'zombie_head' },
    { id: 397, meta: 3, name: 'player_head' },
    { id: 383, meta: 50, name: 'creeper_spawn_egg' },
    { id: 383, meta: 57, name: 'zombified_piglin_spawn_egg' },
    { id: 383, meta: 90, name: 'pig_spawn_egg' },
    { id: 383, meta: 59, name: 'cave_spider_spawn_egg' },
    { id: 373, meta: 0, name: 'potion' },
    { id: 373, meta: 16421, name: 'splash_potion' },
    { id: 263, meta: 1, name: 'charcoal' },
    { id: 322, meta: 1, name: 'enchanted_golden_apple' },
    { id: 360, meta: 0, name: 'melon_slice' },
    { id: 401, meta: 0, name: 'firework_rocket' },
    { id: 402, meta: 0, name: 'firework_star' },
    { id: 405, meta: 0, name: 'nether_brick' },
    { id: 382, meta: 0, name: 'glistering_melon_slice' },
    { id: 2256, meta: 0, name: 'music_disc_13' },
    { id: 2257, meta: 0, name: 'music_disc_cat' },
    { id: 323, meta: 0, name: 'oak_sign' },
    { id: 324, meta: 0, name: 'oak_door' },
    { id: 333, meta: 0, name: 'oak_boat' },
    { id: 338, meta: 0, name: 'sugar_cane' },
    { id: 2, meta: 0, name: 'grass_block' },
    { id: 45, meta: 0, name: 'bricks' },
    { id: 112, meta: 0, name: 'nether_bricks' },
    { id: 153, meta: 0, name: 'nether_quartz_ore' },
    { id: 159, meta: 12, name: 'brown_terracotta' },
    { id: 171, meta: 4, name: 'yellow_carpet' },
    { id: 172, meta: 0, name: 'terracotta' },
    { id: 165, meta: 0, name: 'slime_block' },
  ]),
  entities: Object.freeze([
    { id: 50, name: 'tnt' },
    { id: 1, name: 'oak_boat' },
    { id: 10, name: 'minecart' },
    { id: 57, name: 'zombified_piglin' },
    { id: 97, name: 'snow_golem' },
    { id: 98, name: 'ocelot' },
    { id: 99, name: 'iron_golem' },
    { id: 100, name: 'horse' },
    { id: 96, name: 'mooshroom' },
    { id: 73, name: 'splash_potion' },
    { id: 60, name: 'arrow' },
    { id: 61, name: 'snowball' },
    { id: 63, name: 'fireball' },
    { id: 65, name: 'ender_pearl' },
    { id: 78, name: 'armor_stand' },
    { id: 52, name: 'spider' },
    { id: 54, name: 'zombie' },
    { id: 90, name: 'fishing_bobber' },
    { id: 91, name: 'sheep' },
    { id: 92, name: 'cow' },
    { id: 93, name: 'chicken' },
    { id: 95, name: 'wolf' },
    { id: 120, name: 'villager' },
    { id: 2, name: 'item' }
  ]),
  unknown: Object.freeze({
    blockId: 9999,
    blockMeta: 99,
    itemId: 9999,
    unsupportedSpawnEgg: 53,
    entityId: 9999,
    abstractEntityId: 48
  })
});

const REGISTRY_SELF_TESTS = Object.freeze(['unknown-block', 'silent-fallback']);
const NO_ITEM_FORM_IDS = Object.freeze([9, 11, 68, 90]);
const ABSTRACT_LEGACY_ENTITY_NAMES = Object.freeze(['mob', 'monster']);

// Independent static oracle for the legacy-name audit. These tables do not read
// the registry implementation; they encode the expected 1.21.11 name directly.
const EXPECTED_COLORS = Object.freeze([
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
  'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'
]);
const EXPECTED_BANNER_COLORS = Object.freeze([
  'black', 'red', 'green', 'brown', 'blue', 'purple', 'cyan', 'light_gray',
  'gray', 'pink', 'lime', 'yellow', 'light_blue', 'magenta', 'orange', 'white'
]);
const EXPECTED_WOODS = Object.freeze(['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak']);
const EXPECTED_STONE_VARIANTS = Object.freeze([
  'stone', 'granite', 'polished_granite', 'diorite', 'polished_diorite',
  'andesite', 'polished_andesite'
]);
const EXPECTED_STONE_SLABS = Object.freeze([
  'smooth_stone_slab', 'sandstone_slab', 'petrified_oak_slab',
  'cobblestone_slab', 'brick_slab', 'stone_brick_slab',
  'nether_brick_slab', 'quartz_slab'
]);
const EXPECTED_RED_FLOWERS = Object.freeze([
  'poppy', 'blue_orchid', 'allium', 'azure_bluet', 'red_tulip',
  'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy'
]);
const EXPECTED_DOUBLE_PLANTS = Object.freeze([
  'sunflower', 'lilac', 'tall_grass', 'large_fern', 'rose_bush', 'peony'
]);
const EXPECTED_SKULLS = Object.freeze([
  'skeleton_skull', 'wither_skeleton_skull', 'zombie_head', 'player_head',
  'creeper_head'
]);
const EXPECTED_FLOWER_POTS = Object.freeze([
  'flower_pot', 'potted_poppy', 'potted_dandelion', 'potted_oak_sapling',
  'potted_spruce_sapling', 'potted_birch_sapling', 'potted_jungle_sapling',
  'potted_red_mushroom', 'potted_brown_mushroom', 'potted_cactus',
  'potted_dead_bush', 'potted_fern', 'potted_acacia_sapling',
  'potted_dark_oak_sapling'
]);
const EXPECTED_FISH = Object.freeze(['cod', 'salmon', 'tropical_fish', 'pufferfish']);
const EXPECTED_COOKED_FISH = Object.freeze(['cooked_cod', 'cooked_salmon']);
const EXPECTED_DYES = Object.freeze([
  'ink_sac', 'red_dye', 'green_dye', 'cocoa_beans', 'lapis_lazuli',
  'purple_dye', 'cyan_dye', 'light_gray_dye', 'gray_dye', 'pink_dye',
  'lime_dye', 'yellow_dye', 'light_blue_dye', 'magenta_dye', 'orange_dye',
  'bone_meal'
]);

const EXPECTED_BLOCK_ALIASES = Object.freeze({
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
  slime: 'slime_block'
});

const EXPECTED_BLOCK_VARIANTS = Object.freeze({
  wool: (meta) => EXPECTED_COLORS[meta] + '_wool',
  carpet: (meta) => EXPECTED_COLORS[meta] + '_carpet',
  stained_hardened_clay: (meta) => EXPECTED_COLORS[meta] + '_terracotta',
  stained_glass: (meta) => EXPECTED_COLORS[meta] + '_stained_glass',
  stained_glass_pane: (meta) => EXPECTED_COLORS[meta] + '_stained_glass_pane',
  concrete: (meta) => EXPECTED_COLORS[meta] + '_concrete',
  concrete_powder: (meta) => EXPECTED_COLORS[meta] + '_concrete_powder',
  bed: () => 'red_bed',
  banner: (meta) => EXPECTED_BANNER_COLORS[meta] + '_banner',
  standing_banner: (meta) => EXPECTED_BANNER_COLORS[meta] + '_banner',
  wall_banner: (meta) => EXPECTED_BANNER_COLORS[meta] + '_wall_banner',
  dirt: (meta) => ['dirt', 'coarse_dirt', 'podzol'][meta] || null,
  sponge: (meta) => ['sponge', 'wet_sponge'][meta] || null,
  log: (meta) => (meta & 12) === 12
    ? EXPECTED_WOODS[meta & 3] + '_wood'
    : EXPECTED_WOODS[meta & 3] + '_log',
  log2: (meta) => {
    if (meta & 2) return null;
    const type = meta & 1;
    return (meta & 12) === 12
      ? (type ? 'dark_oak_wood' : 'acacia_wood')
      : (type ? 'dark_oak_log' : 'acacia_log');
  },
  planks: (meta) => meta < 6 ? EXPECTED_WOODS[meta] + '_planks' : null,
  sapling: (meta) => {
    const type = meta & 7;
    return type < 6 ? EXPECTED_WOODS[type] + '_sapling' : null;
  },
  leaves: (meta) => EXPECTED_WOODS[meta & 3] + '_leaves',
  leaves2: (meta) => {
    if (meta & 2) return null;
    return meta & 1 ? 'dark_oak_leaves' : 'acacia_leaves';
  },
  stone: (meta) => EXPECTED_STONE_VARIANTS[meta] || null,
  sand: (meta) => meta === 0 ? 'sand' : (meta === 1 ? 'red_sand' : null),
  sandstone: (meta) => meta === 0 ? 'sandstone'
    : (meta === 1 ? 'chiseled_sandstone' : (meta === 2 ? 'cut_sandstone' : null)),
  stonebrick: (meta) => [
    'stone_bricks', 'mossy_stone_bricks', 'cracked_stone_bricks', 'chiseled_stone_bricks'
  ][meta] || null,
  quartz_block: (meta) => meta === 0 ? 'quartz_block'
    : (meta === 1 ? 'chiseled_quartz_block' : (meta >= 2 && meta <= 4 ? 'quartz_pillar' : null)),
  prismarine: (meta) => meta === 0 ? 'prismarine'
    : (meta === 1 ? 'prismarine_bricks' : (meta === 2 ? 'dark_prismarine' : null)),
  red_sandstone: (meta) => meta === 0 ? 'red_sandstone'
    : (meta === 1 ? 'chiseled_red_sandstone' : (meta === 2 ? 'cut_red_sandstone' : null)),
  double_stone_slab: (meta) => (meta > 9 && meta !== 15) ? null : EXPECTED_STONE_SLABS[meta & 7],
  stone_slab: (meta) => EXPECTED_STONE_SLABS[meta & 7],
  double_wooden_slab: (meta) => meta < 6 ? EXPECTED_WOODS[meta] + '_slab' : null,
  wooden_slab: (meta) => {
    const type = meta & 7;
    return type < 6 ? EXPECTED_WOODS[type] + '_slab' : null;
  },
  double_stone_slab2: (meta) => (meta === 0 || meta === 8) ? 'red_sandstone_slab' : null,
  stone_slab2: (meta) => (meta === 0 || meta === 8) ? 'red_sandstone_slab' : null,
  cobblestone_wall: (meta) => meta === 0 ? 'cobblestone_wall'
    : (meta === 1 ? 'mossy_cobblestone_wall' : null),
  monster_egg: (meta) => [
    'infested_stone', 'infested_cobblestone', 'infested_stone_bricks',
    'infested_mossy_stone_bricks', 'infested_cracked_stone_bricks',
    'infested_chiseled_stone_bricks'
  ][meta] || null,
  tallgrass: (meta) => meta === 0 ? 'dead_bush'
    : (meta === 1 ? 'short_grass' : (meta === 2 ? 'fern' : null)),
  yellow_flower: (meta) => meta === 0 ? 'dandelion' : null,
  red_flower: (meta) => EXPECTED_RED_FLOWERS[meta] || null,
  double_plant: (meta) => {
    const type = meta & 7;
    return type < 6 ? EXPECTED_DOUBLE_PLANTS[type] : null;
  },
  skull: (meta) => EXPECTED_SKULLS[meta] || null,
  brown_mushroom_block: (meta) => (meta === 10 || meta === 15)
    ? 'mushroom_stem'
    : (meta <= 10 || meta === 14 ? 'brown_mushroom_block' : null),
  red_mushroom_block: (meta) => (meta === 10 || meta === 15)
    ? 'mushroom_stem'
    : (meta <= 10 || meta === 14 ? 'red_mushroom_block' : null),
  flower_pot: (meta) => EXPECTED_FLOWER_POTS[meta] || null,
  anvil: (meta) => meta <= 14 ? 'anvil' : null
});

const EXPECTED_ITEM_ALIASES = Object.freeze({
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

const EXPECTED_SPAWN_EGGS = Object.freeze({
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

const EXPECTED_ENTITY_ALIASES = Object.freeze({
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

function expectedBlockName(legacyName, meta) {
  const variant = EXPECTED_BLOCK_VARIANTS[legacyName];
  if (variant) return variant(meta);
  return EXPECTED_BLOCK_ALIASES[legacyName] || legacyName;
}

function expectedItemName(id, meta, legacyName) {
  if (registry.mc18.blocks[id]) return expectedBlockName(legacyName, meta);
  switch (legacyName) {
    case 'fish': return EXPECTED_FISH[meta] || null;
    case 'cooked_fish': return EXPECTED_COOKED_FISH[meta] || null;
    case 'dye': return EXPECTED_DYES[meta] || null;
    case 'coal': return meta === 0 ? 'coal' : (meta === 1 ? 'charcoal' : null);
    case 'golden_apple':
      return meta === 0 ? 'golden_apple' : (meta === 1 ? 'enchanted_golden_apple' : null);
    case 'potion': return (meta & 0x4000) ? 'splash_potion' : 'potion';
    case 'bed': return meta === 0 ? 'red_bed' : null;
    case 'banner':
      return meta >= 0 && meta <= 15 ? EXPECTED_BANNER_COLORS[meta] + '_banner' : null;
    case 'skull': return EXPECTED_SKULLS[meta] || null;
    case 'spawn_egg': {
      const entity = EXPECTED_SPAWN_EGGS[meta];
      return entity ? entity + '_spawn_egg' : null;
    }
    default: return EXPECTED_ITEM_ALIASES[legacyName] || legacyName;
  }
}

function expectedEntityName(legacyName) {
  const key = String(legacyName).toLowerCase();
  return EXPECTED_ENTITY_ALIASES[key] || key;
}

function legacyValidMetas(entry) {
  if (Array.isArray(entry.variations) && entry.variations.length) {
    return entry.variations.map((variation) => variation.metadata);
  }
  return [0];
}

function registryAliasEntries(value) {
  return value && typeof value === 'object' ? Object.entries(value) : [];
}

function validateRegistryMap(api) {
  const mc18 = api.mc18 || registry.mc18;
  const failures = [];
  const fail = (code, detail) => failures.push({ code, detail });
  const stoneState = mc21.blocksByName.stone.defaultState;
  const stoneItemId = mc21.itemsByName.stone.id;
  const armorStandId = mc21.entitiesByName.armor_stand.id;
  let unresolvedExisting = 0;
  let silentStoneFallback = 0;
  let silentArmorStandFallback = 0;
  let newRegistryIds = 0;
  let abstractEntities = 0;
  const observed = { blocks: [], items: [], entities: [], unknown: {}, audit: {} };

  const checkNewId = (kind, name, result, detail) => {
    const table = kind === 'block' ? mc21.blocksByName : (kind === 'item' ? mc21.itemsByName : mc21.entitiesByName);
    const oracle = name && table[name];
    const actualId = kind === 'item' ? result && result.itemId : result && result.id;
    const actualState = kind === 'block' ? result && result.stateId : undefined;
    if (!oracle || actualId !== oracle.id || (kind === 'block' && actualState !== oracle.defaultState)) {
      newRegistryIds += 1;
      fail('E_NEW_REGISTRY_ID', {
        kind,
        name,
        actualId,
        actualState,
        oracle: oracle && { id: oracle.id, defaultState: oracle.defaultState },
        detail
      });
      return false;
    }
    return true;
  };

  for (const testCase of REGISTRY_CASES.blocks) {
    const result = api.resolveBlock(testCase.id, testCase.meta);
    observed.blocks.push({
      id: testCase.id,
      meta: testCase.meta,
      label: testCase.label || null,
      expectedName: testCase.name,
      name: result && result.name,
      id21: result && result.id,
      stateId: result && result.stateId,
      ok: !!(result && result.ok)
    });
    if (!result || result.ok !== true) {
      fail('E_KNOWN_BLOCK_UNRESOLVED', { id: testCase.id, meta: testCase.meta, expectedName: testCase.name, result });
      continue;
    }
    if (result.name !== testCase.name) {
      fail('E_BLOCK_NAME_MISMATCH', { id: testCase.id, meta: testCase.meta, expectedName: testCase.name, actual: result.name });
    }
    checkNewId('block', testCase.name, result, 'known block case');
    if (testCase.name !== 'stone' && result.stateId === stoneState) {
      silentStoneFallback += 1;
      fail('E_SILENT_STONE_FALLBACK', { id: testCase.id, meta: testCase.meta, expectedName: testCase.name, result });
    }
  }

  for (const testCase of REGISTRY_CASES.items) {
    const result = api.resolveItem(testCase.id, testCase.meta);
    observed.items.push({
      id: testCase.id,
      meta: testCase.meta,
      label: testCase.label || null,
      expectedName: testCase.name,
      name: result && result.name,
      itemId: result && result.itemId,
      ok: !!(result && result.ok)
    });
    if (!result || result.ok !== true) {
      fail('E_KNOWN_ITEM_UNRESOLVED', { id: testCase.id, meta: testCase.meta, expectedName: testCase.name, result });
      continue;
    }
    if (result.name !== testCase.name) {
      fail('E_ITEM_NAME_MISMATCH', { id: testCase.id, meta: testCase.meta, expectedName: testCase.name, actual: result.name });
    }
    checkNewId('item', testCase.name, result, 'known item case');
    if (testCase.name !== 'stone' && (result.name === 'stone' || result.itemId === stoneItemId)) {
      silentStoneFallback += 1;
      fail('E_SILENT_STONE_FALLBACK', { id: testCase.id, meta: testCase.meta, expectedName: testCase.name, result });
    }
  }

  for (const testCase of REGISTRY_CASES.entities) {
    const result = api.resolveEntity(testCase.id);
    observed.entities.push({
      id: testCase.id,
      expectedName: testCase.name,
      name: result && result.name,
      id21: result && result.id,
      ok: !!(result && result.ok)
    });
    if (!result || result.ok !== true) {
      fail('E_KNOWN_ENTITY_UNRESOLVED', { id: testCase.id, expectedName: testCase.name, result });
      continue;
    }
    if (result.name !== testCase.name) {
      fail('E_ENTITY_NAME_MISMATCH', { id: testCase.id, expectedName: testCase.name, actual: result.name });
    }
    checkNewId('entity', testCase.name, result, 'known entity case');
    if (testCase.name !== 'armor_stand' && (result.name === 'armor_stand' || result.id === armorStandId)) {
      silentArmorStandFallback += 1;
      fail('E_SILENT_ARMOR_STAND_FALLBACK', { id: testCase.id, expectedName: testCase.name, result });
    }
  }

  const unknownBlock = api.resolveBlock(REGISTRY_CASES.unknown.blockId, 0);
  observed.unknown.block = unknownBlock;
  if (!unknownBlock || unknownBlock.ok !== false || unknownBlock.code !== 'E_UNRESOLVED_BLOCK') {
    fail('E_UNKNOWN_BLOCK_ACCEPTED', unknownBlock);
    if (unknownBlock && unknownBlock.ok && (unknownBlock.name === 'stone' || unknownBlock.stateId === stoneState)) {
      silentStoneFallback += 1;
    }
  }
  const invalidBlockMeta = api.resolveBlock(1, REGISTRY_CASES.unknown.blockMeta);
  observed.unknown.invalidBlockMeta = invalidBlockMeta;
  if (!invalidBlockMeta || invalidBlockMeta.ok !== false || invalidBlockMeta.code !== 'E_UNRESOLVED_BLOCK') {
    fail('E_INVALID_BLOCK_METADATA_ACCEPTED', invalidBlockMeta);
    if (invalidBlockMeta && invalidBlockMeta.ok && invalidBlockMeta.name === 'stone') {
      silentStoneFallback += 1;
    }
  }
  const unknownItem = api.resolveItem(REGISTRY_CASES.unknown.itemId, 0);
  observed.unknown.item = unknownItem;
  if (!unknownItem || unknownItem.ok !== false || unknownItem.code !== 'E_UNRESOLVED_ITEM') {
    fail('E_UNKNOWN_ITEM_ACCEPTED', unknownItem);
    if (unknownItem && unknownItem.ok && (unknownItem.name === 'stone' || unknownItem.itemId === stoneItemId)) {
      silentStoneFallback += 1;
    }
  }
  const unsupportedSpawnEgg = api.resolveItem(383, REGISTRY_CASES.unknown.unsupportedSpawnEgg);
  observed.unknown.unsupportedSpawnEgg = unsupportedSpawnEgg;
  if (!unsupportedSpawnEgg || unsupportedSpawnEgg.ok !== false || unsupportedSpawnEgg.code !== 'E_UNRESOLVED_ITEM') {
    fail('E_UNSUPPORTED_SPAWN_EGG_ACCEPTED', unsupportedSpawnEgg);
  }
  const unknownEntity = api.resolveEntity(REGISTRY_CASES.unknown.entityId);
  observed.unknown.entity = unknownEntity;
  if (!unknownEntity || unknownEntity.ok !== false || unknownEntity.code !== 'E_UNRESOLVED_ENTITY') {
    fail('E_UNKNOWN_ENTITY_ACCEPTED', unknownEntity);
    if (unknownEntity && unknownEntity.ok && (unknownEntity.name === 'armor_stand' || unknownEntity.id === armorStandId)) {
      silentArmorStandFallback += 1;
    }
  }
  const abstractEntity = api.resolveEntity(REGISTRY_CASES.unknown.abstractEntityId);
  observed.unknown.abstractEntity = abstractEntity;
  if (!abstractEntity || abstractEntity.ok !== false || abstractEntity.code !== 'E_UNSUPPORTED_ENTITY') {
    fail('E_ABSTRACT_ENTITY_ACCEPTED', abstractEntity);
  }

  for (const block of Object.values(mc18.blocks)) {
    for (const meta of legacyValidMetas(block)) {
      const expectedName = expectedBlockName(block.name, meta);
      if (!expectedName) {
        fail('E_EXPECTED_NAME_MISSING', { source: 'legacy-block-audit', id: block.id, meta, legacyName: block.name });
        continue;
      }
      const result = api.resolveBlock(block.id, meta);
      if (!result || result.ok !== true) {
        unresolvedExisting += 1;
        fail('E_UNRESOLVED_EXISTING_BLOCK', { id: block.id, meta, legacyName: block.name, expectedName, result });
        continue;
      }
      if (result.name !== expectedName) {
        fail('E_EXPECTED_BLOCK_NAME', {
          source: 'legacy-block-audit', id: block.id, meta, legacyName: block.name, expectedName, actual: result.name
        });
      }
      checkNewId('block', expectedName, result, { source: 'legacy-block-audit', id: block.id, meta });
      if (expectedName !== 'stone' && result.stateId === stoneState) {
        silentStoneFallback += 1;
        fail('E_SILENT_STONE_FALLBACK', {
          source: 'legacy-block-audit', id: block.id, meta, expectedName, result
        });
      }
    }
  }

  const spawnEggMetas = Object.keys(EXPECTED_SPAWN_EGGS).map(Number);
  for (const item of Object.values(mc18.items)) {
    const metas = item.name === 'spawn_egg' ? spawnEggMetas : legacyValidMetas(item);
    for (const meta of metas) {
      const expectedName = expectedItemName(item.id, meta, item.name);
      if (!expectedName) {
        fail('E_EXPECTED_NAME_MISSING', { source: 'legacy-item-audit', id: item.id, meta, legacyName: item.name });
        continue;
      }
      const result = api.resolveItem(item.id, meta);
      if (!result || result.ok !== true) {
        unresolvedExisting += 1;
        fail('E_UNRESOLVED_EXISTING_ITEM', { id: item.id, meta, legacyName: item.name, expectedName, result });
        continue;
      }
      if (result.name !== expectedName) {
        fail('E_EXPECTED_ITEM_NAME', {
          source: 'legacy-item-audit', id: item.id, meta, legacyName: item.name, expectedName, actual: result.name
        });
      }
      checkNewId('item', expectedName, result, { source: 'legacy-item-audit', id: item.id, meta });
      if (expectedName !== 'stone' && (result.name === 'stone' || result.itemId === stoneItemId)) {
        silentStoneFallback += 1;
        fail('E_SILENT_STONE_FALLBACK', {
          source: 'legacy-item-audit', id: item.id, meta, expectedName, result
        });
      }
    }
  }

  for (const entity of Object.values(mc18.entities)) {
    const key = String(entity.name).toLowerCase();
    const result = api.resolveEntity(entity.id);
    if (ABSTRACT_LEGACY_ENTITY_NAMES.includes(key)) {
      abstractEntities += 1;
      if (!result || result.ok !== false || result.code !== 'E_UNSUPPORTED_ENTITY') {
        fail('E_ABSTRACT_ENTITY_ACCEPTED', { id: entity.id, legacyName: entity.name, result });
      }
      continue;
    }
    const expectedName = expectedEntityName(entity.name);
    if (!result || result.ok !== true) {
      unresolvedExisting += 1;
      fail('E_UNRESOLVED_EXISTING_ENTITY', { id: entity.id, legacyName: entity.name, expectedName, result });
      continue;
    }
    if (result.name !== expectedName) {
      fail('E_EXPECTED_ENTITY_NAME', {
        source: 'legacy-entity-audit', id: entity.id, legacyName: entity.name, expectedName, actual: result.name
      });
    }
    checkNewId('entity', expectedName, result, { source: 'legacy-entity-audit', id: entity.id });
    if (expectedName !== 'armor_stand' && (result.name === 'armor_stand' || result.id === armorStandId)) {
      silentArmorStandFallback += 1;
      fail('E_SILENT_ARMOR_STAND_FALLBACK', {
        source: 'legacy-entity-audit', id: entity.id, expectedName, result
      });
    }
  }

  const noItemForm = new Set();
  const malformedItemEntries = [];
  const itemsModule = require(path.join(ROOT, 'bloxd', 'types', 'items.js'));
  for (const [label, value] of Object.entries(itemsModule.ITEMS)) {
    let id = null;
    let meta = 0;
    if (typeof value === 'number') {
      id = value;
    } else if (Array.isArray(value) && typeof value[0] === 'number') {
      id = value[0];
      meta = value[1] | 0;
    } else {
      malformedItemEntries.push(label);
      continue;
    }
    if (!id) continue;
    const legacy = registry.mc18.items[id] || registry.mc18.blocks[id];
    const legacyName = legacy && legacy.name;
    const expectedName = legacyName ? expectedItemName(id, meta, legacyName) : null;
    const result = api.resolveItem(id, meta);
    if (!result || result.ok !== true) {
      if (NO_ITEM_FORM_IDS.includes(id)) {
        noItemForm.add(id);
        if (!result || result.code !== 'E_UNRESOLVED_ITEM') {
          fail('E_NO_ITEM_FORM_NOT_TYPED', { label, id, meta, result });
        }
      } else {
        unresolvedExisting += 1;
        fail('E_UNRESOLVED_EXISTING_ITEM', {
          source: 'items.js', label, id, meta, legacyName, expectedName, result
        });
      }
      continue;
    }
    if (!expectedName) {
      fail('E_EXPECTED_NAME_MISSING', { source: 'items.js', label, id, meta, legacyName });
      continue;
    }
    if (result.name !== expectedName) {
      fail('E_EXPECTED_ITEM_NAME', {
        source: 'items.js', label, id, meta, legacyName, expectedName, actual: result.name
      });
    }
    checkNewId('item', expectedName, result, { source: 'items.js', label, id, meta });
    if (expectedName !== 'stone' && (result.name === 'stone' || result.itemId === stoneItemId)) {
      silentStoneFallback += 1;
      fail('E_SILENT_STONE_FALLBACK', {
        source: 'items.js', label, id, meta, expectedName, result
      });
    }
  }
  observed.audit.noItemFormIds = Array.from(noItemForm).sort((a, b) => a - b);
  observed.audit.malformedItemEntries = malformedItemEntries.slice();
  if (observed.audit.noItemFormIds.length !== NO_ITEM_FORM_IDS.length ||
      NO_ITEM_FORM_IDS.some((id) => !noItemForm.has(id))) {
    fail('E_NO_ITEM_FORM_SET', { expected: NO_ITEM_FORM_IDS.slice(), actual: observed.audit.noItemFormIds });
  }

  const entitiesModule = require(path.join(ROOT, 'bloxd', 'types', 'entities.js'));
  for (const [label, value] of Object.entries(entitiesModule.ENTITIES)) {
    const legacy = registry.mc18.entities[value[0]];
    const legacyName = legacy && legacy.name;
    const expectedName = legacyName ? expectedEntityName(legacyName) : null;
    const result = api.resolveEntity(value[0]);
    if (!result || result.ok !== true) {
      unresolvedExisting += 1;
      fail('E_UNRESOLVED_EXISTING_ENTITY', {
        source: 'entities.js', label, id: value[0], legacyName, expectedName, result
      });
      continue;
    }
    if (!expectedName) {
      fail('E_EXPECTED_NAME_MISSING', { source: 'entities.js', label, id: value[0], legacyName });
      continue;
    }
    if (result.name !== expectedName) {
      fail('E_EXPECTED_ENTITY_NAME', {
        source: 'entities.js', label, id: value[0], legacyName, expectedName, actual: result.name
      });
    }
    checkNewId('entity', expectedName, result, { source: 'entities.js', label, id: value[0] });
  }

  for (const [legacy, target] of registryAliasEntries(api.LEGACY_BLOCK_ALIASES)) {
    if (!mc21.blocksByName[target]) {
      newRegistryIds += 1;
      fail('E_NEW_REGISTRY_ID', { kind: 'block-alias', legacy, target });
    }
  }
  for (const [legacy, target] of registryAliasEntries(api.LEGACY_ITEM_ALIASES)) {
    if (!mc21.itemsByName[target]) {
      newRegistryIds += 1;
      fail('E_NEW_REGISTRY_ID', { kind: 'item-alias', legacy, target });
    }
  }
  for (const [legacy, target] of registryAliasEntries(api.LEGACY_ENTITY_ALIASES)) {
    if (!mc21.entitiesByName[target]) {
      newRegistryIds += 1;
      fail('E_NEW_REGISTRY_ID', { kind: 'entity-alias', legacy, target });
    }
  }
  for (const [meta, target] of registryAliasEntries(api.SPAWN_EGG_ENTITIES)) {
    if (!mc21.itemsByName[target + '_spawn_egg']) {
      newRegistryIds += 1;
      fail('E_NEW_REGISTRY_ID', { kind: 'spawn-egg', meta, target });
    }
  }

  const flags = {
    unresolvedExisting,
    silentStoneFallback,
    silentArmorStandFallback,
    newRegistryIds,
    knownBlocks: REGISTRY_CASES.blocks.length,
    knownItems: REGISTRY_CASES.items.length,
    knownEntities: REGISTRY_CASES.entities.length,
    noItemForm: observed.audit.noItemFormIds.length,
    malformedItemEntries: malformedItemEntries.length,
    abstractEntities
  };
  const ok = failures.length === 0 &&
    unresolvedExisting === 0 &&
    silentStoneFallback === 0 &&
    silentArmorStandFallback === 0 &&
    newRegistryIds === 0;
  return { ok, flags, observed, failures };
}

function validateUnknownClientSafety() {
  const failures = [];
  const real = createStubReal();
  const client = new LegacyClient(real);
  let crashed = false;
  try {
    client.write('block_change', {
      location: { x: 0, y: 0, z: 0 },
      type: (REGISTRY_CASES.unknown.blockId << 4) | 0
    });
    client.write('spawn_entity', {
      entityId: 77,
      type: REGISTRY_CASES.unknown.entityId,
      x: 0, y: 0, z: 0
    });
    client.write('set_slot', {
      windowId: 0,
      slot: 36,
      item: { blockId: REGISTRY_CASES.unknown.itemId, itemCount: 1, itemDamage: 0 }
    });
  } catch (error) {
    crashed = true;
    failures.push({ code: 'E_UNKNOWN_CLIENT_CRASH', message: error.message });
  }

  const blockWrite = real.writes.find((write) => write.name === 'block_change');
  if (blockWrite) failures.push({ code: 'E_UNKNOWN_BLOCK_WRITTEN', data: blockWrite.data });
  const spawnWrite = real.writes.find((write) => write.name === 'spawn_entity');
  if (spawnWrite) failures.push({ code: 'E_UNKNOWN_ENTITY_SPAWNED', data: spawnWrite.data });
  const slotWrite = real.writes.find((write) => write.name === 'set_slot');
  const slotItem = slotWrite && slotWrite.data && slotWrite.data.item;
  if (!slotWrite) {
    failures.push({ code: 'E_UNKNOWN_ITEM_NO_SLOT' });
  } else if (!slotItem || slotItem.itemCount !== 0 ||
      !slotItem.unresolved || slotItem.unresolved.code !== 'E_UNRESOLVED_ITEM') {
    failures.push({ code: 'E_UNKNOWN_ITEM_SILENT_SUCCESS', item: slotItem });
  }

  const codes = (client.registryFailures || []).map((failure) => failure.code);
  if (!codes.includes('E_UNRESOLVED_BLOCK')) {
    failures.push({ code: 'E_UNKNOWN_BLOCK_NOT_REPORTED', codes });
  }
  if (!codes.includes('E_UNRESOLVED_ENTITY')) {
    failures.push({ code: 'E_UNKNOWN_ENTITY_NOT_REPORTED', codes });
  }
  if (!codes.includes('E_UNRESOLVED_ITEM')) {
    failures.push({ code: 'E_UNKNOWN_ITEM_NOT_REPORTED', codes });
  }

  return {
    ok: failures.length === 0,
    failures,
    flags: {
      unknownBlockNoWrite: blockWrite ? 0 : 1,
      unknownEntityNoSpawn: spawnWrite ? 0 : 1,
      unknownItemNoStone: slotItem && slotItem.itemCount === 0 && slotItem.unresolved ? 1 : 0,
      unknownClientNoCrash: crashed ? 0 : 1
    }
  };
}

function validateRegistryWrappers() {
  const failures = [];
  const unknownBlockState = registry.blockState(REGISTRY_CASES.unknown.blockId, 0);
  if (unknownBlockState !== null) {
    failures.push({ code: 'E_BLOCK_STATE_FALLBACK', actual: unknownBlockState });
  }
  const invalidBlockState = registry.blockState(1, REGISTRY_CASES.unknown.blockMeta);
  if (invalidBlockState !== null) {
    failures.push({ code: 'E_BLOCK_STATE_FALLBACK', actual: invalidBlockState, metadata: REGISTRY_CASES.unknown.blockMeta });
  }
  const unknownItemId = registry.itemId(REGISTRY_CASES.unknown.itemId, 0);
  if (unknownItemId !== null) {
    failures.push({ code: 'E_ITEM_ID_FALLBACK', actual: unknownItemId });
  }
  const unsupportedSpawnEggId = registry.itemId(383, REGISTRY_CASES.unknown.unsupportedSpawnEgg);
  if (unsupportedSpawnEggId !== null) {
    failures.push({ code: 'E_ITEM_ID_FALLBACK', actual: unsupportedSpawnEggId, metadata: REGISTRY_CASES.unknown.unsupportedSpawnEgg });
  }
  const unknownEntityType = registry.entityType('not_a_real_entity');
  if (unknownEntityType !== null) {
    failures.push({ code: 'E_ENTITY_TYPE_FALLBACK', actual: unknownEntityType });
  }
  const airItemId = registry.itemId(0, 0);
  if (airItemId !== 0) {
    failures.push({ code: 'E_AIR_ITEM_ID', actual: airItemId });
  }
  return {
    ok: failures.length === 0,
    failures,
    flags: {
      unknownBlockStateNull: unknownBlockState === null && invalidBlockState === null ? 1 : 0,
      unknownItemIdNull: unknownItemId === null && unsupportedSpawnEggId === null ? 1 : 0,
      unknownEntityTypeNull: unknownEntityType === null ? 1 : 0,
      airItemIdZero: airItemId === 0 ? 1 : 0
    }
  };
}

function runRegistryMap() {
  const validation = validateRegistryMap(registry);
  const clientSafety = validateUnknownClientSafety();
  const wrappers = validateRegistryWrappers();
  const failures = validation.failures.concat(clientSafety.failures, wrappers.failures);
  const flags = { ...validation.flags, ...clientSafety.flags, ...wrappers.flags };
  const ok = validation.ok && clientSafety.ok && wrappers.ok && failures.length === 0 &&
    flags.unresolvedExisting === 0 &&
    flags.silentStoneFallback === 0 &&
    flags.silentArmorStandFallback === 0 &&
    flags.newRegistryIds === 0;
  printJson({
    ok,
    mode: 'registry-map',
    expected: {
      source: 'minecraft-data 1.8.9 -> 1.21.11',
      representativeBlocks: REGISTRY_CASES.blocks.length,
      representativeItems: REGISTRY_CASES.items.length,
      representativeEntities: REGISTRY_CASES.entities.length,
      unknownBlock: 'E_UNRESOLVED_BLOCK',
      unknownItem: 'E_UNRESOLVED_ITEM',
      unknownEntity: 'E_UNRESOLVED_ENTITY'
    },
    flags,
    observed: validation.observed,
    clientSafety: { flags: clientSafety.flags, failures: clientSafety.failures },
    wrappers: { flags: wrappers.flags, failures: wrappers.failures },
    failures
  });
  process.exit(ok ? 0 : 1);
}

function registryFaultApi(kind) {
  const api = Object.assign({}, registry);
  api.resolveBlock = (id, data) => {
    const result = registry.resolveBlock(id, data);
    if (result && result.ok) return result;
    if (kind === 'unknown-block' || kind === 'silent-fallback') {
      return {
        ok: true,
        name: 'stone',
        id: mc21.blocksByName.stone.id,
        stateId: mc21.blocksByName.stone.defaultState,
        legacyId: id,
        metadata: data
      };
    }
    return result;
  };
  api.resolveItem = (id, data) => {
    const result = registry.resolveItem(id, data);
    if (result && result.ok) return result;
    if (kind === 'silent-fallback') {
      return {
        ok: true,
        name: 'stone',
        itemId: mc21.itemsByName.stone.id,
        legacyId: id,
        metadata: data
      };
    }
    return result;
  };
  api.resolveEntity = (id) => {
    const result = registry.resolveEntity(id);
    if (result && result.ok) return result;
    if (kind === 'silent-fallback') {
      return {
        ok: true,
        name: 'armor_stand',
        id: mc21.entitiesByName.armor_stand.id,
        legacyId: id
      };
    }
    return result;
  };
  return api;
}

function registrySelfTest(name) {
  const expectedCodes = name === 'unknown-block'
    ? ['E_UNKNOWN_BLOCK_ACCEPTED', 'E_SILENT_STONE_FALLBACK']
    : ['E_UNKNOWN_BLOCK_ACCEPTED', 'E_UNKNOWN_ITEM_ACCEPTED', 'E_UNKNOWN_ENTITY_ACCEPTED',
        'E_SILENT_STONE_FALLBACK', 'E_SILENT_ARMOR_STAND_FALLBACK'];
  const validation = validateRegistryMap(registryFaultApi(name));
  const detected = validation.failures.some((failure) => expectedCodes.includes(failure.code));
  printJson({
    ok: false,
    mode: 'self-test',
    selfTest: name,
    codes: expectedCodes,
    detected,
    flags: validation.flags,
    failures: validation.failures
  });
  process.exit(detected ? 1 : 0);
}

function baseStack() {
  return registry.itemStack(utils.translateItem(freshItem()));
}

function selfTest(name) {
  if (ITEM_VISUAL_SELF_TESTS.includes(name)) {
    return itemVisualsSelfTest(name);
  }
  if (['missing-case', 'swallowed-write', 'wrong-equipment-slot'].includes(name)) {
    return vocabularySelfTest(name);
  }
  if (INBOUND_SELF_TESTS.includes(name)) {
    return inboundSelfTest(name);
  }
  if (COMPONENT_SELF_TESTS.includes(name)) {
    return componentsSelfTest(name);
  }
  if (TITLE_SELF_TESTS.includes(name)) {
    return titlesSelfTest(name);
  }
  if (REGISTRY_SELF_TESTS.includes(name)) {
    return registrySelfTest(name);
  }
  let failures;
  let code;

  if (name === 'missing-component-count') {
    code = 'E_ADDED_COUNT_MISMATCH';
    const stack = baseStack();
    if (!stack || typeof stack !== 'object') {
      printJson({ ok: false, mode: 'self-test', selfTest: name, code: 'E_SELF_TEST_SETUP_FAILED' });
      process.exit(0);
    }
    delete stack.addedComponentCount;
    failures = validateStack(utils.translateItem(freshItem()), stack);
  } else if (name === 'string-lore') {
    code = 'E_LORE_NBT';
    const stack = baseStack();
    const lore = findComponent(stack, 'lore');
    if (!lore) {
      printJson({ ok: false, mode: 'self-test', selfTest: name, code: 'E_SELF_TEST_SETUP_FAILED' });
      process.exit(0);
    }
    lore.data = lore.data.map((entry) => (entry && entry.value && entry.value.text
      ? entry.value.text.value
      : 'plain lore'));
    failures = validateStack(utils.translateItem(freshItem()), stack);
  } else if (name === 'named-entity-fallback') {
    code = 'E_NAMED_ENTITY_FALLBACK';
    const legacyOnly = {
      blockId: EXPECTED.legacyId,
      itemCount: 1,
      itemDamage: 0,
      nbtData: {
        type: 'compound',
        name: '',
        value: {
          display: { type: 'compound', value: { Name: { type: 'string', value: 'Legacy Name' } } }
        }
      }
    };
    const stack = registry.itemStack(legacyOnly);
    failures = validateStack(legacyOnly, stack);
  } else {
    printJson({ ok: false, mode: 'self-test', selfTest: name, code: 'E_UNKNOWN_SELF_TEST' });
    process.exit(2);
  }

  const detected = failures.some((entry) => entry.code === code);
  printJson({
    ok: false,
    mode: 'self-test',
    selfTest: name,
    code,
    detected,
    failures
  });
  process.exit(detected ? 1 : 0);
}

function printJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// vocabulary: every handler write/read disposition + exact 1.21.11 fields
// ---------------------------------------------------------------------------

const HANDLER_IMPL_DIR = path.join(ROOT, 'bloxd', 'handlers', 'impl');
const VOCABULARY_FIXTURE_PATH = path.join(ROOT, 'test', 'fixtures', '846', 'handler-vocabulary.json');
const BLOCK_ENTITY_TYPES_FIXTURE_PATH = path.join(ROOT, 'test', 'fixtures', '846', 'block-entity-types.json');

function loadJsonFixture(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function frozenBlockEntityTypes() {
  const fixture = loadJsonFixture(BLOCK_ENTITY_TYPES_FIXTURE_PATH);
  return fixture && fixture.blockEntityTypes ? fixture.blockEntityTypes : {};
}

function frozenHandlerVocabulary() {
  return loadJsonFixture(VOCABULARY_FIXTURE_PATH);
}

function vocabularyKey(entry) {
  return entry.file + ':' + entry.line + ':' + entry.legacyName;
}

const READ_DISPOSITIONS = Object.freeze({
  flying: { inbound: ['flying'] },
  position: { inbound: ['position'], fields: ['x', 'y', 'z', 'onGround'] },
  look: { inbound: ['look'], fields: ['yaw', 'pitch', 'onGround'] },
  position_look: { inbound: ['position_look'], fields: ['x', 'y', 'z', 'yaw', 'pitch', 'onGround'] },
  held_item_slot: { inbound: ['held_item_slot'], fields: ['slotId'] },
  arm_animation: { inbound: ['arm_animation'] },
  entity_action: { inbound: ['entity_action'], fields: ['actionId', 'entityId'] },
  use_entity: { inbound: ['use_entity'], fields: ['target', 'mouse', 'sneaking'] },
  spectate: { inbound: ['spectate'] },
  window_click: { inbound: ['window_click'] },
  close_window: { inbound: ['close_window'] },
  chat: { inbound: ['chat_message', 'chat_command'], fields: ['message'] },
  tab_complete: { inbound: ['tab_complete'], fields: ['text'] },
  block_place: { inbound: ['block_place', 'use_item'], fields: ['location', 'direction', 'hand', 'sequence'] },
  block_dig: { inbound: ['block_dig'] }
});

const EXPECTED_EQUIPMENT_SLOTS = Object.freeze({ 0: 0, 1: 2, 2: 3, 3: 4, 4: 5 });
const VOCAB_PACKET_NAMES = Object.freeze([
  'map_chunk', 'tile_entity_data', 'entity_equipment', 'open_window', 'window_items',
  'set_slot', 'set_cursor_item', 'scoreboard_objective', 'scoreboard_display_objective',
  'scoreboard_score', 'teams', 'sound_effect', 'world_particles'
]);

function scanHandlerVocabulary() {
  const writes = [];
  const reads = [];
  const files = fs.readdirSync(HANDLER_IMPL_DIR).filter((file) => file.endsWith('.js')).sort();
  for (const file of files) {
    const relative = 'bloxd/handlers/impl/' + file;
    const lines = fs.readFileSync(path.join(HANDLER_IMPL_DIR, file), 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      const writeAt = line.indexOf('client.write(');
      if (writeAt !== -1) {
        const segment = line.slice(writeAt + 'client.write('.length);
        const names = Array.from(segment.matchAll(/'([^']+)'/g), (match) => match[1]);
        writes.push({ file: relative, line: index + 1, names, source: line.trim() });
      }
      const read = line.match(/client\.on\(\s*'([^']+)'/);
      if (read) {
        reads.push({ file: relative, line: index + 1, name: read[1], source: line.trim() });
      }
    });
  }
  return { writes, reads };
}

function countScannedWrites(scan) {
  return scan.writes.reduce((total, call) => total + call.names.length, 0);
}

function buildVocabularyManifest(scan) {
  const writeEntries = [];
  for (const call of scan.writes) {
    for (const name of call.names) {
      const disposition = LegacyClient.WRITE_DISPOSITIONS[name];
      writeEntries.push({
        direction: 'write',
        file: call.file,
        line: call.line,
        legacyName: name,
        source: call.source,
        mapped: Boolean(disposition),
        packet: disposition && disposition.packet ? disposition.packet : null,
        expands: disposition && disposition.expands ? disposition.expands.slice() : [],
        fields: disposition && disposition.fields ? disposition.fields.slice() : [],
        noop: Boolean(disposition && disposition.noop),
        ledger: disposition && disposition.ledger ? disposition.ledger : null
      });
    }
  }
  const readEntries = scan.reads.map((call) => {
    const disposition = READ_DISPOSITIONS[call.name];
    return {
      direction: 'read',
      file: call.file,
      line: call.line,
      legacyName: call.name,
      source: call.source,
      mapped: Boolean(disposition),
      inbound: disposition ? disposition.inbound.slice() : [],
      fields: disposition && disposition.fields ? disposition.fields.slice() : []
    };
  });
  return {
    handlerWriteCount: writeEntries.length,
    handlerReadCount: readEntries.length,
    writeEntries,
    readEntries
  };
}

function capturePackets(legacyName, legacyData, setup) {
  const real = createStubReal();
  const client = new LegacyClient(real);
  if (typeof setup === 'function') setup(client);
  client.write(legacyName, legacyData);
  return real.writes.map((write) => ({ name: write.name, raw: write.data, data: decodeWrite(write) }));
}

function firstPacket(packets, name) {
  return packets.find((packet) => packet.name === name);
}

function unpackHeightmap(data, count) {
  const longs = data.map((value) => BigInt.asUintN(64, BigInt(value)));
  const out = [];
  for (let i = 0; i < count; i++) {
    const index = Math.floor(i / 7);
    const offset = BigInt((i % 7) * 9);
    out.push(Number((longs[index] >> offset) & 0x1ffn));
  }
  return out;
}

function bitCount(value, capacity) {
  let count = 0;
  for (let i = 0; i < capacity; i++) {
    if ((value & (1n << BigInt(i))) !== 0n) count += 1;
  }
  return count;
}

function makeLegacyChunk() {
  const chunk = new Chunk18();
  const pos = new Vec3(0, 0, 0);
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = 0; y < 256; y++) chunk.setSkyLight(pos.set(x, y, z), 15);
      chunk.setBlockType(pos.set(x, 10, z), 2);
    }
  }
  return chunk;
}

function nbtCompoundText(component) {
  if (!component || component.type !== 'compound') return null;
  const text = component.value && component.value.text;
  return text && text.type === 'string' ? text.value : null;
}

function nbtMessages(component) {
  const list = component && component.value && component.value.messages;
  if (!list || list.type !== 'list') return null;
  return list.value.value.map((entry) => (entry && entry.type === 'string' ? entry.value : entry));
}

function validateChunkFields() {
  const failures = [];
  const fail = (code, detail) => failures.push({ code, detail });
  const chunk = makeLegacyChunk();
  const packets = capturePackets('map_chunk', {
    x: 3,
    z: -2,
    groundUp: true,
    bitMap: chunk.getMask(),
    chunkData: chunk.dump()
  });
  const map = firstPacket(packets, 'map_chunk');
  if (!map) {
    fail('E_CHUNK_MISSING', packets.map((packet) => packet.name));
    return { flags: { chunkFieldsExact: 0 }, failures, decoded: { packetNames: packets.map((packet) => packet.name) } };
  }
  const data = map.data;
  const EXPECTED_HEIGHTMAP_TYPES = ['world_surface', 'motion_blocking_no_leaves', 'motion_blocking'];
  const heightmaps = Array.isArray(data.heightmaps) ? data.heightmaps : [];
  if (heightmaps.length !== 3) {
    fail('E_CHUNK_HEIGHTMAPS', heightmaps.length);
  } else {
    if (heightmaps.map((entry) => entry.type).join(',') !== EXPECTED_HEIGHTMAP_TYPES.join(',')) {
      fail('E_CHUNK_HEIGHTMAP_ORDER', heightmaps.map((entry) => entry.type));
    }
    for (const heightmap of heightmaps) {
      if (!Array.isArray(heightmap.data) || heightmap.data.length !== 37) {
        fail('E_CHUNK_HEIGHTMAP_LENGTH', { type: heightmap.type, length: heightmap.data && heightmap.data.length });
        continue;
      }
      const heights = unpackHeightmap(heightmap.data, 256);
      if (heights.some((value) => value !== 75)) {
        fail('E_CHUNK_HEIGHTMAP_VALUES', { type: heightmap.type, first: heights[0], distinct: Array.from(new Set(heights)).slice(0, 8) });
      }
    }
  }
  const skyMask = Array.isArray(data.skyLightMask) && data.skyLightMask.length === 1
    ? BigInt.asUintN(64, BigInt(data.skyLightMask[0]))
    : null;
  if (skyMask === null) {
    fail('E_CHUNK_SKY_MASK_SHAPE', data.skyLightMask);
  } else {
    if (bitCount(skyMask, 26) !== 20) fail('E_CHUNK_SKY_MASK_BITS', bitCount(skyMask, 26));
    if ((skyMask & (1n << 4n)) !== 0n) fail('E_CHUNK_SKY_MASK_OFFSET', 'bit 4 set (expected first set bit 5)');
    if ((skyMask & (1n << 5n)) === 0n) fail('E_CHUNK_SKY_MASK_OFFSET', 'bit 5 clear');
    if ((skyMask & (1n << 24n)) === 0n) fail('E_CHUNK_SKY_MASK_OFFSET', 'bit 24 clear');
  }
  const blockMask = Array.isArray(data.emptyBlockLightMask) && data.emptyBlockLightMask.length === 1
    ? BigInt.asUintN(64, BigInt(data.emptyBlockLightMask[0]))
    : null;
  if (blockMask !== (1n << 26n) - 1n) fail('E_CHUNK_EMPTY_BLOCK_MASK', blockMask === null ? data.emptyBlockLightMask : String(blockMask));
  if (!Array.isArray(data.skyLight) || data.skyLight.length !== 20) {
    fail('E_CHUNK_SKY_LIGHT_COUNT', data.skyLight && data.skyLight.length);
  } else if (data.skyLight.some((section) => !section || section.length !== 2048 ||
      (section[0] !== 0xff && section[0] !== -1))) {
    fail('E_CHUNK_SKY_LIGHT_BYTES');
  }
  if (!Array.isArray(data.blockLight) || data.blockLight.length !== 0) fail('E_CHUNK_BLOCK_LIGHT', data.blockLight);
  if (!Array.isArray(data.blockLightMask) || data.blockLightMask.length !== 0) fail('E_CHUNK_BLOCK_MASK', data.blockLightMask);
  if (!Array.isArray(data.emptySkyLightMask) || data.emptySkyLightMask.length !== 0) fail('E_CHUNK_EMPTY_SKY_MASK', data.emptySkyLightMask);
  if (!Buffer.isBuffer(data.chunkData) || data.chunkData.length === 0) fail('E_CHUNK_DATA', data.chunkData && data.chunkData.length);
  if (!Array.isArray(data.blockEntities) || data.blockEntities.length !== 0) fail('E_CHUNK_BLOCK_ENTITIES', data.blockEntities);

  const reader = require('./lib/chunk-1.21.11-reader.js');
  const grassState = mc21.blocksByName.grass_block.defaultState;
  let decoded = null;
  try {
    decoded = reader.readChunkData(data.chunkData);
  } catch (error) {
    fail('E_CHUNK_READER', error.code || error.message);
  }
  if (decoded) {
    if (decoded.sections.length !== 24) fail('E_CHUNK_SECTION_COUNT', decoded.sections.length);
    if (decoded.bytesConsumed !== data.chunkData.length) {
      fail('E_CHUNK_TRAILING_BYTES', { consumed: decoded.bytesConsumed, length: data.chunkData.length });
    }
    if (decoded.sections[0].blockCount !== 0) fail('E_CHUNK_EMPTY_SECTION', decoded.sections[0].blockCount);
    const surface = decoded.sections[4];
    if (surface.blockCount !== 256) fail('E_CHUNK_BLOCK_COUNT', surface.blockCount);
    const present = Array.from(new Set(Array.from(surface.blocks))).sort((a, b) => a - b);
    if (present.length !== 2 || !present.includes(0) || !present.includes(grassState)) {
      fail('E_CHUNK_BLOCK_STATES', present);
    }
    const biomes = Array.from(new Set(Array.from(surface.biomes)));
    if (biomes.length !== 1 || biomes[0] !== 40) fail('E_CHUNK_BIOME', biomes);
  }

  const fixture = require('./fixtures/12111-chunk/vanilla-flat.json');
  const fixtureBytes = Buffer.from(fixture.chunk.chunkDataBase64, 'base64');
  let fixtureDecoded = null;
  try {
    fixtureDecoded = reader.readChunkData(fixtureBytes);
  } catch (error) {
    fail('E_CHUNK_FIXTURE_READ', error.code || error.message);
  }
  if (fixtureDecoded) {
    if (fixtureDecoded.sections.length !== 24 || fixtureDecoded.bytesConsumed !== fixtureBytes.length) {
      fail('E_CHUNK_FIXTURE_SHAPE', { sections: fixtureDecoded.sections.length, consumed: fixtureDecoded.bytesConsumed });
    } else if (fixtureDecoded.sections[0].blockCount !== 1024) {
      fail('E_CHUNK_FIXTURE_COUNT', fixtureDecoded.sections[0].blockCount);
    }
  }
  const codec = require('../mc/chunk.js');
  const oracleStates = new Uint32Array(24 * 4096);
  const stateIndex = (x, y, z) => (y + 64) * 256 + z * 16 + x;
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      oracleStates[stateIndex(x, -64, z)] = mc21.blocksByName.bedrock.defaultState;
      oracleStates[stateIndex(x, -63, z)] = mc21.blocksByName.dirt.defaultState;
      oracleStates[stateIndex(x, -62, z)] = mc21.blocksByName.dirt.defaultState;
      oracleStates[stateIndex(x, -61, z)] = mc21.blocksByName.grass_block.defaultState;
    }
  }
  const oraclePacket = codec.encodeMapChunk({
    x: 0,
    z: 0,
    stateIds: oracleStates,
    biomeId: mc21.biomesByName.plains.id
  });
  if (!oraclePacket.chunkData.equals(fixtureBytes)) {
    let offset = 0;
    while (offset < fixtureBytes.length && oraclePacket.chunkData[offset] === fixtureBytes[offset]) offset += 1;
    fail('E_CHUNK_FIXTURE_BYTES', { offset, ours: oraclePacket.chunkData.length, vanilla: fixtureBytes.length });
  }
  if (String(oraclePacket.heightmaps[0].data[0]) !== fixture.expected.worldSurfaceFirstLong) {
    fail('E_CHUNK_FIXTURE_HEIGHTMAP', {
      ours: String(oraclePacket.heightmaps[0].data[0]),
      vanilla: fixture.expected.worldSurfaceFirstLong
    });
  }

  const unloadPackets = capturePackets('map_chunk', { x: 4, z: -5, groundUp: true, bitMap: 0, chunkData: [] });
  const unload = firstPacket(unloadPackets, 'unload_chunk');
  if (!unload || unload.data.chunkX !== 4 || unload.data.chunkZ !== -5) {
    fail('E_CHUNK_UNLOAD', unload && unload.data);
  }

  const deferredReal = createStubReal();
  const deferredClient = new LegacyClient(deferredReal);
  const farChunk = makeLegacyChunk();
  deferredClient.write('map_chunk', {
    x: 40,
    z: -40,
    groundUp: true,
    bitMap: farChunk.getMask(),
    chunkData: farChunk.dump()
  });
  if (deferredReal.writes.some((write) => write.name === 'map_chunk')) {
    fail('E_CHUNK_DEFER', 'far chunk was sent before the view center moved');
  }
  if (deferredClient.mapChunkWrites !== 0) fail('E_CHUNK_DEFER_COUNT', deferredClient.mapChunkWrites);
  deferredClient.write('position', { x: 40 * 16 + 8, y: 64, z: -40 * 16 + 8, yaw: 0, pitch: 0 });
  const flushed = deferredReal.writes.filter((write) => write.name === 'map_chunk');
  if (flushed.length !== 1) fail('E_CHUNK_FLUSH', flushed.length);
  if (deferredClient.mapChunkWrites !== 1) fail('E_CHUNK_FLUSH_COUNT', deferredClient.mapChunkWrites);
  deferredClient.write('map_chunk', { x: 4, z: -5, groundUp: true, bitMap: 0, chunkData: [] });
  if (deferredClient.mapChunkWrites !== 1) fail('E_CHUNK_UNLOAD_COUNT', deferredClient.mapChunkWrites);

  const flags = { chunkFieldsExact: failures.length === 0 ? 1 : 0 };
  return {
    flags,
    failures,
    decoded: {
      heightmapCount: data.heightmaps && data.heightmaps[0] && data.heightmaps[0].data && data.heightmaps[0].data.length,
      heightmapFirst: data.heightmaps && data.heightmaps[0] && data.heightmaps[0].data
        ? unpackHeightmap(data.heightmaps[0].data, 1)[0] : null,
      skyMask: skyMask === null ? null : String(skyMask),
      skyLightSections: data.skyLight && data.skyLight.length,
      unload: unload && unload.data
    }
  };
}

function validateEntityUuids() {
  const failures = [];
  const real = createStubReal();
  const client = new LegacyClient(real);
  client.write('spawn_entity', { entityId: 'alpha', type: 54, x: 0, y: 0, z: 0 });
  client.write('spawn_entity', { entityId: 'beta', type: 54, x: 0, y: 0, z: 0 });
  const spawns = real.writes
    .filter((write) => write.name === 'spawn_entity')
    .map((write) => write.data.objectUUID);
  if (spawns.length !== 2) {
    failures.push({ code: 'E_ENTITY_SPAWN_COUNT', detail: spawns.length });
  } else if (spawns[0] === spawns[1]) {
    failures.push({ code: 'E_ENTITY_UUID_DUPLICATE', detail: spawns });
  } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(spawns[0])) {
    failures.push({ code: 'E_ENTITY_UUID_FORMAT', detail: spawns[0] });
  }
  return {
    flags: { entityUuidsUnique: failures.length === 0 ? 1 : 0 },
    failures,
    decoded: { spawns }
  };
}

function validateSignFields() {
  const failures = [];
  const fail = (code, detail) => failures.push({ code, detail });
  const packets = capturePackets('update_sign', {
    location: { x: 10, y: 70, z: -4 },
    text1: JSON.stringify({ text: 'Line one' }),
    text2: JSON.stringify({ text: 'Line two' }),
    text3: JSON.stringify({ text: '' }),
    text4: JSON.stringify({ text: 'Line four' })
  });
  const sign = firstPacket(packets, 'tile_entity_data');
  if (!sign) {
    fail('E_SIGN_PACKET_MISSING', packets.map((packet) => packet.name));
    return { flags: { signFieldsExact: 0 }, failures, decoded: { packetNames: packets.map((packet) => packet.name) } };
  }
  const data = sign.data;
  const frozenTypes = frozenBlockEntityTypes();
  if (frozenTypes.dispenser !== 7 || frozenTypes.sign !== 8) {
    fail('E_BLOCK_ENTITY_FIXTURE', frozenTypes);
  }
  if (data.action !== LegacyClient.SIGN_BLOCK_ENTITY_TYPE || data.action !== frozenTypes.sign) {
    fail('E_SIGN_ACTION', {
      adapterConstant: LegacyClient.SIGN_BLOCK_ENTITY_TYPE,
      frozenSignType: frozenTypes.sign,
      actual: data.action
    });
  }
  if (!data.location || data.location.x !== 10 || data.location.y !== 70 || data.location.z !== -4) {
    fail('E_SIGN_LOCATION', data.location);
  }
  const root = data.nbtData && data.nbtData.value;
  if (!root || root.id && root.id.value !== 'minecraft:sign') fail('E_SIGN_NBT_ID', root && root.id);
  if (!root || !root.isWaxed || root.isWaxed.value !== 0) fail('E_SIGN_WAXED', root && root.isWaxed);
  const front = root && root.front_text;
  if (!front) {
    fail('E_SIGN_FRONT_MISSING');
  } else {
    if (nbtCompoundText({ type: 'compound', value: front.value }) !== null) {
      // front_text has no text field; messages are checked below.
    }
    const messages = nbtMessages(front);
    if (JSON.stringify(messages) !== JSON.stringify(['Line one', 'Line two', '', 'Line four'])) {
      fail('E_SIGN_MESSAGES', messages);
    }
    if (front.value.color && front.value.color.value !== 'black') fail('E_SIGN_COLOR', front.value.color);
    if (!front.value.has_glowing_text || front.value.has_glowing_text.value !== 0) {
      fail('E_SIGN_GLOW', front.value.has_glowing_text);
    }
  }
  const back = root && root.back_text;
  if (!back || JSON.stringify(nbtMessages(back)) !== JSON.stringify(['', '', '', ''])) {
    fail('E_SIGN_BACK', back && nbtMessages(back));
  }
  const flags = { signFieldsExact: failures.length === 0 ? 1 : 0 };
  return {
    flags,
    failures,
    decoded: {
      action: data.action,
      location: data.location,
      frontMessages: front && nbtMessages(front),
      backMessages: back && nbtMessages(back)
    }
  };
}

function decodeEquipmentWrites(client) {
  const real = client.real;
  real.writes.length = 0;
  for (const legacySlot of [0, 1, 2, 3, 4]) {
    client.write('entity_equipment', {
      entityId: 42,
      slot: legacySlot,
      item: { blockId: 276, itemCount: 1, itemDamage: 0 }
    });
  }
  return real.writes
    .filter((write) => write.name === 'entity_equipment')
    .map((write) => decodeWrite(write));
}

function validateEquipmentFields(client) {
  const failures = [];
  const fail = (code, detail) => failures.push({ code, detail });
  const packets = decodeEquipmentWrites(client || new LegacyClient(createStubReal()));
  if (packets.length !== 5) fail('E_EQUIPMENT_COUNT', packets.length);
  const observed = [];
  for (let index = 0; index < packets.length; index++) {
    const packet = packets[index];
    const equipment = packet.equipments && packet.equipments[0];
    const legacySlot = index;
    observed.push({ legacySlot, slot: equipment && equipment.slot, item: equipment && equipment.item });
    if (!equipment || equipment.slot !== EXPECTED_EQUIPMENT_SLOTS[legacySlot]) {
      fail('E_EQUIPMENT_SLOT_MISMATCH', {
        legacySlot,
        expected: EXPECTED_EQUIPMENT_SLOTS[legacySlot],
        actual: equipment && equipment.slot
      });
    }
    if (!equipment || !equipment.item || equipment.item.itemCount !== 1 ||
        equipment.item.itemId !== mc21.itemsByName.diamond_sword.id) {
      fail('E_EQUIPMENT_ITEM', equipment && equipment.item);
    }
  }
  return {
    flags: { equipmentSlotsExact: failures.length === 0 ? 1 : 0 },
    failures,
    decoded: observed
  };
}

function validateInventoryFields() {
  const failures = [];
  const fail = (code, detail) => failures.push({ code, detail });
  const real = createStubReal();
  const client = new LegacyClient(real);
  client.write('open_window', {
    windowId: 1,
    inventoryType: 'minecraft:chest',
    windowTitle: JSON.stringify({ text: 'Chest' }),
    slotCount: 27
  });
  client.write('window_items', { windowId: 0, items: [{ blockId: 1, itemCount: 5, itemDamage: 0 }] });
  client.write('set_slot', { windowId: 0, slot: 36, item: { blockId: 1, itemCount: 1, itemDamage: 0 } });
  client.write('window_items', { windowId: 0, items: [] });
  client.write('set_slot', { windowId: -1, slot: -1, item: { blockId: -1 } });
  client.write('open_window', {
    windowId: 255,
    inventoryType: 'minecraft:container',
    windowTitle: JSON.stringify({ text: 'Custom' }),
    slotCount: 45
  });
  const decoded = real.writes.map((write) => ({ name: write.name, data: decodeWrite(write) }));
  const opens = decoded.filter((packet) => packet.name === 'open_window');
  const windows = decoded.filter((packet) => packet.name === 'window_items');
  const sets = decoded.filter((packet) => packet.name === 'set_slot');
  const cursors = decoded.filter((packet) => packet.name === 'set_cursor_item');

  if (opens.length !== 2) fail('E_OPEN_WINDOW_COUNT', opens.length);
  if (opens[0] && (opens[0].data.inventoryType !== 2 ||
      nbtCompoundText(opens[0].data.windowTitle) !== 'Chest')) {
    fail('E_OPEN_WINDOW_CHEST', opens[0] && opens[0].data);
  }
  if (opens[1] && (opens[1].data.inventoryType !== 4 ||
      nbtCompoundText(opens[1].data.windowTitle) !== 'Custom')) {
    fail('E_OPEN_WINDOW_CUSTOM', opens[1] && opens[1].data);
  }
  if (windows.length !== 2) {
    fail('E_WINDOW_ITEMS_COUNT', windows.length);
  } else {
    if (windows[0].data.windowId !== 0 || windows[0].data.stateId !== 1 ||
        !Array.isArray(windows[0].data.items) || windows[0].data.items.length !== 1 ||
        windows[0].data.items[0].itemCount !== 5 ||
        windows[0].data.carriedItem.itemCount !== 0) {
      fail('E_WINDOW_ITEMS_FIRST', windows[0].data);
    }
    if (windows[1].data.windowId !== 0 || windows[1].data.stateId !== 2 ||
        !Array.isArray(windows[1].data.items) || windows[1].data.items.length !== 0) {
      fail('E_WINDOW_ITEMS_SECOND', windows[1].data);
    }
  }
  if (sets.length !== 1) {
    fail('E_SET_SLOT_COUNT', sets.length);
  } else if (sets[0].data.windowId !== 0 || sets[0].data.stateId !== 1 ||
      sets[0].data.slot !== 36 || sets[0].data.item.itemCount !== 1) {
    fail('E_SET_SLOT_FIELDS', sets[0].data);
  }
  if (cursors.length !== 1 || cursors[0].data.contents.itemCount !== 0) {
    fail('E_SET_CURSOR_ITEM', cursors[0] && cursors[0].data);
  }
  return {
    flags: { inventoryStateExact: failures.length === 0 ? 1 : 0 },
    failures,
    decoded: {
      openWindowTypes: opens.map((packet) => packet.data.inventoryType),
      windowStateIds: windows.map((packet) => packet.data.stateId),
      setSlotStateId: sets[0] && sets[0].data.stateId,
      cursorCleared: cursors.length
    }
  };
}

function validateScoreboardFields() {
  const failures = [];
  const fail = (code, detail) => failures.push({ code, detail });
  const objectiveAdd = firstPacket(capturePackets('scoreboard_objective', {
    name: 'scoreboard',
    action: 0,
    displayText: JSON.stringify({ text: 'Title', color: 'gold' }),
    type: 'INTEGER'
  }), 'scoreboard_objective');
  const objectiveRemove = firstPacket(capturePackets('scoreboard_objective', {
    name: 'scoreboard',
    action: 1
  }), 'scoreboard_objective');
  const display = firstPacket(capturePackets('scoreboard_display_objective', {
    position: 1,
    name: 'scoreboard'
  }), 'scoreboard_display_objective');
  const score = firstPacket(capturePackets('scoreboard_score', {
    scoreName: 'scoreboard',
    itemName: 'line',
    action: 0,
    value: 3
  }), 'scoreboard_score');
  const teamAdd = firstPacket(capturePackets('scoreboard_team', {
    team: 't1',
    mode: 0,
    name: 'Team',
    prefix: 'P',
    suffix: 'S',
    friendlyFire: true,
    nameTagVisibility: 'all',
    color: 0,
    players: ['Tester']
  }), 'teams');
  const teamChange = firstPacket(capturePackets('scoreboard_team', {
    team: 't1',
    mode: 2,
    name: 'Team2',
    prefix: 'P2',
    suffix: 'S2',
    friendlyFire: false,
    color: 3
  }), 'teams');
  const teamRemove = firstPacket(capturePackets('scoreboard_team', { team: 't1', mode: 1 }), 'teams');
  const teamJoin = firstPacket(capturePackets('scoreboard_team', {
    team: 't1', mode: 3, players: ['Tester', 'Other']
  }), 'teams');
  const teamLeave = firstPacket(capturePackets('scoreboard_team', {
    team: 't1', mode: 4, players: ['Tester']
  }), 'teams');

  if (!objectiveAdd || objectiveAdd.data.name !== 'scoreboard' || objectiveAdd.data.action !== 0 ||
      objectiveAdd.data.type !== 0 || nbtCompoundText(objectiveAdd.data.displayText) !== 'Title') {
    fail('E_SCOREBOARD_OBJECTIVE_ADD', objectiveAdd && objectiveAdd.data);
  }
  if (!objectiveRemove || objectiveRemove.data.action !== 1 || objectiveRemove.data.name !== 'scoreboard') {
    fail('E_SCOREBOARD_OBJECTIVE_REMOVE', objectiveRemove && objectiveRemove.data);
  }
  if (!display || display.data.position !== 1 || display.data.name !== 'scoreboard') {
    fail('E_SCOREBOARD_DISPLAY', display && display.data);
  }
  if (!score || score.data.itemName !== 'line' || score.data.scoreName !== 'scoreboard' ||
      score.data.value !== 3 || score.data.display_name !== undefined ||
      score.data.number_format !== undefined) {
    fail('E_SCOREBOARD_SCORE', score && score.data);
  }
  if (!teamAdd || teamAdd.data.team !== 't1' || teamAdd.data.mode !== 'add' ||
      nbtCompoundText(teamAdd.data.name) !== 'Team' ||
      !teamAdd.data.flags || teamAdd.data.flags.friendly_fire !== true ||
      teamAdd.data.flags.see_friendly_invisible !== false ||
      teamAdd.data.nameTagVisibility !== 'always' || teamAdd.data.collisionRule !== 'always' ||
      teamAdd.data.formatting !== 0 ||
      nbtCompoundText(teamAdd.data.prefix) !== 'P' ||
      nbtCompoundText(teamAdd.data.suffix) !== 'S' ||
      JSON.stringify(teamAdd.data.players) !== JSON.stringify(['Tester'])) {
    fail('E_TEAM_ADD', teamAdd && teamAdd.data);
  }
  if (!teamChange || teamChange.data.mode !== 'change' ||
      nbtCompoundText(teamChange.data.name) !== 'Team2' ||
      teamChange.data.flags.friendly_fire !== false ||
      teamChange.data.formatting !== 3 ||
      nbtCompoundText(teamChange.data.prefix) !== 'P2') {
    fail('E_TEAM_CHANGE', teamChange && teamChange.data);
  }
  if (!teamRemove || teamRemove.data.mode !== 'remove' || teamRemove.data.team !== 't1') {
    fail('E_TEAM_REMOVE', teamRemove && teamRemove.data);
  }
  if (!teamJoin || teamJoin.data.mode !== 'join' ||
      JSON.stringify(teamJoin.data.players) !== JSON.stringify(['Tester', 'Other'])) {
    fail('E_TEAM_JOIN', teamJoin && teamJoin.data);
  }
  if (!teamLeave || teamLeave.data.mode !== 'leave' ||
      JSON.stringify(teamLeave.data.players) !== JSON.stringify(['Tester'])) {
    fail('E_TEAM_LEAVE', teamLeave && teamLeave.data);
  }
  return {
    flags: { scoreboardFieldsExact: failures.length === 0 ? 1 : 0 },
    failures,
    decoded: {
      objective: objectiveAdd && objectiveAdd.data,
      display: display && display.data,
      score: score && score.data,
      teamAdd: teamAdd && teamAdd.data,
      teamJoin: teamJoin && teamJoin.data
    }
  };
}

function validateSoundParticleFields() {
  const failures = [];
  const fail = (code, detail) => failures.push({ code, detail });
  const observed = {};
  for (const [legacyName, modernName] of Object.entries(LegacyClient.SOUND_MAP)) {
    const packet = firstPacket(capturePackets('named_sound_effect', {
      soundName: legacyName,
      x: 0, y: 80, z: 0, volume: 1, pitch: 1
    }), 'sound_effect');
    const expectedId = mc21.soundsByName[modernName] && mc21.soundsByName[modernName].id;
    observed[legacyName] = packet && packet.data.sound && packet.data.sound.soundId;
    if (!packet || !expectedId || packet.data.sound.soundId !== expectedId) {
      fail('E_SOUND_ID', { legacyName, modernName, expectedId, actual: observed[legacyName] });
    }
  }

  const crit = firstPacket(capturePackets('world_particles', {
    texture: 'crit', pos1: [1, 70, 1], manualEmitCount: 4
  }), 'world_particles');
  const block = firstPacket(capturePackets('world_particles', {
    texture: 'blockcrack', pos1: [1, 70, 1], manualEmitCount: 8, blockState: mc21.blocksByName.stone.defaultState
  }), 'world_particles');
  const dust = firstPacket(capturePackets('world_particles', {
    texture: 'reddust', pos1: [1, 70, 1], manualEmitCount: 2, color: 0xff0000, scale: 0.5
  }), 'world_particles');
  const fallback = firstPacket(capturePackets('world_particles', {
    texture: 'unknown_particle', pos1: [1, 70, 1], manualEmitCount: 1
  }), 'world_particles');
  if (!crit || crit.data.particle.type !== 'crit' || crit.data.amount !== 4) {
    fail('E_PARTICLE_CRIT', crit && crit.data);
  }
  if (!block || block.data.particle.type !== 'block' ||
      block.data.particle.data !== mc21.blocksByName.stone.defaultState) {
    fail('E_PARTICLE_BLOCK', block && block.data);
  }
  if (!dust || dust.data.particle.type !== 'dust' ||
      !dust.data.particle.data || dust.data.particle.data.color !== 0xff0000 ||
      dust.data.particle.data.scale !== 0.5) {
    fail('E_PARTICLE_DUST', dust && dust.data);
  }
  if (!fallback || fallback.data.particle.type !== LegacyClient.PARTICLE_FALLBACK) {
    fail('E_PARTICLE_FALLBACK', fallback && fallback.data);
  }

  // Unknown sounds must surface as write errors, never be silently dropped.
  const real = createStubReal();
  const callbacks = [];
  const client = new LegacyClient(real, { onWriteError: (record) => callbacks.push(record) });
  const events = [];
  client.on('write_error', (record) => events.push(record));
  client.write('named_sound_effect', { soundName: 'definitely.not.a.sound', x: 0, y: 0, z: 0 });
  if (client.writeErrors.length !== 1 || events.length !== 1 || callbacks.length !== 1 ||
      client.writeErrors[0].message.indexOf('E_UNKNOWN_SOUND') === -1) {
    fail('E_SOUND_UNKNOWN_SWALLOWED', {
      writeErrors: client.writeErrors.length,
      events: events.length,
      callbacks: callbacks.length
    });
  }
  if (real.writes.some((write) => write.name === 'sound_effect')) {
    fail('E_SOUND_UNKNOWN_WRITTEN');
  }
  return {
    flags: { soundIdsExact: failures.length === 0 ? 1 : 0 },
    failures,
    decoded: { sounds: observed, fallback: fallback && fallback.data.particle }
  };
}

function validateMetadataFields() {
  const failures = [];
  const fail = (code, detail) => failures.push({ code, detail });
  const playerMetadata = {
    0: { key: 0, value: 0, type: 0 },
    1: { key: 2, value: 'Custom', type: 4 },
    2: { key: 6, value: 20, type: 3 },
    3: { key: 4, value: 0, type: 0 },
    4: { key: 8, value: 0, type: 0 },
    5: { key: 9, value: 0, type: 0 },
    6: { key: 10, value: 127, type: 0 },
    7: { key: 1, value: 300, type: 1 },
    8: { key: 3, value: 0, type: 0 },
    9: { key: 7, value: 0, type: 2 },
    10: { key: 16, value: 0, type: 0 },
    11: { key: 17, value: 0, type: 3 },
    12: { key: 18, value: 0, type: 2 }
  };
  const expected = {
    0: { type: 'byte', value: 0 },
    1: { type: 'int', value: 300 },
    2: { type: 'optional_component', text: 'Custom' },
    3: { type: 'boolean', value: false },
    4: { type: 'boolean', value: false },
    9: { type: 'float', value: 20 },
    11: { type: 'boolean', value: false },
    12: { type: 'int', value: 0 }
  };
  const real = createStubReal();
  const client = new LegacyClient(real);
  client.entityTypes.set(1, 'player');
  client.write('entity_metadata', { entityId: 1, metadata: playerMetadata });
  const packet = firstPacket(real.writes.map((write) => ({ name: write.name, data: decodeWrite(write) })), 'entity_metadata');
  if (!packet) {
    fail('E_METADATA_PACKET_MISSING');
  } else {
    const byKey = new Map(packet.data.metadata.map((entry) => [entry.key, entry]));
    for (const [key, want] of Object.entries(expected)) {
      const entry = byKey.get(Number(key));
      if (!entry || entry.type !== want.type) {
        fail('E_METADATA_KEY_TYPE', { key, expectedType: want.type, actual: entry && entry.type });
        continue;
      }
      if (want.type === 'optional_component') {
        if (nbtCompoundText(entry.value) !== want.text) {
          fail('E_METADATA_VALUE', { key, expected: want.text, actual: entry.value });
        }
      } else if (entry.value !== want.value) {
        fail('E_METADATA_VALUE', { key, expected: want.value, actual: entry.value });
      }
    }
    if (byKey.size !== Object.keys(expected).length) {
      fail('E_METADATA_KEY_COUNT', { expected: Object.keys(expected).length, actual: byKey.size });
    }
    for (const key of [10, 15, 16, 17, 18]) {
      if (byKey.has(key)) {
        fail('E_METADATA_UNSTABLE_KEY_WRITTEN', { key, entry: byKey.get(key) });
      }
    }
  }

  const dropped = firstPacket((() => {
    const droppedReal = createStubReal();
    const droppedClient = new LegacyClient(droppedReal);
    droppedClient.entityTypes.set(7, 'item');
    droppedClient.write('entity_metadata', {
      entityId: 7,
      metadata: { 0: { key: 10, value: { blockId: 276, itemCount: 1, itemDamage: 0 }, type: 5 } }
    });
    return droppedReal.writes.map((write) => ({ name: write.name, data: decodeWrite(write) }));
  })(), 'entity_metadata');
  const droppedMeta = dropped && dropped.data.metadata.find((entry) => entry.key === 8);
  if (!droppedMeta || droppedMeta.type !== 'item_stack' ||
      !droppedMeta.value || droppedMeta.value.itemId !== mc21.itemsByName.diamond_sword.id ||
      droppedMeta.value.itemCount !== 1) {
    fail('E_METADATA_DROPPED_ITEM', droppedMeta);
  }

  const badReal = createStubReal();
  const badClient = new LegacyClient(badReal);
  const badEvents = [];
  badClient.on('write_error', (record) => badEvents.push(record));
  badClient.write('entity_metadata', {
    entityId: 1,
    metadata: { 0: { key: 31, value: 0, type: 0 } }
  });
  if (badClient.writeErrors.length !== 1 || badEvents.length !== 1 ||
      badClient.writeErrors[0].message.indexOf('E_UNMAPPED_METADATA_KEY') === -1) {
    fail('E_METADATA_UNMAPPED_SWALLOWED', badClient.writeErrors);
  }
  if (badReal.writes.some((write) => write.name === 'entity_metadata')) {
    fail('E_METADATA_UNMAPPED_WRITTEN');
  }
  return {
    flags: { metadataKeysExact: failures.length === 0 ? 1 : 0 },
    failures,
    decoded: {
      playerKeys: packet ? packet.data.metadata.map((entry) => ({ key: entry.key, type: entry.type })) : null,
      droppedItem: droppedMeta || null
    }
  };
}

class ConsoleOnlyErrorClient extends LegacyClient {
  _recordWriteError(name, data, error) {
    console.error(`[mc] failed to write ${name}:`, error && error.message ? error.message : String(error));
  }
}

class WrongEquipmentClient extends LegacyClient {
  _entityEquipment(data) {
    this.real.write('entity_equipment', {
      entityId: data.entityId,
      equipments: [{ slot: Number(data.slot), item: this._itemStack(data.item) }]
    });
  }
}

function writeSurfacingResult(factory) {
  const real = createStubReal();
  real.write = () => { throw new Error('injected adapter write failure'); };
  const callbacks = [];
  const events = [];
  const client = factory
    ? factory(real)
    : new LegacyClient(real, { onWriteError: (record) => callbacks.push(record) });
  client.on('write_error', (record) => events.push(record));
  let threw = false;
  try {
    client.write('chat', { message: 'hello' });
  } catch (error) {
    threw = true;
  }
  const surfaced = client.writeErrors.length > 0 && events.length > 0 &&
    (factory ? true : callbacks.length > 0);
  return {
    surfaced,
    flags: {
      writeFailuresSurfaced: surfaced ? 1 : 0,
      swallowedWriteErrors: surfaced ? 0 : 1,
      writeErrorThrew: threw ? 1 : 0
    },
    observed: {
      writeErrors: client.writeErrors.length,
      events: events.length,
      callbacks: callbacks.length
    }
  };
}

function validateVocabulary(options = {}) {
  const scan = options.scan || scanHandlerVocabulary();
  const golden = options.golden || frozenHandlerVocabulary();
  const manifest = options.manifest || buildVocabularyManifest(scan);
  const failures = [];
  const fail = (code, detail) => failures.push({ code, detail });
  const handlerWrites = countScannedWrites(scan);
  const handlerReads = scan.reads.length;

  // Independent frozen golden: the current scan must match this file exactly.
  // Deleting, adding or moving a client.write/client.on call site changes a
  // key here and fails vocabulary even though the runtime manifest is derived
  // from the same scan.
  const goldenWrites = new Map((golden.writes || []).map((entry) => [vocabularyKey(entry), entry]));
  const goldenReads = new Map((golden.reads || []).map((entry) => [vocabularyKey(entry), entry]));
  for (const entry of golden.writes || []) {
    if (entry.kind !== 'write') fail('E_GOLDEN_KIND', { direction: 'write', ...entry });
  }
  for (const entry of golden.reads || []) {
    if (entry.kind !== 'read') fail('E_GOLDEN_KIND', { direction: 'read', ...entry });
  }
  const scannedWrites = new Map();
  for (const call of scan.writes) {
    for (const name of call.names) {
      const entry = { file: call.file, line: call.line, legacyName: name, kind: 'write' };
      scannedWrites.set(vocabularyKey(entry), entry);
    }
  }
  const scannedReads = new Map(scan.reads.map((call) => {
    const entry = { file: call.file, line: call.line, legacyName: call.name, kind: 'read' };
    return [vocabularyKey(entry), entry];
  }));
  for (const [key, entry] of goldenWrites) {
    if (!scannedWrites.has(key)) {
      fail('E_MISSING_CASE', { direction: 'write', key, ...entry });
    }
  }
  for (const [key, entry] of scannedWrites) {
    if (!goldenWrites.has(key)) {
      fail('E_UNEXPECTED_CASE', { direction: 'write', key, ...entry });
    }
  }
  for (const [key, entry] of goldenReads) {
    if (!scannedReads.has(key)) {
      fail('E_MISSING_CASE', { direction: 'read', key, ...entry });
    }
  }
  for (const [key, entry] of scannedReads) {
    if (!goldenReads.has(key)) {
      fail('E_UNEXPECTED_CASE', { direction: 'read', key, ...entry });
    }
  }
  if (golden.handlerWriteCount !== goldenWrites.size) {
    fail('E_GOLDEN_WRITE_COUNT', { declared: golden.handlerWriteCount, actual: goldenWrites.size });
  }
  if (golden.handlerReadCount !== goldenReads.size) {
    fail('E_GOLDEN_READ_COUNT', { declared: golden.handlerReadCount, actual: goldenReads.size });
  }
  const goldenExact = failures.length === 0 &&
    golden.handlerWriteCount === handlerWrites &&
    golden.handlerReadCount === handlerReads;

  const seenWriteKeys = new Set();
  let unhandled = 0;
  let mapped = 0;
  let noops = 0;
  let noopsLedgerListed = 0;
  for (const entry of manifest.writeEntries) {
    const key = vocabularyKey(entry);
    seenWriteKeys.add(key);
    if (!entry.mapped) {
      unhandled += 1;
      fail('E_UNHANDLED_WRITE', entry);
      continue;
    }
    mapped += 1;
    if (entry.noop) {
      noops += 1;
      const ledger = LegacyClient.NOOP_LEDGER[entry.ledger];
      if (ledger && ledger.reason && ledger.args) {
        noopsLedgerListed += 1;
      } else {
        fail('E_UNEXPLAINED_NOOP', entry);
      }
    } else if (!entry.packet && entry.expands.length === 0) {
      unhandled += 1;
      fail('E_UNHANDLED_WRITE', entry);
    }
  }
  for (const [key, entry] of scannedWrites) {
    if (!seenWriteKeys.has(key)) {
      fail('E_MISSING_CASE', { direction: 'write', key, ...entry });
    }
  }
  for (const entry of manifest.writeEntries) {
    if (!scannedWrites.has(vocabularyKey(entry))) fail('E_STALE_CASE', entry);
  }

  const seenReadKeys = new Set();
  let unhandledReads = 0;
  for (const entry of manifest.readEntries) {
    seenReadKeys.add(vocabularyKey(entry));
    if (!entry.mapped) {
      unhandledReads += 1;
      fail('E_UNHANDLED_READ', entry);
    }
  }
  for (const [key, entry] of scannedReads) {
    if (!seenReadKeys.has(key)) {
      fail('E_MISSING_CASE', { direction: 'read', key, ...entry });
    }
  }

  for (const [name, disposition] of Object.entries(LegacyClient.WRITE_DISPOSITIONS)) {
    if (!disposition.noop) continue;
    const ledger = LegacyClient.NOOP_LEDGER[disposition.ledger];
    if (!ledger || !ledger.reason || !ledger.args) {
      fail('E_NOOP_NOT_LEDGERED', { name, disposition });
    }
  }

  const surfacing = writeSurfacingResult();
  if (surfacing.flags.writeFailuresSurfaced !== 1) fail('E_WRITE_ERROR_NOT_SURFACED', surfacing.observed);

  const flags = {
    handlerWrites,
    handlerWriteCount: manifest.handlerWriteCount,
    handlerReads,
    handlerReadCount: manifest.handlerReadCount,
    goldenWriteCount: golden.handlerWriteCount,
    goldenReadCount: golden.handlerReadCount,
    goldenExact: goldenExact ? 1 : 0,
    mapped,
    unhandled,
    unhandledReads,
    swallowedWriteErrors: surfacing.flags.swallowedWriteErrors,
    noopsAllLedgerListed: noops === noopsLedgerListed ? 1 : 0,
    noops,
    writeErrorThrew: surfacing.flags.writeErrorThrew
  };
  if (handlerWrites !== manifest.handlerWriteCount) {
    fail('E_HANDLER_WRITE_COUNT', { handlerWrites, manifestWriteCount: manifest.handlerWriteCount });
  }
  if (handlerReads !== manifest.handlerReadCount) {
    fail('E_HANDLER_READ_COUNT', { handlerReads, manifestReadCount: manifest.handlerReadCount });
  }
  if (handlerWrites <= 0) fail('E_NO_HANDLER_WRITES');
  if (mapped !== handlerWrites) fail('E_MAPPED_COUNT', { mapped, handlerWrites });
  if (unhandled !== 0) fail('E_UNHANDLED_WRITES', unhandled);
  if (unhandledReads !== 0) fail('E_UNHANDLED_READS', unhandledReads);
  if (flags.noopsAllLedgerListed !== 1) fail('E_NOOPS_NOT_LEDGERED');
  if (flags.goldenExact !== 1) fail('E_GOLDEN_MISMATCH', { handlerWrites, handlerReads });

  return { scan, manifest, golden, flags, failures, surfacing };
}

async function validateRealClientPackets() {
  const failures = [];
  const fail = (code, detail) => failures.push({ code, detail });
  const captured = {};
  const runtime = [];
  let server;
  let client;
  let port = null;
  let sendPackets = null;
  let signalJoin;
  const joined = new Promise((resolve) => { signalJoin = resolve; });

  try {
    server = createServer({ 'online-mode': false, port: 0, version: '1.21.11', motd: 'vocabulary-test' });
    server.on('error', (error) => runtime.push({ source: 'server', message: error.message }));
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
    port = server.socketServer.address().port;

    server.on('playerJoin', (rawClient) => {
      const adapter = new LegacyClient(rawClient);
      adapter.on('error', (error) => runtime.push({ source: 'adapter', message: error.message }));
      adapter.write('login', {});
      sendPackets = () => {
        const chunk = makeLegacyChunk();
        adapter.write('map_chunk', {
          x: 5, z: 6, groundUp: true, bitMap: chunk.getMask(), chunkData: chunk.dump()
        });
        adapter.write('update_sign', {
          location: { x: 5, y: 70, z: 6 },
          text1: JSON.stringify({ text: 'Real one' }),
          text2: JSON.stringify({ text: 'Real two' }),
          text3: JSON.stringify({ text: '' }),
          text4: JSON.stringify({ text: 'Real four' })
        });
        adapter.write('entity_equipment', {
          entityId: 42, slot: 1, item: { blockId: 276, itemCount: 1, itemDamage: 0 }
        });
        adapter.write('open_window', {
          windowId: 1, inventoryType: 'minecraft:chest',
          windowTitle: JSON.stringify({ text: 'Real Chest' }), slotCount: 27
        });
        adapter.write('window_items', { windowId: 0, items: [{ blockId: 1, itemCount: 5, itemDamage: 0 }] });
        adapter.write('set_slot', { windowId: 0, slot: 36, item: { blockId: 1, itemCount: 1, itemDamage: 0 } });
        adapter.write('scoreboard_objective', {
          name: 'scoreboard', action: 0,
          displayText: JSON.stringify({ text: 'Real Title' }), type: 'INTEGER'
        });
        adapter.write('scoreboard_score', {
          scoreName: 'scoreboard', itemName: 'real-line', action: 0, value: 9
        });
        adapter.write('scoreboard_team', {
          team: 'real-team', mode: 0, name: 'Real Team', prefix: 'R', suffix: 'T',
          friendlyFire: true, nameTagVisibility: 'all', color: 0, players: ['Tester']
        });
      };
      signalJoin();
    });

    client = createClient({
      host: 'localhost', port, username: 'VocabTester', version: '1.21.11', auth: 'offline'
    });
    client.on('packet', (data, meta) => {
      if (!meta || !VOCAB_PACKET_NAMES.includes(meta.name)) return;
      if (!captured[meta.name]) captured[meta.name] = [];
      captured[meta.name].push(data);
    });
    client.on('error', (error) => runtime.push({ source: 'client', message: error.message }));

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting for client login')), 8000);
      const onLogin = () => {
        clearTimeout(timer);
        client.removeListener('error', onError);
        resolve();
      };
      const onError = (error) => {
        clearTimeout(timer);
        client.removeListener('login', onLogin);
        reject(error);
      };
      client.once('login', onLogin);
      client.once('error', onError);
    });
    await Promise.race([
      joined,
      delay(8000).then(() => { throw new Error('timeout waiting for playerJoin'); })
    ]);
    if (typeof sendPackets !== 'function') throw new Error('real packet writer was not initialized');
    sendPackets();
    await waitUntil(
      () => ['map_chunk', 'tile_entity_data', 'entity_equipment', 'open_window',
        'window_items', 'set_slot', 'scoreboard_objective', 'scoreboard_score', 'teams']
        .every((name) => captured[name] && captured[name].length > 0),
      10000,
      'real 1.21.11 vocabulary packets'
    );
    await delay(100);
  } catch (error) {
    runtime.push({ source: 'harness', message: error.message });
  } finally {
    if (client) {
      try { client.end(); } catch (_error) { /* exit code is already final */ }
    }
    await delay(50);
    if (server) {
      try { server.close(); } catch (_error) { /* exit code is final */ }
    }
  }

  for (const error of runtime) fail('E_VOCABULARY_RUNTIME', error);

  const map = captured.map_chunk && captured.map_chunk[0];
  if (map) {
    const heightmaps = Array.isArray(map.heightmaps) ? map.heightmaps : [];
    if (heightmaps.length !== 3) fail('E_REAL_CHUNK_HEIGHTMAP_COUNT', heightmaps.length);
    for (const heightmap of heightmaps) {
      if (!heightmap || heightmap.data.length !== 37) fail('E_REAL_CHUNK_HEIGHTMAP', heightmap && heightmap.data.length);
    }
    if (!map.skyLight || map.skyLight.length !== 20) fail('E_REAL_CHUNK_SKY_LIGHT', map.skyLight && map.skyLight.length);
    if (!map.skyLightMask || map.skyLightMask.length !== 1 || bitCount(BigInt.asUintN(64, BigInt(map.skyLightMask[0])), 26) !== 20) {
      fail('E_REAL_CHUNK_SKY_MASK', map.skyLightMask);
    }
  } else {
    fail('E_REAL_CHUNK_MISSING');
  }
  const sign = captured.tile_entity_data && captured.tile_entity_data[0];
  if (sign) {
    const messages = sign.nbtData && sign.nbtData.value && sign.nbtData.value.front_text
      ? nbtMessages(sign.nbtData.value.front_text) : null;
    const frozenSignType = frozenBlockEntityTypes().sign;
    if (sign.action !== frozenSignType ||
        JSON.stringify(messages) !== JSON.stringify(['Real one', 'Real two', '', 'Real four'])) {
      fail('E_REAL_SIGN', { action: sign.action, frozenSignType, messages });
    }
  } else {
    fail('E_REAL_SIGN_MISSING');
  }
  const equipment = captured.entity_equipment && captured.entity_equipment[0];
  if (!equipment || !equipment.equipments || equipment.equipments[0].slot !== 2) {
    fail('E_REAL_EQUIPMENT', equipment);
  }
  const windowItems = captured.window_items && captured.window_items[0];
  const setSlot = captured.set_slot && captured.set_slot[0];
  if (!windowItems || windowItems.stateId !== 1 ||
      !setSlot || setSlot.stateId !== 1 || setSlot.slot !== 36) {
    fail('E_REAL_INVENTORY', { windowItems, setSlot });
  }
  const objective = captured.scoreboard_objective && captured.scoreboard_objective[0];
  const score = captured.scoreboard_score && captured.scoreboard_score[0];
  if (!objective || objective.action !== 0 || nbtCompoundText(objective.displayText) !== 'Real Title' ||
      !score || score.value !== 9 || score.itemName !== 'real-line') {
    fail('E_REAL_SCOREBOARD', { objective, score });
  }
  const team = captured.teams && captured.teams[0];
  if (!team || team.mode !== 'add' || nbtCompoundText(team.name) !== 'Real Team' ||
      JSON.stringify(team.players) !== JSON.stringify(['Tester'])) {
    fail('E_REAL_TEAM', team);
  }

  return {
    flags: { realClientFieldsExact: failures.length === 0 ? 1 : 0 },
    failures,
    decoded: {
      packetNames: Object.keys(captured),
      chunkSkyMask: map && map.skyLightMask && String(map.skyLightMask[0]),
      signAction: sign && sign.action,
      signMessages: sign && sign.nbtData && sign.nbtData.value && sign.nbtData.value.front_text
        ? nbtMessages(sign.nbtData.value.front_text) : null,
      equipmentSlot: equipment && equipment.equipments && equipment.equipments[0].slot,
      windowStateId: windowItems && windowItems.stateId,
      setSlotStateId: setSlot && setSlot.stateId,
      teamPlayers: team && team.players
    }
  };
}

async function runVocabulary() {
  const vocabulary = validateVocabulary();
  const chunk = validateChunkFields();
  const entityUuids = validateEntityUuids();
  const sign = validateSignFields();
  const equipment = validateEquipmentFields();
  const inventory = validateInventoryFields();
  const scoreboard = validateScoreboardFields();
  const sound = validateSoundParticleFields();
  const metadata = validateMetadataFields();
  const real = await validateRealClientPackets();
  const fieldResults = { chunk, entityUuids, sign, equipment, inventory, scoreboard, sound, metadata, real };
  const failures = vocabulary.failures.slice();
  for (const result of Object.values(fieldResults)) failures.push(...result.failures);
  const flags = {
    ...vocabulary.flags,
    ...chunk.flags,
    ...sign.flags,
    ...equipment.flags,
    ...inventory.flags,
    ...scoreboard.flags,
    ...sound.flags,
    ...metadata.flags,
    ...real.flags
  };
  const ok = failures.length === 0 &&
    flags.handlerWrites === flags.handlerWriteCount &&
    flags.handlerWrites > 0 &&
    flags.mapped === flags.handlerWrites &&
    flags.unhandled === 0 &&
    flags.swallowedWriteErrors === 0 &&
    flags.noopsAllLedgerListed === 1 &&
    flags.chunkFieldsExact === 1 &&
    flags.signFieldsExact === 1 &&
    flags.equipmentSlotsExact === 1 &&
    flags.inventoryStateExact === 1 &&
    flags.scoreboardFieldsExact === 1 &&
    flags.soundIdsExact === 1 &&
    flags.metadataKeysExact === 1 &&
    flags.realClientFieldsExact === 1 &&
    flags.goldenExact === 1;
  printJson({
    ok,
    mode: 'vocabulary',
    manifest: {
      handlerWriteCount: vocabulary.manifest.handlerWriteCount,
      handlerReadCount: vocabulary.manifest.handlerReadCount,
      goldenWriteCount: vocabulary.golden.handlerWriteCount,
      goldenReadCount: vocabulary.golden.handlerReadCount,
      writeEntries: vocabulary.manifest.writeEntries,
      readEntries: vocabulary.manifest.readEntries
    },
    flags,
    decoded: {
      chunk: chunk.decoded,
      sign: sign.decoded,
      equipment: equipment.decoded,
      inventory: inventory.decoded,
      scoreboard: scoreboard.decoded,
      sound: sound.decoded,
      metadata: metadata.decoded,
      realClient: real.decoded
    },
    failures
  });
  process.exit(ok ? 0 : 1);
}

function vocabularySelfTest(name) {
  let detected = false;
  let code = null;
  let observed = null;
  if (name === 'missing-case') {
    code = 'E_MISSING_CASE';
    const scan = scanHandlerVocabulary();
    const removedCall = scan.writes.find((call) => call.names.length === 1);
    if (!removedCall) {
      printJson({ ok: false, mode: 'self-test', selfTest: name, code: 'E_SELF_TEST_SETUP_FAILED' });
      process.exit(0);
    }
    scan.writes = scan.writes.filter((call) => call !== removedCall);
    const missingKey = vocabularyKey({
      file: removedCall.file,
      line: removedCall.line,
      legacyName: removedCall.names[0]
    });
    const result = validateVocabulary({ scan });
    detected = result.failures.some((failure) =>
      failure.code === code && failure.detail && failure.detail.key === missingKey);
    observed = {
      removedKey: missingKey,
      failures: result.failures.map((failure) => ({ code: failure.code, key: failure.detail && failure.detail.key })),
      flags: result.flags
    };
  } else if (name === 'swallowed-write') {
    code = 'E_WRITE_ERROR_NOT_SURFACED';
    const surfacing = writeSurfacingResult((real) => new ConsoleOnlyErrorClient(real));
    detected = surfacing.flags.swallowedWriteErrors === 1;
    observed = { surfacing };
  } else if (name === 'wrong-equipment-slot') {
    code = 'E_EQUIPMENT_SLOT_MISMATCH';
    const result = validateEquipmentFields(new WrongEquipmentClient(createStubReal()));
    detected = result.failures.some((failure) => failure.code === code);
    observed = { failures: result.failures.map((failure) => failure.code), decoded: result.decoded };
  } else {
    printJson({ ok: false, mode: 'self-test', selfTest: name, code: 'E_UNKNOWN_SELF_TEST' });
    process.exit(2);
  }
  printJson({
    ok: false,
    mode: 'self-test',
    selfTest: name,
    code,
    detected,
    observed
  });
  process.exit(detected ? 1 : 0);
}

function main(argv) {
  const selfIndex = argv.indexOf('--self-test');
  if (selfIndex !== -1) {
    return selfTest(argv[selfIndex + 1]);
  }
  const onlyIndex = argv.indexOf('--only');
  if (onlyIndex !== -1) {
    const category = argv[onlyIndex + 1];
    if (category === 'inbound') return runInbound();
    if (category === 'components') return runComponents();
    if (category === 'titles') return runTitles();
    if (category === 'registry-map') return runRegistryMap();
    if (category === 'item-visuals') return runItemVisuals();
    if (category === 'vocabulary') return runVocabulary();
    if (category !== 'item-components') {
      printJson({ ok: false, code: 'E_UNKNOWN_CATEGORY', category });
      process.exit(2);
    }
  }
  return runItemComponents();
}

const outcome = main(process.argv.slice(2));
if (outcome && typeof outcome.then === 'function') {
  outcome.then(
    (code) => process.exit(code === undefined ? 0 : code),
    (error) => {
      printJson({
        ok: false,
        mode: 'inbound',
        code: 'E_UNCAUGHT',
        error: { name: error.name, message: error.message, stack: error.stack }
      });
      process.exit(1);
    }
  );
}
