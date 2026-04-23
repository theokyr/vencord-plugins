/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type ActionPosition = "above" | "below" | "hidden";
export type ContextMenuMode = "top" | "bottom" | "hybrid";

export interface TabActionConfig {
    action: TabActionId;
    position: ActionPosition;
}

export const TAB_ACTIONS = [
    "pin",
    "close",
    "closeOthers",
    "closeLeft",
    "closeRight",
    "markRead",
    "markAllRead",
    "markOthersRead",
    "markLeftRead",
    "markRightRead",
] as const;

export type TabActionId = typeof TAB_ACTIONS[number];

export const ACTION_LABELS: Record<TabActionId, string> = {
    pin: "Pin / Unpin",
    close: "Close",
    closeOthers: "Close Others",
    closeLeft: "Close to Left",
    closeRight: "Close to Right",
    markRead: "Mark as Read",
    markAllRead: "Mark All as Read",
    markOthersRead: "Mark Others as Read",
    markLeftRead: "Mark Left as Read",
    markRightRead: "Mark Right as Read",
};

export const DEFAULT_ACTION_CONFIGS: TabActionConfig[] = [
    { action: "pin", position: "above" },
    { action: "close", position: "above" },
    { action: "closeOthers", position: "hidden" },
    { action: "closeLeft", position: "hidden" },
    { action: "closeRight", position: "hidden" },
    { action: "markRead", position: "hidden" },
    { action: "markAllRead", position: "hidden" },
    { action: "markOthersRead", position: "hidden" },
    { action: "markLeftRead", position: "hidden" },
    { action: "markRightRead", position: "hidden" },
];

export const HIDDEN_SUBMENU_ORDER: TabActionId[] = [
    "closeOthers",
    "closeLeft",
    "closeRight",
    "markRead",
    "markAllRead",
    "markOthersRead",
    "markLeftRead",
    "markRightRead",
];

export const HIDDEN_SUBMENU_SEPARATOR_AFTER = 2;

export const GROUP_ACTIONS = [
    "renameGroup", "changeColor", "markGroupRead",
    "closeGroup", "ungroupTabs", "closeOtherGroups",
] as const;
export type GroupActionId = typeof GROUP_ACTIONS[number];

export const GROUP_ACTION_LABELS: Record<GroupActionId, string> = {
    renameGroup: "Rename Group",
    changeColor: "Change Color",
    markGroupRead: "Mark Group as Read",
    closeGroup: "Close Group",
    ungroupTabs: "Ungroup Tabs",
    closeOtherGroups: "Close Other Groups",
};

export function resolveActionPositions(
    mode: ContextMenuMode,
    configs: TabActionConfig[]
): { above: TabActionId[]; below: TabActionId[]; hidden: TabActionId[] } {
    if (mode === "top") {
        return {
            above: configs.map(c => c.action),
            below: [],
            hidden: [],
        };
    }

    if (mode === "bottom") {
        return {
            above: [],
            below: configs.map(c => c.action),
            hidden: [],
        };
    }

    // hybrid: split by each config's position, hidden sorted by HIDDEN_SUBMENU_ORDER
    const above: TabActionId[] = [];
    const below: TabActionId[] = [];
    const hiddenSet = new Set<TabActionId>();

    for (const config of configs) {
        if (config.position === "above") {
            above.push(config.action);
        } else if (config.position === "below") {
            below.push(config.action);
        } else {
            hiddenSet.add(config.action);
        }
    }

    const hidden = HIDDEN_SUBMENU_ORDER.filter(id => hiddenSet.has(id));

    return { above, below, hidden };
}
