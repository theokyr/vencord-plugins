/*
 * Vencord userplugin - EmbedFix
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DefinedSettings } from "@api/Settings";
import type { SettingsSchema } from "../settingsHub/schema";

function EmbedFixIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M3.9 12a5 5 0 0 1 5-5H12v2H8.9a3 3 0 1 0 0 6H12v2H8.9a5 5 0 0 1-5-5Zm5.1 1h6v-2H9v2Zm3-6h3.1a5 5 0 0 1 0 10H12v-2h3.1a3 3 0 1 0 0-6H12V7Z" />
        </svg>
    );
}

export function createEmbedFixSchema(settings: DefinedSettings): SettingsSchema {
    return {
        plugin: "EmbedFix",
        description: "Rewrite social media URLs to embed-friendly providers",
        icon: EmbedFixIcon,
        settings,
        sections: [
            {
                id: "rewrites",
                label: "Rewrites",
                groups: [
                    {
                        settings: [
                            {
                                key: "rewriteOutgoing",
                                label: "Rewrite Outgoing Messages",
                                description: "Rewrite URLs in your own messages before sending.",
                            },
                            {
                                key: "rewriteIncoming",
                                label: "Rewrite Incoming Links",
                                description: "Visually replace supported social links in messages from other users.",
                            },
                            {
                                key: "cacheTTLHours",
                                control: "slider",
                                label: "Cache Lifetime",
                                description: "How long provider probe results stay cached.",
                                slider: { min: 1, max: 168, step: 1, unit: "h", markers: [1, 12, 24, 72, 168] },
                            },
                        ],
                    },
                ],
            },
            {
                id: "platforms",
                label: "Platforms",
                groups: [
                    {
                        settings: [
                            { key: "enableTwitter", label: "Twitter / X" },
                            { key: "enableReddit", label: "Reddit" },
                            { key: "enableInstagram", label: "Instagram" },
                            { key: "enableTiktok", label: "TikTok" },
                            { key: "enablePixiv", label: "Pixiv" },
                            { key: "enableBluesky", label: "Bluesky" },
                            { key: "enableThreads", label: "Threads" },
                        ],
                    },
                ],
            },
            {
                id: "providers",
                label: "Providers",
                groups: [
                    {
                        label: "Priority",
                        settings: [
                            {
                                key: "providerPriorities",
                                control: "component",
                                label: "Provider Priority",
                                description: "Drag providers to choose which rewrite service is tried first.",
                            },
                        ],
                    },
                    {
                        label: "Overrides",
                        settings: [
                            {
                                key: "customProviders",
                                control: "text",
                                label: "Custom Providers",
                                description: "JSON array of provider overrides merged with the built-in provider list.",
                            },
                        ],
                    },
                    {
                        label: "Cache",
                        settings: [
                            {
                                key: "recheckProviders",
                                control: "component",
                                label: "Re-check Providers",
                                description: "Flush the probe cache and check every enabled provider again.",
                            },
                        ],
                    },
                ],
            },
        ],
    };
}
