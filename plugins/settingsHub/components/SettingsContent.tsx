/*
 * Vencord userplugin — settingsHub
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { SettingsSchema } from "../schema";
import { useSettingsReactive } from "../hooks";
import { SettingsSection } from "./SettingsSection";

interface SettingsContentProps {
    schema: SettingsSchema;
}

export function SettingsContent({ schema }: SettingsContentProps) {
    useSettingsReactive(schema.settings);

    return (
        <div role="main">
            <div className="vc-settingsHub-plugin-header">
                <h1 className="vc-settingsHub-plugin-name">{schema.plugin}</h1>
                <p className="vc-settingsHub-plugin-desc">{schema.description}</p>
            </div>
            {schema.sections.map(section => (
                <SettingsSection
                    key={section.id}
                    section={section}
                    settings={schema.settings}
                    pluginName={schema.plugin}
                />
            ))}
        </div>
    );
}
