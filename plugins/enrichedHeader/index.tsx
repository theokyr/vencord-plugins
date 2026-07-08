/*
 * Vencord userplugin - EnrichedHeader
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";
import "../_libAnimationKit/animations.css";

import { definePluginSettings, Settings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { GuildStore, SelectedChannelStore, SelectedGuildStore } from "@webpack/common";

import type {
    EnrichedHeaderAPI,
    HeaderContext,
    HeaderItemDefinition,
    HeaderItemId,
    HeaderRegistration,
    HeaderTitleOverride,
} from "./api";
import { HEADER_ZONES } from "./api";
import { createHeaderDomController, type HeaderDomController } from "./dom";
import { classifyHeaderMode, createHeaderLayoutRegistry } from "./layout";
import { migrateChannelTabsSettings } from "./migration";
import { createEnrichedHeaderSchema } from "./settingsSchema";
import {
    applySidebarClasses,
    clearSidebarClasses,
    createSidebarToggleElement,
    cycleSidebarMode,
    getSidebarMode,
    setSidebarMode,
} from "./sidebar";
import { createMacosWindowFullscreenController, type MacosWindowFullscreenController } from "./windowState";

type LayoutRegistry = ReturnType<typeof createHeaderLayoutRegistry>;
type SidebarTogglePosition = "left" | "right";
type GuildNameStyle = "none" | "breadcrumb";
type NavButtonsStyle = "show" | "compact" | "hidden";

interface EnrichedHeaderSettingsStore {
    headerEnabled: boolean;
    migratedFromChannelTabsV1: boolean;
    sidebarTogglePosition: SidebarTogglePosition;
    guildNameStyle: GuildNameStyle;
    navButtonsStyle: NavButtonsStyle;
    hideGuildSidebar: boolean;
    hideChannelList: boolean;
    keybind_cycleSidebar: string;
    keybind_cycleSidebar_enabled: boolean;
}

interface SettingsHubBridge {
    open(pluginName?: string): void;
    register(schema: ReturnType<typeof createEnrichedHeaderSchema>): void;
    unregister(pluginName: string): void;
}

interface DiscordGuild {
    readonly name?: string;
    readonly icon?: string | null;
}

const layoutRegistry: LayoutRegistry = createHeaderLayoutRegistry();
const subscriptions = new Map<string, (ctx: HeaderContext) => void>();
let domController: HeaderDomController | null = null;
let macosWindowFullscreenController: MacosWindowFullscreenController | null = null;
let coreSidebarRegistration: HeaderRegistration | null = null;
let coreBreadcrumbRegistration: HeaderRegistration | null = null;
let renderGeneration = 0;
let nextSubscription = 0;

function getSettingsStore(): EnrichedHeaderSettingsStore {
    return settings.store as unknown as EnrichedHeaderSettingsStore;
}

function getSettingsHubWindow(): Window & { __settingsHub?: SettingsHubBridge; } {
    return window as Window & { __settingsHub?: SettingsHubBridge; };
}

function getChannelTabsMigrationSource(): Record<string, unknown> | null {
    const pluginSettings = Settings.plugins as Partial<Record<"ChannelTabs", Record<string, unknown>>>;
    return pluginSettings.ChannelTabs ?? null;
}

function getHeaderContext(): HeaderContext {
    const channelId = SelectedChannelStore.getChannelId?.() ?? null;
    const guildId = SelectedGuildStore.getGuildId?.() ?? null;
    const path = window.location.pathname;

    return {
        active: Boolean(domController?.isActive()),
        guildId,
        channelId,
        path,
        mode: classifyHeaderMode({ channelId, path }),
    };
}

function notifySubscribers() {
    const ctx = getHeaderContext();
    layoutRegistry.setContext(ctx);
    for (const listener of subscriptions.values()) {
        try { listener(ctx); } catch { }
    }
}

function disposeRegistration(registration: HeaderRegistration | null) {
    try { registration?.dispose(); } catch { }
}

function applyNavClasses() {
    const store = getSettingsStore();
    document.body.classList.toggle("vc-enrichedHeader-navCompact", store.navButtonsStyle === "compact");
    document.body.classList.toggle("vc-enrichedHeader-navHidden", store.navButtonsStyle === "hidden");
}

function clearNavClasses() {
    document.body.classList.remove("vc-enrichedHeader-navCompact", "vc-enrichedHeader-navHidden");
}

function refreshHeader() {
    const store = getSettingsStore();
    applySidebarClasses(store);
    applyNavClasses();
    domController?.refresh();
    notifySubscribers();
}

function restartDomIfNeeded() {
    if (!getSettingsStore().headerEnabled) {
        domController?.undo();
        notifySubscribers();
        return;
    }

    if (!domController) return;
    domController.relocate();
    notifySubscribers();
}

function renderLayout(titleBar: HTMLElement) {
    const generation = String(++renderGeneration);
    const ctx = getHeaderContext();
    layoutRegistry.setContext(ctx);

    titleBar.querySelectorAll<HTMLElement>("[data-vc-enriched-header-layout]").forEach(el => el.remove());

    const trailing = titleBar.querySelector(':scope > [class*="trailing"]') as HTMLElement | null;
    const title = titleBar.querySelector(':scope > [class*="title_"]') as HTMLElement | null;
    const insertBeforeRef = trailing ?? title ?? null;

    for (const zone of HEADER_ZONES) {
        const items = layoutRegistry.getItemsForZone(zone);
        if (items.length === 0) continue;

        const zoneEl = document.createElement("div");
        zoneEl.className = `vc-enrichedHeader-layoutZone vc-enrichedHeader-layoutZone-${zone}`;
        zoneEl.dataset.vcEnrichedHeaderLayout = generation;

        for (const item of items) {
            const el = layoutRegistry.renderItem(item.id, ctx);
            if (!el) continue;
            el.dataset.vcEnrichedHeaderItem = item.id;
            zoneEl.appendChild(el);
        }

        if (zoneEl.childElementCount === 0) continue;

        titleBar.insertBefore(zoneEl, insertBeforeRef);
    }

    const override = layoutRegistry.getTitleOverride();
    if (override?.label) {
        const label = document.createElement("span");
        label.className = "vc-enrichedHeader-titleOverride";
        label.dataset.vcEnrichedHeaderLayout = generation;

        if (override.icon instanceof HTMLElement) {
            label.appendChild(override.icon);
        } else if (typeof override.icon === "string") {
            const icon = document.createElement("img");
            icon.src = override.icon;
            icon.alt = "";
            label.appendChild(icon);
        }

        const text = document.createElement("span");
        text.textContent = override.label;
        label.appendChild(text);
        titleBar.insertBefore(label, insertBeforeRef);
    }
}

function teardownLayout() {
    document.querySelectorAll<HTMLElement>("[data-vc-enriched-header-layout]").forEach(el => el.remove());
}

function getGuild(guildId: string | null): DiscordGuild | null {
    if (!guildId) return null;
    try {
        return (GuildStore as { getGuild(id: string): DiscordGuild | null | undefined; }).getGuild(guildId) ?? null;
    } catch {
        return null;
    }
}

function updateBreadcrumbElement(container: HTMLElement, ctx: HeaderContext): void {
    container.textContent = "";
    const guild = getGuild(ctx.guildId);
    if (!guild?.name || !ctx.guildId) return;

    if (guild.icon) {
        const img = document.createElement("img");
        img.src = `https://cdn.discordapp.com/icons/${ctx.guildId}/${guild.icon}.webp?size=32`;
        img.alt = "";
        container.appendChild(img);
    }

    const name = document.createElement("span");
    name.textContent = guild.name;
    container.appendChild(name);

    const separator = document.createElement("span");
    separator.className = "vc-enrichedHeader-breadcrumbSeparator";
    separator.textContent = ">";
    container.appendChild(separator);
}

function createBreadcrumbElement(ctx: HeaderContext): HTMLElement {
    const container = document.createElement("span");
    container.className = "vc-enrichedHeader-breadcrumb";
    updateBreadcrumbElement(container, ctx);
    return container;
}

function registerCoreHeaderItems() {
    disposeRegistration(coreSidebarRegistration);
    disposeRegistration(coreBreadcrumbRegistration);

    const store = getSettingsStore();

    coreSidebarRegistration = layoutRegistry.registerItem({
        id: "enrichedHeader:sidebar-controls",
        zone: store.sidebarTogglePosition === "left" ? "beforeBreadcrumb" : "trailing",
        priority: 0,
        render: () => createSidebarToggleElement(
            () => getSidebarMode(getSettingsStore()),
            mode => {
                setSidebarMode(getSettingsStore(), mode);
                refreshHeader();
            },
        ),
    });

    coreBreadcrumbRegistration = layoutRegistry.registerItem({
        id: "enrichedHeader:guild-breadcrumb",
        zone: "breadcrumb",
        priority: 0,
        visible: ctx => getSettingsStore().guildNameStyle === "breadcrumb" && Boolean(ctx.guildId),
        render: createBreadcrumbElement,
        update: updateBreadcrumbElement,
    });
}

const api: EnrichedHeaderAPI = {
    version: 1,
    registerItem<TId extends HeaderItemId>(item: HeaderItemDefinition<TId>): HeaderRegistration<TId> {
        const registration = layoutRegistry.registerItem(item);
        refreshHeader();
        return {
            id: registration.id,
            dispose() {
                registration.dispose();
                refreshHeader();
            },
        };
    },
    setTitleOverride<TId extends HeaderItemId>(id: TId, override: HeaderTitleOverride): HeaderRegistration<TId> {
        const registration = layoutRegistry.setTitleOverride(id, override);
        refreshHeader();
        return {
            id: registration.id,
            dispose() {
                registration.dispose();
                refreshHeader();
            },
        };
    },
    refresh() {
        refreshHeader();
    },
    isActive() {
        return Boolean(domController?.isActive());
    },
    ownsSidebarControls() {
        return Boolean(coreSidebarRegistration);
    },
    subscribe(listener: (ctx: HeaderContext) => void): HeaderRegistration<`${string}:subscription`> {
        const id = `enrichedHeader:${++nextSubscription}:subscription` as const;
        subscriptions.set(id, listener);
        try { listener(getHeaderContext()); } catch { }
        return {
            id,
            dispose() {
                subscriptions.delete(id);
            },
        };
    },
};

declare global {
    interface Window {
        __enrichedHeader?: EnrichedHeaderAPI;
    }
}

window.__enrichedHeader = api;

export const settings = definePluginSettings({
    headerEnabled: {
        type: OptionType.BOOLEAN,
        description: "Move channel header controls into the title bar",
        default: false,
        onChange: () => restartDomIfNeeded(),
    },
    migratedFromChannelTabsV1: {
        type: OptionType.BOOLEAN,
        description: "Internal migration marker for ChannelTabs enriched header settings",
        default: false,
        hidden: true,
    },
    sidebarTogglePosition: {
        type: OptionType.SELECT,
        description: "Sidebar toggle position in the enriched header",
        options: [
            { label: "Left", value: "left", default: true },
            { label: "Right", value: "right" },
        ],
        onChange: () => {
            registerCoreHeaderItems();
            refreshHeader();
        },
    },
    guildNameStyle: {
        type: OptionType.SELECT,
        description: "Guild name display in the enriched header",
        options: [
            { label: "Hidden", value: "none", default: true },
            { label: "Breadcrumb", value: "breadcrumb" },
        ],
        onChange: () => refreshHeader(),
    },
    navButtonsStyle: {
        type: OptionType.SELECT,
        description: "Back/forward navigation buttons in the enriched header",
        options: [
            { label: "Show", value: "show", default: true },
            { label: "Compact", value: "compact" },
            { label: "Hidden", value: "hidden" },
        ],
        onChange: () => refreshHeader(),
    },
    hideGuildSidebar: {
        type: OptionType.BOOLEAN,
        description: "Hide the guild sidebar",
        default: false,
        onChange: () => refreshHeader(),
    },
    hideChannelList: {
        type: OptionType.BOOLEAN,
        description: "Hide the channel list sidebar",
        default: false,
        onChange: () => refreshHeader(),
    },
    keybind_cycleSidebar: {
        type: OptionType.STRING,
        description: "Cycle sidebar visibility",
        default: "ctrl+Backquote",
    },
    keybind_cycleSidebar_enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable cycle sidebar keybind",
        default: true,
    },
});

export default definePlugin({
    name: "EnrichedHeader",
    description: "Moves Discord channel header controls into the title bar and exposes a typed header layout API",
    authors: [{ name: "kamaras", id: 132106519264100352n }],
    settings,
    settingsAboutComponent() {
        const { Button } = require("@webpack/common");
        return (
            <Button onClick={() => getSettingsHubWindow().__settingsHub?.open("EnrichedHeader")}>
                Open Full Settings
            </Button>
        );
    },
    start() {
        migrateChannelTabsSettings(
            getSettingsStore() as unknown as Record<string, unknown>,
            getChannelTabsMigrationSource(),
        );
        window.__enrichedHeader = api;

        registerCoreHeaderItems();
        applySidebarClasses(getSettingsStore());
        applyNavClasses();

        macosWindowFullscreenController = createMacosWindowFullscreenController();
        macosWindowFullscreenController.start();

        domController = createHeaderDomController({
            renderLayout,
            teardownLayout,
            onRelocated: notifySubscribers,
        });

        window.__keybindRegistry?.register({
            plugin: "EnrichedHeader",
            settings,
            keybinds: {
                cycleSidebar: {
                    action: "Cycle sidebar visibility",
                    defaultKeys: "ctrl+Backquote",
                    defaultEnabled: true,
                    handler: () => {
                        cycleSidebarMode(getSettingsStore());
                        refreshHeader();
                    },
                },
            },
        });

        getSettingsHubWindow().__settingsHub?.register(createEnrichedHeaderSchema(settings));

        if (getSettingsStore().headerEnabled) {
            setTimeout(() => restartDomIfNeeded(), 1000);
        }
    },
    stop() {
        window.__keybindRegistry?.unregister("EnrichedHeader");
        getSettingsHubWindow().__settingsHub?.unregister("EnrichedHeader");

        domController?.undo();
        domController = null;
        macosWindowFullscreenController?.stop();
        macosWindowFullscreenController = null;
        teardownLayout();
        clearSidebarClasses();
        clearNavClasses();
        disposeRegistration(coreSidebarRegistration);
        disposeRegistration(coreBreadcrumbRegistration);
        coreSidebarRegistration = null;
        coreBreadcrumbRegistration = null;
        notifySubscribers();
    },
});
