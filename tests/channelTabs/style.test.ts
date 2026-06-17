import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../../plugins/channelTabs/style.css"), "utf8");
const source = readFileSync(resolve(__dirname, "../../plugins/channelTabs/index.tsx"), "utf8");
const tabBarSource = readFileSync(resolve(__dirname, "../../plugins/channelTabs/tabBar.tsx"), "utf8");
const settingsSchemaSource = readFileSync(resolve(__dirname, "../../plugins/channelTabs/settingsSchema.tsx"), "utf8");
const contextMenuSource = readFileSync(resolve(__dirname, "../../plugins/channelTabs/contextMenu.tsx"), "utf8");
const channelTabsSource = [source, tabBarSource, settingsSchemaSource, contextMenuSource].join("\n");

function blockFor(selector: string) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    return match?.[1] ?? "";
}

describe("ChannelTabs styles", () => {
    it("keeps the injected container fixed-size inside Discord's page flex column", () => {
        const root = blockFor("#vc-channelTabs-container");

        expect(root).toContain("order: -2");
        expect(root).toContain("flex: 0 0 auto");
        expect(root).toContain("width: 100%");
        expect(root).toContain("min-width: 0");
    });

    it("does not force minimalCallBar's injected root to fill the page", () => {
        expect(source).toContain('"vc-minimalCallBar-root"');
        expect(source).toContain("isFixedPageChromeChild(child)");
    });

    it("does not contain Enriched Header or sidebar ownership remnants", () => {
        for (const term of [
            "relocateChannelHeader",
            "enrichedHeader:",
            "showSidebarToggles",
            "sidebarTogglePosition",
            "guildNameStyle",
            "navButtonsStyle",
            "hideGuildSidebar",
            "hideChannelList",
            "keybind_cycleSidebar",
            "onToggleGuilds",
            "onToggleChannels",
            "onSetSidebarMode",
        ]) {
            expect(channelTabsSource).not.toContain(term);
        }
        expect(css).not.toContain("vc-channelTabs-enrichedHeader");
    });
});
