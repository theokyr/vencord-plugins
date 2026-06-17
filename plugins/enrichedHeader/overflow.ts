export interface HeaderOverflowController {
    setup(titleBar: HTMLElement, toolbar: HTMLElement): void;
    update(): void;
    teardown(): void;
}

const OVERFLOW_THRESHOLD = 0.9;

function teardownOverflow() {
    activeController?.teardown();
}

let activeController: HeaderOverflowController | null = null;

export function createHeaderOverflowController(): HeaderOverflowController {
    let titleBar: HTMLElement | null = null;
    let toolbar: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let overflowBtn: HTMLElement | null = null;
    let overflowMenu: HTMLElement | null = null;
    let overflowCloseHandler: ((event: MouseEvent) => void) | null = null;

    function closeMenu() {
        if (!overflowMenu) return;
        overflowMenu.remove();
        overflowMenu = null;
    }

    function removeCloseListener() {
        if (!overflowCloseHandler) return;
        document.removeEventListener("mousedown", overflowCloseHandler);
        overflowCloseHandler = null;
    }

    function getToolbarItems() {
        return toolbar ? Array.from(toolbar.children) as HTMLElement[] : [];
    }

    function measureTitleBarWidth() {
        if (!titleBar) return 0;

        let totalWidth = 0;
        for (const child of Array.from(titleBar.children) as HTMLElement[]) {
            if (child.style.display === "none") continue;
            totalWidth += child.getBoundingClientRect().width;
        }
        return totalWidth;
    }

    function update() {
        if (!titleBar || !toolbar || !overflowBtn) return;

        const toolbarItems = getToolbarItems();
        toolbarItems.forEach(item => { item.style.display = ""; });
        overflowBtn.style.display = "none";

        const threshold = titleBar.getBoundingClientRect().width * OVERFLOW_THRESHOLD;
        let totalWidth = measureTitleBarWidth();
        const itemWidths = toolbarItems.map(item => item.getBoundingClientRect().width);

        if (totalWidth <= threshold) {
            closeMenu();
            removeCloseListener();
            return;
        }

        overflowBtn.style.display = "";
        totalWidth += overflowBtn.getBoundingClientRect().width;

        for (let index = toolbarItems.length - 1; index >= 0; index--) {
            toolbarItems[index].style.display = "none";
            totalWidth -= itemWidths[index];
            if (totalWidth <= threshold) break;
        }

        let actualTotal = measureTitleBarWidth();
        while (actualTotal > threshold) {
            let hidItem = false;
            for (let index = toolbarItems.length - 1; index >= 0; index--) {
                if (toolbarItems[index].style.display === "none") continue;
                toolbarItems[index].style.display = "none";
                hidItem = true;
                break;
            }
            if (!hidItem) break;
            actualTotal = measureTitleBarWidth();
        }
    }

    function appendTopic() {
        if (!overflowMenu) return;

        const topicEl = document.querySelector('[class*="topic__"]') as HTMLElement | null;
        const topicText = topicEl?.textContent?.trim();
        if (!topicEl || !topicText) return;

        const topicItem = document.createElement("div");
        topicItem.className = "vc-enrichedHeader-overflowTopic";
        topicItem.textContent = topicText;
        topicItem.addEventListener("click", event => {
            event.stopPropagation();
            topicEl.click();
            closeMenu();
        });
        overflowMenu.appendChild(topicItem);

        const separator = document.createElement("div");
        separator.className = "vc-enrichedHeader-overflowSeparator";
        overflowMenu.appendChild(separator);
    }

    function appendToolbarItems() {
        if (!overflowMenu) return;

        for (const item of getToolbarItems()) {
            if (item.style.display !== "none") continue;

            const label = item.getAttribute("aria-label")
                || item.querySelector("[aria-label]")?.getAttribute("aria-label")
                || "";
            const menuItem = document.createElement("div");
            menuItem.className = "vc-enrichedHeader-overflowMenuItem";

            const isSearch = typeof item.className === "string" && item.className.includes("search");
            if (isSearch) {
                menuItem.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21.71 20.29 18 16.61A9 9 0 1 0 16.61 18l3.68 3.68a1 1 0 0 0 1.42 0 1 1 0 0 0 0-1.39ZM11 18a7 7 0 1 1 7-7 7 7 0 0 1-7 7Z"/></svg>';
            } else {
                const svg = item.querySelector("svg");
                if (svg) {
                    const iconClone = svg.cloneNode(true) as SVGElement;
                    iconClone.setAttribute("width", "18");
                    iconClone.setAttribute("height", "18");
                    menuItem.appendChild(iconClone);
                }
            }

            const labelSpan = document.createElement("span");
            labelSpan.textContent = label || (isSearch ? "Search" : "");
            if (labelSpan.textContent) menuItem.appendChild(labelSpan);

            menuItem.addEventListener("click", event => {
                event.stopPropagation();
                const clickable = item.querySelector('[role="button"], button, a') as HTMLElement | null;
                (clickable ?? item).click();
                closeMenu();
            });
            overflowMenu.appendChild(menuItem);
        }
    }

    function toggleMenu(event: MouseEvent) {
        event.stopPropagation();

        if (overflowMenu) {
            closeMenu();
            removeCloseListener();
            return;
        }

        if (!overflowBtn) return;

        overflowMenu = document.createElement("div");
        overflowMenu.className = "vc-enrichedHeader-overflowMenu";

        const btnRect = overflowBtn.getBoundingClientRect();
        overflowMenu.style.top = `${btnRect.bottom + 4}px`;
        overflowMenu.style.right = `${window.innerWidth - btnRect.right}px`;

        appendTopic();
        appendToolbarItems();
        document.body.appendChild(overflowMenu);

        removeCloseListener();
        overflowCloseHandler = mouseEvent => {
            if (!overflowMenu || overflowMenu.contains(mouseEvent.target as Node) || mouseEvent.target === overflowBtn) return;
            closeMenu();
            removeCloseListener();
        };
        document.addEventListener("mousedown", overflowCloseHandler);
    }

    function setup(nextTitleBar: HTMLElement, nextToolbar: HTMLElement) {
        teardown();
        activeController = controller;

        titleBar = nextTitleBar;
        toolbar = nextToolbar;

        overflowBtn = document.createElement("div");
        overflowBtn.className = "vc-enrichedHeader-overflowBtn";
        overflowBtn.textContent = "···";
        overflowBtn.style.display = "none";
        overflowBtn.addEventListener("click", toggleMenu);

        if (toolbar.nextSibling) {
            titleBar.insertBefore(overflowBtn, toolbar.nextSibling);
        } else {
            titleBar.appendChild(overflowBtn);
        }

        resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(update);
        });
        resizeObserver.observe(titleBar);
        update();
    }

    function teardown() {
        removeCloseListener();
        closeMenu();

        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }

        if (overflowBtn) {
            overflowBtn.removeEventListener("click", toggleMenu);
            overflowBtn.remove();
            overflowBtn = null;
        }

        if (toolbar) {
            for (const item of Array.from(toolbar.children) as HTMLElement[]) {
                item.style.display = "";
            }
        }

        titleBar = null;
        toolbar = null;
        if (activeController === controller) activeController = null;
    }

    const controller = { setup, update, teardown };
    activeController = controller;
    return controller;
}

export { teardownOverflow };
