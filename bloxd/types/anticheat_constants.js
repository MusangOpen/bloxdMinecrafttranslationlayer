const TARGET = require('../protocol/target.js');
const version = TARGET.version;

module.exports = {
	PACKET_SEND_VER_KEY: TARGET.transport.sendKey,
	PACKET_SEND_EXP_KEY: TARGET.transport.expKey,
	PACKET_GEN_VER_KEY: version * 5 + 13,
	PACKET_GEN_KEY: 'uviz1r5a3xzl5',

	ATTACK_KEY: Math.floor(version / 3) + 4,
	LANGUAGE_KEY: 'En-GB',
	WORLD_KEY: '-1|1|0'
};