import { describe, expect, it } from "vitest";
import { migrateChannelTabsSettings } from "../../plugins/enrichedHeader/migration";

describe("migrateChannelTabsSettings", () => {
    it("copies flat ChannelTabs enrichedHeader settings once and marks the target", () => {
        const target: Record<string, unknown> = {};
        const source = {
            enrichedHeader: true,
            sidebarTogglePosition: "right",
            guildNameStyle: "breadcrumb",
            navButtonsStyle: "compact",
            hideGuildSidebar: true,
            hideChannelList: false,
            unrelated: "ignored",
        };

        expect(migrateChannelTabsSettings(target, source)).toBe(true);
        expect(target).toEqual({
            headerEnabled: true,
            sidebarTogglePosition: "right",
            guildNameStyle: "breadcrumb",
            navButtonsStyle: "compact",
            hideGuildSidebar: true,
            hideChannelList: false,
            migratedFromChannelTabsV1: true,
        });
    });

    it("ignores invalid legacy values while still marking migration complete", () => {
        const target: Record<string, unknown> = {};
        const source = {
            enrichedHeader: "yes",
            sidebarTogglePosition: "toolbar",
            guildNameStyle: "full",
            navButtonsStyle: "tiny",
            hideGuildSidebar: 1,
            hideChannelList: null,
        };

        expect(migrateChannelTabsSettings(target, source)).toBe(true);
        expect(target).toEqual({
            migratedFromChannelTabsV1: true,
        });
    });

    it("does not overwrite settings after the migration marker is set", () => {
        const target: Record<string, unknown> = {
            headerEnabled: false,
            migratedFromChannelTabsV1: true,
        };
        const source = {
            enrichedHeader: true,
            hideGuildSidebar: true,
        };

        expect(migrateChannelTabsSettings(target, source)).toBe(false);
        expect(target).toEqual({
            headerEnabled: false,
            migratedFromChannelTabsV1: true,
        });
    });

    it("does not mark the target when no source exists", () => {
        const target: Record<string, unknown> = {};

        expect(migrateChannelTabsSettings(target, null)).toBe(false);
        expect(target).toEqual({});
    });
});
