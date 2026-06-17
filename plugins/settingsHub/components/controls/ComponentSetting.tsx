/*
 * Vencord userplugin - settingsHub
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DefinedSettings } from "@api/Settings";
import { SettingRow } from "./SettingRow";

interface ComponentSettingProps {
    settingKey: string;
    settings: DefinedSettings;
    label: string;
    description?: string;
    anchorId?: string;
}

export function ComponentSetting({ settingKey, settings, label, description, anchorId }: ComponentSettingProps) {
    const Component = (settings.def as any)?.[settingKey]?.component;
    if (typeof Component !== "function") return null;

    return (
        <SettingRow label={label} description={description} anchorId={anchorId}>
            <Component />
        </SettingRow>
    );
}
