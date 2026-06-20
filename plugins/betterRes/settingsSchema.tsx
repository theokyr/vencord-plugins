/*
 * Vencord userplugin - BetterRes
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DefinedSettings } from "@api/Settings";
import type { SettingsSchema } from "../settingsHub/schema";

function BetterResIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 13.5v-7Zm2.5-.5a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.5-.5h-11ZM8 18h8v2H8v-2Z" />
            <path d="M9 8h2v4H9V8Zm4 0h2v4h-2V8Z" />
        </svg>
    );
}

export function createBetterResSchema(settings: DefinedSettings): SettingsSchema {
    return {
        plugin: "BetterRes",
        description: "Custom stream resolutions and frame rates",
        icon: BetterResIcon,
        settings,
        sections: [
            {
                id: "quality",
                label: "Quality",
                groups: [
                    {
                        label: "Custom Values",
                        settings: [
                            {
                                key: "customResolutions",
                                control: "text",
                                label: "Extra Resolutions",
                                description: "Comma-separated vertical resolutions in p. Restart required.",
                                tags: ["stream", "resolution", "screenshare", "quality"],
                            },
                            {
                                key: "customFps",
                                control: "text",
                                label: "Extra Frame Rates",
                                description: "Comma-separated FPS values. Restart required.",
                                tags: ["stream", "fps", "framerate", "screenshare"],
                            },
                        ],
                    },
                ],
            },
        ],
    };
}
