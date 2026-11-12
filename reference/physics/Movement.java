// module code
// Measured on the 2026-11-11 Bloxd skywars sample (4376 frames / 110 s,
// noa movement._lastTickVelocity + position):
//   walk 3.304 blocks/s, sprint 5.794 blocks/s, post-boost plateau ~6.5 blocks/s,
//   jump peak 7.333 (= 8 - 20/30), gravity 19.74 m/s^2, maxBunnyHops 3.
// Hop speeds measured 3.18 / 3.32 / 3.27 blocks/s (flat), so the legacy 0.025
// bunny-hop bonus is disabled until a sample shows the increase.
// event.motion is blocks per Minecraft tick (20 tps), so speeds are blocks/s / 20.
private static final double WALK_SPEED = 0.165D;
private static final double SPRINT_SPEED = 0.290D;
private static final double BOOST_SPEED = 0.325D;
private static final double ITEM_SPEED = 0.06D;
private static final double JUMP_IMPULSE = 8D;
private static final int MAX_BUNNY_HOPS = 3;
private static final double BUNNY_HOP_BONUS = 0.0D;
private static final double SPEED_POTION_BONUS = 0.14D;
private static final long BOOST_WINDOW_MS = 1300L;

private double jumpfunny = 0;
private long jumpticks = System.currentTimeMillis();

@EventListener
public void packetEvent(PacketEvent event) {
    if (mode.value.equals("Bloxd")) {
        if (event.packet instanceof S12PacketEntityVelocity) {
            S12PacketEntityVelocity packet = (S12PacketEntityVelocity) event.packet;
            if (mc.thePlayer != null && packet.getEntityID() == mc.thePlayer.getEntityId()) {
                jumpticks = System.currentTimeMillis() + BOOST_WINDOW_MS;
            }
        } else if (event.packet instanceof S3FPacketCustomPayload) {
            S3FPacketCustomPayload packet = (S3FPacketCustomPayload)event.packet;
            if ("bloxd:resyncphysics".equals(packet.getChannelName())) {
                PacketBuffer data = packet.getBufferData();
                jumpfunny = 0;
                bloxdPhysics.impulseVector.set(0, 0, 0);
                bloxdPhysics.forceVector.set(0, 0, 0);
                bloxdPhysics.velocityVector.set(data.readFloat(), data.readFloat(), data.readFloat());
            }
        }
    }
}

// event hooking Entity.moveEntity & replacing the y velocity with this, you can also use it for move dir with the strafe function of choice
if (mc.thePlayer.onGround && bloxdPhysics.velocityVector.y < 0) {
    bloxdPhysics.velocityVector.set(0, 0, 0);
}

if (event.motion.y == (double)0.42f) {
    jumpfunny = Math.min(jumpfunny + 1, MAX_BUNNY_HOPS);
    bloxdPhysics.impulseVector.add(new Vec3d(0, JUMP_IMPULSE, 0));
}

jumpfunny = mc.thePlayer.groundTicks > 5 ? 0 : jumpfunny;
double baseSpeed = mc.thePlayer.isSprinting() ? SPRINT_SPEED : WALK_SPEED;
double speed;
if (jumpticks > System.currentTimeMillis() && mc.timer.timerSpeed == 1) {
    speed = BOOST_SPEED;
} else if (mc.thePlayer.isUsingItem()) {
    speed = ITEM_SPEED;
} else {
    speed = baseSpeed + BUNNY_HOP_BONUS * jumpfunny;
}

if (mc.thePlayer.isPotionActive(Potion.moveSpeed)) {
    switch (mc.thePlayer.getActivePotionEffect(Potion.moveSpeed).getAmplifier()) {
        case 0:
            speed += SPEED_POTION_BONUS;
            break;
        case 1:
            speed += SPEED_POTION_BONUS;
            break;
    }
}

Vec3d moveDirection = getMoveDirection(speed);
if (mc.theWorld.isBlockLoaded(mc.thePlayer.getPosition()) || mc.thePlayer.posY <= 0) {
    bloxdPhysics.gravityMul = ModuleHandler.aura.isAttacking && bloxdPhysics.velocityVector.y >= 0 ? 4d : 2d;
    event.motion = new Vec3d(moveDirection.x, bloxdPhysics.getMotionForTick().y * (1 / 30d), moveDirection.z);
} else {
    event.motion = new Vec3d(0, 0, 0);
}
