/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Pointer-position → drop-slot math for tab drag & drop.
 *
 * Deliberately dependency-free (DOM only, no Discord/webpack imports) so the
 * hover logic can be unit-tested outside the renderer.
 */

/** Fraction of a group chip's width, per side, that reorders instead of absorbing. */
export const CHIP_EDGE_ZONE = 0.3;

/** Distance from a bar edge at which drag auto-scroll kicks in. */
export const AUTOSCROLL_MARGIN = 48;
export const AUTOSCROLL_SPEED = 14;

/** Top-level bar items in visual order. Group chips are wrapped, so both the
 *  wrapper and plain tabs carry `data-vc-tab-index`. */
export function topLevelItems(bar: HTMLElement): HTMLElement[] {
    return Array.from(bar.querySelectorAll<HTMLElement>(":scope > [data-vc-tab-index]"));
}

/**
 * Insertion slot (0..count) nearest to `clientX`: the index the dragged tab
 * would occupy, i.e. before the first item whose horizontal midpoint the
 * pointer has not yet passed.
 */
export function computeInsertIndex(bar: HTMLElement, clientX: number, count: number): number {
    for (const el of topLevelItems(bar)) {
        const idx = Number(el.dataset.vcTabIndex);
        if (Number.isNaN(idx)) continue;
        const rect = el.getBoundingClientRect();
        if (clientX < rect.left + rect.width / 2) return idx;
    }
    return count;
}

/**
 * Group id under the pointer, but only within the chip's middle "absorb" band.
 * The outer {@link CHIP_EDGE_ZONE} on each side stays a reorder target so a
 * chip never becomes an inescapable drop sink.
 */
export function absorbTargetAt(target: HTMLElement, clientX: number): string | null {
    const chip = target.closest<HTMLElement>(".vc-channelTabs-group-chip");
    if (!chip) return null;
    const rect = chip.getBoundingClientRect();
    if (rect.width === 0) return null;
    const rel = (clientX - rect.left) / rect.width;
    if (rel < CHIP_EDGE_ZONE || rel > 1 - CHIP_EDGE_ZONE) return null;
    return chip.dataset.vcGroupId ?? null;
}

/** Vertical equivalent of {@link computeInsertIndex} for the group dropdown. */
export function computeChildSlot(list: HTMLElement, clientY: number, count: number): number {
    const items = Array.from(list.querySelectorAll<HTMLElement>("[data-vc-child-index]"));
    for (const el of items) {
        const idx = Number(el.dataset.vcChildIndex);
        if (Number.isNaN(idx)) continue;
        const rect = el.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) return idx;
    }
    return count;
}

/**
 * Convert an insertion slot into the post-removal index that `moveTab` /
 * `moveWithinGroup` expect (they splice the item out before re-inserting).
 * Returns null when the move is a no-op.
 */
export function slotToMoveTarget(slot: number, from: number, count: number): number | null {
    const target = Math.min(slot > from ? slot - 1 : slot, count - 1);
    return target === from ? null : target;
}

/** Auto-scroll direction for a pointer near the bar's edges (0 = no scroll). */
export function autoScrollDirection(bar: HTMLElement, clientX: number): -1 | 0 | 1 {
    if (bar.scrollWidth <= bar.clientWidth) return 0;
    const rect = bar.getBoundingClientRect();
    if (clientX < rect.left + AUTOSCROLL_MARGIN) return -1;
    if (clientX > rect.right - AUTOSCROLL_MARGIN) return 1;
    return 0;
}
