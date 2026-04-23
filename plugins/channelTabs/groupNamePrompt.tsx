/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useCallback, useEffect, useRef, useState } from "@webpack/common";

export interface GroupNamePromptProps {
    onConfirm: (name: string) => void;
    onCancel: () => void;
}

export function GroupNamePrompt({ onConfirm, onCancel }: GroupNamePromptProps) {
    const [value, setValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter" && value.trim()) {
            e.preventDefault();
            onConfirm(value.trim());
        } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
        }
        e.stopPropagation();
    }, [value, onConfirm, onCancel]);

    return (
        <div className="vc-channelTabs-tab vc-channelTabs-group-namePrompt">
            <input
                ref={inputRef}
                className="vc-channelTabs-group-nameInput"
                type="text"
                placeholder="Group name..."
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={onCancel}
                maxLength={32}
            />
        </div>
    );
}
