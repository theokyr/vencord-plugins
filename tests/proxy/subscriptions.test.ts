import { describe, it, expect, beforeEach } from "vitest";
import { SubscriptionManager } from "../../proxy/src/subscriptions";
import type { EventMessage } from "../../proxy/src/protocol";

describe("SubscriptionManager", () => {
    let manager: SubscriptionManager;

    beforeEach(() => {
        manager = new SubscriptionManager();
    });

    describe("create()", () => {
        it("returns incrementing IDs with epoch prefix", () => {
            const id1 = manager.create(["message_create"]);
            const id2 = manager.create(["typing_start"]);
            const id3 = manager.create(["presence_update"]);

            expect(id1).toMatch(/^sub_\d+_1$/);
            expect(id2).toMatch(/^sub_\d+_2$/);
            expect(id3).toMatch(/^sub_\d+_3$/);
            // All share the same epoch
            const epoch1 = id1.split("_")[1];
            const epoch2 = id2.split("_")[1];
            const epoch3 = id3.split("_")[1];
            expect(epoch1).toBe(epoch2);
            expect(epoch2).toBe(epoch3);
        });

        it("stores subscription with events and filters", () => {
            manager.create(["message_create", "message_delete"], {
                guildId: "123",
                channelId: "456",
            });

            const all = manager.getAll();
            expect(all).toHaveLength(1);
            expect(all[0].events).toEqual(["message_create", "message_delete"]);
            expect(all[0].filters).toEqual({ guildId: "123", channelId: "456" });
        });

        it("stores subscription without filters", () => {
            manager.create(["typing_start"]);

            const all = manager.getAll();
            expect(all).toHaveLength(1);
            expect(all[0].filters).toBeUndefined();
        });
    });

    describe("remove()", () => {
        it("deletes existing subscription and returns true", () => {
            const id = manager.create(["message_create"]);
            const result = manager.remove(id);

            expect(result).toBe(true);
            expect(manager.getAll()).toHaveLength(0);
        });

        it("returns false for non-existent ID", () => {
            expect(manager.remove("sub_999")).toBe(false);
        });

        it("returns false when removing the same ID twice", () => {
            const id = manager.create(["message_create"]);
            manager.remove(id);
            expect(manager.remove(id)).toBe(false);
        });
    });

    describe("getAll()", () => {
        it("returns empty array initially", () => {
            expect(manager.getAll()).toEqual([]);
        });

        it("returns all subscriptions", () => {
            manager.create(["message_create"]);
            manager.create(["typing_start"]);
            manager.create(["presence_update"]);

            const all = manager.getAll();
            expect(all).toHaveLength(3);
            const ids = all.map(s => s.id);
            expect(ids[0]).toMatch(/^sub_\d+_1$/);
            expect(ids[1]).toMatch(/^sub_\d+_2$/);
            expect(ids[2]).toMatch(/^sub_\d+_3$/);
        });
    });

    describe("match()", () => {
        const makeEvent = (event: string): EventMessage => ({
            type: "event",
            subscription: "",
            event,
            data: {},
        });

        it("returns subscription IDs matching an event type", () => {
            const id = manager.create(["message_create"]);
            const matched = manager.match(makeEvent("message_create"));

            expect(matched).toEqual([id]);
        });

        it("returns empty array for unmatched events", () => {
            manager.create(["message_create"]);
            const matched = manager.match(makeEvent("typing_start"));

            expect(matched).toEqual([]);
        });

        it("returns empty array when no subscriptions exist", () => {
            expect(manager.match(makeEvent("message_create"))).toEqual([]);
        });

        it("handles multiple subscriptions with overlapping events", () => {
            const id1 = manager.create(["message_create", "message_delete"]);
            const id2 = manager.create(["message_create", "typing_start"]);
            const id3 = manager.create(["presence_update"]);

            const matched = manager.match(makeEvent("message_create"));
            expect(matched).toEqual([id1, id2]);

            const matchedDelete = manager.match(makeEvent("message_delete"));
            expect(matchedDelete).toEqual([id1]);

            const matchedPresence = manager.match(makeEvent("presence_update"));
            expect(matchedPresence).toEqual([id3]);
        });

        it("does not match removed subscriptions", () => {
            const id = manager.create(["message_create"]);
            manager.remove(id);

            expect(manager.match(makeEvent("message_create"))).toEqual([]);
        });
    });

    describe("clear()", () => {
        it("removes all subscriptions", () => {
            manager.create(["message_create"]);
            manager.create(["typing_start"]);
            manager.clear();

            expect(manager.getAll()).toEqual([]);
        });

        it("resets counter so IDs restart from 1 again", () => {
            manager.create(["message_create"]);
            manager.create(["typing_start"]);
            manager.clear();

            const id = manager.create(["presence_update"]);
            expect(id).toMatch(/^sub_\d+_1$/);
        });
    });
});
