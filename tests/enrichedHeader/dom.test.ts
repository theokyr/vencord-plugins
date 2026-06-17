// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHeaderDomController } from "../../plugins/enrichedHeader/dom";

class TestResizeObserver {
    observe() {}
    disconnect() {}
}

describe("createHeaderDomController", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
        vi.stubGlobal("ResizeObserver", TestResizeObserver);
        vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
            cb(0);
            return 0;
        });
    });

    function setupHeaderDom() {
        document.body.innerHTML = `
            <div class="base__test">
                <div class="bar__test">
                    <div class="title__test">Discord title</div>
                    <div class="trailing__test"></div>
                </div>
                <div class="page__test">
                    <div class="upperContainer__test">
                        <div class="children__test">Channel</div>
                        <div class="toolbar__test"><button>Action</button></div>
                    </div>
                </div>
            </div>
        `;
    }

    it("refreshes registered layout after relocation even when header children already moved", () => {
        setupHeaderDom();
        const renderLayout = vi.fn(titleBar => {
            const item = document.createElement("span");
            item.dataset.testLayout = String(renderLayout.mock.calls.length);
            titleBar.appendChild(item);
        });
        const controller = createHeaderDomController({ renderLayout });

        controller.relocate();
        expect(renderLayout).toHaveBeenCalledTimes(1);
        expect(document.querySelector('[data-test-layout="1"]')).toBeTruthy();

        controller.refresh();

        expect(renderLayout).toHaveBeenCalledTimes(2);
        expect(document.querySelector('[data-test-layout="2"]')).toBeTruthy();
    });

    it("restores relocated elements and active body class on undo", () => {
        setupHeaderDom();
        const controller = createHeaderDomController();
        const upperContainer = document.querySelector(".upperContainer__test")!;
        const children = document.querySelector(".children__test") as HTMLElement;
        const toolbar = document.querySelector(".toolbar__test") as HTMLElement;

        controller.relocate();
        expect(document.body.classList.contains("vc-enrichedHeader-active")).toBe(true);
        expect(document.querySelector(".bar__test")?.contains(children)).toBe(true);
        expect(document.querySelector(".bar__test")?.contains(toolbar)).toBe(true);

        controller.undo();

        expect(document.body.classList.contains("vc-enrichedHeader-active")).toBe(false);
        expect(upperContainer.contains(children)).toBe(true);
        expect(upperContainer.contains(toolbar)).toBe(true);
    });
});
