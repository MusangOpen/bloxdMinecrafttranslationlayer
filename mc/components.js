'use strict';

/**
 * Legacy JSON chat component -> 1.21.11 anonymous NBT component.
 *
 * The legacy handlers build chat/title/tablist messages as JSON strings (or
 * plain strings) using the 1.8 text component vocabulary. Since 1.20.3 the
 * wire format is NBT, so the full component tree (extra/translate/with/style/
 * events) must be converted instead of keeping only `text`.
 *
 * The conversion is total: malformed JSON, cycles, excessive depth and invalid
 * fields degrade to a plain-text component instead of throwing, because a
 * thrown error here would break the whole Minecraft connection.
 */

const nbt = require('prismarine-nbt');

const MAX_DEPTH = 64;
const MAX_FALLBACK_DEPTH = 512;
const MAX_STRING_LENGTH = 32767;
const MAX_SPANS = 256;

const STYLE_FLAGS = ['bold', 'italic', 'underlined', 'strikethrough', 'obfuscated'];

const COLOR_NAMES = new Set([
	'black', 'dark_blue', 'dark_green', 'dark_aqua', 'dark_red', 'dark_purple',
	'gold', 'gray', 'dark_gray', 'blue', 'green', 'aqua', 'red',
	'light_purple', 'yellow', 'white'
]);

const LEGACY_COLORS = {
	'0': 'black',
	'1': 'dark_blue',
	'2': 'dark_green',
	'3': 'dark_aqua',
	'4': 'dark_red',
	'5': 'dark_purple',
	'6': 'gold',
	'7': 'gray',
	'8': 'dark_gray',
	'9': 'blue',
	a: 'green',
	b: 'aqua',
	c: 'red',
	d: 'light_purple',
	e: 'yellow',
	f: 'white'
};

const LEGACY_STYLES = {
	k: 'obfuscated',
	l: 'bold',
	m: 'strikethrough',
	n: 'underlined',
	o: 'italic'
};

const CLICK_ACTIONS = new Set([
	'open_url',
	'run_command',
	'suggest_command',
	'change_page',
	'copy_to_clipboard',
	'show_dialog'
]);

const HOVER_ACTIONS = new Set(['show_text', 'show_item', 'show_entity']);

function truncate(text) {
	const value = String(text);
	return value.length > MAX_STRING_LENGTH ? value.slice(0, MAX_STRING_LENGTH) : value;
}

function safeString(value) {
	if (value == null) return '';
	if (typeof value === 'string') return truncate(value);
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
		return truncate(String(value));
	}
	return '';
}

function safeInteger(value, fallback) {
	const number = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
	if (!Number.isFinite(number)) return fallback;
	const integer = Math.trunc(number);
	return Number.isSafeInteger(integer) ? integer : fallback;
}

function stripLegacyCodes(text) {
	return String(text).replace(/\u00a7[0-9a-fk-or]/gi, '');
}

function normalizeAction(action) {
	return String(action == null ? '' : action)
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.toLowerCase();
}

