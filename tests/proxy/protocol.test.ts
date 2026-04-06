import { describe, it, expect } from "vitest";
import { PROTOCOL_VERSION, DEFAULT_PORT, TOOL_NAMES, TIMEOUTS } from "../../proxy/src/protocol";

describe("protocol constants", () => {
    it("PROTOCOL_VERSION is 1", () => {
        expect(PROTOCOL_VERSION).toBe(1);
    });

    it("DEFAULT_PORT is 21420", () => {
        expect(DEFAULT_PORT).toBe(21420);
    });
});

describe("TOOL_NAMES", () => {
    const expectedKeys = [
        // Read
        "listGuilds", "listChannels", "readMessages", "getUser",
        "getGuild", "getChannel", "getPinnedMessages", "getThread",
        // State
        "getPresence", "getUnread", "getSelected", "listOnline",
        // Actions
        "sendMessage", "react", "editMessage", "deleteMessage",
        "setPresence", "joinVoice", "leaveVoice",
        // Events
        "subscribe", "unsubscribe",
        // DevTools
        "eval", "querySelector", "getWebpackModule", "getStore", "getVencordPlugins",
        // Build
        "rebuildPlugins",
        // Utility
        "testPrompt",
    ];

    it("has all expected keys", () => {
        for (const key of expectedKeys) {
            expect(TOOL_NAMES).toHaveProperty(key);
        }
    });

    it("has no unexpected keys", () => {
        const actualKeys = Object.keys(TOOL_NAMES);
        expect(actualKeys.sort()).toEqual(expectedKeys.sort());
    });

    it("all values follow the discord_ prefix convention", () => {
        for (const [key, value] of Object.entries(TOOL_NAMES)) {
            expect(value, `TOOL_NAMES.${key}`).toMatch(/^discord_/);
        }
    });

    it("has no duplicate tool names", () => {
        const values = Object.values(TOOL_NAMES);
        const unique = new Set(values);
        expect(unique.size).toBe(values.length);
    });
});

describe("TIMEOUTS", () => {
    const expectedKeys = ["handshake", "toolCall", "eval", "prompt"];

    it("has all expected keys", () => {
        for (const key of expectedKeys) {
            expect(TIMEOUTS).toHaveProperty(key);
        }
    });

    it("all values are positive numbers", () => {
        for (const [key, value] of Object.entries(TIMEOUTS)) {
            expect(value, `TIMEOUTS.${key}`).toBeGreaterThan(0);
        }
    });

    it("has reasonable values (between 1s and 120s)", () => {
        for (const [key, value] of Object.entries(TIMEOUTS)) {
            expect(value, `TIMEOUTS.${key}`).toBeGreaterThanOrEqual(1_000);
            expect(value, `TIMEOUTS.${key}`).toBeLessThanOrEqual(120_000);
        }
    });

    it("eval timeout is longer than toolCall timeout", () => {
        expect(TIMEOUTS.eval).toBeGreaterThan(TIMEOUTS.toolCall);
    });

    it("prompt timeout is the longest", () => {
        expect(TIMEOUTS.prompt).toBeGreaterThanOrEqual(TIMEOUTS.eval);
        expect(TIMEOUTS.prompt).toBeGreaterThanOrEqual(TIMEOUTS.toolCall);
        expect(TIMEOUTS.prompt).toBeGreaterThanOrEqual(TIMEOUTS.handshake);
    });
});
