/*
 * Vencord userplugin - EnrichedHeader
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type SidebarMode = "all" | "guilds" | "channels" | "none";

type SidebarStore = {
    hideGuildSidebar: boolean;
    hideChannelList: boolean;
};

const GUILDS_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 20H4V4h4v16zm12 0H10V4h10v16z"/></svg>';
const ALL_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 20H4V4h4v16zm6 0h-4V4h4v16zm6 0h-4V4h4v16z"/></svg>';
const CHANNELS_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/></svg>';

export function getSidebarMode(store: SidebarStore): SidebarMode {
    if (!store.hideGuildSidebar && !store.hideChannelList) return "all";
    if (!store.hideGuildSidebar && store.hideChannelList) return "guilds";
    if (store.hideGuildSidebar && !store.hideChannelList) return "channels";
    return "none";
}

export function applySidebarClasses(store: SidebarStore): void {
    document.body.classList.toggle("vc-enrichedHeader-hideGuilds", store.hideGuildSidebar);
    document.body.classList.toggle("vc-enrichedHeader-hideChannels", store.hideChannelList);
}

export function clearSidebarClasses(): void {
    document.body.classList.remove("vc-enrichedHeader-hideGuilds", "vc-enrichedHeader-hideChannels");
}

export function setSidebarMode(store: SidebarStore, mode: SidebarMode): void {
    store.hideGuildSidebar = mode === "channels" || mode === "none";
    store.hideChannelList = mode === "guilds" || mode === "none";
    applySidebarClasses(store);
}

export function cycleSidebarMode(store: SidebarStore): SidebarMode {
    const next: Record<SidebarMode, SidebarMode> = {
        all: "guilds",
        guilds: "channels",
        channels: "none",
        none: "all",
    };
    const mode = next[getSidebarMode(store)];
    setSidebarMode(store, mode);
    return mode;
}

export function createSidebarToggleElement(getMode: () => SidebarMode, setMode: (mode: SidebarMode) => void): HTMLElement {
    const container = document.createElement("div");
    container.className = "vc-enrichedHeader-sidebarToggles";

    const buttons: Array<{ mode: SidebarMode; title: string; icon: string; }> = [
        { mode: "guilds", title: "Show guilds only", icon: GUILDS_ICON },
        { mode: "all", title: "Show all sidebars", icon: ALL_ICON },
        { mode: "channels", title: "Show channels only", icon: CHANNELS_ICON },
    ];

    function sync() {
        const current = getMode();
        for (const child of Array.from(container.children)) {
            const button = child as HTMLElement;
            button.classList.toggle("vc-enrichedHeader-toggleBtn-active", button.dataset.mode === current);
        }
    }

    for (const { mode, title, icon } of buttons) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "vc-enrichedHeader-toggleBtn";
        button.dataset.mode = mode;
        button.title = title;
        button.setAttribute("aria-label", title);
        button.innerHTML = icon;
        button.addEventListener("click", () => {
            setMode(getMode() === mode ? "none" : mode);
            sync();
        });
        container.appendChild(button);
    }

    sync();
    return container;
}
