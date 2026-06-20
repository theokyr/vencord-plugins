// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHeaderOverflowController, teardownOverflow } from "../../plugins/enrichedHeader/overflow";

let resizeObserverCallback: ResizeObserverCallback | null = null;

class TestResizeObserver {
    constructor(callback: ResizeObserverCallback) {
        resizeObserverCallback = callback;
    }

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

function createDiscordSearchItem() {
    const search = document.createElement("div");
    search.className = "search__test";
    setWidth(search, 244);

    const searchInner = document.createElement("div");
    searchInner.className = "search_test";
    search.appendChild(searchInner);

    const searchBar = document.createElement("div");
    searchBar.className = "searchBar_test";
    searchInner.appendChild(searchBar);

    const searchIcon = document.createElement("div");
    searchIcon.setAttribute("role", "button");
    searchIcon.ariaLabel = "Search";
    searchBar.appendChild(searchIcon);

    const combobox = document.createElement("div");
    combobox.className = "notranslate public-DraftEditor-content";
    combobox.setAttribute("role", "combobox");
    combobox.ariaLabel = "Search";
    searchBar.appendChild(combobox);

    return { search, combobox };
}

function createRelocatedHeaderFixture() {
    const titleBar = document.createElement("div");
    titleBar.className = "bar__test";
    const title = document.createElement("div");
    title.className = "children__test";
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar__test";
    const trailing = document.createElement("div");
    trailing.className = "trailing__test";
    const overlay = document.createElement("div");
    overlay.className = "vc-enrichedHeader-dragOverlay";
    overlay.style.position = "absolute";

    titleBar.append(title, toolbar, trailing, overlay);
    document.body.appendChild(titleBar);

    setWidth(titleBar, 1400);
    setWidth(title, 680);
    setWidth(toolbar, 316);
    setWidth(trailing, 180);
    setWidth(overlay, 1000);

    const items = Array.from({ length: 2 }, (_, index) => {
        const item = document.createElement("button");
        item.ariaLabel = `Action ${index + 1}`;
        setWidth(item, 36);
        toolbar.appendChild(item);
        return item;
    });
    const { search, combobox } = createDiscordSearchItem();
    toolbar.appendChild(search);

    Object.defineProperty(titleBar, "clientWidth", { configurable: true, value: 1400 });
    Object.defineProperty(titleBar, "scrollWidth", { configurable: true, value: 1400 });
    Object.defineProperty(toolbar, "clientWidth", { configurable: true, value: 316 });
    Object.defineProperty(toolbar, "scrollWidth", { configurable: true, value: 316 });

    return { titleBar, toolbar, items, search, combobox };
}

describe("createHeaderOverflowController", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
        vi.restoreAllMocks();
        resizeObserverCallback = null;
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

    it("keeps Discord channel search visible when relocated header content fits", () => {
        const { titleBar, toolbar, items, search, combobox } = createRelocatedHeaderFixture();
        const controller = createHeaderOverflowController();

        controller.setup(titleBar, toolbar);

        expect(search.style.display).toBe("");
        expect(combobox.isConnected).toBe(true);
        expect(combobox.getAttribute("role")).toBe("combobox");
        expect(items.every(item => item.style.display === "")).toBe(true);
        expect((titleBar.querySelector(".vc-enrichedHeader-overflowBtn") as HTMLElement).style.display).toBe("none");
    });

    it("does not hide search when toolbar actions overflow", () => {
        const { titleBar, toolbar, items, search } = createRelocatedHeaderFixture();
        Object.defineProperty(toolbar, "clientWidth", { configurable: true, value: 244 });
        Object.defineProperty(toolbar, "scrollWidth", { configurable: true, value: 316 });
        const controller = createHeaderOverflowController();

        controller.setup(titleBar, toolbar);

        expect(search.style.display).toBe("");
        expect(items.every(item => item.style.display === "none")).toBe(true);
        expect((titleBar.querySelector(".vc-enrichedHeader-overflowBtn") as HTMLElement).style.display).toBe("");

        (titleBar.querySelector(".vc-enrichedHeader-overflowBtn") as HTMLElement).click();
        const menuEntries = Array.from(document.querySelectorAll(".vc-enrichedHeader-overflowMenuItem"));
        expect(menuEntries.map(entry => entry.textContent)).toEqual(["Action 1", "Action 2"]);
    });

    it("does not copy disabled Discord toolbar actions into the overflow menu", () => {
        const { titleBar, toolbar, items, search } = createRelocatedHeaderFixture();
        const disabledAction = document.createElement("div");
        disabledAction.className = "iconWrapper__test iconDisabled__test";
        disabledAction.setAttribute("role", "button");
        disabledAction.setAttribute("aria-disabled", "true");
        disabledAction.setAttribute("tabindex", "-1");
        disabledAction.ariaLabel = "Show User Profile (Unavailable)";
        setWidth(disabledAction, 36);
        toolbar.insertBefore(disabledAction, search);
        Object.defineProperty(toolbar, "clientWidth", { configurable: true, value: 244 });
        Object.defineProperty(toolbar, "scrollWidth", { configurable: true, value: 352 });
        const controller = createHeaderOverflowController();

        controller.setup(titleBar, toolbar);

        expect(disabledAction.style.display).toBe("none");
        expect(items.every(item => item.style.display === "none")).toBe(true);

        (titleBar.querySelector(".vc-enrichedHeader-overflowBtn") as HTMLElement).click();
        const menuEntries = Array.from(document.querySelectorAll(".vc-enrichedHeader-overflowMenuItem"));
        expect(menuEntries.map(entry => entry.textContent)).toEqual(["Action 1", "Action 2"]);
        expect(menuEntries.some(entry => entry.textContent?.includes("Unavailable"))).toBe(false);
    });

    it("coalesces resize observer callbacks into one animation frame update", () => {
        const { titleBar, toolbar } = createToolbarFixture();
        const callbacks: FrameRequestCallback[] = [];
        vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
            callbacks.push(cb);
            return callbacks.length;
        });
        const controller = createHeaderOverflowController();

        controller.setup(titleBar, toolbar);
        resizeObserverCallback?.([], {} as ResizeObserver);
        resizeObserverCallback?.([], {} as ResizeObserver);
        resizeObserverCallback?.([], {} as ResizeObserver);

        expect(callbacks).toHaveLength(1);

        callbacks.shift()?.(0);
        resizeObserverCallback?.([], {} as ResizeObserver);

        expect(callbacks).toHaveLength(1);
    });

    it("cancels a pending resize update on teardown", () => {
        const { titleBar, toolbar } = createToolbarFixture();
        vi.stubGlobal("requestAnimationFrame", () => 123);
        const cancelAnimationFrame = vi.fn();
        vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
        const controller = createHeaderOverflowController();

        controller.setup(titleBar, toolbar);
        resizeObserverCallback?.([], {} as ResizeObserver);
        controller.teardown();

        expect(cancelAnimationFrame).toHaveBeenCalledWith(123);
    });
});
