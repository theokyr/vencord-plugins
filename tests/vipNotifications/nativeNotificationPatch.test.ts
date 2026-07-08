import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "../../plugins/vipNotifications/index.tsx"), "utf8");
const notificationPatchBlock = source.slice(
    source.indexOf("find: \".SUPPRESS_NOTIFICATIONS))return!1\""),
    source.indexOf("start() {"),
);

describe("vipNotifications native notification patch", () => {
    it("does not embed stale minified bindings in notification patch replacements", () => {
        expect(source).not.toContain("w.A.getStatus()");
        expect(source).not.toContain("y.NO.getSetting()");
        expect(source).not.toContain("M.Ay.allowNoMessages(o)");
        expect(source).not.toContain("T.A.isMuted(o.id)");
    });

    it("captures Discord's minified export names instead of hardcoding them", () => {
        expect(notificationPatchBlock).not.toMatch(/\\?\.NO\\?\.getSetting/);
        expect(notificationPatchBlock).not.toMatch(/\\?\.MRS\\?\.SELF_MENTIONABLE_SYSTEM/);
        expect(notificationPatchBlock).not.toMatch(/\\?\.CP\\?\.NO_MESSAGES/);
        expect(notificationPatchBlock).not.toMatch(/\\?\.CP\\?\.ALL_MESSAGES/);
        expect(notificationPatchBlock).not.toMatch(/\\?\.l\\?\)/);
        expect(notificationPatchBlock).not.toMatch(/\\?\.bG\\?\)/);
    });

    it("groups notification predicate replacements so partial matches are rolled back", () => {
        expect(notificationPatchBlock).toContain("group: true");
    });
});
