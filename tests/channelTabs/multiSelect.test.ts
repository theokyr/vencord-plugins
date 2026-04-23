import { describe, it, expect, beforeEach } from "vitest";
import {
    MultiSelectState,
    createMultiSelect,
    toggleSelect,
    rangeSelect,
    clearSelection,
    getSelectedIndices,
} from "../../plugins/channelTabs/multiSelect";

describe("multiSelect", () => {
    let ms: MultiSelectState;

    beforeEach(() => {
        ms = createMultiSelect();
    });

    it("starts empty", () => {
        expect(getSelectedIndices(ms)).toEqual([]);
    });

    it("toggleSelect adds an index", () => {
        ms = toggleSelect(ms, 2, "bar");
        expect(getSelectedIndices(ms)).toEqual([2]);
    });

    it("toggleSelect removes an already-selected index", () => {
        ms = toggleSelect(ms, 2, "bar");
        ms = toggleSelect(ms, 2, "bar");
        expect(getSelectedIndices(ms)).toEqual([]);
    });

    it("rangeSelect selects from anchor to target", () => {
        ms = toggleSelect(ms, 1, "bar");
        ms = rangeSelect(ms, 4, "bar");
        expect(getSelectedIndices(ms)).toEqual([1, 2, 3, 4]);
    });

    it("rangeSelect works backwards", () => {
        ms = toggleSelect(ms, 4, "bar");
        ms = rangeSelect(ms, 1, "bar");
        expect(getSelectedIndices(ms)).toEqual([1, 2, 3, 4]);
    });

    it("clearSelection resets state", () => {
        ms = toggleSelect(ms, 1, "bar");
        ms = toggleSelect(ms, 3, "bar");
        ms = clearSelection(ms);
        expect(getSelectedIndices(ms)).toEqual([]);
    });

    it("scoped to container — changing container clears previous selection", () => {
        ms = toggleSelect(ms, 1, "bar");
        ms = toggleSelect(ms, 2, "dropdown-g1");
        expect(getSelectedIndices(ms)).toEqual([2]);
        expect(ms.container).toBe("dropdown-g1");
    });

    it("rangeSelect with no anchor starts from 0", () => {
        ms = rangeSelect(ms, 3, "bar");
        expect(getSelectedIndices(ms)).toEqual([0, 1, 2, 3]);
    });
});
