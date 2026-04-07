import { describe, it, expect } from "vitest";
import { codeToLabel, normalizeEvent, parseKeybind, serializeKeybind } from "../../plugins/_libKeybindRegistry/format";

describe("_libKeybindRegistry/format", () => {
    describe("codeToLabel", () => {
        it("converts ControlLeft to ctrl", () => {
            expect(codeToLabel("ControlLeft")).toBe("ctrl");
        });
        it("converts ControlRight to ctrl", () => {
            expect(codeToLabel("ControlRight")).toBe("ctrl");
        });
        it("converts AltLeft to alt", () => {
            expect(codeToLabel("AltLeft")).toBe("alt");
        });
        it("converts ShiftLeft to shift", () => {
            expect(codeToLabel("ShiftLeft")).toBe("shift");
        });
        it("converts MetaLeft to meta", () => {
            expect(codeToLabel("MetaLeft")).toBe("meta");
        });
        it("converts KeyW to w", () => {
            expect(codeToLabel("KeyW")).toBe("w");
        });
        it("converts Digit1 to 1", () => {
            expect(codeToLabel("Digit1")).toBe("1");
        });
        it("converts Tab to tab", () => {
            expect(codeToLabel("Tab")).toBe("tab");
        });
        it("converts Backquote to backquote", () => {
            expect(codeToLabel("Backquote")).toBe("backquote");
        });
        it("converts BracketRight to bracketright", () => {
            expect(codeToLabel("BracketRight")).toBe("bracketright");
        });
    });

    describe("normalizeEvent", () => {
        function makeEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
            return { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, code: "KeyA", ...overrides } as KeyboardEvent;
        }

        it("returns just the key code when no modifiers", () => {
            expect(normalizeEvent(makeEvent({ code: "KeyW" }))).toBe("KeyW");
        });
        it("includes ctrl prefix", () => {
            expect(normalizeEvent(makeEvent({ ctrlKey: true, code: "KeyW" }))).toBe("ctrl+KeyW");
        });
        it("includes multiple modifiers in order ctrl+alt+shift+meta", () => {
            expect(normalizeEvent(makeEvent({ ctrlKey: true, altKey: true, shiftKey: true, code: "KeyW" }))).toBe("ctrl+alt+shift+KeyW");
        });
        it("handles Tab key", () => {
            expect(normalizeEvent(makeEvent({ ctrlKey: true, code: "Tab" }))).toBe("ctrl+Tab");
        });
        it("returns modifier-only string when code is a modifier", () => {
            expect(normalizeEvent(makeEvent({ ctrlKey: true, altKey: true, code: "AltLeft" }))).toBe("ctrl+alt");
        });
    });

    describe("parseKeybind", () => {
        it("splits on +", () => {
            expect(parseKeybind("ctrl+shift+KeyW")).toEqual(["ctrl", "shift", "KeyW"]);
        });
        it("handles single key", () => {
            expect(parseKeybind("Escape")).toEqual(["Escape"]);
        });
        it("trims whitespace", () => {
            expect(parseKeybind("ctrl + shift + KeyW")).toEqual(["ctrl", "shift", "KeyW"]);
        });
        it("filters empty parts", () => {
            expect(parseKeybind("ctrl++KeyW")).toEqual(["ctrl", "KeyW"]);
        });
    });

    describe("serializeKeybind", () => {
        it("joins with +", () => {
            expect(serializeKeybind(["ctrl", "shift", "KeyW"])).toBe("ctrl+shift+KeyW");
        });
    });
});
