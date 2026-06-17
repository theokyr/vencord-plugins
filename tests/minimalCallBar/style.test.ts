import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../../plugins/minimalCallBar/style.css"), "utf8");

function blockFor(selector: string) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    return match?.[1] ?? "";
}

describe("MinimalCallBar styles", () => {
    it("prevents the injected root from growing as a Discord page flex child", () => {
        const root = blockFor("#vc-minimalCallBar-root");

        expect(root).toContain("flex: 0 0 auto");
        expect(root).toContain("width: 100%");
        expect(root).toContain("min-width: 0");
    });

    it("keeps strip and bottom bars at a border-inclusive 32px height", () => {
        expect(blockFor(".vc-minimalCallBar-strip")).toContain("box-sizing: border-box");
        expect(blockFor(".vc-minimalCallBar-bottom")).toContain("box-sizing: border-box");
    });
});
