import type { DefinedSettings } from "@api/Settings";
import type { SettingsSchema } from "../settingsHub/schema";
import { DiagnosticsPanel } from "./components/DiagnosticsPanel";
import { VipManager } from "./components/VipManager";

function VipNotificationsIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M12 3a7 7 0 0 0-7 7v3.4L3.3 16a1 1 0 0 0 .8 1.6h15.8a1 1 0 0 0 .8-1.6L19 13.4V10a7 7 0 0 0-7-7Zm0 18a3 3 0 0 0 2.8-2h-5.6A3 3 0 0 0 12 21Zm-5-5 1-1.5V10a4 4 0 0 1 8 0v4.5l1 1.5H7Z" />
        </svg>
    );
}

function FullVipManager() {
    return <VipManager mode="full" />;
}

export function createVipNotificationsSchema(settings: DefinedSettings): SettingsSchema {
    return {
        plugin: "VipNotifications",
        description: "VIP notification rules that can alert through Discord notification restrictions",
        icon: VipNotificationsIcon,
        settings,
        sections: [
            {
                id: "manager",
                label: "Manager",
                render: FullVipManager,
            },
            {
                id: "diagnostics",
                label: "Diagnostics",
                render: DiagnosticsPanel,
            },
        ],
    };
}
