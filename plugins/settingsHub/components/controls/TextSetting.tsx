/*
 * Vencord userplugin — settingsHub
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DefinedSettings } from "@api/Settings";
import { TextInput, useState } from "@webpack/common";
import { SettingRow } from "./SettingRow";

interface TextSettingProps {
    settingKey: string;
    settings: DefinedSettings;
    label: string;
    description?: string;
    anchorId?: string;
}

export function TextSetting({ settingKey, settings, label, description, anchorId }: TextSettingProps) {
    const [, rerender] = useState(0);
    const value = settings.store[settingKey] as string;

    return (
        <SettingRow label={label} description={description} anchorId={anchorId}>
            <TextInput
                value={value}
                onChange={(v: string) => {
                    settings.store[settingKey] = v;
                    rerender(n => n + 1);
                }}
                style={{ width: 200 }}
            />
        </SettingRow>
    );
}
