package dev.gtnhplanner.calcoracle;

import cpw.mods.fml.common.eventhandler.SubscribeEvent;
import cpw.mods.fml.common.gameevent.TickEvent;

public final class ServerAutorunHandler {

    private boolean started;

    @SubscribeEvent
    public void onServerTick(TickEvent.ServerTickEvent event) {
        if (event.phase != TickEvent.Phase.END || started) {
            return;
        }

        started = true;
        GtnhCalcOracleMod.requestAutorunExport("server-started");
    }
}
