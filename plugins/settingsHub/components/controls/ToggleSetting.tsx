/*
 * Vencord userplugin — settingsHub
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DefinedSettings } from "@api/Settings";
import { Switch } from "@components/Switch";
import { useState } from "@webpack/common";
import { SettingRow } from "./SettingRow";

interface ToggleSettingProps {
    settingKey: string;
    settings: DefinedSettings;
    label: string;
    description?: string;
    anchorId?: string;
}

export function ToggleSetting({ settingKey, settings, label, description, anchorId }: ToggleSettingProps) {
    const [, rerender] = useState(0);
    const value = settings.store[settingKey] as boolean;

    return (
        <SettingRow label={label} description={description} anchorId={anchorId}>
            <Switch
                checked={value}
                onChange={(checked: boolean) => {
                    settings.store[settingKey] = checked;
                    rerender(n => n + 1);
                }}
            />
        </SettingRow>
    );
}
