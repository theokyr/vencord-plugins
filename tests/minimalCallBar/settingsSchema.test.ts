import { describe, it, expect } from "vitest";
import { createMinimalCallBarSchema } from "../../plugins/minimalCallBar/settingsSchema";

// Mock settings object matching DefinedSettings shape
const mockSettings = {
    store: {},
    def: {
        displayMode: { type: 4, default: "strip" },
        showMic: { type: 1, default: true },
        showDeafen: { type: 1, default: true },
        showCamera: { type: 1, default: true },
        showScreenshare: { type: 1, default: true },
        showOverflow: { type: 1, default: true },
        maxVisibleAvatars: { type: 2, default: 3 },
        tooltipUsers: { type: 1, default: true },
        tooltipDuration: { type: 1, default: true },
        tooltipChannel: { type: 1, default: true },
        hoverDelay: { type: 2, default: 300 },
        clickAction: { type: 4, default: "toggleOverlay" },
    },
    checks: {},
    pluginName: "MinimalCallBar",
} as any;

describe("createMinimalCallBarSchema", () => {
    const schema = createMinimalCallBarSchema(mockSettings);

    it("has correct plugin name", () => {
        expect(schema.plugin).toBe("MinimalCallBar");
    });

    it("has an icon component", () => {
        expect(typeof schema.icon).toBe("function");
    });

    it("passes settings reference through", () => {
        expect(schema.settings).toBe(mockSettings);
    });

    it("has all required sections", () => {
        const sectionIds = schema.sections.map(s => s.id);
        expect(sectionIds).toContain("display");
        expect(sectionIds).toContain("controls");
        expect(sectionIds).toContain("avatars");
        expect(sectionIds).toContain("tooltip");
        expect(sectionIds).toContain("behavior");
    });

    it("display section has displayMode setting", () => {
        const display = schema.sections.find(s => s.id === "display")!;
        const keys = display.groups!.flatMap(g => g.settings.map(s => s.key));
        expect(keys).toContain("displayMode");
    });

    it("behavior section has clickAction setting", () => {
        const behavior = schema.sections.find(s => s.id === "behavior")!;
        const keys = behavior.groups!.flatMap(g => g.settings.map(s => s.key));
        expect(keys).toContain("clickAction");
        expect(keys).not.toContain("modeCycleKeybind");
        expect(keys).not.toContain("expandCollapseKeybind");
    });

    it("controls section has all 5 visibility toggles", () => {
        const controls = schema.sections.find(s => s.id === "controls")!;
        const keys = controls.groups!.flatMap(g => g.settings.map(s => s.key));
        expect(keys).toEqual(expect.arrayContaining(["showMic", "showDeafen", "showCamera", "showScreenshare", "showOverflow"]));
    });

    it("avatars section has slider config for maxVisibleAvatars", () => {
        const avatars = schema.sections.find(s => s.id === "avatars")!;
        const setting = avatars.groups![0].settings.find(s => s.key === "maxVisibleAvatars")!;
        expect(setting.control).toBe("slider");
        expect(setting.slider).toEqual({ min: 1, max: 8, step: 1 });
    });

    it("tooltip section has hover delay slider", () => {
        const tooltip = schema.sections.find(s => s.id === "tooltip")!;
        const allSettings = tooltip.groups!.flatMap(g => g.settings);
        const hoverDelay = allSettings.find(s => s.key === "hoverDelay")!;
        expect(hoverDelay.control).toBe("slider");
        expect(hoverDelay.slider?.unit).toBe("ms");
    });
});
