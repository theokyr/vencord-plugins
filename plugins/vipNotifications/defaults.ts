import type { VipConfig, VipProfile } from "./types";

export function createDefaultProfile(): VipProfile {
    return {
        id: "default",
        name: "Default",
        enabled: true,
        soundKind: "builtIn",
        soundId: "default",
        customSoundUrl: "",
        soundVolume: 80,
        showDesktopNotification: true,
        showVencordNotification: true,
        privacyMode: "streamerAware",
        allowDndOverride: true,
        allowStreamerModeOverride: false,
        allowStreamerContent: false,
        allowMuteOverride: false,
        cooldownMs: 60000,
        cooldownKey: "profileChannel",
    };
}

export function createDefaultConfig(): VipConfig {
    return {
        version: 1,
        defaultProfileId: "default",
        quickAddPlacement: "top",
        decisionTtlMs: 15000,
        profiles: [createDefaultProfile()],
        rules: [],
    };
}
