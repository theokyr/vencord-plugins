import { describe, it, expect, beforeEach } from "vitest";
import { initVcAnim, setPreset, setEnabled } from "../../plugins/_libAnimationKit/global";

// Reset module-level state between tests by clearing window.__vcAnim
// and reimporting the module fresh each time via dynamic import with cache-bust
// Since vitest doesn't easily re-init module state, we work around by clearing
// the globalThis.__vcAnim sentinel and resetting via the exported setters.

beforeEach(() => {
    // Clear the sentinel so initVcAnim is not idempotent-blocked
    delete (globalThis as any).__vcAnim;
    // Reset to known defaults via setters
    setPreset("smooth");
    setEnabled(true);
});

describe("_libAnimationKit/global", () => {
    describe("initVcAnim", () => {
        it("sets window.__vcAnim", () => {
            initVcAnim("smooth", true);
            expect((globalThis as any).__vcAnim).toBeDefined();
        });

        it("is idempotent — second call does not overwrite", () => {
            initVcAnim("smooth", true);
            const first = (globalThis as any).__vcAnim;
            initVcAnim("expressive", false);
            expect((globalThis as any).__vcAnim).toBe(first);
        });
    });

    describe("VcAnim API", () => {
        beforeEach(() => {
            initVcAnim("smooth", true);
        });

        it("preset getter returns current preset", () => {
            expect((globalThis as any).__vcAnim.preset).toBe("smooth");
        });

        it("isEnabled returns true when enabled", () => {
            expect((globalThis as any).__vcAnim.isEnabled()).toBe(true);
        });

        it("speed returns correct value when enabled", () => {
            expect((globalThis as any).__vcAnim.speed("normal")).toBe(150);
            expect((globalThis as any).__vcAnim.speed("fast")).toBe(100);
            expect((globalThis as any).__vcAnim.speed("slow")).toBe(250);
        });

        it("stagger returns correct value when enabled", () => {
            expect((globalThis as any).__vcAnim.stagger(0)).toBe("0ms");
            expect((globalThis as any).__vcAnim.stagger(3)).toBe("120ms");
        });

        it("ease returns the ease string", () => {
            expect((globalThis as any).__vcAnim.ease()).toBe("ease");
        });
    });

    describe("setPreset", () => {
        it("changes the current preset", () => {
            initVcAnim("smooth", true);
            setPreset("expressive");
            expect((globalThis as any).__vcAnim.preset).toBe("expressive");
            expect((globalThis as any).__vcAnim.speed("normal")).toBe(200);
        });

        it("changes to minimal preset", () => {
            initVcAnim("smooth", true);
            setPreset("minimal");
            expect((globalThis as any).__vcAnim.preset).toBe("minimal");
            expect((globalThis as any).__vcAnim.speed("normal")).toBe(80);
        });
    });

    describe("setEnabled", () => {
        it("speed returns 0 when disabled", () => {
            initVcAnim("smooth", true);
            setEnabled(false);
            expect((globalThis as any).__vcAnim.isEnabled()).toBe(false);
            expect((globalThis as any).__vcAnim.speed("normal")).toBe(0);
            expect((globalThis as any).__vcAnim.speed("fast")).toBe(0);
            expect((globalThis as any).__vcAnim.speed("slow")).toBe(0);
        });

        it("stagger returns 0ms when disabled", () => {
            initVcAnim("smooth", true);
            setEnabled(false);
            expect((globalThis as any).__vcAnim.stagger(0)).toBe("0ms");
            expect((globalThis as any).__vcAnim.stagger(3)).toBe("0ms");
        });

        it("re-enabling restores normal behavior", () => {
            initVcAnim("smooth", true);
            setEnabled(false);
            setEnabled(true);
            expect((globalThis as any).__vcAnim.isEnabled()).toBe(true);
            expect((globalThis as any).__vcAnim.speed("normal")).toBe(150);
        });
    });
});
