import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    setupComplete: {
        type: OptionType.BOOLEAN,
        description: "Whether first-run setup has been completed",
        default: false,
        hidden: true,
    },
    checkUpdatesOnLaunch: {
        type: OptionType.BOOLEAN,
        description: "Check for plugin updates when Discord starts",
        default: true,
    },
    showUpdateToast: {
        type: OptionType.BOOLEAN,
        description: "Show a toast notification when updates are available",
        default: true,
    },
    dashboardViewMode: {
        type: OptionType.SELECT,
        description: "Dashboard plugin display mode",
        options: [
            { label: "List", value: "list", default: true },
            { label: "Grid", value: "grid" },
        ],
    },
});
