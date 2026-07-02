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
    discardOnRelocate: boolean;
}

const HEADER_REFRESH_DELAY = 150;
const HEADER_RELEVANT_SELECTOR = '[class*="upperContainer_"], [class*="children_"], [class*="toolbar_"]';

function findVisibleTitleBar(): HTMLElement | null {
    const bars = document.querySelectorAll('[class*="base_"] > [class*="bar"]');
    for (const bar of Array.from(bars)) {
        if (typeof bar.className === "string" && !bar.className.includes("systemBar")) {
            return bar as HTMLElement;
        }
    }
    return null;
}

function findChannelHeaderChildren(): HTMLElement | null {
    return document.querySelector('[class*="upperContainer_"] > [class*="children_"]') as HTMLElement | null;
}

function findChannelHeaderToolbar(): HTMLElement | null {
    return document.querySelector('[class*="upperContainer_"] > [class*="toolbar_"]') as HTMLElement | null;
}

function isHeaderElement(element: Element): boolean {
    return element.matches(HEADER_RELEVANT_SELECTOR);
}

function nodeContainsHeader(node: Node): boolean {
    return node instanceof Element
        && (isHeaderElement(node) || Boolean(node.querySelector(HEADER_RELEVANT_SELECTOR)));
}

function mutationTouchesHeader(records: MutationRecord[]): boolean {
    for (const record of records) {
        if (record.target instanceof Element && isHeaderElement(record.target)) return true;

        for (const node of Array.from(record.addedNodes)) {
            if (nodeContainsHeader(node)) return true;
        }

        for (const node of Array.from(record.removedNodes)) {
            if (nodeContainsHeader(node)) return true;
        }
    }

    return false;
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

    function savePosition(element: HTMLElement, options: { discardOnRelocate?: boolean; } = {}) {
        const originalParent = element.parentElement;
        if (!originalParent) return;

        relocatedElements.push({
            element,
            originalParent,
            originalNextSibling: element.nextSibling,
            originalDisplay: element.style.display,
            discardOnRelocate: options.discardOnRelocate ?? false,
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

        observer = new MutationObserver(records => {
            if (!active) return;
            if (!mutationTouchesHeader(records)) return;
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

    function resetRelocation(resetOptions: { restoreChannelElements: boolean; }) {
        teardownObserver();
        overflowController.teardown();
        options.teardownLayout?.();

        for (const element of injectedElements) {
            element.remove();
        }
        injectedElements = [];

        for (const { element, originalParent, originalNextSibling, originalDisplay, discardOnRelocate } of relocatedElements) {
            element.style.display = originalDisplay;
            if (!resetOptions.restoreChannelElements && discardOnRelocate) {
                element.remove();
                continue;
            }
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

    function relocate(relocateOptions: { restoreChannelElements?: boolean; } = {}) {
        resetRelocation({ restoreChannelElements: relocateOptions.restoreChannelElements ?? true });

        const nextTitleBar = findVisibleTitleBar();
        if (!nextTitleBar) return;

        titleBar = nextTitleBar;
        originalTitleBarPosition = titleBar.style.position;

        const titleBarTitle = titleBar.querySelector(':scope > [class*="title"]') as HTMLElement | null;
        const titleBarTrailing = titleBar.querySelector(':scope > [class*="trailing"]') as HTMLElement | null;
        const channelChildren = findChannelHeaderChildren();
        const channelToolbar = findChannelHeaderToolbar();

        if (titleBarTitle) {
            savePosition(titleBarTitle);
            titleBarTitle.style.display = "none";
        }

        // move channel header children into the visible title bar; never move the title bar into the channel header.
        if (channelChildren) {
            savePosition(channelChildren, { discardOnRelocate: true });
            insertBeforeTrailing(channelChildren, titleBar, titleBarTrailing);
        }

        if (channelToolbar) {
            savePosition(channelToolbar, { discardOnRelocate: true });
            insertBeforeTrailing(channelToolbar, titleBar, titleBarTrailing);
            overflowController.setup(titleBar, channelToolbar);
        }

        options.renderLayout?.(titleBar);

        titleBar.style.position = "relative";

        document.body.classList.add("vc-enrichedHeader-active");
        active = true;
        setupObserver();
        options.onRelocated?.();
    }

    function undo() {
        resetRelocation({ restoreChannelElements: true });
    }

    function refresh() {
        if (!active) return;

        const currentTitleBar = findVisibleTitleBar();
        if (!currentTitleBar) return;

        if (titleBar !== currentTitleBar) {
            relocate({ restoreChannelElements: false });
            return;
        }

        const freshChildren = findChannelHeaderChildren();
        if (freshChildren && !currentTitleBar.contains(freshChildren)) {
            relocate({ restoreChannelElements: false });
            return;
        }

        const freshToolbar = findChannelHeaderToolbar();
        if (freshToolbar && !currentTitleBar.contains(freshToolbar)) {
            relocate({ restoreChannelElements: false });
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
