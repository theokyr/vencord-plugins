import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../../plugins/settingsHub/style.css"), "utf8");
const keybindRecorderSource = readFileSync(resolve(__dirname, "../../plugins/settingsHub/components/controls/KeybindRecorder.tsx"), "utf8");
const globalKeybindsSource = readFileSync(resolve(__dirname, "../../plugins/settingsHub/components/GlobalKeybindsPage.tsx"), "utf8");

function blockFor(selector: string) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    return match?.[1] ?? "";
}

function themedSection() {
    const match = css.match(/\/\* ─── Nitro Theme Adaptation[\s\S]*?\/\* ─── Content fade-in/);
    return match?.[0] ?? "";
}

describe("SettingsHub styles", () => {
    it("bounds hidden Discord page content so virtual scrollers cannot expand the page", () => {
        const hiddenPageContent = blockFor('body.vc-settingsHub-open [class*="page_"] > :not(#vc-channelTabs-container):not(.vc-settingsHub-route-container)');

        expect(hiddenPageContent).toContain("inset: 0");
        expect(hiddenPageContent).toContain("height: 100%");
        expect(hiddenPageContent).toContain("max-height: 100%");
        expect(hiddenPageContent).toContain("overflow: hidden");
        expect(hiddenPageContent).toContain("contain: size layout style");
    });

    it("prefers Discord visual-refresh tokens over legacy dark fallbacks", () => {
        expect(blockFor(".vc-settingsHub-page")).toContain("var(--background-base-low, var(--background-primary");
        expect(blockFor(".vc-settingsHub-page")).toContain("var(--text-default, var(--text-normal");
        expect(blockFor(".vc-settingsHub-sidebar")).toContain("var(--background-base-lowest, var(--background-secondary");
        expect(blockFor(".vc-settingsHub-content")).toContain("background: var(--background-base-low, var(--background-primary");
        expect(blockFor(".vc-settingsHub-search")).toContain("var(--input-background-default, var(--background-tertiary");
        expect(blockFor(".vc-settingsHub-search input")).toContain("var(--input-text-default");
        expect(blockFor(".vc-settingsHub-search input")).toContain("var(--text-default");
        expect(blockFor(".vc-settingsHub-search svg")).toContain("var(--input-icon-default, var(--text-muted");
        expect(blockFor(".vc-settingsHub-nav-item:hover")).toContain("var(--interactive-background-hover");
        expect(blockFor(".vc-settingsHub-nav-item.vc-settingsHub-active")).toContain("var(--interactive-background-selected");
    });

    it("keeps Nitro theme overrides on semantic Discord tokens instead of raw black or white overlays", () => {
        const themed = themedSection();

        expect(themed).toContain("--background-base-lowest");
        expect(themed).toContain("--background-surface-high");
        expect(themed).toContain("--interactive-background-hover");
        expect(themed).toContain("--border-subtle");
        expect(themed).not.toMatch(/rgba\((?:0,\s*0,\s*0|255,\s*255,\s*255)/);
    });

    it("uses status and text tokens for custom keybind UI states", () => {
        expect(blockFor(".vc-settingsHub-keybind-edit")).toContain("var(--background-mod-normal");
        expect(blockFor(".vc-settingsHub-keybind-edit")).toContain("var(--interactive-text-default");
        expect(keybindRecorderSource).toContain("var(--text-muted)");
        expect(globalKeybindsSource).toContain("var(--text-feedback-warning");
        expect(globalKeybindsSource).toContain("var(--border-feedback-warning");
        expect(keybindRecorderSource).not.toContain("#949ba4");
        expect(globalKeybindsSource).not.toContain("#f0a020");
    });
});
