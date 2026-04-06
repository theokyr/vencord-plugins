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

export type Tab = ChannelTab | RouteTab;
