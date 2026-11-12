'use strict';

/**
 * Canonical Bloxd target descriptor for the pinned itj4su/d11e9e80 build.
 *
 * This is the only product module allowed to contain the target protocol
 * version literal. The protocol descriptor, browser/auth version, anticheat
 * transport keys and BloxClient join payload all derive from this object.
 */
const VERSION = 856;

const TARGET = Object.freeze({
  build: '7rp1w',
  buildVersion: '57cd8edd',
  version: VERSION,
  sourceUrl: 'https://bloxd.io/static/js/7rp1w.main.57cd8edd.js',
  mainBundle: Object.freeze({
    url: 'https://bloxd.io/static/js/7rp1w.main.57cd8edd.js',
    filename: '7rp1w.main.57cd8edd.js',
    sha256: '5b55225a3b3758475fb4a6538ba3170c05a26394fcd878deacf649ecc94dd205'
  }),
  generatedManifestSha256: 'ea70f18f94840eb4886735ac8777d2d7c6924d55d8bba7ad97a3fddb6fd80318',
  transport: Object.freeze({
    algorithm: 'xor-id-scramble',
    sendKey: 11 * VERSION + 7,
    expKey: 42,
    secondPassOffset: 5,
    lengthMultiplier: 3
  })
});

module.exports = TARGET;
