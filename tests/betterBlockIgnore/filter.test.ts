import { describe, expect, it } from "vitest";

import {
    isFilteredRelationshipUser,
    shouldHideMessageByRelationship,
    shouldHideReactionByRelationship,
    type BetterBlockIgnoreOptions,
    type RelationshipChecks,
} from "../../plugins/betterBlockIgnore/filter";

const baseOptions: BetterBlockIgnoreOptions = {
    applyToIgnoredUsers: true,
    hideBlockedMessages: true,
    hideRepliesToBlockedUsers: true,
    hideMentionsOfBlockedUsers: true,
    hideReactionsFromBlockedUsers: true,
};

function checks(blocked: string[] = [], ignored: string[] = []): RelationshipChecks {
    return {
        isBlocked: id => blocked.includes(id),
        isIgnored: id => ignored.includes(id),
    };
}

describe("BetterBlockIgnore filters", () => {
    it("matches blocked users and only matches ignored users when enabled", () => {
        expect(isFilteredRelationshipUser("blocked", checks(["blocked"]), true)).toBe(true);
        expect(isFilteredRelationshipUser("ignored", checks([], ["ignored"]), true)).toBe(true);
        expect(isFilteredRelationshipUser("ignored", checks([], ["ignored"]), false)).toBe(false);
        expect(isFilteredRelationshipUser("other", checks(["blocked"], ["ignored"]), true)).toBe(false);
    });

    it("hides messages authored by blocked or ignored users when blocked message hiding is enabled", () => {
        expect(shouldHideMessageByRelationship(
            { author: { id: "blocked" } },
            baseOptions,
            checks(["blocked"])
        )).toBe(true);

        expect(shouldHideMessageByRelationship(
            { author: { id: "ignored" } },
            baseOptions,
            checks([], ["ignored"])
        )).toBe(true);

        expect(shouldHideMessageByRelationship(
            { author: { id: "ignored" } },
            { ...baseOptions, applyToIgnoredUsers: false },
            checks([], ["ignored"])
        )).toBe(false);
    });

    it("hides direct replies to blocked users when enabled", () => {
        expect(shouldHideMessageByRelationship(
            {
                author: { id: "speaker" },
                referenced_message: { author: { id: "blocked" } },
            },
            baseOptions,
            checks(["blocked"])
        )).toBe(true);

        expect(shouldHideMessageByRelationship(
            {
                author: { id: "speaker" },
                referenced_message: { author: { id: "blocked" } },
            },
            { ...baseOptions, hideRepliesToBlockedUsers: false },
            checks(["blocked"])
        )).toBe(false);
    });

    it("resolves reply targets from message references when the embedded message is absent", () => {
        expect(shouldHideMessageByRelationship(
            {
                author: { id: "speaker" },
                channel_id: "channel-1",
                messageReference: { channel_id: "channel-1", message_id: "target-1" },
            },
            baseOptions,
            checks(["blocked"]),
            (channelId, messageId) => channelId === "channel-1" && messageId === "target-1"
                ? { author: { id: "blocked" } }
                : undefined
        )).toBe(true);
    });

    it("hides messages that mention blocked users with either object or string mention shapes", () => {
        expect(shouldHideMessageByRelationship(
            { author: { id: "speaker" }, mentions: [{ id: "blocked" }] },
            baseOptions,
            checks(["blocked"])
        )).toBe(true);

        expect(shouldHideMessageByRelationship(
            { author: { id: "speaker" }, mentions: ["blocked"] },
            baseOptions,
            checks(["blocked"])
        )).toBe(true);

        expect(shouldHideMessageByRelationship(
            { author: { id: "speaker" }, mentions: ["blocked"] },
            { ...baseOptions, hideMentionsOfBlockedUsers: false },
            checks(["blocked"])
        )).toBe(false);
    });

    it("hides reaction events from blocked or ignored users when enabled", () => {
        expect(shouldHideReactionByRelationship(
            { userId: "blocked" },
            baseOptions,
            checks(["blocked"])
        )).toBe(true);

        expect(shouldHideReactionByRelationship(
            { user_id: "ignored" },
            baseOptions,
            checks([], ["ignored"])
        )).toBe(true);

        expect(shouldHideReactionByRelationship(
            { user: { id: "blocked" } },
            { ...baseOptions, hideReactionsFromBlockedUsers: false },
            checks(["blocked"])
        )).toBe(false);
    });
});
