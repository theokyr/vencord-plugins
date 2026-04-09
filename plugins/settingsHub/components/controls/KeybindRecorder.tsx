/*
 * Vencord userplugin — settingsHub
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DefinedSettings } from "@api/Settings";
import { Button } from "@webpack/common";
import { ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, openModal } from "@utils/modal";
import { useCallback, useEffect, useState } from "@webpack/common";
import { Keycap, KeybindDisplay, serializeKeybind } from "./Keycap";
import { SettingRow } from "./SettingRow";
import { codeToLabel, isModifierCode } from "../../../_libKeybindRegistry/format";

export function RecordModal({ modalProps, onSave, title }: {
    modalProps: ModalProps;
    onSave: (keybind: string) => void;
    title?: string;
}) {
    const [keys, setKeys] = useState<string[]>([]);
    const [recording, setRecording] = useState(true);

    useEffect(() => {
        if (!recording) return;

        const captured = new Set<string>();

        function onKeyDown(e: KeyboardEvent) {
            e.preventDefault();
            e.stopPropagation();

            // Escape cancels recording — never recorded as a keybind
            if (e.code === "Escape") {
                captured.clear();
                setKeys([]);
                setRecording(false);
                return;
            }

            const label = codeToLabel(e.code);
            captured.add(label);

            if (!isModifierCode(e.code)) {
                setKeys([...captured]);
                setRecording(false);
            } else {
                setKeys([...captured]);
            }
        }

        function onKeyUp(e: KeyboardEvent) {
            e.preventDefault();
            if (captured.size > 0 && !isModifierCode(e.code)) {
                setKeys([...captured]);
                setRecording(false);
            }
        }

        window.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("keyup", onKeyUp, true);
        return () => {
            window.removeEventListener("keydown", onKeyDown, true);
            window.removeEventListener("keyup", onKeyUp, true);
        };
    }, [recording]);

    return (
        <ModalRoot {...modalProps} size={"small" as any}>
            <ModalHeader separator={false}>
                <span style={{ fontSize: 20, fontWeight: 700 }}>{title ?? "Edit Keybind"}</span>
            </ModalHeader>
            <ModalContent>
                <div className="vc-settingsHub-recorder">
                    <div className="vc-settingsHub-recorder-prompt">
                        {recording ? "Press a key combination..." : "Keybind captured:"}
                    </div>
                    <div className="vc-settingsHub-recorder-keys">
                        {keys.length > 0
                            ? keys.map((k, i) => <Keycap key={i} label={k} />)
                            : <span style={{ color: "#949ba4" }}>Waiting...</span>
                        }
                    </div>
                </div>
            </ModalContent>
            <ModalFooter>
                <div className="vc-settingsHub-recorder-actions">
                    <Button
                        onClick={() => {
                            if (keys.length > 0) onSave(serializeKeybind(keys));
                            modalProps.onClose();
                        }}
                        disabled={keys.length === 0}
                    >
                        Save
                    </Button>
                    <Button
                        color={Button.Colors.TRANSPARENT}
                        onClick={() => { setKeys([]); setRecording(true); }}
                    >
                        Re-record
                    </Button>
                    <Button
                        color={Button.Colors.TRANSPARENT}
                        onClick={modalProps.onClose}
                    >
                        Cancel
                    </Button>
                </div>
            </ModalFooter>
        </ModalRoot>
    );
}

interface KeybindRecorderProps {
    settingKey: string;
    settings: DefinedSettings;
    label: string;
    description?: string;
    anchorId?: string;
    suffix?: string;
}

export function KeybindRecorder({ settingKey, settings, label, description, anchorId, suffix }: KeybindRecorderProps) {
    const value = settings.store[settingKey] as string;

    const openRecorder = useCallback(() => {
        openModal(modalProps => (
            <RecordModal
                modalProps={modalProps}
                onSave={(keybind) => { settings.store[settingKey] = keybind; }}
            />
        ));
    }, [settingKey, settings]);

    return (
        <SettingRow label={label} description={description} anchorId={anchorId}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <KeybindDisplay keybind={value} suffix={suffix} />
                <button className="vc-settingsHub-keybind-edit" onClick={openRecorder}>
                    Edit Keybind
                </button>
            </div>
        </SettingRow>
    );
}
