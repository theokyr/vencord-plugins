import { describe, expect, it } from "vitest";

import {
    DEFAULT_CUSTOM_FPS,
    DEFAULT_CUSTOM_RESOLUTIONS,
    getFpsValues,
    getResolutionValues,
    getStreamPresetSpecs,
    parseNumberList,
} from "../../plugins/betterRes/options";

describe("BetterRes options", () => {
    it("parses comma or whitespace separated numbers with p/fps suffixes", () => {
        expect(parseNumberList("240p, 360 48 fps, nope, 0, -1, 9999", { min: 1, max: 240 })).toEqual([240, 48]);
    });

    it("merges custom resolutions with Discord defaults and keeps Source last", () => {
        expect(getResolutionValues("240p, 360, 720, 144")).toEqual([144, 240, 360, 480, 720, 1080, 1440, 0]);
    });

    it("merges custom frame rates with Discord defaults", () => {
        expect(getFpsValues("5, 10, 24fps, 30, 48")).toEqual([5, 10, 15, 24, 30, 48, 60]);
    });

    it("ships low and specific default values", () => {
        expect(getResolutionValues(DEFAULT_CUSTOM_RESOLUTIONS)).toEqual([240, 360, 480, 720, 1080, 1440, 0]);
        expect(getFpsValues(DEFAULT_CUSTOM_FPS)).toEqual([5, 10, 15, 24, 30, 48, 60]);
    });

    it("builds stream presets for every custom resolution and frame rate", () => {
        const presets = getStreamPresetSpecs("240, 360", "5, 24");

        expect(presets).toContainEqual({ resolution: 240, fps: 5 });
        expect(presets).toContainEqual({ resolution: 360, fps: 24 });
        expect(presets).toContainEqual({ resolution: 0, fps: 24 });
    });
});
