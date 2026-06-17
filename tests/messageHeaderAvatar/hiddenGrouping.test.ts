import { describe, expect, it } from "vitest";

import { getHiddenGroupingDecisions } from "../../plugins/messageHeaderAvatar/hiddenGrouping";

describe("MessageHeaderAvatar hidden message grouping", () => {
    it("forces a header when the first visible continuation belongs to a new author", () => {
        expect(getHiddenGroupingDecisions([
            { authorId: "previous", hidden: false, groupStart: true },
            { authorId: "next", hidden: false, groupStart: false },
        ])).toEqual(["default", "forceHeader"]);
    });

    it("collapses headers when hidden DOM content appears between visible messages from the same author", () => {
        expect(getHiddenGroupingDecisions([
            { authorId: "same", hidden: false, groupStart: true },
            { authorId: "blocked", hidden: true, groupStart: true },
            { authorId: "same", hidden: false, groupStart: true },
            { authorId: "blocked", hidden: true, groupStart: true },
            { authorId: "same", hidden: false, groupStart: true },
        ])).toEqual(["default", "default", "collapseHeader", "default", "collapseHeader"]);
    });

    it("collapses headers when filtered messages were removed from the DOM between same-author visible messages", () => {
        expect(getHiddenGroupingDecisions([
            { authorId: "same", hidden: false, groupStart: true },
            { authorId: "same", hidden: false, groupStart: true },
            { authorId: "same", hidden: false, groupStart: true },
        ])).toEqual(["default", "collapseHeader", "collapseHeader"]);
    });

    it("keeps normal headers for alternating visible authors", () => {
        expect(getHiddenGroupingDecisions([
            { authorId: "one", hidden: false, groupStart: true },
            { authorId: "two", hidden: false, groupStart: true },
            { authorId: "one", hidden: false, groupStart: true },
        ])).toEqual(["default", "default", "default"]);
    });
});
