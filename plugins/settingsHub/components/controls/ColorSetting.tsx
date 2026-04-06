/*
 * Vencord userplugin — settingsHub
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DefinedSettings } from "@api/Settings";
import { ColorPicker, useState } from "@webpack/common";
import { SettingRow } from "./SettingRow";

interface ColorSettingProps {
    settingKey: string;
    settings: DefinedSettings;
    label: string;
    description?: string;
    anchorId?: string;
}

function cssColorToHex(css: string): number | null {
    if (css.startsWith("#")) {
        const hex = css.slice(1);
        return parseInt(hex.length === 3 ? hex.split("").map(c => c + c).join("") : hex, 16);
    }
    return null;
}

function hexToCSS(hex: number): string {
    return `#${hex.toString(16).padStart(6, "0")}`;
}

export function ColorSetting({
    settingKey, settings, label, description, anchorId,
}: ColorSettingProps) {
    const [, rerender] = useState(0);
    const value = settings.store[settingKey] as string;
    const hexValue = cssColorToHex(value);

    return (
        <SettingRow label={label} description={description} anchorId={anchorId}>
            <ColorPicker
                color={hexValue ?? 0x949ba4}
                onChange={(color: number) => {
                    settings.store[settingKey] = hexToCSS(color);
                    rerender(n => n + 1);
                }}
                showEyeDropper={true}
            />
        </SettingRow>
    );
}
