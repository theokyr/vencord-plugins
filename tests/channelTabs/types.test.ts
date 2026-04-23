import { describe, it, expect } from "vitest";
import {
    isChannelTab, isRouteTab, isGroupTab, isLeafTab,
    type ChannelTab, type RouteTab, type GroupTab
} from "../../plugins/channelTabs/types";

const channelTab: ChannelTab = {
    type: "channel", id: "tab-1", channelId: "123", guildId: "456", pinned: false,
};
const routeTab: RouteTab = {
    type: "route", id: "tab-2", path: "/store", label: "Store", pinned: false,
};
const groupTab: GroupTab = {
    type: "group", id: "tab-3", name: "Work", color: null, pinned: false,
    collapsed: true, children: [channelTab],
};

describe("type guards", () => {
    it("isChannelTab identifies channel tabs", () => {
        expect(isChannelTab(channelTab)).toBe(true);
        expect(isChannelTab(routeTab)).toBe(false);
        expect(isChannelTab(groupTab)).toBe(false);
    });

    it("isRouteTab identifies route tabs", () => {
        expect(isRouteTab(routeTab)).toBe(true);
        expect(isRouteTab(channelTab)).toBe(false);
        expect(isRouteTab(groupTab)).toBe(false);
    });

    it("isGroupTab identifies group tabs", () => {
        expect(isGroupTab(groupTab)).toBe(true);
        expect(isGroupTab(channelTab)).toBe(false);
        expect(isGroupTab(routeTab)).toBe(false);
    });

    it("isLeafTab identifies non-group tabs", () => {
        expect(isLeafTab(channelTab)).toBe(true);
        expect(isLeafTab(routeTab)).toBe(true);
        expect(isLeafTab(groupTab)).toBe(false);
    });
});
