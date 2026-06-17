import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "../../plugins/settingsHub/index.tsx"), "utf8");
const css = readFileSync(resolve(__dirname, "../../plugins/settingsHub/style.css"), "utf8");

describe("SettingsHub EnrichedHeader integration", () => {
    it("uses the EnrichedHeader API instead of ChannelTabs header DOM placement", () => {
        expect(source).toContain("__enrichedHeader");
        expect(source).toContain("setTitleOverride");
        expect(source).not.toContain("vc-channelTabs-headerBreadcrumb");
    });

    it("requires the EnrichedHeader API to be active before relying on title override", () => {
        expect(source).toContain("window.__enrichedHeader?.setTitleOverride");
        expect(source).toContain("window.__enrichedHeader.isActive()");
    });

    it("uses the shared EnrichedHeaderAPI type instead of a narrower inline declaration", () => {
        expect(source).toContain('import type { EnrichedHeaderAPI } from "../enrichedHeader/api";');
        expect(source).toContain("__enrichedHeader?: EnrichedHeaderAPI;");
        expect(source).not.toContain("setTitleOverride(key: string, override:");
    });

    it("cleans up the EnrichedHeader title override registration", () => {
        expect(source).toContain("enrichedHeaderTitleRegistration.dispose();");
        expect(source).toContain("enrichedHeaderTitleRegistration = null;");
    });

    it("keeps the fallback header label without ChannelTabs breadcrumb placement", () => {
        expect(source).toContain("vc-settingsHub-header-label");
        expect(source).not.toContain("querySelector('.vc-channelTabs-headerBreadcrumb')");
        expect(source).not.toContain('querySelector(".vc-channelTabs-headerBreadcrumb")');
    });

    it("does not hide ChannelTabs-specific relocated header selectors", () => {
        expect(css).not.toContain("children__9293f");
        expect(css).not.toContain("toolbar__9293f");
        expect(css).not.toContain("vc-channelTabs-overflowBtn");
        expect(css).not.toContain("vc-channelTabs-headerBreadcrumb");
    });
});
