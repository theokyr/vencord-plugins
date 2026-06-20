import { describe, expect, it } from "vitest";
import { createDefaultConfig } from "../../plugins/vipNotifications/defaults";
import { parseConfig, serializeConfig } from "../../plugins/vipNotifications/settingsCodec";

describe("vipNotifications/settingsCodec", () => {
    it("creates a valid default config with one default profile", () => {
        const config = createDefaultConfig();

        expect(config.version).toBe(1);
        expect(config.defaultProfileId).toBe("default");
        expect(config.quickAddPlacement).toBe("top");
        expect(config.decisionTtlMs).toBe(15000);
        expect(config.rules).toEqual([]);
        expect(config.profiles).toHaveLength(1);
        expect(config.profiles[0]).toMatchObject({
            id: "default",
            enabled: true,
            privacyMode: "streamerAware",
            allowDndOverride: true,
            allowStreamerModeOverride: false,
            allowStreamerContent: false,
            allowMuteOverride: false,
            cooldownKey: "profileChannel",
        });
    });

    it("round trips valid config JSON", () => {
        const original = createDefaultConfig();
        const parsed = parseConfig(serializeConfig(original));

        expect(parsed.config).toEqual(original);
        expect(parsed.diagnostics).toEqual([]);
    });

    it("repairs invalid JSON to defaults with diagnostics", () => {
        const parsed = parseConfig("{ invalid");

        expect(parsed.config).toEqual(createDefaultConfig());
        expect(parsed.diagnostics.some(d => d.code === "invalid_json")).toBe(true);
    });

    it("drops duplicate rule ids and preserves the first rule", () => {
        const base = createDefaultConfig();
        const raw = JSON.stringify({
            ...base,
            rules: [
                { id: "r1", name: "First", enabled: true, profileId: "default", conditions: { authorUserIds: ["u1"] } },
                { id: "r1", name: "Duplicate", enabled: true, profileId: "default", conditions: { authorUserIds: ["u2"] } },
            ],
        });
        const parsed = parseConfig(raw);

        expect(parsed.config.rules).toHaveLength(1);
        expect(parsed.config.rules[0].name).toBe("First");
        expect(parsed.diagnostics.some(d => d.code === "duplicate_rule_id")).toBe(true);
    });

    it("clamps sound volume and cooldown values", () => {
        const base = createDefaultConfig();
        const raw = JSON.stringify({
            ...base,
            profiles: [
                { ...base.profiles[0], soundVolume: 150, cooldownMs: -1 },
                { ...base.profiles[0], id: "quiet", soundVolume: -20, cooldownMs: 2500 },
            ],
        });
        const parsed = parseConfig(raw);

        expect(parsed.config.profiles[0].soundVolume).toBe(100);
        expect(parsed.config.profiles[0].cooldownMs).toBe(0);
        expect(parsed.config.profiles[1].soundVolume).toBe(0);
        expect(parsed.config.profiles[1].cooldownMs).toBe(2500);
    });

    it("drops unknown future fields from the returned config", () => {
        const base = createDefaultConfig();
        const raw = JSON.stringify({
            ...base,
            futureRoot: true,
            profiles: [
                { ...base.profiles[0], futureProfile: true },
            ],
            rules: [
                {
                    id: "r1",
                    name: "Rule",
                    enabled: true,
                    profileId: "default",
                    futureRule: true,
                    conditions: {
                        authorUserIds: ["u1", "", "u1"],
                        futureCondition: true,
                    },
                },
            ],
        });
        const parsed = parseConfig(raw);

        expect(parsed.config).not.toHaveProperty("futureRoot");
        expect(parsed.config.profiles[0]).not.toHaveProperty("futureProfile");
        expect(parsed.config.rules[0]).not.toHaveProperty("futureRule");
        expect(parsed.config.rules[0].conditions).not.toHaveProperty("futureCondition");
        expect(parsed.config.rules[0].conditions.authorUserIds).toEqual(["u1"]);
    });
});
