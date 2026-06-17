import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelTab } from "../../plugins/channelTabs/types";

async function importTabMetaWithStores(channel: any) {
    vi.resetModules();
    const { __resetMockStores, __setMockStore } = await import("@webpack");
    __resetMockStores();
    __setMockStore("ChannelStore", { getChannel: () => channel });
    __setMockStore("GuildStore", { getGuild: () => null });
    __setMockStore("UserStore", {
        getUser: (userId: string) => ({
            id: userId,
            username: "directuser",
            globalName: "Direct User",
            getAvatarURL: () => `https://cdn.discordapp.com/avatars/${userId}/avatar.webp?size=32`,
        }),
    });
    __setMockStore("RelationshipStore", { getNickname: () => undefined, isFriend: () => true });
    return import("../../plugins/channelTabs/tabMeta");
}

function makeTab(channelId = "200000000000000001"): ChannelTab {
    return { type: "channel", id: "tab-1", channelId, guildId: null, pinned: false };
}

describe("getTabMeta", () => {
    beforeEach(async () => {
        vi.resetModules();
        const { __resetMockStores } = await import("@webpack");
        __resetMockStores();
    });

    it("uses the group DM name and icon instead of the first recipient", async () => {
        const { getTabMeta } = await importTabMetaWithStores({
            id: "200000000000000001",
            type: 3,
            name: "Project Chat",
            guild_id: null,
            icon: "abcdef1234567890abcdef1234567890",
            recipients: ["100000000000000001"],
            isDM: () => false,
            isGroupDM: () => true,
        });

        const meta = getTabMeta(makeTab(), true);

        expect(meta).toEqual({
            icon: "https://cdn.discordapp.com/channel-icons/200000000000000001/abcdef1234567890abcdef1234567890.png?size=32",
            name: "Project Chat",
            isDm: false,
            dmUserId: null,
        });
    });

    it("uses recipient display names for unnamed group DMs", async () => {
        const { getTabMeta } = await importTabMetaWithStores({
            id: "200000000000000002",
            type: 3,
            name: "",
            guild_id: null,
            icon: null,
            rawRecipients: [
                { id: "100000000000000001", username: "ada", globalName: "Ada" },
                { id: "100000000000000002", username: "ben", globalName: "Ben", display_name: "Ben" },
            ],
            recipients: ["100000000000000001", "100000000000000002"],
            isDM: () => false,
            isGroupDM: () => true,
        });

        const meta = getTabMeta(makeTab("200000000000000002"), true);

        expect(meta).toEqual({
            icon: null,
            name: "Ada, Ben",
            isDm: false,
            dmUserId: null,
        });
    });
});
