import { describe, it, expect, afterEach } from "vitest";
import {
    registerSchema,
    unregisterSchema,
    getSchemas,
    onSchemasChange,
} from "../../plugins/settingsHub/registry";

// Minimal schema factory — only the fields registry.ts actually touches
function makeSchema(plugin: string) {
    return {
        plugin,
        description: `${plugin} description`,
        icon: (() => null) as any,
        settings: { def: {}, store: {} } as any,
        sections: [],
    };
}

describe("settingsHub/registry", () => {
    // Clean up module-level state between tests
    afterEach(() => {
        for (const s of [...getSchemas()]) {
            unregisterSchema(s.plugin);
        }
    });

    describe("getSchemas", () => {
        it("returns empty initially", () => {
            expect(getSchemas()).toEqual([]);
        });

        it("returns all registered schemas", () => {
            registerSchema(makeSchema("PluginA"));
            registerSchema(makeSchema("PluginB"));
            const schemas = getSchemas();
            expect(schemas).toHaveLength(2);
            expect(schemas[0].plugin).toBe("PluginA");
            expect(schemas[1].plugin).toBe("PluginB");
        });
    });

    describe("registerSchema", () => {
        it("adds a schema", () => {
            registerSchema(makeSchema("TestPlugin"));
            expect(getSchemas()).toHaveLength(1);
            expect(getSchemas()[0].plugin).toBe("TestPlugin");
        });

        it("updates existing schema when same plugin name is registered", () => {
            registerSchema(makeSchema("TestPlugin"));
            const updated = makeSchema("TestPlugin");
            updated.description = "updated description";
            registerSchema(updated);

            expect(getSchemas()).toHaveLength(1);
            expect(getSchemas()[0].description).toBe("updated description");
        });
    });

    describe("unregisterSchema", () => {
        it("removes a schema", () => {
            registerSchema(makeSchema("ToRemove"));
            expect(getSchemas()).toHaveLength(1);
            unregisterSchema("ToRemove");
            expect(getSchemas()).toHaveLength(0);
        });

        it("does nothing for non-existent plugin (no error)", () => {
            expect(() => unregisterSchema("NonExistent")).not.toThrow();
            expect(getSchemas()).toHaveLength(0);
        });
    });

    describe("onSchemasChange", () => {
        it("listener fires on register", () => {
            let called = 0;
            const cleanup = onSchemasChange(() => { called++; });
            registerSchema(makeSchema("A"));
            expect(called).toBe(1);
            cleanup();
        });

        it("listener fires on unregister", () => {
            registerSchema(makeSchema("A"));
            let called = 0;
            const cleanup = onSchemasChange(() => { called++; });
            unregisterSchema("A");
            expect(called).toBe(1);
            cleanup();
        });

        it("listener does NOT fire on unregister of non-existent plugin", () => {
            let called = 0;
            const cleanup = onSchemasChange(() => { called++; });
            unregisterSchema("NonExistent");
            expect(called).toBe(0);
            cleanup();
        });

        it("cleanup function removes listener", () => {
            let called = 0;
            const cleanup = onSchemasChange(() => { called++; });
            cleanup();
            registerSchema(makeSchema("A"));
            expect(called).toBe(0);
        });

        it("multiple listeners all fire", () => {
            let countA = 0;
            let countB = 0;
            const cleanA = onSchemasChange(() => { countA++; });
            const cleanB = onSchemasChange(() => { countB++; });
            registerSchema(makeSchema("X"));
            expect(countA).toBe(1);
            expect(countB).toBe(1);
            cleanA();
            cleanB();
        });
    });
});
