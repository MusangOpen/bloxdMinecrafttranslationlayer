'use strict'

// Pins the Minecraft Java 1.21.11 (protocol 774) chunk-data layout and long-array packing.
// Hand-written on purpose: it must stay independent of the encoder that produced the data.

const MIN_Y = -64
const SECTION_COUNT = 24
const WORLD_HEIGHT = 384
const BLOCK_CELLS = 4096
const BIOME_CELLS = 64
const MAX_BITS_PER_VALUE = 32
const UINT32_LIMIT = 0x100000000

function fail (code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

function ensure (buffer, offset, length, what) {
  if (offset + length > buffer.length) {
    throw fail('E_CHUNK_READ_TRUNCATED', 'truncated while reading ' + what + ' at byte ' + offset)
  }
}

function readByte (buffer, offset, what) {
  ensure(buffer, offset, 1, what)
  return buffer[offset]
}

function readVarint (buffer, offset, what) {
  let value = 0
  let scale = 1
  for (let i = 0; i < 5; i++) {
    const byte = readByte(buffer, offset + i, what)
    value += (byte & 0x7f) * scale
    if ((byte & 0x80) === 0) return { value, bytes: i + 1 }
    scale *= 128
  }
  throw fail('E_CHUNK_READ_TRUNCATED', 'varint longer than 5 bytes for ' + what + ' at byte ' + offset)
}

function readContainer (buffer, offset, isBiome) {
  const cells = isBiome ? BIOME_CELLS : BLOCK_CELLS
  const paletteMaxBpv = isBiome ? 3 : 8
  const bitsPerValue = readByte(buffer, offset, (isBiome ? 'biome' : 'block') + ' bitsPerValue')
  offset += 1
  if (bitsPerValue > MAX_BITS_PER_VALUE) {
    throw fail('E_CHUNK_READ_BAD_BPV',
      bitsPerValue + ' bits per value exceeds the ' + MAX_BITS_PER_VALUE + '-bit limit')
  }

  if (bitsPerValue === 0) {
    const single = readVarint(buffer, offset, (isBiome ? 'biome' : 'block') + ' single value')
    if (single.value >= UINT32_LIMIT) {
      throw fail('E_CHUNK_READ_PALETTE_INDEX',
        'single value ' + single.value + ' does not fit in uint32')
    }
    const out = new Uint32Array(cells)
    out.fill(single.value)
    return { cells: out, offset: offset + single.bytes }
  }

  const direct = bitsPerValue > paletteMaxBpv
  let palette = null
  if (!direct) {
    const head = readVarint(buffer, offset, (isBiome ? 'biome' : 'block') + ' palette length')
    const paletteLength = head.value
    offset += head.bytes
    if (paletteLength < 1 || paletteLength > Math.pow(2, bitsPerValue)) {
      throw fail('E_CHUNK_READ_BAD_BPV',
        'palette length ' + paletteLength + ' does not fit in ' + bitsPerValue + ' bits')
    }
    palette = new Uint32Array(paletteLength)
    for (let i = 0; i < paletteLength; i++) {
      const entry = readVarint(buffer, offset, (isBiome ? 'biome' : 'block') + ' palette entry')
      offset += entry.bytes
      if (entry.value >= UINT32_LIMIT) {
        throw fail('E_CHUNK_READ_PALETTE_INDEX',
          'palette entry ' + entry.value + ' does not fit in uint32')
      }
      palette[i] = entry.value
    }
  }

  const valuesPerLong = Math.floor(64 / bitsPerValue)
  const longCount = Math.ceil(cells / valuesPerLong)
  ensure(buffer, offset, longCount * 8, (isBiome ? 'biome' : 'block') + ' data longs')
  const words = new Array(longCount)
  for (let i = 0; i < longCount; i++) {
    words[i] = buffer.readBigUInt64BE(offset)
    offset += 8
  }

  const mask = (1n << BigInt(bitsPerValue)) - 1n
  const out = new Uint32Array(cells)
  for (let i = 0; i < cells; i++) {
    const word = words[Math.floor(i / valuesPerLong)]
    const shift = BigInt((i % valuesPerLong) * bitsPerValue)
    const raw = Number((word >> shift) & mask)
    if (palette === null) {
      out[i] = raw
    } else {
      if (raw >= palette.length) {
        throw fail('E_CHUNK_READ_PALETTE_INDEX',
          'palette index ' + raw + ' at cell ' + i + ' is outside palette of ' + palette.length)
      }
      out[i] = palette[raw]
    }
  }
  return { cells: out, offset }
}

function readChunkData (buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('readChunkData expects a Buffer')
  const sections = []
  let offset = 0
  for (let i = 0; i < SECTION_COUNT; i++) {
    if (offset >= buffer.length) {
      throw fail('E_CHUNK_READ_SECTION_COUNT',
        'buffer ended after ' + i + ' of ' + SECTION_COUNT + ' sections')
    }
    ensure(buffer, offset, 2, 'section blockCount')
    const blockCount = buffer.readInt16BE(offset)
    offset += 2
    const blocks = readContainer(buffer, offset, false)
    offset = blocks.offset
    const biomes = readContainer(buffer, offset, true)
    offset = biomes.offset
    sections.push({ blockCount, blocks: blocks.cells, biomes: biomes.cells })
  }
  if (offset < buffer.length) {
    throw fail('E_CHUNK_READ_TRAILING_BYTES',
      (buffer.length - offset) + ' byte(s) left after ' + SECTION_COUNT + ' sections')
  }
  return { sections, bytesConsumed: offset }
}

function toLong (value, what) {
  if (typeof value === 'bigint') return BigInt.asUintN(64, value)
  if (Array.isArray(value)) {
    if (value.length !== 2) {
      throw new TypeError(what + ' must be a BigInt, a [hi, lo] pair, or a number')
    }
    const hi = BigInt.asUintN(32, BigInt(value[0]))
    const lo = BigInt.asUintN(32, BigInt(value[1]))
    return BigInt.asUintN(64, (hi << 32n) | lo)
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new TypeError(what + ' number is not an integer')
    return BigInt.asUintN(64, BigInt(value))
  }
  throw new TypeError(what + ' must be a BigInt, a [hi, lo] pair, or a number')
}

function readHeightmap (longs) {
  if (!Array.isArray(longs) || longs.length !== 37) {
    throw fail('E_CHUNK_READ_HEIGHTMAP_LENGTH',
      'heightmap needs 37 longs, got ' + (Array.isArray(longs) ? longs.length : typeof longs))
  }
  const words = longs.map((value, i) => toLong(value, 'heightmap long ' + i))
  const values = new Array(256)
  for (let i = 0; i < 256; i++) {
    const word = words[Math.floor(i / 7)]
    const shift = BigInt((i % 7) * 9)
    const value = Number((word >> shift) & 0x1ffn)
    if (value < 0 || value > WORLD_HEIGHT) {
      throw fail('E_CHUNK_READ_HEIGHTMAP_VALUE',
        'heightmap value ' + value + ' at index ' + i + ' is outside 0..' + WORLD_HEIGHT)
    }
    values[i] = value
  }
  return values
}

function readLightMask (longs) {
  if (!Array.isArray(longs)) throw new TypeError('readLightMask expects an array of longs')
  const bits = []
  for (let i = 0; i < longs.length; i++) {
    const word = toLong(longs[i], 'light mask long ' + i)
    for (let bit = 0; bit < 64; bit++) {
      if (((word >> BigInt(bit)) & 1n) === 1n) bits.push(i * 64 + bit)
    }
  }
  return { bits, popcount: bits.length }
}

module.exports = {
  readChunkData,
  readHeightmap,
  readLightMask,
  MIN_Y,
  SECTION_COUNT,
  WORLD_HEIGHT
}
