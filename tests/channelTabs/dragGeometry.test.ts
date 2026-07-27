// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import {
    absorbTargetAt,
    autoScrollDirection,
    computeChildSlot,
    computeInsertIndex,
    slotToMoveTarget,
    topLevelItems,
} from "../../plugins/channelTabs/dragGeometry";

/** happy-dom has no layout engine, so rects are stubbed explicitly. */
function stubRect(el: HTMLElement, rect: { left: number; width: number; top?: number; height?: number; }) {
    const top = rect.top ?? 0;
    const height = rect.height ?? 26;
    el.getBoundingClientRect = () => ({
        left: rect.left,
        right: rect.left + rect.width,
        width: rect.width,
        top,
        bottom: top + height,
        height,
        x: rect.left,
        y: top,
        toJSON: () => ({}),
    }) as DOMRect;
}

/** Bar of `widths.length` tabs laid out left-to-right starting at x=0. */
function makeBar(widths: number[]): HTMLElement {
    const bar = document.createElement("div");
    let left = 0;
    widths.forEach((width, i) => {
        const el = document.createElement("div");
        el.dataset.vcTabIndex = String(i);
        el.dataset.vcTabId = `tab-${i}`;
        stubRect(el, { left, width });
        bar.appendChild(el);
        left += width;
    });
    stubRect(bar, { left: 0, width: left });
    return bar;
}

describe("channelTabs/dragGeometry", () => {
    describe("topLevelItems", () => {
        it("returns only direct children carrying a tab index", () => {
            const bar = makeBar([100, 100]);
            // A dropdown row nested inside a tab must not be picked up.
            const nested = document.createElement("div");
            nested.dataset.vcTabIndex = "99";
            bar.firstElementChild!.appendChild(nested);

            expect(topLevelItems(bar).map(e => e.dataset.vcTabIndex)).toEqual(["0", "1"]);
        });
    });

    describe("computeInsertIndex", () => {
        // Tabs occupy 0-100, 100-200, 200-300; midpoints at 50, 150, 250.
        const cases: Array<[number, number]> = [
            [0, 0],
            [49, 0],
            [51, 1],
            [149, 1],
            [151, 2],
            [249, 2],
            [251, 3],
            [999, 3],
        ];

        it.each(cases)("clientX %i → slot %i", (clientX, expected) => {
            expect(computeInsertIndex(makeBar([100, 100, 100]), clientX, 3)).toBe(expected);
        });

        it("returns 0 for an empty bar", () => {
            expect(computeInsertIndex(makeBar([]), 42, 0)).toBe(0);
        });
    });

    describe("absorbTargetAt", () => {
        function makeChip(id: string, left: number, width: number) {
            const chip = document.createElement("div");
            chip.className = "vc-channelTabs-group-chip";
            chip.dataset.vcGroupId = id;
            stubRect(chip, { left, width });
            return chip;
        }

        it("returns the group id inside the middle band", () => {
            const chip = makeChip("g1", 0, 100);
            expect(absorbTargetAt(chip, 50)).toBe("g1");
            expect(absorbTargetAt(chip, 31)).toBe("g1");
            expect(absorbTargetAt(chip, 69)).toBe("g1");
        });

        it("returns null in the reorder edge zones", () => {
            const chip = makeChip("g1", 0, 100);
            expect(absorbTargetAt(chip, 5)).toBeNull();
            expect(absorbTargetAt(chip, 29)).toBeNull();
            expect(absorbTargetAt(chip, 71)).toBeNull();
            expect(absorbTargetAt(chip, 99)).toBeNull();
        });

        it("resolves the chip from a nested descendant", () => {
            const chip = makeChip("g1", 0, 100);
            const icon = document.createElement("img");
            chip.appendChild(icon);
            expect(absorbTargetAt(icon, 50)).toBe("g1");
        });

        it("returns null when the pointer is not over a chip", () => {
            const plain = document.createElement("div");
            stubRect(plain, { left: 0, width: 100 });
            expect(absorbTargetAt(plain, 50)).toBeNull();
        });

        it("returns null for a zero-width chip instead of dividing by zero", () => {
            expect(absorbTargetAt(makeChip("g1", 0, 0), 0)).toBeNull();
        });
    });

    describe("computeChildSlot", () => {
        it("picks the slot from vertical midpoints", () => {
            const list = document.createElement("div");
            [0, 1, 2].forEach(i => {
                const el = document.createElement("div");
                el.dataset.vcChildIndex = String(i);
                stubRect(el, { left: 0, width: 200, top: i * 30, height: 30 });
                list.appendChild(el);
            });

            expect(computeChildSlot(list, 5, 3)).toBe(0);
            expect(computeChildSlot(list, 20, 3)).toBe(1);
            expect(computeChildSlot(list, 50, 3)).toBe(2);
            expect(computeChildSlot(list, 200, 3)).toBe(3);
        });

        it("uses original child indices, not visual order", () => {
            // The dropdown sorts pinned children first, so DOM order != index order.
            const list = document.createElement("div");
            [2, 0, 1].forEach((originalIdx, pos) => {
                const el = document.createElement("div");
                el.dataset.vcChildIndex = String(originalIdx);
                stubRect(el, { left: 0, width: 200, top: pos * 30, height: 30 });
                list.appendChild(el);
            });

            expect(computeChildSlot(list, 5, 3)).toBe(2);
            expect(computeChildSlot(list, 35, 3)).toBe(0);
        });
    });

    describe("slotToMoveTarget", () => {
        it("shifts down when inserting after the source", () => {
            // [A B C], drag A (0) to the far end (slot 3) → index 2 after removal.
            expect(slotToMoveTarget(3, 0, 3)).toBe(2);
            expect(slotToMoveTarget(2, 0, 3)).toBe(1);
        });

        it("keeps the slot when inserting before the source", () => {
            expect(slotToMoveTarget(0, 2, 3)).toBe(0);
            expect(slotToMoveTarget(1, 2, 3)).toBe(1);
        });

        it("returns null for no-op moves on either side of the source", () => {
            expect(slotToMoveTarget(1, 1, 3)).toBeNull();
            expect(slotToMoveTarget(2, 1, 3)).toBeNull();
        });

        it("clamps to the last valid index", () => {
            expect(slotToMoveTarget(10, 0, 3)).toBe(2);
        });
    });

    describe("autoScrollDirection", () => {
        function makeScrollableBar(scrollWidth: number, clientWidth: number) {
            const bar = document.createElement("div");
            stubRect(bar, { left: 0, width: clientWidth });
            Object.defineProperty(bar, "scrollWidth", { value: scrollWidth });
            Object.defineProperty(bar, "clientWidth", { value: clientWidth });
            return bar;
        }

        it("does not scroll a bar that fits", () => {
            expect(autoScrollDirection(makeScrollableBar(500, 500), 2)).toBe(0);
        });

        it("scrolls left/right near the edges of an overflowing bar", () => {
            const bar = makeScrollableBar(1500, 500);
            expect(autoScrollDirection(bar, 10)).toBe(-1);
            expect(autoScrollDirection(bar, 490)).toBe(1);
            expect(autoScrollDirection(bar, 250)).toBe(0);
        });
    });
});
