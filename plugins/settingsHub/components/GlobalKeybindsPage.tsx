/*
 * Vencord userplugin — settingsHub
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useState, useCallback } from "@webpack/common";
import { Switch } from "@components/Switch";
import { ModalProps, openModal } from "@utils/modal";
import { KeybindDisplay } from "./controls/Keycap";
import { RecordModal } from "./controls/KeybindRecorder";

function getRegistry() { return window.__keybindRegistry; }

export const KEYBINDS_PLUGIN_ID = "__keybinds";

export const KeybindIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <path d="M20 5H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"/>
    </svg>
);

export function GlobalKeybindsPage() {
    const reg = getRegistry();
    const [, forceUpdate] = useState(0);

    useEffect(() => {
        if (!reg) return;
        return reg.onChange(() => forceUpdate(n => n + 1));
    }, [reg]);

    if (!reg) {
        return <p style={{ color: "var(--text-muted)", padding: 40 }}>Keybind registry not loaded.</p>;
    }

    const all = reg.getAll();
    const conflicts = reg.getConflicts();

    // Group by plugin
    const byPlugin = new Map<string, typeof all[number][]>();
    for (const kb of all) {
        const list = byPlugin.get(kb.plugin) ?? [];
        list.push(kb);
        byPlugin.set(kb.plugin, list);
    }

    // Build set of conflicting keybind IDs
    const conflictingIds = new Set<string>();
    for (const entries of conflicts.values()) {
        for (const e of entries) conflictingIds.add(e.id);
    }

    return (
        <div>
            <h2 className="vc-settingsHub-section-heading" style={{ marginTop: 0 }}>Keybinds</h2>
            <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>
                All keyboard shortcuts across plugins. Edit bindings, toggle on/off, and resolve conflicts.
            </p>

            {byPlugin.size === 0 && (
                <p style={{ color: "var(--text-muted)" }}>No plugins have registered keybinds.</p>
            )}

            {[...byPlugin.entries()].map(([plugin, keybinds]) => (
                <div key={plugin} style={{ marginBottom: 24 }}>
                    <h3 className="vc-settingsHub-group-label">{plugin}</h3>
                    {keybinds.map(kb => (
                        <KeybindRow
                            key={kb.id}
                            kb={kb}
                            hasConflict={conflictingIds.has(kb.id)}
                            conflicts={conflicts}
                            reg={reg}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

function KeybindRow({ kb, hasConflict, conflicts, reg }: {
    kb: ReturnType<NonNullable<typeof window.__keybindRegistry>["getAll"]>[number];
    hasConflict: boolean;
    conflicts: Map<string, typeof kb[]>;
    reg: NonNullable<typeof window.__keybindRegistry>;
}) {
    const [showConflict, setShowConflict] = useState(false);
    const conflictEntries = conflicts.get(kb.keys);

    const openRecorder = useCallback(() => {
        openModal((modalProps: ModalProps) => (
            <RecordModal
                modalProps={modalProps}
                title={`Edit Keybind \u2014 ${kb.action}`}
                onSave={(newKeys) => reg.updateKeys(kb.id, newKeys)}
            />
        ));
    }, [kb.id, kb.action, reg]);

    const resetToDefault = useCallback(() => {
        reg.updateKeys(kb.id, kb.defaultKeys);
    }, [kb.id, kb.defaultKeys, reg]);

    return (
        <div>
            <div className="vc-settingsHub-keybind-row" style={{ opacity: kb.enabled ? 1 : 0.5 }}>
                <div className="vc-settingsHub-keybind-action">
                    <div className="vc-settingsHub-keybind-action-name">
                        {hasConflict && (
                            <span
                                style={{ color: "#f0a020", cursor: "pointer", marginRight: 6 }}
                                title="Conflict \u2014 click to resolve"
                                onClick={() => setShowConflict(!showConflict)}
                            >
                                {"\u26A0"}
                            </span>
                        )}
                        {kb.action}
                    </div>
                    <div className="vc-settingsHub-keybind-action-desc">{kb.plugin}</div>
                </div>
                <div className="vc-settingsHub-keybind-controls">
                    <KeybindDisplay keybind={kb.keys} />
                    <button className="vc-settingsHub-keybind-edit" onClick={openRecorder}>
                        Edit
                    </button>
                    {kb.keys !== kb.defaultKeys && (
                        <button className="vc-settingsHub-keybind-edit" onClick={resetToDefault}>
                            Reset
                        </button>
                    )}
                    <Switch
                        checked={kb.enabled}
                        onChange={(v: boolean) => reg.setEnabled(kb.id, v)}
                    />
                </div>
            </div>

            {showConflict && conflictEntries && conflictEntries.length > 1 && (
                <ConflictResolver
                    keysCombo={kb.keys}
                    entries={conflictEntries}
                    reg={reg}
                />
            )}
        </div>
    );
}

function ConflictResolver({ keysCombo, entries, reg }: {
    keysCombo: string;
    entries: ReturnType<NonNullable<typeof window.__keybindRegistry>["getAll"]>;
    reg: NonNullable<typeof window.__keybindRegistry>;
}) {
    const [winner, setWinner] = useState<string | null>(null);

    return (
        <div style={{
            padding: "8px 16px", marginLeft: 16, marginBottom: 8,
            background: "var(--background-secondary, #2b2d31)",
            borderRadius: 8, borderLeft: "3px solid #f0a020",
        }}>
            <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 8 }}>
                Multiple actions bound to this key. Pick which one fires:
            </div>
            {entries.map(entry => (
                <label key={entry.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer" }}>
                    <input
                        type="radio"
                        name={`conflict-${keysCombo}`}
                        checked={winner === entry.id}
                        onChange={() => {
                            setWinner(entry.id);
                            reg.resolve(keysCombo, entry.id);
                        }}
                    />
                    <span>{entry.plugin} &mdash; {entry.action}</span>
                </label>
            ))}
        </div>
    );
}
