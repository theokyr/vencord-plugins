// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHeaderOverflowController, teardownOverflow } from "../../plugins/enrichedHeader/overflow";

class TestResizeObserver {
    observe() {}
    disconnect() {}
}

function setWidth(element: HTMLElement, width: number): void {
    element.getBoundingClientRect = () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: width,
        bottom: 24,
        width,
        height: 24,
        toJSON: () => ({}),
    } as DOMRect);
}

function createToolbarFixture() {
    const titleBar = document.createElement("div");
    const toolbar = document.createElement("div");
    titleBar.appendChild(toolbar);
    document.body.appendChild(titleBar);

    setWidth(titleBar, 100);
    setWidth(toolbar, 120);

    const items = Array.from({ length: 3 }, (_, index) => {
        const item = document.createElement("button");
        item.ariaLabel = `Action ${index + 1}`;
        setWidth(item, 50);
        toolbar.appendChild(item);
        return item;
    });

    return { titleBar, toolbar, items };
}

describe("createHeaderOverflowController", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
        vi.restoreAllMocks();
        vi.stubGlobal("ResizeObserver", TestResizeObserver);
        vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
            cb(0);
            return 0;
        });
    });

    it("exports a global teardown helper that tears down the active controller", () => {
        const { titleBar, toolbar, items } = createToolbarFixture();
        const controller = createHeaderOverflowController();

        controller.setup(titleBar, toolbar);
        expect(titleBar.querySelector(".vc-enrichedHeader-overflowBtn")).toBeTruthy();
        expect(items.some(item => item.style.display === "none")).toBe(true);

        teardownOverflow();

        expect(titleBar.querySelector(".vc-enrichedHeader-overflowBtn")).toBeNull();
        expect(items.every(item => item.style.display === "")).toBe(true);
    });

    it("removes the outside-click listener when a resize closes the overflow menu", () => {
        const { titleBar, toolbar } = createToolbarFixture();
        const addListener = vi.spyOn(document, "addEventListener");
        const removeListener = vi.spyOn(document, "removeEventListener");
        const controller = createHeaderOverflowController();

        controller.setup(titleBar, toolbar);
        const button = titleBar.querySelector(".vc-enrichedHeader-overflowBtn") as HTMLElement;
        button.click();
        expect(addListener).toHaveBeenCalledWith("mousedown", expect.any(Function));
        expect(document.querySelector(".vc-enrichedHeader-overflowMenu")).toBeTruthy();

        setWidth(titleBar, 1000);
        setWidth(toolbar, 20);
        controller.update();

        expect(document.querySelector(".vc-enrichedHeader-overflowMenu")).toBeNull();
        expect(removeListener).toHaveBeenCalledWith("mousedown", expect.any(Function));
    });
});
