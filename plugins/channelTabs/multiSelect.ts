/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface MultiSelectState {
    selected: Set<number>;
    anchor: number | null;
    container: string | null;
}

export function createMultiSelect(): MultiSelectState {
    return { selected: new Set(), anchor: null, container: null };
}

export function toggleSelect(state: MultiSelectState, index: number, container: string): MultiSelectState {
    if (state.container !== null && state.container !== container) {
        return { selected: new Set([index]), anchor: index, container };
    }
    const selected = new Set(state.selected);
    if (selected.has(index)) {
        selected.delete(index);
    } else {
        selected.add(index);
    }
    return { selected, anchor: index, container };
}

export function rangeSelect(state: MultiSelectState, index: number, container: string): MultiSelectState {
    if (state.container !== null && state.container !== container) {
        return { selected: new Set([index]), anchor: index, container };
    }
    const anchor = state.anchor ?? 0;
    const min = Math.min(anchor, index);
    const max = Math.max(anchor, index);
    const selected = new Set<number>();
    for (let i = min; i <= max; i++) selected.add(i);
    return { selected, anchor: state.anchor ?? 0, container };
}

export function clearSelection(state: MultiSelectState): MultiSelectState {
    return { selected: new Set(), anchor: null, container: null };
}

export function getSelectedIndices(state: MultiSelectState): number[] {
    return [...state.selected].sort((a, b) => a - b);
}
