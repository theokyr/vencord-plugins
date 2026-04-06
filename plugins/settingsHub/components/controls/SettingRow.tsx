/*
 * Vencord userplugin — settingsHub
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

interface SettingRowProps {
    label: string;
    description?: string;
    anchorId?: string;
    children: React.ReactNode;
}

export function SettingRow({ label, description, anchorId, children }: SettingRowProps) {
    return (
        <div className="vc-settingsHub-setting-row" id={anchorId}>
            <div className="vc-settingsHub-setting-info">
                <div className="vc-settingsHub-setting-label">{label}</div>
                {description && (
                    <div className="vc-settingsHub-setting-desc">{description}</div>
                )}
            </div>
            <div className="vc-settingsHub-setting-control">
                {children}
            </div>
        </div>
    );
}
