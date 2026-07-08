// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MACOS_WINDOW_FULLSCREEN_CLASS, createMacosWindowFullscreenController } from "../../plugins/enrichedHeader/windowState";

describe("createMacosWindowFullscreenController", () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;

    function setViewport(width: number, height: number) {
        Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
        Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
    }

    beforeEach(() => {
        document.documentElement.className = "platform-osx";
        document.body.className = "";
        Object.defineProperty(window, "screen", {
            configurable: true,
            value: { width: 1280, height: 800 },
        });
    });

    afterEach(() => {
        document.documentElement.className = "";
        document.body.className = "";
        setViewport(originalInnerWidth, originalInnerHeight);
    });

    it("marks macOS native window fullscreen when viewport fills the physical screen", () => {
        setViewport(1280, 800);
        const controller = createMacosWindowFullscreenController();

        controller.start();

        expect(document.body.classList.contains(MACOS_WINDOW_FULLSCREEN_CLASS)).toBe(true);
    });

    it("does not mark ordinary macOS windowed layout as fullscreen", () => {
        setViewport(1280, 770);
        const controller = createMacosWindowFullscreenController();

        controller.start();

        expect(document.body.classList.contains(MACOS_WINDOW_FULLSCREEN_CLASS)).toBe(false);
    });

    it("updates the marker on resize and removes it on stop", () => {
        setViewport(1000, 700);
        const controller = createMacosWindowFullscreenController();

        controller.start();
        expect(document.body.classList.contains(MACOS_WINDOW_FULLSCREEN_CLASS)).toBe(false);

        setViewport(1280, 800);
        window.dispatchEvent(new Event("resize"));
        expect(document.body.classList.contains(MACOS_WINDOW_FULLSCREEN_CLASS)).toBe(true);

        controller.stop();
        expect(document.body.classList.contains(MACOS_WINDOW_FULLSCREEN_CLASS)).toBe(false);
    });
});