function normalizeColor(value) {
	if (typeof value !== 'string') return null;
	const color = value.trim().toLowerCase();
	if (COLOR_NAMES.has(color)) return color;
	if (/^#[0-9a-f]{6}$/.test(color)) return color;
	return null;
}

/**
 * Split legacy § formatted text into style spans. A color code resets all
 * active formatting, matching Minecraft's legacy behavior.
 */
function legacySpans(text) {
	const spans = [];
	let style = {};
	let buffer = '';

	const flush = () => {
		if (buffer.length === 0) return;
		spans.push(Object.assign({ text: buffer }, style));
		buffer = '';
	};

	for (let i = 0; i < text.length; i += 1) {
		const character = text[i];
		if (character === '\u00a7' && i + 1 < text.length) {
			const code = text[i + 1].toLowerCase();
			if (LEGACY_COLORS[code] || LEGACY_STYLES[code] || code === 'r') {
				flush();
				if (code === 'r') {
					style = {};
				} else if (LEGACY_COLORS[code]) {
					style = { color: LEGACY_COLORS[code] };
				} else {
					style = Object.assign({}, style, { [LEGACY_STYLES[code]]: true });
				}
				i += 1;
				continue;
			}
		}
		buffer += character;
	}
	flush();

	if (spans.length > MAX_SPANS) {
		const kept = spans.slice(0, MAX_SPANS);
		const overflow = spans.slice(MAX_SPANS).map((span) => span.text).join('');
		if (overflow) kept[MAX_SPANS - 1] = Object.assign({}, kept[MAX_SPANS - 1], { text: kept[MAX_SPANS - 1].text + overflow });
		return kept;
	}
	return spans;
}

function applySpanStyle(value, span) {
	if (span.color) value.color = nbt.string(span.color);
	for (const flag of STYLE_FLAGS) {
		if (span[flag]) value[flag] = nbt.byte(1);
	}
}

function spanToNbt(span) {
	const value = { text: nbt.string(truncate(span.text)) };
	applySpanStyle(value, span);
	return value;
}

function isNbtCompound(value) {
	return !!value &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		value.type === 'compound' &&
		value.value &&
		typeof value.value === 'object' &&
		!Array.isArray(value.value);
}

function parseMaybeJson(message) {
	if (typeof message !== 'string') return message;
	const trimmed = message.trim();
	if (trimmed[0] !== '{' && trimmed[0] !== '[') return message;
	try {
		return JSON.parse(trimmed);
	} catch (_error) {
		// Malformed JSON is displayed as the original text, never thrown.
		return message;
	}
}

function convertScore(score) {
	if (!score || typeof score !== 'object' || Array.isArray(score)) return null;
	const name = safeString(score.name);
	const objective = safeString(score.objective);
	if (!name || !objective) return null;
	const value = {
		name: nbt.string(name),
		objective: nbt.string(objective)
	};
	if (score.value != null) value.value = nbt.string(safeString(score.value));
	return nbt.comp(value);
}

function convertClickEvent(event) {
	if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
	const action = normalizeAction(event.action);
	if (!CLICK_ACTIONS.has(action)) return null;

	if (action === 'change_page') {
		const page = safeInteger(event.page != null ? event.page : event.value, null);
		if (page === null) return null;
		return nbt.comp({ action: nbt.string(action), page: nbt.int(page) });
	}

	if (action === 'show_dialog') {
		const dialog = safeString(event.dialog != null ? event.dialog : event.value);
		if (!dialog) return null;
		return nbt.comp({ action: nbt.string(action), dialog: nbt.string(dialog) });
	}

	if (action === 'open_url') {
		const url = safeString(event.url != null ? event.url : event.value);
		if (!url) return null;
		return nbt.comp({ action: nbt.string(action), url: nbt.string(url) });
	}

	if (action === 'run_command' || action === 'suggest_command') {
		const command = safeString(event.command != null ? event.command : event.value);
		if (!command) return null;
		return nbt.comp({ action: nbt.string(action), command: nbt.string(command) });
	}

	const value = safeString(event.value != null ? event.value : event.contents);
	if (!value) return null;
	return nbt.comp({ action: nbt.string(action), value: nbt.string(value) });
}

function uuidToNbt(value) {
	if (Array.isArray(value) && value.length === 4 && value.every((entry) => Number.isInteger(entry))) {
		return nbt.intArray(value.map((entry) => entry | 0));
	}
	if (typeof value !== 'string') return null;
	const hex = value.replace(/-/g, '');
	if (!/^[0-9a-f]{32}$/i.test(hex)) return null;
	const ints = [];
	for (let index = 0; index < 4; index += 1) {
		ints.push(Number.parseInt(hex.slice(index * 8, (index + 1) * 8), 16) | 0);
	}
	return nbt.intArray(ints);
}

function convertHoverEvent(event, convertNode, depth, ancestors) {
	if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
	const action = normalizeAction(event.action);
	if (!HOVER_ACTIONS.has(action)) return null;
	const source = event.contents != null ? event.contents : event.value;

	if (action === 'show_text') {
		if (source == null) return null;
		return nbt.comp({
			action: nbt.string(action),
			value: nbt.comp(convertNode(source, depth + 1, ancestors))
		});
	}

	if (action === 'show_item') {
		let id = '';
		let count = 1;
		if (typeof source === 'string') {
			id = safeString(source);
		} else if (source && typeof source === 'object' && !Array.isArray(source)) {
			id = safeString(source.id != null ? source.id : source.item);
			const rawCount = source.count != null ? source.count : source.Count;
			if (rawCount != null) count = safeInteger(rawCount, 1);
		}
		if (!id) return null;
		const value = {
			action: nbt.string(action),
			id: nbt.string(id),
			count: nbt.int(count)
		};
		if (source && typeof source === 'object' && isNbtCompound(source.components)) {
			value.components = source.components;
		}
		return nbt.comp(value);
	}

	let entity = source;
	if (typeof entity === 'string') {
		// Legacy hover values are occasionally JSON-encoded; never attempt SNBT.
		try {
			entity = JSON.parse(entity);
		} catch (_error) {
			return null;
		}
	}
	if (!entity || typeof entity !== 'object' || Array.isArray(entity)) return null;

	let entityType = '';
	let uuidSource = null;
	if (entity.type !== undefined) {
		entityType = safeString(entity.type);
		uuidSource = entity.id;
	} else {
		entityType = safeString(entity.id);
		uuidSource = entity.uuid;
	}
	const uuid = uuidToNbt(uuidSource);
	if (!entityType || !uuid) return null;

	const value = {
		action: nbt.string(action),
		id: nbt.string(entityType),
		uuid
	};
	if (entity.name != null) value.name = nbt.comp(convertNode(entity.name, depth + 1, ancestors));
	return nbt.comp(value);
}

function fallbackComponent(value, ancestors) {
	return { text: nbt.string(truncate(plainText(value, ancestors, 0))) };
}

function convertObject(object, depth, ancestors) {
	const value = {};
	const extra = [];
	let inlineSpan = null;
	let hasContent = false;

	const translate = safeString(object.translate);
	if (translate) {
		value.translate = nbt.string(translate);
		hasContent = true;
		if (Array.isArray(object.with)) {
			value.with = nbt.list(nbt.comp(object.with.map((entry) => convertNode(entry, depth + 1, ancestors))));
		}
		if (object.fallback != null) value.fallback = nbt.string(safeString(object.fallback));
	} else if (object.text !== undefined) {
		const text = safeString(object.text);
		hasContent = true;
		if (text.indexOf('\u00a7') === -1) {
			value.text = nbt.string(text);
		} else {
			const spans = legacySpans(text);
			if (spans.length === 0) {
				value.text = nbt.string('');
			} else if (spans.length === 1) {
				value.text = nbt.string(truncate(spans[0].text));
				inlineSpan = spans[0];
			} else {
				value.text = nbt.string('');
				for (const span of spans) extra.push(spanToNbt(span));
			}
		}
	} else {
		const score = convertScore(object.score);
		if (score) {
			value.score = score;
			hasContent = true;
		} else if (object.selector !== undefined && safeString(object.selector)) {
			value.selector = nbt.string(safeString(object.selector));
			hasContent = true;
		} else if (object.keybind !== undefined && safeString(object.keybind)) {
			value.keybind = nbt.string(safeString(object.keybind));
			hasContent = true;
		} else if (object.nbt !== undefined && safeString(object.nbt)) {
			value.nbt = nbt.string(safeString(object.nbt));
			if (typeof object.interpret === 'boolean') value.interpret = nbt.byte(object.interpret ? 1 : 0);
			hasContent = true;
		}
	}

	if (Array.isArray(object.extra)) {
		for (const entry of object.extra) extra.push(convertNode(entry, depth + 1, ancestors));
	}
	if (object.separator !== undefined) {
		value.separator = nbt.comp(convertNode(object.separator, depth + 1, ancestors));
	}

	const color = normalizeColor(object.color);
	if (color) value.color = nbt.string(color);
	if (typeof object.font === 'string' && object.font) value.font = nbt.string(truncate(object.font));
	for (const flag of STYLE_FLAGS) {
		if (typeof object[flag] === 'boolean') value[flag] = nbt.byte(object[flag] ? 1 : 0);
	}
	if (object.insertion !== undefined) value.insertion = nbt.string(safeString(object.insertion));

	if (inlineSpan) applySpanStyle(value, inlineSpan);

	const click = convertClickEvent(object.clickEvent !== undefined ? object.clickEvent : object.click_event);
	if (click) value.click_event = click;
	const hover = convertHoverEvent(
		object.hoverEvent !== undefined ? object.hoverEvent : object.hover_event,
		convertNode,
		depth,
		ancestors
	);
	if (hover) value.hover_event = hover;

	if (extra.length > 0) value.extra = nbt.list(nbt.comp(extra));
	if (!hasContent && value.text === undefined) value.text = nbt.string('');

	return value;
}

function convertNode(node, depth, ancestors) {
	if (depth > MAX_DEPTH) return fallbackComponent(node, ancestors);
	if (node == null) return { text: nbt.string('') };
	if (typeof node === 'string') {
		if (node.indexOf('\u00a7') === -1) return { text: nbt.string(truncate(node)) };
		const spans = legacySpans(node);
		if (spans.length === 0) return { text: nbt.string('') };
		if (spans.length === 1) return spanToNbt(spans[0]);
		return { text: nbt.string(''), extra: nbt.list(nbt.comp(spans.map(spanToNbt))) };
	}
	if (typeof node === 'number' || typeof node === 'boolean' || typeof node === 'bigint') {
		return { text: nbt.string(safeString(node)) };
	}
	if (Array.isArray(node)) {
		if (node.length === 0) return { text: nbt.string('') };
		const entries = node.map((entry) => convertNode(entry, depth + 1, ancestors));
		return { text: nbt.string(''), extra: nbt.list(nbt.comp(entries)) };
	}
	if (isNbtCompound(node)) return node.value;
	if (typeof node !== 'object') return { text: nbt.string('') };
	if (ancestors.has(node)) return fallbackComponent(node, ancestors);

	ancestors.add(node);
	try {
		return convertObject(node, depth, ancestors);
	} finally {
		ancestors.delete(node);
	}
}

/**
 * Extract a cycle-safe, depth-safe plain string from any component value.
 * Used only when the structured conversion cannot continue.
 */
function plainText(value, ancestors, depth) {
	const seen = ancestors || new Set();
	const level = depth || 0;
	if (level > MAX_FALLBACK_DEPTH) return '';
	if (value == null) return '';
	if (typeof value === 'string') return truncate(stripLegacyCodes(value));
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
		return truncate(String(value));
	}
	if (typeof value !== 'object') return '';
	if (seen.has(value)) return '';

	seen.add(value);
	try {
		if (Array.isArray(value)) {
			let text = '';
			for (const entry of value) {
				text += plainText(entry, seen, level + 1);
				if (text.length >= MAX_STRING_LENGTH) break;
			}
			return truncate(text);
		}

		let text = '';
		if (value.text !== undefined) text += plainText(value.text, seen, level + 1);
		if (Array.isArray(value.extra)) text += plainText(value.extra, seen, level + 1);
		if (value.translate !== undefined) text += plainText(value.translate, seen, level + 1);
		if (Array.isArray(value.with)) text += plainText(value.with, seen, level + 1);
		if (value.fallback !== undefined) text += plainText(value.fallback, seen, level + 1);
		if (value.selector !== undefined) text += plainText(value.selector, seen, level + 1);
		if (value.keybind !== undefined) text += plainText(value.keybind, seen, level + 1);
		if (value.score && typeof value.score === 'object') text += plainText(value.score.name, seen, level + 1);
		return truncate(text);
	} finally {
		seen.delete(value);
	}
}

/**
 * Convert any legacy chat message into an anonymous NBT compound suitable for
 * `system_chat.content`, `set_title_text.text` and `playerlist_header`.
 * This function never throws.
 */
function toNbtComponent(message) {
	try {
		const parsed = parseMaybeJson(message);
		if (isNbtCompound(parsed)) return parsed;
		const value = convertNode(parsed, 0, new Set());
		return nbt.comp(value || { text: nbt.string('') });
	} catch (_error) {
		return nbt.comp({ text: nbt.string(truncate(plainText(message, new Set(), 0))) });
	}
}

module.exports = {
	MAX_DEPTH,
	MAX_FALLBACK_DEPTH,
	toNbtComponent,
	plainText,
	legacySpans,
	stripLegacyCodes
};
