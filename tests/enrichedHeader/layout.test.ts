import { describe, expect, it } from "vitest";
import {
    classifyHeaderMode,
    createHeaderLayoutRegistry,
} from "../../plugins/enrichedHeader/layout";
import type { HeaderContext, HeaderItemDefinition } from "../../plugins/enrichedHeader/api";

const context: HeaderContext = {
    active: true,
    guildId: "guild",
    channelId: "channel",
    path: "/channels/guild/channel",
    mode: "channel",
};

function makeItem(id: string, priority?: number): HeaderItemDefinition {
    return {
        id: id as `${string}:${string}`,
        zone: "toolbar",
        priority,
        render: () => ({}) as HTMLElement,
    };
}

describe("enrichedHeader layout registry", () => {
    it("orders items by priority ascending then stable registration order", () => {
        const registry = createHeaderLayoutRegistry();
        registry.registerItem(makeItem("test:second", 10));
        registry.registerItem(makeItem("test:first", 1));
        registry.registerItem(makeItem("test:third", 10));

        expect(registry.getItemsForZone("toolbar").map(item => item.id)).toEqual([
            "test:first",
            "test:second",
            "test:third",
        ]);
    });

    it("cleans up the old rendered element when an item id is replaced", () => {
        const registry = createHeaderLayoutRegistry();
        const cleaned: HTMLElement[] = [];
        const firstElement = {} as HTMLElement;

        registry.registerItem({
            id: "test:item",
            zone: "toolbar",
            render: () => firstElement,
            cleanup: el => cleaned.push(el),
        });
        expect(registry.renderItem("test:item", context)).toBe(firstElement);

        const secondElement = {} as HTMLElement;
        registry.registerItem({
            id: "test:item",
            zone: "toolbar",
            render: () => secondElement,
        });

        expect(cleaned).toEqual([firstElement]);
        expect(registry.renderItem("test:item", context)).toBe(secondElement);
    });

    it("keeps replacement and notification working when old cleanup throws", () => {
        const registry = createHeaderLayoutRegistry();
        const firstElement = {} as HTMLElement;
        const secondElement = {} as HTMLElement;
        let notifications = 0;

        registry.registerItem({
            id: "test:item",
            zone: "toolbar",
            render: () => firstElement,
            cleanup: () => { throw new Error("cleanup failed"); },
        });
        registry.renderItem("test:item", context);
        registry.subscribe(() => { notifications++; });

        expect(() => registry.registerItem({
            id: "test:item",
            zone: "toolbar",
            render: () => secondElement,
        })).not.toThrow();

        expect(registry.getItemsForZone("toolbar").map(item => item.id)).toEqual(["test:item"]);
        expect(registry.renderItem("test:item", context)).toBe(secondElement);
        expect(notifications).toBe(1);
    });

    it("clears all items even when one cleanup throws", () => {
        const registry = createHeaderLayoutRegistry();
        const cleaned: string[] = [];

        registry.registerItem({
            id: "test:bad",
            zone: "toolbar",
            render: () => ({}) as HTMLElement,
            cleanup: () => { throw new Error("cleanup failed"); },
        });
        registry.registerItem({
            id: "test:good",
            zone: "toolbar",
            render: () => ({}) as HTMLElement,
            cleanup: () => { cleaned.push("good"); },
        });
        registry.renderItem("test:bad", context);
        registry.renderItem("test:good", context);

        expect(() => registry.clear()).not.toThrow();
        expect(cleaned).toEqual(["good"]);
        expect(registry.getItemsForZone("toolbar")).toEqual([]);
    });

    it("does not let a stale registration dispose a newer item with the same id", () => {
        const registry = createHeaderLayoutRegistry();
        const stale = registry.registerItem(makeItem("test:item"));
        registry.registerItem({ ...makeItem("test:item"), priority: 5 });

        stale.dispose();

        expect(registry.getItemsForZone("toolbar").map(item => item.id)).toEqual(["test:item"]);
        expect(registry.getItemsForZone("toolbar")[0].priority).toBe(5);
    });

    it("resolves title overrides by highest priority then newest equal-priority registration", () => {
        const registry = createHeaderLayoutRegistry();
        registry.setTitleOverride("test:low", { label: "Low", priority: 1 });
        registry.setTitleOverride("test:oldHigh", { label: "Old High", priority: 5 });
        registry.setTitleOverride("test:newHigh", { label: "New High", priority: 5 });

        expect(registry.getTitleOverride()?.label).toBe("New High");
    });

    it("skips items whose visible callback throws", () => {
        const registry = createHeaderLayoutRegistry();
        registry.registerItem({
            ...makeItem("test:bad"),
            visible: () => { throw new Error("visible failed"); },
        });
        registry.registerItem(makeItem("test:good"));

        expect(() => registry.getItemsForZone("toolbar", context)).not.toThrow();
        expect(registry.getItemsForZone("toolbar", context).map(item => item.id)).toEqual(["test:good"]);
        expect(registry.renderItem("test:bad", context)).toBeNull();
    });

    it("guards render and update failures", () => {
        const registry = createHeaderLayoutRegistry();
        const element = {} as HTMLElement;

        registry.registerItem({
            id: "test:render",
            zone: "toolbar",
            render: () => { throw new Error("render failed"); },
        });
        expect(() => registry.renderItem("test:render", context)).not.toThrow();
        expect(registry.renderItem("test:render", context)).toBeNull();

        registry.registerItem({
            id: "test:update",
            zone: "toolbar",
            render: () => element,
            update: () => { throw new Error("update failed"); },
        });
        expect(registry.renderItem("test:update", context)).toBe(element);
        expect(() => registry.renderItem("test:update", context)).not.toThrow();
        expect(registry.renderItem("test:update", context)).toBe(element);
    });

    it("keeps notifying other listeners when one listener throws", () => {
        const registry = createHeaderLayoutRegistry();
        let called = 0;

        registry.subscribe(() => { throw new Error("listener failed"); });
        registry.subscribe(() => { called++; });

        expect(() => registry.notify(context)).not.toThrow();
        expect(called).toBe(1);
    });

    it("classifies header mode", () => {
        expect(classifyHeaderMode({ channelId: "123", path: "@@virtual" })).toBe("channel");
        expect(classifyHeaderMode({ channelId: null, path: "@@virtual" })).toBe("virtual");
        expect(classifyHeaderMode({ channelId: null, path: "/channels/@me" })).toBe("route");
        expect(classifyHeaderMode({ channelId: null, path: "/message-requests" })).toBe("route");
        expect(classifyHeaderMode({ channelId: null, path: "/store" })).toBe("route");
        expect(classifyHeaderMode({ channelId: null, path: "/shop" })).toBe("route");
        expect(classifyHeaderMode({ channelId: null, path: "/quest-home" })).toBe("route");
        expect(classifyHeaderMode({ channelId: null, path: "/other" })).toBe("unknown");
    });
});
