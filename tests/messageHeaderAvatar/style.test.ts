import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const css = readFileSync(resolve(__dirname, "../../plugins/messageHeaderAvatar/style.css"), "utf8");

describe("MessageHeaderAvatar styles", () => {
    it("uses explicit hidden-message grouping classes instead of broad sibling selectors", () => {
        expect(css).toContain("li.vc-msgHeaderAvatar-forceHeader");
        expect(css).toContain("li.vc-msgHeaderAvatar-collapseHeader");
        expect(css).not.toContain("li.vc-better-block-ignore-hidden + li");
    });
});
