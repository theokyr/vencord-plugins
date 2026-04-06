/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

// ─── Body class helpers ────────────────────────────────────────────────────────

export const BODY_CLASSES = {
    hideClanTags: "vc-bsNoMore-hideClanTags",
    hideProfileDecorations: "vc-bsNoMore-hideProfileDecorations",
    hideStoreTabs: "vc-bsNoMore-hideStoreTabs",
    hideServerBanners: "vc-bsNoMore-hideServerBanners",
} as const;

export type BodyClassKey = keyof typeof BODY_CLASSES;

export function toggleBodyClass(key: BodyClassKey, enabled: boolean) {
    document.body.classList.toggle(BODY_CLASSES[key], enabled);
}

// ─── Re-render subscribers for the ButtonBar component ────────────────────────

export const barListeners = new Set<() => void>();
export function notifyBar() { barListeners.forEach(fn => fn()); }

// ─── Settings ─────────────────────────────────────────────────────────────────

export const settings = definePluginSettings({
    // ── DM Sidebar ──────────────────────────────
    compactDMNav: {
        type: OptionType.BOOLEAN,
        description: "Replace the vertical DM nav list with a compact horizontal button bar (restart required)",
        default: true,
    },
    iconOnlyMode: {
        type: OptionType.BOOLEAN,
        description: "Use circular icon buttons instead of labeled pills",
        default: false,
        onChange: notifyBar,
    },
    iconSize: {
        type: OptionType.NUMBER,
        description: "Icon size in pixels",
        default: 16,
        onChange: notifyBar,
    },
    textSize: {
        type: OptionType.NUMBER,
        description: "Label text size in pixels (pill mode only)",
        default: 12,
        onChange: notifyBar,
    },
    barPadding: {
        type: OptionType.NUMBER,
        description: "Vertical padding above and below the button bar (pixels)",
        default: 8,
        onChange: notifyBar,
    },
    barAlignment: {
        type: OptionType.SELECT,
        description: "Button bar alignment",
        default: "left",
        options: [
            { label: "Left", value: "left", default: true },
            { label: "Center", value: "center" },
            { label: "Right", value: "right" },
        ],
        onChange: notifyBar,
    },
    showFriends: {
        type: OptionType.BOOLEAN,
        description: "Show Friends button",
        default: true,
        onChange: notifyBar,
    },
    showMessageRequests: {
        type: OptionType.BOOLEAN,
        description: "Show Message Requests button",
        default: true,
        onChange: notifyBar,
    },
    showNitroHome: {
        type: OptionType.BOOLEAN,
        description: "Show Nitro Home button",
        default: false,
        onChange: notifyBar,
    },
    showShop: {
        type: OptionType.BOOLEAN,
        description: "Show Shop button",
        default: false,
        onChange: notifyBar,
    },
    showQuests: {
        type: OptionType.BOOLEAN,
        description: "Show Quests button",
        default: false,
        onChange: notifyBar,
    },

    // ── Global Clutter ──────────────────────────
    hideClanTags: {
        type: OptionType.BOOLEAN,
        description: "Hide clan tag badges everywhere",
        default: true,
        onChange: (val: boolean) => toggleBodyClass("hideClanTags", val),
    },
    hideProfileDecorations: {
        type: OptionType.BOOLEAN,
        description: "Hide avatar decoration effects",
        default: true,
        onChange: (val: boolean) => toggleBodyClass("hideProfileDecorations", val),
    },
    hideQuestPopups: {
        type: OptionType.BOOLEAN,
        description: "Suppress quest/orb advertisement popups (restart required)",
        default: true,
    },
    hideStoreTabs: {
        type: OptionType.BOOLEAN,
        description: "Hide store UI elements and upsell banners",
        default: true,
        onChange: (val: boolean) => toggleBodyClass("hideStoreTabs", val),
    },
    hideServerBanners: {
        type: OptionType.BOOLEAN,
        description: "Hide server banner images in the channel list header",
        default: true,
        onChange: (val: boolean) => toggleBodyClass("hideServerBanners", val),
    },
});
