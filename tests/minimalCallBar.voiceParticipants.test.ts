import { describe, expect, it, vi } from "vitest";

import { pickVoiceStates } from "../plugins/minimalCallBar/voiceParticipants";

function vs(userId: string) {
    return {
        userId,
        selfMute: false,
        selfDeaf: false,
        mute: false,
        deaf: false,
        selfVideo: false,
        selfStream: false,
    };
}

describe("pickVoiceStates", () => {
    it("unwraps the sorted store's entries, preserving its order", () => {
        const sorted = [{ voiceState: vs("c") }, { voiceState: vs("a") }, { voiceState: vs("b") }];
        const raw = { a: vs("a"), b: vs("b"), c: vs("c") };

        expect(pickVoiceStates(sorted, raw).map(s => s.userId)).toEqual(["c", "a", "b"]);
    });

    it("falls back to the raw store when the sorted store has no entries", () => {
        const raw = { a: vs("a"), b: vs("b") };

        expect(pickVoiceStates([], raw).map(s => s.userId)).toEqual(["a", "b"]);
    });

    it("falls back when the sorted store is unavailable", () => {
        const raw = { a: vs("a") };

        expect(pickVoiceStates(undefined, raw).map(s => s.userId)).toEqual(["a"]);
        expect(pickVoiceStates(null, raw).map(s => s.userId)).toEqual(["a"]);
    });

    it("returns an empty list when neither store has anything", () => {
        expect(pickVoiceStates(undefined, undefined)).toEqual([]);
        expect(pickVoiceStates([], {})).toEqual([]);
    });

    it("drops sorted entries with no voice state rather than emitting holes", () => {
        const sorted = [{ voiceState: vs("a") }, { voiceState: undefined as any }, { voiceState: vs("b") }];

        expect(pickVoiceStates(sorted, null).map(s => s.userId)).toEqual(["a", "b"]);
    });
});

describe("getSortedVoiceStates", () => {
    // The stores are resolved at module load, so each case re-imports with its own stubs.
    // resetModules also gives the webpack mock a fresh registry, so the stubs must be
    // registered through the re-imported copy rather than the one bound at file scope.
    async function load(stores: Record<string, unknown>) {
        vi.resetModules();
        const webpack = await import("./__mocks__/webpack");
        webpack.__resetMockStores();
        for (const [name, store] of Object.entries(stores)) webpack.__setMockStore(name, store);
        return (await import("../plugins/minimalCallBar/voiceParticipants")).getSortedVoiceStates;
    }

    it("asks the sorted store for the channel's guild bucket", async () => {
        const getVoiceStatesForChannelAlt = vi.fn(() => [{ voiceState: vs("z") }, { voiceState: vs("y") }]);
        const get = await load({
            SortedVoiceStateStore: { getVoiceStatesForChannelAlt },
            ChannelStore: { getChannel: () => ({ getGuildId: () => "guild-1" }) },
        });

        expect(get("chan-1").map(s => s.userId)).toEqual(["z", "y"]);
        expect(getVoiceStatesForChannelAlt).toHaveBeenCalledWith("chan-1", "guild-1");
    });

    it("prefers a caller-supplied guild id over a channel lookup", async () => {
        const getVoiceStatesForChannelAlt = vi.fn(() => [{ voiceState: vs("z") }]);
        const getChannel = vi.fn();
        const get = await load({
            SortedVoiceStateStore: { getVoiceStatesForChannelAlt },
            ChannelStore: { getChannel },
        });

        get("chan-1", "guild-2");

        expect(getVoiceStatesForChannelAlt).toHaveBeenCalledWith("chan-1", "guild-2");
        expect(getChannel).not.toHaveBeenCalled();
    });

    it("uses the @me bucket for DM and group calls", async () => {
        const getVoiceStatesForChannelAlt = vi.fn(() => [{ voiceState: vs("z") }]);
        const get = await load({
            SortedVoiceStateStore: { getVoiceStatesForChannelAlt },
            ChannelStore: { getChannel: () => ({ getGuildId: () => null }) },
        });

        get("dm-1");

        expect(getVoiceStatesForChannelAlt).toHaveBeenCalledWith("dm-1", undefined);
    });

    it("reads guild_id when the channel record has no getGuildId", async () => {
        const getVoiceStatesForChannelAlt = vi.fn(() => [{ voiceState: vs("z") }]);
        const get = await load({
            SortedVoiceStateStore: { getVoiceStatesForChannelAlt },
            ChannelStore: { getChannel: () => ({ guild_id: "guild-3" }) },
        });

        get("chan-1");

        expect(getVoiceStatesForChannelAlt).toHaveBeenCalledWith("chan-1", "guild-3");
    });

    it("falls back to the unsorted store when the sorted store is empty", async () => {
        const get = await load({
            SortedVoiceStateStore: { getVoiceStatesForChannelAlt: () => [] },
            VoiceStateStore: { getVoiceStatesForChannel: () => ({ a: vs("a"), b: vs("b") }) },
            ChannelStore: { getChannel: () => ({ getGuildId: () => "guild-1" }) },
        });

        expect(get("chan-1").map(s => s.userId)).toEqual(["a", "b"]);
    });

    it("falls back when the sorted store throws", async () => {
        const get = await load({
            SortedVoiceStateStore: { getVoiceStatesForChannelAlt: () => { throw new Error("not ready"); } },
            VoiceStateStore: { getVoiceStatesForChannel: () => ({ a: vs("a") }) },
            ChannelStore: { getChannel: () => ({ getGuildId: () => "guild-1" }) },
        });

        expect(get("chan-1").map(s => s.userId)).toEqual(["a"]);
    });

    it("survives a channel lookup that throws", async () => {
        const getVoiceStatesForChannelAlt = vi.fn(() => [{ voiceState: vs("z") }]);
        const get = await load({
            SortedVoiceStateStore: { getVoiceStatesForChannelAlt },
            ChannelStore: { getChannel: () => { throw new Error("not ready"); } },
        });

        expect(get("chan-1").map(s => s.userId)).toEqual(["z"]);
        expect(getVoiceStatesForChannelAlt).toHaveBeenCalledWith("chan-1", undefined);
    });

    it("returns an empty list when no store is available", async () => {
        const get = await load({});

        expect(get("chan-1")).toEqual([]);
    });
});
