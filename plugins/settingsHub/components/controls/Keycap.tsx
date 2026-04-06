/*
 * Vencord userplugin — settingsHub
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const KEY_DISPLAY: Record<string, string> = {
    control: "CTRL",
    ctrl: "CTRL",
    alt: "ALT",
    shift: "SHIFT",
    meta: "META",
    mod: "CTRL",
};

interface KeycapProps {
    label: string;
}

export function Keycap({ label }: KeycapProps) {
    const display = KEY_DISPLAY[label.toLowerCase()] ?? label.toUpperCase();
    return <span className="vc-settingsHub-keycap">{display}</span>;
}

export function parseKeybind(keybind: string): string[] {
    return keybind.split("+").map(s => s.trim()).filter(Boolean);
}

export function serializeKeybind(keys: string[]): string {
    return keys.map(k => k.toLowerCase()).join("+");
}

interface KeybindDisplayProps {
    keybind: string;
    suffix?: string;
}

export function KeybindDisplay({ keybind, suffix }: KeybindDisplayProps) {
    const keys = parseKeybind(keybind);
    return (
        <span className="vc-settingsHub-keybind-display">
            {keys.map((key, i) => (
                <span key={i}>
                    {i > 0 && <span className="vc-settingsHub-keybind-plus">+</span>}
                    <Keycap label={key} />
                </span>
            ))}
            {suffix && (
                <>
                    <span className="vc-settingsHub-keybind-plus">+</span>
                    <Keycap label={suffix} />
                </>
            )}
        </span>
    );
}
