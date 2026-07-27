/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Shared drag state for the tab bar.
 *
 * `DataTransfer.getData()` is deliberately unreadable during `dragover` (only
 * `types` is exposed), so hover-time decisions — "is this a group being
 * reordered or a tab being absorbed?" — cannot be made from the event alone.
 * We mirror the payload here at `dragstart` and read it during `dragover`.
 */

import { useEffect, useState } from "@webpack/common";

export type DragKind = "tab" | "group" | "child";

export interface DragPayload {
    kind: DragKind;
    /** Tab id being dragged. */
    id: string;
    /** Index within its container (top-level index, or child index for "child"). */
    index: number;
    /** Owning group id — only set for `kind: "child"`. */
    sourceGroupId?: string;
}

let current: DragPayload | null = null;
const listeners = new Set<() => void>();

function emit() {
    for (const fn of listeners) fn();
}

export function getDrag(): DragPayload | null {
    return current;
}

export function setDrag(payload: DragPayload) {
    current = payload;
    document.body.classList.add("vc-channelTabs-dragging");
    document.body.classList.add(`vc-channelTabs-dragging-${payload.kind}`);
    emit();
}

export function clearDrag() {
    if (!current) return;
    document.body.classList.remove("vc-channelTabs-dragging");
    document.body.classList.remove(`vc-channelTabs-dragging-${current.kind}`);
    current = null;
    emit();
}

export function subscribeDrag(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

/** Re-renders the caller whenever a drag starts or ends. */
export function useDrag(): DragPayload | null {
    const [payload, setPayload] = useState<DragPayload | null>(current);
    useEffect(() => subscribeDrag(() => setPayload(current)), []);
    return payload;
}

/** True when the user has not disabled animations via _libAnimationKit. */
export function animationsOn(): boolean {
    return !document.body.classList.contains("vc-anim-off");
}

// ─── Custom drag image ────────────────────────────────────────────────────

/**
 * Replace the browser's default drag snapshot with a tilted, shadowed clone of
 * the source element. Chromium rasterises the drag image synchronously at the
 * end of the `dragstart` handler, so the clone only has to live one frame.
 */
export function setDragGhost(e: React.DragEvent, source: HTMLElement) {
    if (!animationsOn()) return;
    try {
        const rect = source.getBoundingClientRect();
        const clone = source.cloneNode(true) as HTMLElement;
        clone.classList.add("vc-channelTabs-dragGhost");
        clone.style.width = `${rect.width}px`;
        clone.style.height = `${rect.height}px`;
        const host = document.createElement("div");
        host.className = "vc-channelTabs-dragGhostHost";
        host.appendChild(clone);
        document.body.appendChild(host);
        e.dataTransfer.setDragImage(clone, e.clientX - rect.left, e.clientY - rect.top);
        requestAnimationFrame(() => host.remove());
    } catch {
        // setDragImage is unsupported / the clone failed — keep the default ghost
    }
}
