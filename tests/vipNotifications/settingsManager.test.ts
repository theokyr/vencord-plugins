import { describe, expect, it } from "vitest";
import { createDefaultConfig, createDefaultProfile } from "../../plugins/vipNotifications/defaults";
import {
    addProfileToConfig,
    addRuleToConfig,
    moveRuleInConfig,
    removeProfileFromConfig,
    setDefaultProfileInConfig,
} from "../../plugins/vipNotifications/settings";
import type { VipConfig, VipRule } from "../../plugins/vipNotifications/types";

function rule(id: string, profileId = "default"): VipRule {
    return {
        id,
        name: id,
        enabled: true,
        profileId,
        conditions: {},
    };
}

describe("vipNotifications/settings manager helpers", () => {
    it("creates unique profile and rule drafts using valid default profile references", () => {
        const withProfile = addProfileToConfig(createDefaultConfig());
        const withRule = addRuleToConfig(withProfile);

        expect(withProfile.profiles.map(profile => profile.id)).toEqual(["default", "profile-1"]);
        expect(withProfile.profiles[1]).toMatchObject({
            name: "Profile 1",
            enabled: true,
            privacyMode: "streamerAware",
            allowDndOverride: true,
            allowStreamerModeOverride: false,
            allowStreamerContent: false,
            allowMuteOverride: false,
        });
        expect(withRule.rules).toHaveLength(1);
        expect(withRule.rules[0]).toMatchObject({
            id: "rule-1",
            name: "Rule 1",
            enabled: true,
            profileId: "default",
            conditions: {},
        });
    });

    it("keeps defaultProfileId valid and retargets rules when deleting the default profile", () => {
        const base: VipConfig = {
            ...createDefaultConfig(),
            defaultProfileId: "vip",
            profiles: [
                createDefaultProfile(),
                { ...createDefaultProfile(), id: "vip", name: "VIP" },
            ],
            rules: [rule("r1", "vip"), rule("r2", "default")],
        };

        const next = removeProfileFromConfig(base, "vip");

        expect(next.profiles.map(profile => profile.id)).toEqual(["default"]);
        expect(next.defaultProfileId).toBe("default");
        expect(next.rules.map(item => item.profileId)).toEqual(["default", "default"]);
    });

    it("does not delete the last profile or set default to an unknown profile", () => {
        const base = createDefaultConfig();

        expect(removeProfileFromConfig(base, "default")).toBe(base);
        expect(setDefaultProfileInConfig(base, "missing")).toBe(base);
    });

    it("moves rules by index and ignores out-of-range moves", () => {
        const base: VipConfig = {
            ...createDefaultConfig(),
            rules: [rule("a"), rule("b"), rule("c")],
        };

        expect(moveRuleInConfig(base, 0, 2).rules.map(item => item.id)).toEqual(["b", "c", "a"]);
        expect(moveRuleInConfig(base, -1, 1)).toBe(base);
        expect(moveRuleInConfig(base, 1, 1)).toBe(base);
    });
});
