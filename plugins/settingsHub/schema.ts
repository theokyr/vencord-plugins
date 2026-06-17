// plugins/settingsHub/schema.ts

/*
 * Vencord userplugin — settingsHub
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DefinedSettings } from "@api/Settings";

export interface SettingsSchema {
    /** Plugin name — must match definePlugin name exactly */
    plugin: string;
    /** Short description shown below plugin name in sidebar */
    description: string;
    /** Icon component for sidebar nav item */
    icon: React.ComponentType;
    /** Reference to the plugin's definePluginSettings result */
    settings: DefinedSettings;
    /** Sections become sub-items in sidebar, scroll anchors in content */
    sections: Section[];
}

export interface Section {
    /** Unique ID within this plugin (used as scroll anchor) */
    id: string;
    /** Display label in sidebar and as section heading */
    label: string;
    /** Preview component rendered at top of section (reads settings.store reactively) */
    preview?: React.ComponentType;
    /** Auto-rendered groups of settings. Mutually exclusive with `render`. */
    groups?: Group[];
    /** Custom render escape hatch — replaces groups entirely. Mutually exclusive with `groups`. */
    render?: React.ComponentType;
}

export interface Group {
    /** Optional group heading (rendered as uppercase label) */
    label?: string;
    /** Setting configurations to render in this group */
    settings: SettingConfig[];
}

export interface SettingConfig {
    /** Key in the plugin's settings.store */
    key: string;
    /** Override the auto-detected control type */
    control?: "toggle" | "slider" | "select" | "color" | "tristate" | "keybind" | "text" | "component";
    /** Override label (defaults to the OptionType description from definePluginSettings) */
    label?: string;
    /** Override description */
    description?: string;
    /** Extra search keywords */
    tags?: string[];
    /** Slider config — required when control is "slider" or OptionType is NUMBER */
    slider?: { min: number; max: number; step?: number; unit?: string; markers?: number[]; };
    /** TriState config — custom labels for the three states */
    tristate?: { deny?: string; prompt?: string; allow?: string; };
}
