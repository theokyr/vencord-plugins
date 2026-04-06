import { settings } from "./settings";
import { Dashboard } from "./components/Dashboard";
import { Browse } from "./components/Browse";
import { Advanced } from "./components/Advanced";

const VenpmIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <path d="M20 7H4c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm0 8H4V9h16v6zm-2-1h-3v-1h3v1zm-5 0H8v-1h5v1zm-7 0H4v-1h2v1z" />
    </svg>
);

export const venpmGuiSchema = {
    plugin: "VenpmGui",
    description: "Manage Vencord plugins from inside Discord",
    icon: VenpmIcon,
    settings,
    sections: [
        {
            id: "dashboard",
            label: "Dashboard",
            render: Dashboard,
        },
        {
            id: "browse",
            label: "Browse",
            render: Browse,
        },
        {
            id: "advanced",
            label: "Advanced",
            render: Advanced,
        },
        {
            id: "preferences",
            label: "Preferences",
            groups: [
                {
                    label: "Updates",
                    settings: [
                        {
                            key: "checkUpdatesOnLaunch",
                            label: "Check for updates on launch",
                            description: "Automatically check for plugin updates when Discord starts",
                        },
                        {
                            key: "showUpdateToast",
                            label: "Show update notifications",
                            description: "Display a toast when plugin updates are available",
                        },
                    ],
                },
                {
                    label: "Display",
                    settings: [
                        {
                            key: "dashboardViewMode",
                            label: "Dashboard view",
                            description: "How to display installed plugins",
                            control: "select",
                        },
                    ],
                },
            ],
        },
    ],
};
