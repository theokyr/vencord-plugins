import { describe, expect, it } from "vitest";
import {
    channelPayloadTouchesOpenTabs,
    getDirectDmRecipientIds,
    presencePayloadTouchesOpenDmTabs,
    tabListContainsChannel,
    voicePayloadTouchesOpenTabs,
} from "../../plugins/channelTabs/eventFilters";
import type { ChannelTab, GroupTab, RouteTab } from "../../plugins/channelTabs/types";

const dmTab: ChannelTab = {
    type: "channel",
    id: "tab-dm",
    channelId: "dm-1",
    guildId: null,
    pinned: false,
};

const guildTab: ChannelTab = {
    type: "channel",
    id: "tab-guild",
    channelId: "guild-1",
    guildId: "guild",
    pinned: false,
};

const routeTab: RouteTab = {
    type: "route",
    id: "tab-route",
    path: "/store",
    label: "Store",
    pinned: false,
};

const groupTab: GroupTab = {
    type: "group",
    id: "tab-group",
    name: "Group",
    color: null,
    pinned: false,
    collapsed: true,
    children: [{
        type: "channel",
        id: "child-1",
        channelId: "group-child-1",
        guildId: "guild",
        pinned: false,
    }],
};

const tabs = [dmTab, guildTab, routeTab, groupTab];

function getChannel(id: string) {
    if (id === "dm-1") return { guild_id: null, recipients: ["user-1"], isDM: () => true };
    if (id === "guild-1") return { guild_id: "guild", recipients: [], isDM: () => false };
    return null;
}

describe("channelTabs event filters", () => {
    it("matches channel tabs inside top-level and grouped tabs", () => {
        expect(tabListContainsChannel(tabs, "guild-1")).toBe(true);
        expect(tabListContainsChannel(tabs, "group-child-1")).toBe(true);
        expect(tabListContainsChannel(tabs, "missing")).toBe(false);
    });

    it("ignores channel-scoped payloads for channels without tabs", () => {
        expect(channelPayloadTouchesOpenTabs(tabs, { channelId: "guild-1" })).toBe(true);
        expect(channelPayloadTouchesOpenTabs(tabs, { channelId: "missing" })).toBe(false);
    });

    it("keeps unknown channel payloads conservative", () => {
        expect(channelPayloadTouchesOpenTabs(tabs, {})).toBe(true);
    });

    it("tracks presence only for direct DM tab recipients", () => {
        expect(getDirectDmRecipientIds(tabs, getChannel)).toEqual(new Set(["user-1"]));
        expect(presencePayloadTouchesOpenDmTabs(tabs, { updates: [{ user: { id: "user-1" } }] }, getChannel)).toBe(true);
        expect(presencePayloadTouchesOpenDmTabs(tabs, { updates: [{ user: { id: "other" } }] }, getChannel)).toBe(false);
    });

    it("keeps voice leave payloads conservative so call indicators clear", () => {
        expect(voicePayloadTouchesOpenTabs(tabs, { voiceStates: [{ channelId: "missing" }] })).toBe(false);
        expect(voicePayloadTouchesOpenTabs(tabs, { voiceStates: [{ channelId: null }] })).toBe(true);
    });
});
