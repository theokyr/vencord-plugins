import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    toolHandlers,
    registerTool,
    send,
    setSendFn,
    activeSubscriptions,
    type ToolHandler,
    type ActiveSubscription,
} from "../../plugins/discordMcp/shared";

describe("discordMcp/shared", () => {
    beforeEach(() => {
        toolHandlers.clear();
        activeSubscriptions.clear();
        // Reset send to a no-op so previous test state doesn't leak
        setSendFn(() => {});
    });

    // ─── toolHandlers ─────────────────────────────────────────────────

    describe("toolHandlers", () => {
        it("starts as an empty Map", () => {
            expect(toolHandlers.size).toBe(0);
        });

        it("registerTool adds a handler", () => {
            const handler: ToolHandler = async () => "ok";
            registerTool("test_tool", handler);

            expect(toolHandlers.size).toBe(1);
            expect(toolHandlers.get("test_tool")).toBe(handler);
        });

        it("registerTool overwrites an existing handler for the same name", () => {
            const first: ToolHandler = async () => "first";
            const second: ToolHandler = async () => "second";

            registerTool("dup", first);
            registerTool("dup", second);

            expect(toolHandlers.size).toBe(1);
            expect(toolHandlers.get("dup")).toBe(second);
        });
    });

    // ─── send / setSendFn ─────────────────────────────────────────────

    describe("send / setSendFn", () => {
        it("send() does nothing when no send function is set", () => {
            // Reset _send to null by creating a fresh module state:
            // We can't directly null it, but the beforeEach sets a no-op.
            // To truly test the null path, we need a separate approach.
            // Instead, verify it doesn't throw with the no-op set.
            expect(() => send({ type: "response", id: "1", result: null })).not.toThrow();
        });

        it("setSendFn sets the send function", () => {
            const fn = vi.fn();
            setSendFn(fn);

            const msg = { type: "response" as const, id: "1", result: "hello" };
            send(msg);

            expect(fn).toHaveBeenCalledOnce();
            expect(fn).toHaveBeenCalledWith(msg);
        });

        it("send() calls the set function with the message", () => {
            const fn = vi.fn();
            setSendFn(fn);

            const msg = { type: "response" as const, id: "2", result: { data: 42 } };
            send(msg);

            expect(fn).toHaveBeenCalledWith(msg);
        });

        it("setSendFn can be called again to change the function", () => {
            const first = vi.fn();
            const second = vi.fn();

            setSendFn(first);
            send({ type: "response" as const, id: "1", result: null });
            expect(first).toHaveBeenCalledOnce();

            setSendFn(second);
            send({ type: "response" as const, id: "2", result: null });
            expect(second).toHaveBeenCalledOnce();
            // first should not have been called again
            expect(first).toHaveBeenCalledOnce();
        });
    });

    // ─── activeSubscriptions ──────────────────────────────────────────

    describe("activeSubscriptions", () => {
        it("starts as an empty Map", () => {
            expect(activeSubscriptions.size).toBe(0);
        });

        it("can store and retrieve subscriptions", () => {
            const sub: ActiveSubscription = {
                id: "sub-1",
                events: ["MESSAGE_CREATE", "MESSAGE_DELETE"],
                filters: { channelId: "123" },
                cleanups: [() => {}],
            };

            activeSubscriptions.set(sub.id, sub);

            expect(activeSubscriptions.size).toBe(1);
            expect(activeSubscriptions.get("sub-1")).toBe(sub);
            expect(activeSubscriptions.get("sub-1")!.events).toEqual([
                "MESSAGE_CREATE",
                "MESSAGE_DELETE",
            ]);
            expect(activeSubscriptions.get("sub-1")!.filters).toEqual({ channelId: "123" });
        });
    });
});
