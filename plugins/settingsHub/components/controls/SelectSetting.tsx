/*
 * Vencord userplugin — settingsHub
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DefinedSettings } from "@api/Settings";
import { Select, useState } from "@webpack/common";
import { SettingRow } from "./SettingRow";

interface SelectOption {
    label: string;
    value: string | number;
    default?: boolean;
}

interface SelectSettingProps {
    settingKey: string;
    settings: DefinedSettings;
    label: string;
    description?: string;
    anchorId?: string;
    options: readonly SelectOption[];
}

export function SelectSetting({ settingKey, settings, label, description, anchorId, options }: SelectSettingProps) {
    const [, rerender] = useState(0);
    const value = settings.store[settingKey];

    return (
        <SettingRow label={label} description={description} anchorId={anchorId}>
            <Select
                options={options as any}
                isSelected={(v: any) => v === value}
                select={(v: any) => {
                    settings.store[settingKey] = v;
                    rerender(n => n + 1);
                }}
                serialize={(v: any) => String(v)}
            />
        </SettingRow>
    );
}
