import { createHeaderOverflowController, type HeaderOverflowController } from "./overflow";

export interface HeaderDomController {
    relocate(): void;
    undo(): void;
    refresh(): void;
    isActive(): boolean;
    getTitleBar(): HTMLElement | null;
}

interface HeaderDomControllerOptions {
    onRelocated?: () => void;
    renderLayout?: (titleBar: HTMLElement) => void;
    teardownLayout?: () => void;
}

interface RelocatedElement {
    element: HTMLElement;
    originalParent: HTMLElement;
    originalNextSibling: Node | null;
    originalDisplay: string;
}

const HEADER_REFRESH_DELAY = 150;

function findVisibleTitleBar(): HTMLElement | null {
    const bars = document.querySelectorAll('[class*="base_"] > [class*="bar_"]');
    for (const bar of Array.from(bars)) {
        if (typeof bar.className === "string" && !bar.className.includes("systemBar")) {
            return bar as HTMLElement;
        }
    }
    return null;
}

function findChannelHeaderChildren(): HTMLElement | null {
    return document.querySelector('[class*="upperContainer__"] > [class*="children__"]') as HTMLElement | null;
}

function findChannelHeaderToolbar(): HTMLElement | null {
    return document.querySelector('[class*="upperContainer__"] > [class*="toolbar__"]') as HTMLElement | null;
}

function createDragOverlay(): HTMLElement {
    const dragOverlay = document.createElement("div");
    dragOverlay.className = "vc-enrichedHeader-dragOverlay";
    return dragOverlay;
}

export function createHeaderDomController(options: HeaderDomControllerOptions = {}): HeaderDomController {
    let active = false;
    let observer: MutationObserver | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let titleBar: HTMLElement | null = null;
    let originalTitleBarPosition: string | null = null;
    let relocatedElements: RelocatedElement[] = [];
    let injectedElements: HTMLElement[] = [];
    const overflowController: HeaderOverflowController = createHeaderOverflowController();

    function savePosition(element: HTMLElement) {
        const originalParent = element.parentElement;
        if (!originalParent) return;

        relocatedElements.push({
            element,
            originalParent,
            originalNextSibling: element.nextSibling,
            originalDisplay: element.style.display,
        });
    }

    function insertBeforeTrailing(element: HTMLElement, fallbackParent: HTMLElement, trailing: HTMLElement | null) {
        if (trailing) {
            fallbackParent.insertBefore(element, trailing);
        } else {
            fallbackParent.appendChild(element);
        }
    }

    function clearRefreshTimer() {
        if (!refreshTimer) return;
        clearTimeout(refreshTimer);
        refreshTimer = null;
    }

    function setupObserver() {
        if (observer) return;

        const page = document.querySelector('[class*="page_"]');
        if (!page) return;

        observer = new MutationObserver(() => {
            if (!active) return;
            clearRefreshTimer();
            refreshTimer = setTimeout(() => {
                refreshTimer = null;
                refresh();
            }, HEADER_REFRESH_DELAY);
        });
        observer.observe(page, { childList: true, subtree: true });
    }

    function teardownObserver() {
        clearRefreshTimer();
        if (!observer) return;
        observer.disconnect();
        observer = null;
    }

    function relocate() {
        undo();

        const nextTitleBar = findVisibleTitleBar();
        if (!nextTitleBar) return;

        titleBar = nextTitleBar;
        originalTitleBarPosition = titleBar.style.position;

        const titleBarTitle = titleBar.querySelector(':scope > [class*="title_"]') as HTMLElement | null;
        const titleBarTrailing = titleBar.querySelector(':scope > [class*="trailing"]') as HTMLElement | null;
        const channelChildren = findChannelHeaderChildren();
        const channelToolbar = findChannelHeaderToolbar();

        options.renderLayout?.(titleBar);

        if (titleBarTitle) {
            savePosition(titleBarTitle);
            titleBarTitle.style.display = "none";
        }

        // move channel header children into the visible title bar; never move the title bar into the channel header.
        if (channelChildren) {
            savePosition(channelChildren);
            insertBeforeTrailing(channelChildren, titleBar, titleBarTrailing);
        }

        if (channelToolbar) {
            savePosition(channelToolbar);
            insertBeforeTrailing(channelToolbar, titleBar, titleBarTrailing);
            overflowController.setup(titleBar, channelToolbar);
        }

        titleBar.style.position = "relative";
        const dragOverlay = createDragOverlay();
        titleBar.appendChild(dragOverlay);
        injectedElements.push(dragOverlay);

        document.body.classList.add("vc-enrichedHeader-active");
        active = true;
        setupObserver();
        options.onRelocated?.();
    }

    function undo() {
        teardownObserver();
        overflowController.teardown();
        options.teardownLayout?.();

        for (const element of injectedElements) {
            element.remove();
        }
        injectedElements = [];

        for (const { element, originalParent, originalNextSibling, originalDisplay } of relocatedElements) {
            element.style.display = originalDisplay;
            if (originalNextSibling?.parentNode === originalParent) {
                originalParent.insertBefore(element, originalNextSibling);
            } else {
                originalParent.appendChild(element);
            }
        }
        relocatedElements = [];

        if (titleBar && originalTitleBarPosition !== null) {
            titleBar.style.position = originalTitleBarPosition;
        }
        titleBar = null;
        originalTitleBarPosition = null;

        document.body.classList.remove("vc-enrichedHeader-active");
        active = false;
    }

    function refresh() {
        if (!active) return;

        const currentTitleBar = findVisibleTitleBar();
        if (!currentTitleBar) return;

        if (titleBar !== currentTitleBar) {
            relocate();
            return;
        }

        const freshChildren = findChannelHeaderChildren();
        if (freshChildren && !currentTitleBar.contains(freshChildren)) {
            relocate();
            return;
        }

        options.renderLayout?.(currentTitleBar);
        overflowController.update();
        options.onRelocated?.();
    }

    return {
        relocate,
        undo,
        refresh,
        isActive: () => active,
        getTitleBar: () => titleBar ?? findVisibleTitleBar(),
    };
}
