// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

    afterEach(() => {
        vi.useRealTimers();
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

    function setupHeaderDomWithSingleUnderscoreClasses() {
        document.body.innerHTML = `
            <div class="base_test">
                <div class="bar_test">
                    <div class="title_test">Discord title</div>
                    <div class="trailing_test"></div>
                </div>
                <div class="page_test">
                    <div class="upperContainer_test">
                        <div class="children_test">Channel</div>
                        <div class="toolbar_test"><button>Action</button></div>
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

    it("relocates Discord channel headers when hash classes use single underscores", () => {
        setupHeaderDomWithSingleUnderscoreClasses();
        const controller = createHeaderDomController();
        const titleBar = document.querySelector(".bar_test") as HTMLElement;
        const children = document.querySelector(".children_test") as HTMLElement;
        const toolbar = document.querySelector(".toolbar_test") as HTMLElement;

        controller.relocate();

        expect(titleBar.contains(children)).toBe(true);
        expect(titleBar.contains(toolbar)).toBe(true);
    });

    it("does not inject a full-titlebar native drag overlay over relocated controls", () => {
        setupHeaderDom();
        const controller = createHeaderDomController();

        controller.relocate();

        expect(document.querySelector(".vc-enrichedHeader-dragOverlay")).toBeNull();
    });

    it("keeps injected layout zones in a stable order across refreshes", () => {
        setupHeaderDom();
        const renderLayout = vi.fn(titleBar => {
            const item = document.createElement("span");
            item.className = "vc-enrichedHeader-layoutZone vc-enrichedHeader-layoutZone-trailing";
            item.dataset.vcEnrichedHeaderLayout = String(renderLayout.mock.calls.length);
            titleBar.querySelectorAll("[data-vc-enriched-header-layout]").forEach(el => el.remove());
            titleBar.insertBefore(item, titleBar.querySelector(".trailing__test"));
        });
        const controller = createHeaderDomController({ renderLayout });

        controller.relocate();
        const titleBar = document.querySelector(".bar__test")!;
        const afterRelocate = Array.from(titleBar.children).map(el => (el as HTMLElement).className);

        controller.refresh();

        expect(Array.from(titleBar.children).map(el => (el as HTMLElement).className)).toEqual(afterRelocate);
    });

    it("replaces rerendered channel header nodes without restoring stale relocated nodes", () => {
        setupHeaderDom();
        const controller = createHeaderDomController();
        const upperContainer = document.querySelector(".upperContainer__test")!;
        const oldChildren = document.querySelector(".children__test") as HTMLElement;
        const oldToolbar = document.querySelector(".toolbar__test") as HTMLElement;

        controller.relocate();

        const freshChildren = document.createElement("div");
        freshChildren.className = "children__fresh";
        freshChildren.textContent = "Fresh channel";
        const freshToolbar = document.createElement("div");
        freshToolbar.className = "toolbar__fresh";
        freshToolbar.textContent = "Fresh toolbar";
        upperContainer.append(freshChildren, freshToolbar);

        controller.refresh();
        const titleBar = document.querySelector(".bar__test")!;

        expect(titleBar.contains(freshChildren)).toBe(true);
        expect(titleBar.contains(freshToolbar)).toBe(true);
        expect(oldChildren.isConnected).toBe(false);
        expect(oldToolbar.isConnected).toBe(false);
    });

    it("replaces a rerendered toolbar even when channel title children are unchanged", () => {
        setupHeaderDom();
        const controller = createHeaderDomController();
        const upperContainer = document.querySelector(".upperContainer__test")!;
        const oldToolbar = document.querySelector(".toolbar__test") as HTMLElement;

        controller.relocate();

        const freshToolbar = document.createElement("div");
        freshToolbar.className = "toolbar__fresh";
        freshToolbar.textContent = "Fresh toolbar";
        upperContainer.appendChild(freshToolbar);

        controller.refresh();
        const titleBar = document.querySelector(".bar__test")!;

        expect(titleBar.contains(freshToolbar)).toBe(true);
        expect(oldToolbar.isConnected).toBe(false);
    });

    it("ignores unrelated page subtree mutations", async () => {
        vi.useFakeTimers();
        setupHeaderDom();
        const renderLayout = vi.fn();
        const controller = createHeaderDomController({ renderLayout });

        controller.relocate();
        expect(renderLayout).toHaveBeenCalledTimes(1);

        const page = document.querySelector(".page__test")!;
        const unrelated = document.createElement("div");
        unrelated.className = "messageList__test";
        unrelated.appendChild(document.createElement("span"));
        page.appendChild(unrelated);

        await Promise.resolve();
        vi.advanceTimersByTime(200);

        expect(renderLayout).toHaveBeenCalledTimes(1);
    });

    it("refreshes when Discord rerenders channel header nodes", async () => {
        vi.useFakeTimers();
        setupHeaderDom();
        const renderLayout = vi.fn();
        const controller = createHeaderDomController({ renderLayout });
        const upperContainer = document.querySelector(".upperContainer__test")!;

        controller.relocate();
        expect(renderLayout).toHaveBeenCalledTimes(1);

        const freshChildren = document.createElement("div");
        freshChildren.className = "children__fresh";
        freshChildren.textContent = "Fresh channel";
        upperContainer.appendChild(freshChildren);

        await Promise.resolve();
        vi.advanceTimersByTime(200);

        expect(renderLayout).toHaveBeenCalledTimes(2);
    });
});
