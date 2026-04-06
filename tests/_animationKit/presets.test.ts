import { describe, it, expect } from "vitest";
import { PRESETS, getSpeed, getStagger, getEase } from "../../plugins/_animationKit/presets";

describe("_animationKit/presets", () => {
    describe("PRESETS", () => {
        it("has three presets", () => {
            expect(Object.keys(PRESETS)).toHaveLength(3);
            expect(PRESETS.minimal).toBeDefined();
            expect(PRESETS.smooth).toBeDefined();
            expect(PRESETS.expressive).toBeDefined();
        });

        it("minimal preset has correct values", () => {
            const p = PRESETS.minimal;
            expect(p.speedFast).toBe(0);
            expect(p.speed).toBe(80);
            expect(p.speedSlow).toBe(100);
            expect(p.ease).toBe("ease");
            expect(p.easeOut).toBe("ease-out");
            expect(p.easeSpring).toBe("ease-out");
            expect(p.stagger).toBe(0);
        });

        it("smooth preset has correct values", () => {
            const p = PRESETS.smooth;
            expect(p.speedFast).toBe(100);
            expect(p.speed).toBe(150);
            expect(p.speedSlow).toBe(250);
            expect(p.ease).toBe("ease");
            expect(p.easeOut).toBe("ease-out");
            expect(p.easeSpring).toBe("cubic-bezier(0.34, 1.56, 0.64, 1)");
            expect(p.stagger).toBe(40);
        });

        it("expressive preset has correct values", () => {
            const p = PRESETS.expressive;
            expect(p.speedFast).toBe(100);
            expect(p.speed).toBe(200);
            expect(p.speedSlow).toBe(350);
            expect(p.ease).toBe("ease");
            expect(p.easeOut).toBe("ease-out");
            expect(p.easeSpring).toBe("cubic-bezier(0.34, 1.56, 0.64, 1)");
            expect(p.stagger).toBe(40);
        });
    });

    describe("getSpeed", () => {
        it("returns speedFast for fast tier", () => {
            expect(getSpeed("minimal", "fast")).toBe(0);
            expect(getSpeed("smooth", "fast")).toBe(100);
            expect(getSpeed("expressive", "fast")).toBe(100);
        });

        it("returns speed for normal tier", () => {
            expect(getSpeed("minimal", "normal")).toBe(80);
            expect(getSpeed("smooth", "normal")).toBe(150);
            expect(getSpeed("expressive", "normal")).toBe(200);
        });

        it("returns speedSlow for slow tier", () => {
            expect(getSpeed("minimal", "slow")).toBe(100);
            expect(getSpeed("smooth", "slow")).toBe(250);
            expect(getSpeed("expressive", "slow")).toBe(350);
        });
    });

    describe("getStagger", () => {
        it("returns 0ms for index 0", () => {
            expect(getStagger("smooth", 0)).toBe("0ms");
            expect(getStagger("expressive", 0)).toBe("0ms");
        });

        it("returns 0ms for all minimal indices", () => {
            expect(getStagger("minimal", 0)).toBe("0ms");
            expect(getStagger("minimal", 1)).toBe("0ms");
            expect(getStagger("minimal", 3)).toBe("0ms");
            expect(getStagger("minimal", 10)).toBe("0ms");
        });

        it("returns correct delay for index 3 with smooth (120ms)", () => {
            expect(getStagger("smooth", 3)).toBe("120ms");
        });

        it("returns correct delay for index 3 with expressive (120ms)", () => {
            expect(getStagger("expressive", 3)).toBe("120ms");
        });
    });

    describe("getEase", () => {
        it("returns ease string for each preset", () => {
            expect(getEase("minimal")).toBe("ease");
            expect(getEase("smooth")).toBe("ease");
            expect(getEase("expressive")).toBe("ease");
        });
    });
});
