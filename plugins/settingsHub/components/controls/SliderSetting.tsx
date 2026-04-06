/*
 * Vencord userplugin — settingsHub
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DefinedSettings } from "@api/Settings";
import { useState } from "@webpack/common";
import { SettingRow } from "./SettingRow";

interface SliderSettingProps {
    settingKey: string;
    settings: DefinedSettings;
    label: string;
    description?: string;
    anchorId?: string;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    markers?: number[];
}

export function SliderSetting({
    settingKey, settings, label, description, anchorId,
    min, max, step = 1, unit = "", markers,
}: SliderSettingProps) {
    const [, rerender] = useState(0);
    const value = settings.store[settingKey] as number;
    const precision = step < 1 ? Math.ceil(-Math.log10(step)) : 0;
    const sliderMarkers = markers ?? generateMarkers(min, max, step);

    return (
        <SettingRow label={label} description={description} anchorId={anchorId}>
            <div className="vc-settingsHub-slider-wrapper">
                <div className="vc-settingsHub-slider-markers">
                    {sliderMarkers.map(m => (
                        <span key={m} className="vc-settingsHub-slider-marker">{m.toFixed(precision)}{unit}</span>
                    ))}
                </div>
                <input
                    type="range"
                    className="vc-settingsHub-slider-input"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={e => {
                        settings.store[settingKey] = parseFloat(parseFloat(e.target.value).toFixed(precision));
                        rerender(n => n + 1);
                    }}
                />
            </div>
        </SettingRow>
    );
}

function generateMarkers(min: number, max: number, step: number): number[] {
    if (step <= 0) return [min, max];
    const range = max - min;
    const markerStep = Math.max(step, Math.ceil(range / 8 / step) * step);
    const markers: number[] = [];
    for (let v = min; v <= max; v += markerStep) {
        markers.push(v);
    }
    if (markers[markers.length - 1] !== max) markers.push(max);
    return markers;
}
