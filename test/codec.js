'use strict';

const { Type } = require('avsc');
const protocol = require('../bloxd/protocol/live.js');
const inRaw = require('../.research/live/inbound-schemas.json');
const outRaw = require('../.research/live/outbound-schemas.json');
const { createHarness } = require('./lib/harness');

const harness = createHarness({ name: 'codec' });
harness.loadBaseline();

for (const [name, id] of Object.entries(protocol.INBOUND_IDS)) {
  if (!protocol.isInboundBinary(name)) continue;
  const raw = inRaw[id];
  if (!raw) {
    // Known 840 gap: the captured bundle has no schema for this id. Record the
    // baseline defect, but still fail instead of skipping the required check.
    harness.noteDefect('BLX-840-006', { packet: name, id, direction: 'inbound' });
    harness.requireSchema(null, name, id, 'inbound');
    continue;
  }
  harness.check(`inbound ${name}`, () => {
    const bundle = Type.forSchema(raw.schema);
    const sample = bundle.random();
    const buffer = bundle.toBuffer(sample);
    const decoded = protocol.decodeInbound(name, buffer);
    if (decoded === undefined) throw new Error('decode returned undefined');
  });
}

for (const [name] of Object.entries(protocol.OUTBOUND_IDS)) {
  if (!protocol.isOutboundBinary(name)) continue;
  const id = protocol.OUTBOUND_IDS[name];
  const raw = outRaw[id];
  if (!harness.requireSchema(raw, name, id, 'outbound')) continue;

  harness.check(`outbound ${name}`, () => {
    const bundle = Type.forSchema(raw.schema);
    if (!harness.requireSchema(protocol.OUTBOUND_SCHEMAS[name], name, id, 'outbound descriptor')) {
      throw new Error('descriptor schema missing');
    }
    const ours = protocol.OUTBOUND_SCHEMAS[name];
    const sample = ours.random();
    const encoded = protocol.encodeOutbound(name, sample);
    const decoded = bundle.fromBuffer(encoded);
    const reencoded = bundle.toBuffer(decoded);
    if (!Buffer.from(encoded).equals(reencoded)) throw new Error('byte mismatch');
  });
}

const exitCode = harness.finish();
console.log(`CODEC assertions=${harness.assertions} fail=${harness.failures.length}`);
process.exit(exitCode);
