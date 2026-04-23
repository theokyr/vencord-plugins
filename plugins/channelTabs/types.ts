/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface ChannelTab {
    type: "channel";
    id: string;
    channelId: string;
    guildId: string | null;
    pinned: boolean;
}

export interface RouteTab {
    type: "route";
    id: string;
    path: string;
    label: string;
    pinned: boolean;
}

export interface GroupTab {
    type: "group";
    id: string;
    name: string;
    color: string | null;
    pinned: boolean;
    collapsed: boolean;
    children: LeafTab[];
}

/** A tab that can exist standalone or inside a group */
export type LeafTab = ChannelTab | RouteTab;

/** Any tab — leaf or group */
export type Tab = LeafTab | GroupTab;

export function isChannelTab(tab: Tab): tab is ChannelTab {
    return tab.type === "channel";
}

export function isRouteTab(tab: Tab): tab is RouteTab {
    return tab.type === "route";
}

export function isGroupTab(tab: Tab): tab is GroupTab {
    return tab.type === "group";
}

export function isLeafTab(tab: Tab): tab is LeafTab {
    return tab.type !== "group";
}
