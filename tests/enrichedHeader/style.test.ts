import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../../plugins/enrichedHeader/style.css"), "utf8");
const indexSource = readFileSync(resolve(__dirname, "../../plugins/enrichedHeader/index.tsx"), "utf8");
const domSource = readFileSync(resolve(__dirname, "../../plugins/enrichedHeader/dom.ts"), "utf8");
const overflowSource = readFileSync(resolve(__dirname, "../../plugins/enrichedHeader/overflow.ts"), "utf8");
const settingsSchemaSource = readFileSync(resolve(__dirname, "../../plugins/enrichedHeader/settingsSchema.tsx"), "utf8");

function blockFor(selector: string) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
    return match?.[1] ?? "";
}

describe("EnrichedHeader extraction", () => {
    it("exports the DOM controller API", () => {
        expect(domSource).toContain("export interface HeaderDomController");
        expect(domSource).toContain("export function createHeaderDomController");
        expect(domSource).toContain("relocate(): void");
        expect(domSource).toContain("undo(): void");
        expect(domSource).toContain("refresh(): void");
        expect(domSource).toContain("isActive(): boolean");
        expect(domSource).toContain("getTitleBar(): HTMLElement | null");
    });

    it("exports the overflow controller API", () => {
        expect(overflowSource).toContain("export interface HeaderOverflowController");
        expect(overflowSource).toContain("export function createHeaderOverflowController");
        expect(overflowSource).toContain("setup(titleBar: HTMLElement, toolbar: HTMLElement): void");
        expect(overflowSource).toContain("update(): void");
        expect(overflowSource).toContain("teardown(): void");
        expect(overflowSource).toContain("export { teardownOverflow }");
    });

    it("uses standalone enrichedHeader class names", () => {
        for (const className of [
            "vc-enrichedHeader-active",
            "vc-enrichedHeader-hideGuilds",
            "vc-enrichedHeader-hideChannels",
            "vc-enrichedHeader-sidebarToggles",
            "vc-enrichedHeader-toggleBtn",
            "vc-enrichedHeader-breadcrumb",
            "vc-enrichedHeader-layoutZone",
            "vc-enrichedHeader-titleOverride",
            "vc-enrichedHeader-navCompact",
            "vc-enrichedHeader-navHidden",
            "vc-enrichedHeader-overflowBtn",
            "vc-enrichedHeader-overflowMenu",
            "vc-enrichedHeader-overflowMenuItem",
            "vc-enrichedHeader-overflowTopic",
        ]) {
            expect(css).toContain(className);
        }

        expect(css).not.toContain("vc-channelTabs-enrichedHeader");
    });

    it("preserves Discord's three-column base grid so the titleBar area stays full width", () => {
        expect(css).toContain("[start] 0px [guildsEnd] 240px [channelsEnd] 1fr [end]");
        expect(css).toContain("[start] 72px [guildsEnd] 0px [channelsEnd] 1fr [end]");
        expect(css).toContain("[start] 0px [guildsEnd] 0px [channelsEnd] 1fr [end]");
        expect(css).not.toContain("[sidebarEnd]");
        expect(css).toContain('[class^="base_"]');
        expect(css).toContain('[class*=" base_"]');
        expect(css).toContain("grid-column: titleBar !important");
        expect(css).toContain("width: 100% !important");
        expect(css).not.toContain('[class^="base__"]');
        expect(css).not.toContain('[class*=" base__"]');
    });

    it("normalizes platform title-bar start padding without breaking macOS window controls", () => {
        expect(css).toContain("--vc-enrichedHeader-edge-padding: var(--space-8, 8px)");
        expect(css).toContain(".platform-linux body.vc-enrichedHeader-active");
        expect(css).toContain(".platform-win body.vc-enrichedHeader-active");
        expect(css).toContain(".platform-osx body.vc-enrichedHeader-active.vc-enrichedHeader-macosWindowFullscreen");
        expect(css).toContain("padding-inline-start: var(--vc-enrichedHeader-edge-padding) !important");
        expect(css).not.toContain('.platform-osx body.vc-enrichedHeader-active [data-fullscreen="true"]');
    });

    it("documents and implements title-bar relocation direction", () => {
        expect(domSource).toContain("move channel header children into the visible title bar");
        expect(domSource).toContain("function findVisibleTitleBar");
        expect(domSource).not.toContain("titleBar.parentElement?.appendChild");
    });

    it("finds the visible Discord title bar and excludes the system bar", () => {
        expect(domSource).toContain('[class*="base_"] > [class*="bar"]');
        expect(domSource).toContain("systemBar");
        expect(domSource).toMatch(/!bar\.className\.includes\("systemBar"\)|className\.includes\("systemBar"\)/);
    });

    it("queries fresh channel header children and toolbar from upperContainer", () => {
        expect(domSource).toContain('[class*="upperContainer_"] > [class*="children_"]');
        expect(domSource).toContain('[class*="upperContainer_"] > [class*="toolbar_"]');
        expect(domSource).toContain("function findChannelHeaderChildren");
        expect(domSource).toContain("function findChannelHeaderToolbar");
    });

    it("saves relocation positions and original display styles for cleanup", () => {
        expect(domSource).toContain("originalParent");
        expect(domSource).toContain("originalNextSibling");
        expect(domSource).toContain("originalDisplay");
        expect(domSource).toContain("element.style.display");
    });

    it("moves the channel toolbar before trailing title-bar controls", () => {
        expect(domSource).toContain("titleBarTrailing");
        expect(domSource).toContain("channelToolbar");
        expect(domSource).toContain("insertBeforeTrailing(channelToolbar, titleBar, titleBarTrailing)");
    });

    it("wires the overflow controller into relocation refresh and teardown", () => {
        expect(domSource).toContain("createHeaderOverflowController");
        expect(domSource).toContain("overflowController.setup(titleBar, channelToolbar)");
        expect(domSource).toContain("overflowController.update()");
        expect(domSource).toContain("overflowController.teardown()");
    });

    it("adds and removes the enrichedHeader active body class", () => {
        expect(domSource).toContain('document.body.classList.add("vc-enrichedHeader-active")');
        expect(domSource).toContain('document.body.classList.remove("vc-enrichedHeader-active")');
    });

    it("keeps the enriched title bar out of Electron native drag regions", () => {
        expect(css).toMatch(/> \[class\*="bar_"\]:not\(\[class\*="systemBar"\]\) \{[\s\S]*?-webkit-app-region: no-drag;/);
        expect(css).not.toMatch(/vc-enrichedHeader-dragOverlay[\s\S]*?-webkit-app-region: drag;/);
        expect(css).not.toMatch(/>\s*\*\s*\{[\s\S]*?-webkit-app-region: drag;/);
    });

    it("owns core breadcrumb and title override layout items", () => {
        expect(indexSource).toContain("classifyHeaderMode");
        expect(indexSource).toContain('id: "enrichedHeader:guild-breadcrumb"');
        expect(indexSource).toContain("GuildStore");
        expect(indexSource).toContain("vc-enrichedHeader-titleOverride");
        expect(indexSource).toContain("layoutRegistry.renderItem(item.id, ctx)");
    });

    it("uses monotonic subscription ids that satisfy the public id contract", () => {
        expect(indexSource).toContain("let nextSubscription = 0");
        expect(indexSource).toContain("`enrichedHeader:${++nextSubscription}:subscription`");
        expect(indexSource).not.toContain("subscriptions.size + 1");
        expect(indexSource).not.toContain("subscription-${");
    });

    it("observes page changes with a 150ms refresh debounce", () => {
        expect(domSource).toContain('[class*="page_"]');
        expect(domSource).toContain("MutationObserver");
        expect(domSource).toContain("setTimeout");
        expect(domSource).toMatch(/HEADER_REFRESH_DELAY\s*=\s*150|},\s*150\)/);
    });

    it("uses a 90 percent overflow threshold", () => {
        expect(overflowSource).toMatch(/OVERFLOW_THRESHOLD\s*=\s*0\.9/);
        expect(overflowSource).toContain("titleBar.getBoundingClientRect().width * OVERFLOW_THRESHOLD");
    });

    it("creates enrichedHeader overflow controls", () => {
        expect(overflowSource).toContain("vc-enrichedHeader-overflowBtn");
        expect(overflowSource).toContain("vc-enrichedHeader-overflowMenu");
    });

    it("builds overflow menu entries from channel topic and hidden toolbar items", () => {
        expect(overflowSource).toContain('[class*="topic__"]');
        expect(overflowSource).toContain("vc-enrichedHeader-overflowTopic");
        expect(overflowSource).toContain("getToolbarItems()");
        expect(overflowSource).toContain("hiddenToolbarItems.has(item)");
        expect(overflowSource).toContain("vc-enrichedHeader-overflowMenuItem");
    });

    it("tears down overflow and restores hidden toolbar items", () => {
        expect(overflowSource).toContain("function teardownOverflow");
        expect(overflowSource).toContain('style.display = ""');
    });

    it("prefers Discord visual-refresh theme tokens for custom header chrome", () => {
        expect(css).toContain("var(--interactive-background-hover, var(--background-mod-subtle");
        expect(css).toContain("var(--interactive-text-default, var(--interactive-normal");
        expect(css).toContain("var(--interactive-text-hover, var(--interactive-hover");
        expect(css).toContain("var(--text-subtle, var(--text-muted");
        expect(css).toContain("var(--border-subtle, var(--background-modifier-accent");
        expect(css).toContain("var(--background-surface-high, var(--background-floating");
        expect(css).not.toContain("rgba(255, 255, 255, 0.08)");
        expect(css).not.toContain("rgba(255, 255, 255, 0.35)");
        expect(css).not.toContain("rgba(255, 255, 255, 0.4)");
    });

    it("uses the same Discord tokens in the settings preview", () => {
        expect(settingsSchemaSource).toContain("--background-surface-highest");
        expect(settingsSchemaSource).toContain("--background-surface-high");
        expect(settingsSchemaSource).toContain("--interactive-text-default");
        expect(settingsSchemaSource).toContain("--text-subtle");
        expect(settingsSchemaSource).not.toContain("--text-muted, #80848e");
    });

    it("resets native title-bar button chrome and color inheritance", () => {
        const toggleButton = blockFor(".vc-enrichedHeader-toggleBtn");

        expect(css).toContain("--vc-enrichedHeader-titlebar-text");
        expect(css).toContain("--vc-enrichedHeader-titlebar-icon");
        expect(css).toContain("> [class*=\"children_\"]");
        expect(toggleButton).toContain("appearance: none");
        expect(toggleButton).toContain("background: transparent");
        expect(toggleButton).toContain("border: 0");
        expect(toggleButton).toContain("padding: 0");
    });
});
