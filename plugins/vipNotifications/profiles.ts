import type { Diagnostic, MessageContext, VipConfig, VipDeliveryPlan, VipProfile, VipRule } from "./types";

export type DeliveryPlanResult =
    | { ok: true; plan: VipDeliveryPlan; diagnostics: Diagnostic[] }
    | { ok: false; reason: "missing_profile" | "disabled_profile"; diagnostics: Diagnostic[] };

function diagnostic(code: string, message: string, path?: string, severity: Diagnostic["severity"] = "warning"): Diagnostic {
    return { code, message, path, severity };
}

function profileToPlan(rule: VipRule, profile: VipProfile): VipDeliveryPlan {
    return {
        ruleId: rule.id,
        profileId: profile.id,
        profileName: profile.name,
        soundKind: profile.soundKind,
        soundId: profile.soundId,
        customSoundUrl: profile.customSoundUrl,
        soundVolume: profile.soundVolume,
        showDesktopNotification: profile.showDesktopNotification,
        showVencordNotification: profile.showVencordNotification,
        privacyMode: profile.privacyMode,
        allowDndOverride: profile.allowDndOverride,
        allowStreamerModeOverride: profile.allowStreamerModeOverride,
        allowStreamerContent: profile.allowStreamerContent,
        allowMuteOverride: profile.allowMuteOverride,
        cooldownMs: profile.cooldownMs,
        cooldownKey: profile.cooldownKey,
    };
}

export function resolveDeliveryPlan(config: VipConfig, rule: VipRule, _ctx: MessageContext): DeliveryPlanResult {
    const diagnostics: Diagnostic[] = [];
    const profilesById = new Map(config.profiles.map(profile => [profile.id, profile]));
    const matchedProfile = profilesById.get(rule.profileId);

    if (matchedProfile) {
        if (!matchedProfile.enabled) {
            return {
                ok: false,
                reason: "disabled_profile",
                diagnostics: [
                    diagnostic("disabled_profile", "Matched profile is disabled.", "rule.profileId"),
                ],
            };
        }

        return {
            ok: true,
            plan: profileToPlan(rule, matchedProfile),
            diagnostics,
        };
    }

    diagnostics.push(diagnostic("missing_profile", "Matched profile was not found.", "rule.profileId"));

    const defaultProfile = profilesById.get(config.defaultProfileId);
    if (!defaultProfile) {
        return {
            ok: false,
            reason: "missing_profile",
            diagnostics: [
                ...diagnostics,
                diagnostic("missing_default_profile", "Default profile was not found.", "defaultProfileId"),
            ],
        };
    }

    if (!defaultProfile.enabled) {
        return {
            ok: false,
            reason: "disabled_profile",
            diagnostics: [
                ...diagnostics,
                diagnostic("disabled_default_profile", "Default profile is disabled.", "defaultProfileId"),
            ],
        };
    }

    diagnostics.push(diagnostic("profile_fallback_default", "Missing profile fell back to the default profile.", "defaultProfileId", "info"));

    return {
        ok: true,
        plan: profileToPlan(rule, defaultProfile),
        diagnostics,
    };
}
