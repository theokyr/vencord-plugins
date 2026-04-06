/*
 * Vencord userplugin — settingsHub
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DefinedSettings } from "@api/Settings";
import { Button } from "@webpack/common";
import { Switch } from "@components/Switch";
import { ModalProps, openModal } from "@utils/modal";
import { useCallback } from "@webpack/common";
import { KeybindDisplay } from "./Keycap";
import { RecordModal } from "./KeybindRecorder";

export interface KeybindEntry {
    id: string;
    actionName: string;
    actionDesc: string;
    keybindKey: string;
    enableKey?: string;
    suffix?: string;
}

interface KeybindTableProps {
    entries: KeybindEntry[];
    settings: DefinedSettings;
}

export function KeybindTable({ entries, settings }: KeybindTableProps) {
    return (
        <div>
            {entries.map(entry => (
                <KeybindTableRow key={entry.id} entry={entry} settings={settings} />
            ))}
        </div>
    );
}

function KeybindTableRow({ entry, settings }: { entry: KeybindEntry; settings: DefinedSettings; }) {
    const keybind = settings.store[entry.keybindKey] as string;
    const enabled = entry.enableKey ? settings.store[entry.enableKey] as boolean : true;

    const openRecorder = useCallback(() => {
        openModal((modalProps: ModalProps) => (
            <RecordModal
                modalProps={modalProps}
                title={`Edit Keybind — ${entry.actionName}`}
                onSave={(kb) => { settings.store[entry.keybindKey] = kb; }}
            />
        ));
    }, [entry, settings]);

    return (
        <div className="vc-settingsHub-keybind-row" style={{ opacity: enabled ? 1 : 0.5 }}>
            <div className="vc-settingsHub-keybind-action">
                <div className="vc-settingsHub-keybind-action-name">{entry.actionName}</div>
                <div className="vc-settingsHub-keybind-action-desc">{entry.actionDesc}</div>
            </div>
            <div className="vc-settingsHub-keybind-controls">
                <KeybindDisplay keybind={keybind} suffix={entry.suffix} />
                <button className="vc-settingsHub-keybind-edit" onClick={openRecorder}>
                    Edit Keybind
                </button>
                {entry.enableKey && (
                    <Switch
                        checked={enabled}
                        onChange={(v: boolean) => { settings.store[entry.enableKey!] = v; }}
                    />
                )}
            </div>
        </div>
    );
}
