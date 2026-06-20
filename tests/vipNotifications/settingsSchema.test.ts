import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "../../plugins/vipNotifications/settingsSchema.tsx"), "utf8");

describe("vipNotifications/settingsSchema", () => {
    it("keeps SettingsHub focused on the full manager and diagnostics", () => {
        expect(source).toContain("id: \"manager\"");
        expect(source).toContain("render: FullVipManager");
        expect(source).toContain("id: \"diagnostics\"");
        expect(source).toContain("render: DiagnosticsPanel");

        expect(source).not.toContain("id: \"native\"");
        expect(source).not.toContain("Vencord Plugin Settings");
        expect(source).not.toContain("Compact Manager");
    });
});
