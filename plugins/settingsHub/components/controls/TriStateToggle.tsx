/*
 * Vencord userplugin — settingsHub
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DefinedSettings } from "@api/Settings";
import { useState } from "@webpack/common";
import { SettingRow } from "./SettingRow";

type TriStateValue = "deny" | "prompt" | "allow";

interface TriStateToggleProps {
    settingKey: string;
    settings: DefinedSettings;
    label: string;
    description?: string;
    anchorId?: string;
    denyLabel?: string;
    promptLabel?: string;
    allowLabel?: string;
}

export function TriStateToggle({
    settingKey, settings, label, description, anchorId,
    denyLabel = "Deny", promptLabel = "Prompt", allowLabel = "Allow",
}: TriStateToggleProps) {
    const [, rerender] = useState(0);
    const value = settings.store[settingKey] as TriStateValue;

    const segments: { key: TriStateValue; label: string; activeClass: string; }[] = [
        { key: "deny", label: denyLabel, activeClass: "vc-settingsHub-deny-active" },
        { key: "prompt", label: promptLabel, activeClass: "vc-settingsHub-prompt-active" },
        { key: "allow", label: allowLabel, activeClass: "vc-settingsHub-allow-active" },
    ];

    return (
        <SettingRow label={label} description={description} anchorId={anchorId}>
            <div className="vc-settingsHub-tristate" data-value={value}>
                {segments.map(seg => (
                    <span
                        key={seg.key}
                        className={`vc-settingsHub-tristate-seg ${value === seg.key ? seg.activeClass : ""}`}
                        onClick={() => {
                            settings.store[settingKey] = seg.key;
                            rerender(n => n + 1);
                        }}
                    >
                        {seg.label}
                    </span>
                ))}
            </div>
        </SettingRow>
    );
}
