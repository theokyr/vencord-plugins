/*
 * Vencord userplugin — settingsHub
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DefinedSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import type { Section } from "../schema";
import { PreviewPane } from "./PreviewPane";
import { SettingsGroup } from "./SettingsGroup";

interface SettingsSectionProps {
    section: Section;
    settings: DefinedSettings;
    pluginName: string;
}

export function SettingsSection({ section, settings, pluginName }: SettingsSectionProps) {
    const anchorId = `settings-${pluginName}-${section.id}`;

    return (
        <div>
            <h2
                className="vc-settingsHub-section-heading"
                data-settings-anchor={anchorId}
                id={anchorId}
            >
                {section.label}
            </h2>

            {section.preview && (
                <PreviewPane>
                    <ErrorBoundary>
                        <section.preview />
                    </ErrorBoundary>
                </PreviewPane>
            )}

            {section.render ? (
                <ErrorBoundary>
                    <section.render />
                </ErrorBoundary>
            ) : (
                section.groups?.map((group, i) => (
                    <SettingsGroup
                        key={i}
                        group={group}
                        settings={settings}
                        pluginName={pluginName}
                    />
                ))
            )}
        </div>
    );
}
