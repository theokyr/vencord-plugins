import { describe, it, expect } from "vitest";
import {
    resolveActionPositions,
    DEFAULT_ACTION_CONFIGS,
    TAB_ACTIONS,
    ACTION_LABELS,
    HIDDEN_SUBMENU_ORDER,
    HIDDEN_SUBMENU_SEPARATOR_AFTER,
    type TabActionConfig,
} from "../../plugins/channelTabs/contextMenuConfig";

describe("contextMenuConfig", () => {
    describe("constants", () => {
        it("TAB_ACTIONS has exactly 10 entries", () => {
            expect(TAB_ACTIONS).toHaveLength(10);
        });

        it("every TAB_ACTION has a label in ACTION_LABELS", () => {
            for (const action of TAB_ACTIONS) {
                expect(ACTION_LABELS).toHaveProperty(action);
                expect(typeof ACTION_LABELS[action]).toBe("string");
                expect(ACTION_LABELS[action].length).toBeGreaterThan(0);
            }
        });

        it("DEFAULT_ACTION_CONFIGS has an entry for every TAB_ACTION", () => {
            const configActions = DEFAULT_ACTION_CONFIGS.map(c => c.action);
            for (const action of TAB_ACTIONS) {
                expect(configActions).toContain(action);
            }
            expect(DEFAULT_ACTION_CONFIGS).toHaveLength(TAB_ACTIONS.length);
        });

        it("default: pin and close are 'above', everything else is 'hidden'", () => {
            const byAction = Object.fromEntries(
                DEFAULT_ACTION_CONFIGS.map(c => [c.action, c.position])
            );
            expect(byAction["pin"]).toBe("above");
            expect(byAction["close"]).toBe("above");
            const hiddenActions = TAB_ACTIONS.filter(a => a !== "pin" && a !== "close");
            for (const action of hiddenActions) {
                expect(byAction[action]).toBe("hidden");
            }
        });

        it("HIDDEN_SUBMENU_ORDER contains only valid TAB_ACTIONS", () => {
            for (const id of HIDDEN_SUBMENU_ORDER) {
                expect(TAB_ACTIONS).toContain(id);
            }
        });

        it("HIDDEN_SUBMENU_ORDER does not contain 'pin' or 'close'", () => {
            expect(HIDDEN_SUBMENU_ORDER).not.toContain("pin");
            expect(HIDDEN_SUBMENU_ORDER).not.toContain("close");
        });

        it("HIDDEN_SUBMENU_SEPARATOR_AFTER is 2 (after closeRight)", () => {
            expect(HIDDEN_SUBMENU_SEPARATOR_AFTER).toBe(2);
            // HIDDEN_SUBMENU_ORDER is 0-indexed; index 2 is "closeRight" (the 3rd entry)
            expect(HIDDEN_SUBMENU_ORDER[HIDDEN_SUBMENU_SEPARATOR_AFTER]).toBe("closeRight");
        });
    });

    describe("resolveActionPositions — 'top' mode", () => {
        it("all actions go to above, below and hidden are empty", () => {
            const result = resolveActionPositions("top", DEFAULT_ACTION_CONFIGS);
            expect(result.above).toHaveLength(DEFAULT_ACTION_CONFIGS.length);
            expect(result.below).toHaveLength(0);
            expect(result.hidden).toHaveLength(0);
        });

        it("above contains every action from configs", () => {
            const result = resolveActionPositions("top", DEFAULT_ACTION_CONFIGS);
            for (const config of DEFAULT_ACTION_CONFIGS) {
                expect(result.above).toContain(config.action);
            }
        });

        it("preserves config order in above array", () => {
            const configs: TabActionConfig[] = [
                { action: "close", position: "hidden" },
                { action: "pin", position: "above" },
                { action: "markRead", position: "below" },
            ];
            const result = resolveActionPositions("top", configs);
            expect(result.above).toEqual(["close", "pin", "markRead"]);
        });

        it("empty config produces empty above", () => {
            const result = resolveActionPositions("top", []);
            expect(result.above).toEqual([]);
            expect(result.below).toEqual([]);
            expect(result.hidden).toEqual([]);
        });
    });

    describe("resolveActionPositions — 'bottom' mode", () => {
        it("all actions go to below, above and hidden are empty", () => {
            const result = resolveActionPositions("bottom", DEFAULT_ACTION_CONFIGS);
            expect(result.above).toHaveLength(0);
            expect(result.below).toHaveLength(DEFAULT_ACTION_CONFIGS.length);
            expect(result.hidden).toHaveLength(0);
        });

        it("below contains every action from configs", () => {
            const result = resolveActionPositions("bottom", DEFAULT_ACTION_CONFIGS);
            for (const config of DEFAULT_ACTION_CONFIGS) {
                expect(result.below).toContain(config.action);
            }
        });

        it("preserves config order in below array", () => {
            const configs: TabActionConfig[] = [
                { action: "markAllRead", position: "above" },
                { action: "close", position: "hidden" },
                { action: "pin", position: "below" },
            ];
            const result = resolveActionPositions("bottom", configs);
            expect(result.below).toEqual(["markAllRead", "close", "pin"]);
        });

        it("empty config produces empty below", () => {
            const result = resolveActionPositions("bottom", []);
            expect(result.above).toEqual([]);
            expect(result.below).toEqual([]);
            expect(result.hidden).toEqual([]);
        });
    });

    describe("resolveActionPositions — 'hybrid' mode", () => {
        it("default config: pin+close above, rest hidden", () => {
            const result = resolveActionPositions("hybrid", DEFAULT_ACTION_CONFIGS);
            expect(result.above).toEqual(["pin", "close"]);
            expect(result.below).toEqual([]);
            expect(result.hidden).toHaveLength(DEFAULT_ACTION_CONFIGS.length - 2);
        });

        it("all 'above': everything in above, nothing elsewhere", () => {
            const configs: TabActionConfig[] = TAB_ACTIONS.map(action => ({
                action,
                position: "above",
            }));
            const result = resolveActionPositions("hybrid", configs);
            expect(result.above).toHaveLength(TAB_ACTIONS.length);
            expect(result.below).toEqual([]);
            expect(result.hidden).toEqual([]);
        });

        it("all 'below': everything in below, nothing elsewhere", () => {
            const configs: TabActionConfig[] = TAB_ACTIONS.map(action => ({
                action,
                position: "below",
            }));
            const result = resolveActionPositions("hybrid", configs);
            expect(result.above).toEqual([]);
            expect(result.below).toHaveLength(TAB_ACTIONS.length);
            expect(result.hidden).toEqual([]);
        });

        it("all 'hidden': everything in hidden, sorted by HIDDEN_SUBMENU_ORDER", () => {
            // Only actions in HIDDEN_SUBMENU_ORDER go into hidden
            const configs: TabActionConfig[] = HIDDEN_SUBMENU_ORDER.map(action => ({
                action,
                position: "hidden",
            }));
            const result = resolveActionPositions("hybrid", configs);
            expect(result.above).toEqual([]);
            expect(result.below).toEqual([]);
            expect(result.hidden).toEqual(HIDDEN_SUBMENU_ORDER);
        });

        it("mixed: actions split correctly into their configured positions", () => {
            const configs: TabActionConfig[] = [
                { action: "pin", position: "above" },
                { action: "close", position: "below" },
                { action: "closeOthers", position: "hidden" },
                { action: "markRead", position: "above" },
                { action: "markAllRead", position: "below" },
            ];
            const result = resolveActionPositions("hybrid", configs);
            expect(result.above).toEqual(["pin", "markRead"]);
            expect(result.below).toEqual(["close", "markAllRead"]);
            expect(result.hidden).toEqual(["closeOthers"]);
        });

        it("above/below preserve config order, hidden sorted by HIDDEN_SUBMENU_ORDER regardless of config order", () => {
            // Supply hidden items in reverse HIDDEN_SUBMENU_ORDER
            const reversedHidden = [...HIDDEN_SUBMENU_ORDER].reverse();
            const configs: TabActionConfig[] = [
                { action: "pin", position: "above" },
                { action: "close", position: "above" },
                ...reversedHidden.map(action => ({ action, position: "hidden" as const })),
            ];
            const result = resolveActionPositions("hybrid", configs);
            expect(result.above).toEqual(["pin", "close"]);
            expect(result.hidden).toEqual(HIDDEN_SUBMENU_ORDER);
        });

        it("empty config array: all arrays empty", () => {
            const result = resolveActionPositions("hybrid", []);
            expect(result.above).toEqual([]);
            expect(result.below).toEqual([]);
            expect(result.hidden).toEqual([]);
        });

        it("single action 'above': just that one in above", () => {
            const result = resolveActionPositions("hybrid", [
                { action: "pin", position: "above" },
            ]);
            expect(result.above).toEqual(["pin"]);
            expect(result.below).toEqual([]);
            expect(result.hidden).toEqual([]);
        });

        it("single action 'hidden': sorted into correct position in hidden", () => {
            // markAllRead is at index 4 in HIDDEN_SUBMENU_ORDER — should still just be [markAllRead]
            const result = resolveActionPositions("hybrid", [
                { action: "markAllRead", position: "hidden" },
            ]);
            expect(result.above).toEqual([]);
            expect(result.below).toEqual([]);
            expect(result.hidden).toEqual(["markAllRead"]);
        });

        it("hidden ordering: closeLeft comes before markRead", () => {
            const configs: TabActionConfig[] = [
                { action: "markRead", position: "hidden" },
                { action: "closeLeft", position: "hidden" },
            ];
            const result = resolveActionPositions("hybrid", configs);
            const closeLeftIdx = result.hidden.indexOf("closeLeft");
            const markReadIdx = result.hidden.indexOf("markRead");
            expect(closeLeftIdx).toBeLessThan(markReadIdx);
        });
    });

    describe("edge cases", () => {
        it("hidden items are always sorted by HIDDEN_SUBMENU_ORDER even if configs are in reverse order", () => {
            const configs: TabActionConfig[] = [
                { action: "markRightRead", position: "hidden" },
                { action: "markLeftRead", position: "hidden" },
                { action: "markOthersRead", position: "hidden" },
                { action: "markAllRead", position: "hidden" },
                { action: "markRead", position: "hidden" },
                { action: "closeRight", position: "hidden" },
                { action: "closeLeft", position: "hidden" },
                { action: "closeOthers", position: "hidden" },
            ];
            const result = resolveActionPositions("hybrid", configs);
            expect(result.hidden).toEqual(HIDDEN_SUBMENU_ORDER);
        });

        it("actions not in HIDDEN_SUBMENU_ORDER are filtered out of hidden", () => {
            // pin and close are not in HIDDEN_SUBMENU_ORDER, so if they're marked hidden
            // they get collected into hiddenSet but filtered by HIDDEN_SUBMENU_ORDER
            const configs: TabActionConfig[] = [
                { action: "pin", position: "hidden" },
                { action: "close", position: "hidden" },
                { action: "closeOthers", position: "hidden" },
            ];
            const result = resolveActionPositions("hybrid", configs);
            // pin and close are not in HIDDEN_SUBMENU_ORDER, so they're excluded
            expect(result.hidden).toEqual(["closeOthers"]);
            expect(result.hidden).not.toContain("pin");
            expect(result.hidden).not.toContain("close");
        });

        it("duplicate actions in configs: only first is counted (Set deduplication)", () => {
            const configs: TabActionConfig[] = [
                { action: "closeOthers", position: "hidden" },
                { action: "closeOthers", position: "hidden" },
            ];
            const result = resolveActionPositions("hybrid", configs);
            expect(result.hidden).toEqual(["closeOthers"]);
        });

        it("'top' mode ignores position values entirely", () => {
            const configs: TabActionConfig[] = [
                { action: "pin", position: "hidden" },
                { action: "close", position: "below" },
            ];
            const result = resolveActionPositions("top", configs);
            expect(result.above).toEqual(["pin", "close"]);
            expect(result.below).toEqual([]);
            expect(result.hidden).toEqual([]);
        });

        it("'bottom' mode ignores position values entirely", () => {
            const configs: TabActionConfig[] = [
                { action: "pin", position: "above" },
                { action: "close", position: "hidden" },
            ];
            const result = resolveActionPositions("bottom", configs);
            expect(result.above).toEqual([]);
            expect(result.below).toEqual(["pin", "close"]);
            expect(result.hidden).toEqual([]);
        });
    });
});
