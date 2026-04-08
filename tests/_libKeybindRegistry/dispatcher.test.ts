// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { register, _reset } from "../../plugins/_libKeybindRegistry/registry";
import { startDispatcher, stopDispatcher } from "../../plugins/_libKeybindRegistry/dispatcher";

function fireKeydown(opts: { code: string; key?: string; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean; }) {
    const event = new KeyboardEvent("keydown", {
        code: opts.code,
        key: opts.key ?? opts.code,
        ctrlKey: opts.ctrlKey ?? false,
        altKey: opts.altKey ?? false,
        shiftKey: opts.shiftKey ?? false,
        metaKey: opts.metaKey ?? false,
        bubbles: true,
    });
    document.dispatchEvent(event);
}

describe("_libKeybindRegistry/dispatcher", () => {
    afterEach(() => {
        stopDispatcher();
        _reset();
    });

    describe("basic dispatch", () => {
        it("calls handler when keybind matches", () => {
            const handler = vi.fn();
            register({
                plugin: "Test",
                keybinds: { doIt: { action: "Do it", defaultKeys: "ctrl+KeyA", handler } },
            });
            startDispatcher();
            fireKeydown({ code: "KeyA", ctrlKey: true });
            expect(handler).toHaveBeenCalledTimes(1);
        });

        it("does not call handler when keybind does not match", () => {
            const handler = vi.fn();
            register({
                plugin: "Test",
                keybinds: { doIt: { action: "Do it", defaultKeys: "ctrl+KeyA", handler } },
            });
            startDispatcher();
            fireKeydown({ code: "KeyB", ctrlKey: true });
            expect(handler).not.toHaveBeenCalled();
        });

        it("does not call disabled keybind handler", () => {
            const handler = vi.fn();
            register({
                plugin: "Test",
                keybinds: { doIt: { action: "Do it", defaultKeys: "ctrl+KeyA", handler, defaultEnabled: false } },
            });
            startDispatcher();
            fireKeydown({ code: "KeyA", ctrlKey: true });
            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe("text input guard", () => {
        it("blocks keybind with textInputBehavior='block' when focused on INPUT", () => {
            const handler = vi.fn();
            register({
                plugin: "Test",
                keybinds: {
                    doIt: { action: "Do it", defaultKeys: "ctrl+KeyA", handler, textInputBehavior: "block" },
                },
            });
            startDispatcher();

            const input = document.createElement("input");
            document.body.appendChild(input);
            input.focus();
            fireKeydown({ code: "KeyA", ctrlKey: true });
            expect(handler).not.toHaveBeenCalled();
            input.remove();
        });

        it("allows keybind with textInputBehavior='allow' when focused on INPUT", () => {
            const handler = vi.fn();
            register({
                plugin: "Test",
                keybinds: {
                    doIt: { action: "Do it", defaultKeys: "ctrl+Tab", handler, textInputBehavior: "allow" },
                },
            });
            startDispatcher();

            const input = document.createElement("input");
            document.body.appendChild(input);
            input.focus();
            fireKeydown({ code: "Tab", ctrlKey: true });
            expect(handler).toHaveBeenCalledTimes(1);
            input.remove();
        });
    });

    describe("conflict resolution", () => {
        it("calls neither handler when conflict is unresolved", () => {
            const handlerA = vi.fn();
            const handlerB = vi.fn();
            register({ plugin: "A", keybinds: { x: { action: "X", defaultKeys: "ctrl+KeyW", handler: handlerA } } });
            register({ plugin: "B", keybinds: { y: { action: "Y", defaultKeys: "ctrl+KeyW", handler: handlerB } } });
            startDispatcher();
            fireKeydown({ code: "KeyW", ctrlKey: true });
            expect(handlerA).not.toHaveBeenCalled();
            expect(handlerB).not.toHaveBeenCalled();
        });

        it("calls winner handler when conflict is resolved", async () => {
            const handlerA = vi.fn();
            const handlerB = vi.fn();
            register({ plugin: "A", keybinds: { x: { action: "X", defaultKeys: "ctrl+KeyW", handler: handlerA } } });
            register({ plugin: "B", keybinds: { y: { action: "Y", defaultKeys: "ctrl+KeyW", handler: handlerB } } });

            const { resolve } = await import("../../plugins/_libKeybindRegistry/registry");
            resolve("ctrl+KeyW", "A.x");

            startDispatcher();
            fireKeydown({ code: "KeyW", ctrlKey: true });
            expect(handlerA).toHaveBeenCalledTimes(1);
            expect(handlerB).not.toHaveBeenCalled();
        });
    });

    describe("stopDispatcher", () => {
        it("removes the listener so keybinds stop firing", () => {
            const handler = vi.fn();
            register({ plugin: "T", keybinds: { a: { action: "A", defaultKeys: "ctrl+KeyA", handler } } });
            startDispatcher();
            stopDispatcher();
            fireKeydown({ code: "KeyA", ctrlKey: true });
            expect(handler).not.toHaveBeenCalled();
        });
    });
});
