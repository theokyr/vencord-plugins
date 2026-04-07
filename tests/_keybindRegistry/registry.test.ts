import { describe, it, expect, afterEach } from "vitest";
import {
    register, unregister, getAll, getConflicts,
    resolve, updateKeys, setEnabled, onChange, _reset,
} from "../../plugins/_keybindRegistry/registry";

function makeOpts(plugin: string, keybinds: Record<string, { action: string; defaultKeys: string; handler?: () => void; defaultEnabled?: boolean; }>) {
    const filled: Record<string, any> = {};
    for (const [k, v] of Object.entries(keybinds)) {
        filled[k] = { action: v.action, defaultKeys: v.defaultKeys, handler: v.handler ?? (() => {}), defaultEnabled: v.defaultEnabled };
    }
    return { plugin, keybinds: filled };
}

describe("_keybindRegistry/registry", () => {
    afterEach(() => _reset());

    describe("register / getAll", () => {
        it("registers keybinds and retrieves them", () => {
            register(makeOpts("TestPlugin", {
                doThing: { action: "Do thing", defaultKeys: "ctrl+KeyA" },
            }));
            const all = getAll();
            expect(all).toHaveLength(1);
            expect(all[0].id).toBe("TestPlugin.doThing");
            expect(all[0].keys).toBe("ctrl+KeyA");
            expect(all[0].enabled).toBe(true);
        });

        it("uses defaultEnabled when provided", () => {
            register(makeOpts("P", {
                a: { action: "A", defaultKeys: "ctrl+KeyA", defaultEnabled: false },
            }));
            expect(getAll()[0].enabled).toBe(false);
        });

        it("re-register replaces existing entries for same plugin", () => {
            register(makeOpts("P", { a: { action: "A", defaultKeys: "ctrl+KeyA" } }));
            register(makeOpts("P", { b: { action: "B", defaultKeys: "ctrl+KeyB" } }));
            const all = getAll();
            expect(all).toHaveLength(1);
            expect(all[0].id).toBe("P.b");
        });
    });

    describe("unregister", () => {
        it("removes all keybinds for a plugin", () => {
            register(makeOpts("P", {
                a: { action: "A", defaultKeys: "ctrl+KeyA" },
                b: { action: "B", defaultKeys: "ctrl+KeyB" },
            }));
            expect(getAll()).toHaveLength(2);
            unregister("P");
            expect(getAll()).toHaveLength(0);
        });

        it("does nothing for non-existent plugin", () => {
            expect(() => unregister("NonExistent")).not.toThrow();
        });
    });

    describe("getConflicts", () => {
        it("returns empty map when no conflicts", () => {
            register(makeOpts("A", { x: { action: "X", defaultKeys: "ctrl+KeyA" } }));
            register(makeOpts("B", { y: { action: "Y", defaultKeys: "ctrl+KeyB" } }));
            expect(getConflicts().size).toBe(0);
        });

        it("detects conflict when two plugins share the same key combo", () => {
            register(makeOpts("A", { x: { action: "X", defaultKeys: "ctrl+KeyW" } }));
            register(makeOpts("B", { y: { action: "Y", defaultKeys: "ctrl+KeyW" } }));
            const conflicts = getConflicts();
            expect(conflicts.size).toBe(1);
            expect(conflicts.get("ctrl+KeyW")).toHaveLength(2);
        });

        it("excludes disabled keybinds from conflicts", () => {
            register(makeOpts("A", { x: { action: "X", defaultKeys: "ctrl+KeyW" } }));
            register(makeOpts("B", { y: { action: "Y", defaultKeys: "ctrl+KeyW", defaultEnabled: false } }));
            expect(getConflicts().size).toBe(0);
        });
    });

    describe("resolve", () => {
        it("stores a conflict resolution", () => {
            register(makeOpts("A", { x: { action: "X", defaultKeys: "ctrl+KeyW" } }));
            register(makeOpts("B", { y: { action: "Y", defaultKeys: "ctrl+KeyW" } }));
            resolve("ctrl+KeyW", "A.x");
            // getConflicts still reports it (it's still a conflict), but dispatcher uses resolution
            expect(getConflicts().size).toBe(1);
        });
    });

    describe("updateKeys", () => {
        it("changes the key combo for a keybind", () => {
            register(makeOpts("P", { a: { action: "A", defaultKeys: "ctrl+KeyA" } }));
            updateKeys("P.a", "ctrl+KeyB");
            expect(getAll()[0].keys).toBe("ctrl+KeyB");
            expect(getAll()[0].defaultKeys).toBe("ctrl+KeyA");
        });

        it("does nothing for non-existent id", () => {
            expect(() => updateKeys("nope.nope", "ctrl+KeyX")).not.toThrow();
        });
    });

    describe("setEnabled", () => {
        it("toggles enabled state", () => {
            register(makeOpts("P", { a: { action: "A", defaultKeys: "ctrl+KeyA" } }));
            expect(getAll()[0].enabled).toBe(true);
            setEnabled("P.a", false);
            expect(getAll()[0].enabled).toBe(false);
        });
    });

    describe("onChange", () => {
        it("fires on register", () => {
            let called = 0;
            const cleanup = onChange(() => { called++; });
            register(makeOpts("P", { a: { action: "A", defaultKeys: "ctrl+KeyA" } }));
            expect(called).toBe(1);
            cleanup();
        });

        it("fires on unregister", () => {
            register(makeOpts("P", { a: { action: "A", defaultKeys: "ctrl+KeyA" } }));
            let called = 0;
            const cleanup = onChange(() => { called++; });
            unregister("P");
            expect(called).toBe(1);
            cleanup();
        });

        it("fires on updateKeys", () => {
            register(makeOpts("P", { a: { action: "A", defaultKeys: "ctrl+KeyA" } }));
            let called = 0;
            const cleanup = onChange(() => { called++; });
            updateKeys("P.a", "ctrl+KeyB");
            expect(called).toBe(1);
            cleanup();
        });

        it("cleanup removes listener", () => {
            let called = 0;
            const cleanup = onChange(() => { called++; });
            cleanup();
            register(makeOpts("P", { a: { action: "A", defaultKeys: "ctrl+KeyA" } }));
            expect(called).toBe(0);
        });
    });
});
