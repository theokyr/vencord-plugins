// plugins/minimalCallBar/settingsSchema.tsx

/*
 * Vencord userplugin — minimalCallBar
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DefinedSettings } from "@api/Settings";
import type { SettingsSchema } from "../settingsHub/schema";

function PhoneIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M12 9C10.4 9 8.85 9.25 7.4 9.72V12.82C7.4 13.21 7.17 13.56 6.84 13.72C5.86 14.21 4.97 14.84 4.18 15.57C3.95 15.78 3.58 15.78 3.34 15.54L0.71 12.91C0.47 12.67 0.48 12.28 0.73 12.05C3.71 9.43 7.68 7.85 12 7.85C16.32 7.85 20.29 9.43 23.27 12.05C23.52 12.28 23.53 12.67 23.29 12.91L20.66 15.54C20.42 15.78 20.06 15.78 19.82 15.57C19.03 14.84 18.14 14.21 17.16 13.72C16.83 13.56 16.6 13.21 16.6 12.82V9.72C15.15 9.25 13.6 9 12 9Z" />
        </svg>
    );
}

export function createMinimalCallBarSchema(settings: DefinedSettings): SettingsSchema {
    return {
        plugin: "MinimalCallBar",
        description: "Compact DM/Group DM call bar",
        icon: PhoneIcon,
        settings,
        sections: [
            {
                id: "display",
                label: "Display",
                groups: [
                    {
                        label: "Mode",
                        settings: [
                            {
                                key: "displayMode",
                                label: "Display Mode",
                                description: "Where the compact bar appears. Cycle with keybind.",
                            },
                        ],
                    },
                ],
            },
            {
                id: "controls",
                label: "Controls",
                groups: [
                    {
                        label: "Visible Controls",
                        settings: [
                            { key: "showMic", label: "Microphone" },
                            { key: "showDeafen", label: "Deafen" },
                            { key: "showCamera", label: "Camera" },
                            { key: "showScreenshare", label: "Screen Share" },
                            { key: "showOverflow", label: "Overflow Menu" },
                        ],
                    },
                ],
            },
            {
                id: "avatars",
                label: "Avatars",
                groups: [
                    {
                        settings: [
                            {
                                key: "maxVisibleAvatars",
                                control: "slider",
                                label: "Max Visible Avatars",
                                description: "Number of avatars before +N count",
                                slider: { min: 1, max: 8, step: 1 },
                            },
                        ],
                    },
                ],
            },
            {
                id: "tooltip",
                label: "Tooltip",
                groups: [
                    {
                        label: "Tooltip Sections",
                        settings: [
                            { key: "tooltipUsers", label: "Show User List" },
                            { key: "tooltipDuration", label: "Show Call Duration" },
                            { key: "tooltipChannel", label: "Show Channel Info" },
                        ],
                    },
                    {
                        label: "Timing",
                        settings: [
                            {
                                key: "hoverDelay",
                                control: "slider",
                                label: "Hover Delay",
                                slider: { min: 0, max: 1000, step: 50, unit: "ms" },
                            },
                        ],
                    },
                ],
            },
            {
                id: "behavior",
                label: "Behavior",
                groups: [
                    {
                        label: "Click Action",
                        settings: [
                            {
                                key: "clickAction",
                                label: "Bar Click Action",
                                description: "What happens when you click the bar (outside controls).",
                            },
                        ],
                    },

                ],
            },
        ],
    };
}
