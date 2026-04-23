/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Tab, LeafTab, GroupTab } from "./types";
import { isGroupTab, isLeafTab } from "./types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TabState {
    tabs: Tab[];
    activeTabIndex: number;
    activeChildIndex: number | null;
}

export interface TabLocation {
    tabIndex: number;
    childIndex: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a shallow-cloned tabs array with the item at `index` replaced. */
function replaceAt<T>(arr: T[], index: number, item: T): T[] {
    const next = [...arr];
    next[index] = item;
    return next;
}

/** Remove item at index, returning new array. */
function removeAt<T>(arr: T[], index: number): T[] {
    const next = [...arr];
    next.splice(index, 1);
    return next;
}

/** Insert item at index, returning new array. */
function insertAt<T>(arr: T[], index: number, item: T): T[] {
    const next = [...arr];
    next.splice(index, 0, item);
    return next;
}

/**
 * Stable sort: pinned items precede unpinned items, relative order preserved
 * within each partition.
 */
function enforcePinnedOrder<T extends { pinned: boolean }>(arr: T[]): T[] {
    const pinned = arr.filter(t => t.pinned);
    const unpinned = arr.filter(t => !t.pinned);
    return [...pinned, ...unpinned];
}

/**
 * Resolve the id of the currently-active item from a TabState.
 * If the active tab is a group and a child is active, returns the child's id.
 * Otherwise returns the top-level tab's id.
 */
function resolveActiveId(state: TabState): string | null {
    const { tabs, activeTabIndex, activeChildIndex } = state;
    const activeTab = tabs[activeTabIndex];
    if (!activeTab) return null;
    if (isGroupTab(activeTab) && activeChildIndex !== null) {
        return activeTab.children[activeChildIndex]?.id ?? activeTab.id;
    }
    return activeTab.id;
}

/**
 * Reconstruct activeTabIndex / activeChildIndex in `newTabs` after a mutation,
 * given the id of the item that was active before the mutation.
 * Falls back to clamping activeTabIndex if the item cannot be found.
 */
function relocateActive(
    newTabs: Tab[],
    activeItemId: string,
    fallbackTabIndex: number,
): Pick<TabState, "activeTabIndex" | "activeChildIndex"> {
    const loc = findTabLocation(newTabs, activeItemId);
    if (loc !== null) {
        return { activeTabIndex: loc.tabIndex, activeChildIndex: loc.childIndex };
    }
    return {
        activeTabIndex: Math.max(0, Math.min(fallbackTabIndex, newTabs.length - 1)),
        activeChildIndex: null,
    };
}

// ---------------------------------------------------------------------------
// findTabLocation
// ---------------------------------------------------------------------------

/**
 * Find where a tab with `tabId` lives.
 * - If it's a top-level tab (leaf or group), returns `{ tabIndex, childIndex: null }`.
 * - If it's a child inside a group, returns `{ tabIndex: groupIndex, childIndex }`.
 * - If not found, returns `null`.
 */
export function findTabLocation(tabs: Tab[], tabId: string): TabLocation | null {
    for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];
        if (tab.id === tabId) {
            return { tabIndex: i, childIndex: null };
        }
        if (isGroupTab(tab)) {
            for (let j = 0; j < tab.children.length; j++) {
                if (tab.children[j].id === tabId) {
                    return { tabIndex: i, childIndex: j };
                }
            }
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// createGroup
// ---------------------------------------------------------------------------

/**
 * Create a new group from the loose tab indices provided. Indices that point
 * to existing groups are silently ignored (no nesting).
 *
 * The group is inserted at the position of the smallest valid index.
 * Active state is adjusted to track the previously-active tab.
 */
export function createGroup(
    state: TabState,
    indices: number[],
    groupId: string,
    name: string,
    color?: string,
): TabState {
    const { tabs, activeTabIndex, activeChildIndex } = state;

    // Filter to only leaf-tab indices (no groups)
    const leafIndices = indices
        .filter(i => i >= 0 && i < tabs.length && isLeafTab(tabs[i]))
        .sort((a, b) => a - b);

    if (leafIndices.length === 0) {
        // Nothing to group — return state as-is
        return state;
    }

    // Collect the leaf tabs that will become children
    const children = leafIndices.map(i => tabs[i] as LeafTab);

    // Build new tabs array: remove the grouped leaves, insert group at the
    // position where the first selected leaf was.
    const insertPos = leafIndices[0];
    const leafIndexSet = new Set(leafIndices);

    const newGroup: GroupTab = {
        type: "group",
        id: groupId,
        name,
        color: color ?? null,
        pinned: false,
        collapsed: true,
        children,
    };

    const filteredTabs = tabs.filter((_, i) => !leafIndexSet.has(i));
    // Compute insert position in the filtered array.
    // How many indices before insertPos are NOT in leafIndexSet?
    const offset = tabs.slice(0, insertPos).filter((_, i) => !leafIndexSet.has(i)).length;
    const newTabs = insertAt(filteredTabs, offset, newGroup);

    // Adjust active tracking ------------------------------------------------
    const activeTab = tabs[activeTabIndex];
    const activeId = activeTab?.id;

    // Was the active top-level tab one of the leaf tabs that got grouped?
    const activeWasGrouped = leafIndexSet.has(activeTabIndex) && activeChildIndex === null;

    let newActiveTabIndex: number;
    let newActiveChildIndex: number | null;

    if (activeWasGrouped) {
        // Active tab is now inside the new group
        newActiveTabIndex = offset; // group position in newTabs
        const activeChildIdx = children.findIndex(ch => ch.id === activeId);
        newActiveChildIndex = activeChildIdx >= 0 ? activeChildIdx : 0;
    } else {
        // Active was not grouped — re-find using child id if applicable
        const activeItemId = resolveActiveId(state);
        const relocated = relocateActive(newTabs, activeItemId ?? "", activeTabIndex);
        newActiveTabIndex = relocated.activeTabIndex;
        newActiveChildIndex = relocated.activeChildIndex;
    }

    return {
        tabs: newTabs,
        activeTabIndex: newActiveTabIndex,
        activeChildIndex: newActiveChildIndex,
    };
}

// ---------------------------------------------------------------------------
// addToGroup
// ---------------------------------------------------------------------------

/**
 * Move a tab (by id) into a group (by groupId). The tab can be loose or
 * already in another group.
 *
 * No-op if:
 * - The target group does not exist.
 * - The tab is already in the target group.
 */
export function addToGroup(state: TabState, tabId: string, groupId: string): TabState {
    const { tabs, activeTabIndex, activeChildIndex } = state;

    // Find the target group
    const groupTabIdx = tabs.findIndex(t => t.id === groupId && isGroupTab(t));
    if (groupTabIdx === -1) return state;

    const targetGroup = tabs[groupTabIdx] as GroupTab;

    // Is tab already in this group?
    if (targetGroup.children.some(ch => ch.id === tabId)) return state;

    // Find the tab to move
    const loc = findTabLocation(tabs, tabId);
    if (loc === null) return state;

    // Extract the leaf tab
    let leafTab: LeafTab;
    let intermediateTabs: Tab[];

    if (loc.childIndex === null) {
        // Loose tab
        const t = tabs[loc.tabIndex];
        if (!isLeafTab(t)) return state; // Can't move a group into a group
        leafTab = t;
        intermediateTabs = removeAt(tabs, loc.tabIndex);
    } else {
        // Child in another group
        const srcGroup = tabs[loc.tabIndex] as GroupTab;
        leafTab = srcGroup.children[loc.childIndex];
        const newChildren = removeAt(srcGroup.children, loc.childIndex);
        const updatedSrcGroup: GroupTab = { ...srcGroup, children: newChildren };
        intermediateTabs = replaceAt(tabs, loc.tabIndex, updatedSrcGroup);
    }

    // Recompute target group index after possible removal
    const newGroupIdx = intermediateTabs.findIndex(t => t.id === groupId);
    const currentTargetGroup = intermediateTabs[newGroupIdx] as GroupTab;
    const newChildren = [...currentTargetGroup.children, leafTab];
    const childIndex = newChildren.length - 1;
    const updatedGroup: GroupTab = { ...currentTargetGroup, children: newChildren };
    const newTabs = replaceAt(intermediateTabs, newGroupIdx, updatedGroup);

    // Adjust active tracking
    const activeItemId = resolveActiveId(state);
    // Is the moving tab the active item?
    const isActiveMoving = activeItemId === tabId;

    let newActiveTabIndex: number;
    let newActiveChildIndex: number | null;

    if (isActiveMoving) {
        newActiveTabIndex = newGroupIdx;
        newActiveChildIndex = childIndex;
    } else {
        const result = relocateActive(newTabs, activeItemId ?? "", activeTabIndex);
        newActiveTabIndex = result.activeTabIndex;
        newActiveChildIndex = result.activeChildIndex;
    }

    return {
        tabs: newTabs,
        activeTabIndex: newActiveTabIndex,
        activeChildIndex: newActiveChildIndex,
    };
}

// ---------------------------------------------------------------------------
// removeFromGroup
// ---------------------------------------------------------------------------

/**
 * Remove a child (by id) from its group and place it as a loose tab
 * immediately after the group in tabs[].
 *
 * If the group becomes empty:
 * - `"dissolve"` (default): remove the group too.
 * - `"keep"`: leave the empty group in place.
 */
export function removeFromGroup(
    state: TabState,
    tabId: string,
    emptyBehavior: "dissolve" | "keep" = "dissolve",
): TabState {
    const { tabs, activeTabIndex, activeChildIndex } = state;

    const loc = findTabLocation(tabs, tabId);
    if (loc === null || loc.childIndex === null) return state;

    const groupIdx = loc.tabIndex;
    const childIdx = loc.childIndex;
    const srcGroup = tabs[groupIdx] as GroupTab;
    const leaf = srcGroup.children[childIdx];

    const newGroupChildren = removeAt(srcGroup.children, childIdx);
    const groupBecomesEmpty = newGroupChildren.length === 0;

    let newTabs: Tab[];
    let looseTabPos: number;

    if (groupBecomesEmpty && emptyBehavior === "dissolve") {
        // Remove group, insert leaf at group position
        newTabs = replaceAt(tabs, groupIdx, leaf);
        looseTabPos = groupIdx;
    } else {
        // Keep group (possibly empty), insert leaf after it
        const updatedGroup: GroupTab = { ...srcGroup, children: newGroupChildren };
        const withUpdatedGroup = replaceAt(tabs, groupIdx, updatedGroup);
        newTabs = insertAt(withUpdatedGroup, groupIdx + 1, leaf);
        looseTabPos = groupIdx + 1;
    }

    // Adjust active tracking
    const isActiveTabIndex = activeTabIndex === groupIdx;

    // Resolve the id of the actually-active item
    const activeChildObj = (isActiveTabIndex && activeChildIndex !== null)
        ? srcGroup.children[activeChildIndex]
        : null;
    const isActiveMoving = isActiveTabIndex && activeChildIndex === childIdx;

    let newActiveTabIndex: number;
    let newActiveChildIndex: number | null;

    if (isActiveMoving) {
        // The active child is being ejected — follow it to its new loose position
        newActiveTabIndex = looseTabPos;
        newActiveChildIndex = null;
    } else if (isActiveTabIndex && activeChildObj !== null) {
        // Active is a child in the same group — re-find it in newGroupChildren
        // The group is at the same tabIndex (unless dissolved and became a single leaf)
        const groupInNewTabs = newTabs[groupIdx];
        if (groupInNewTabs && isGroupTab(groupInNewTabs)) {
            const newChildIdx = groupInNewTabs.children.findIndex(ch => ch.id === activeChildObj.id);
            newActiveTabIndex = groupIdx;
            newActiveChildIndex = newChildIdx >= 0 ? newChildIdx : 0;
        } else {
            // Group dissolved and is now a single leaf — active is that leaf
            newActiveTabIndex = groupIdx;
            newActiveChildIndex = null;
        }
    } else {
        // Active was not in this group — re-find by resolving child id if needed
        const activeItemId = resolveActiveId(state);
        const relocated = relocateActive(newTabs, activeItemId ?? "", activeTabIndex);
        newActiveTabIndex = relocated.activeTabIndex;
        newActiveChildIndex = relocated.activeChildIndex;
    }

    return {
        tabs: newTabs,
        activeTabIndex: newActiveTabIndex,
        activeChildIndex: newActiveChildIndex,
    };
}

// ---------------------------------------------------------------------------
// dissolveGroup
// ---------------------------------------------------------------------------

/**
 * Spill all children of a group at the group's position, removing the group.
 * Active tracking follows the previously-active child (or the first child if
 * no child was active).
 */
export function dissolveGroup(state: TabState, groupId: string): TabState {
    const { tabs, activeTabIndex, activeChildIndex } = state;

    const groupIdx = tabs.findIndex(t => t.id === groupId);
    if (groupIdx === -1) return state;

    const group = tabs[groupIdx];
    if (!isGroupTab(group)) return state;

    const { children } = group;

    // Build new tabs: remove group, insert children at its position
    const before = tabs.slice(0, groupIdx);
    const after = tabs.slice(groupIdx + 1);
    const newTabs = [...before, ...children, ...after];

    // Determine the child that was active (or default to first)
    const activeGroupWasActive = activeTabIndex === groupIdx;
    const resolvedChildIndex = activeGroupWasActive && activeChildIndex !== null
        ? activeChildIndex
        : 0;

    const targetChild = children[resolvedChildIndex];
    let newActiveTabIndex: number;
    let newActiveChildIndex: number | null = null;

    if (activeGroupWasActive) {
        // Active was in the dissolved group — follow to the child's new position
        if (targetChild) {
            newActiveTabIndex = groupIdx + resolvedChildIndex;
        } else {
            // Group was empty — clamp
            newActiveTabIndex = Math.min(activeTabIndex, newTabs.length - 1);
        }
    } else {
        // Active was elsewhere — re-find by resolving child id if needed
        const activeItemId = resolveActiveId(state);
        const relocated = relocateActive(newTabs, activeItemId ?? "", activeTabIndex);
        newActiveTabIndex = relocated.activeTabIndex;
        newActiveChildIndex = relocated.activeChildIndex;
    }

    return {
        tabs: newTabs,
        activeTabIndex: newActiveTabIndex,
        activeChildIndex: newActiveChildIndex,
    };
}

// ---------------------------------------------------------------------------
// closeGroup
// ---------------------------------------------------------------------------

/**
 * Remove a group and all its children. Adjusts active index appropriately.
 */
export function closeGroup(state: TabState, groupId: string): TabState {
    const { tabs, activeTabIndex, activeChildIndex } = state;

    const groupIdx = tabs.findIndex(t => t.id === groupId);
    if (groupIdx === -1) return state;

    const newTabs = removeAt(tabs, groupIdx);
    if (newTabs.length === 0) {
        return { tabs: newTabs, activeTabIndex: 0, activeChildIndex: null };
    }

    // Was the active tab inside (or at) the closed group?
    const activeWasInClosedGroup = activeTabIndex === groupIdx;
    const activeWasAfterGroup = activeTabIndex > groupIdx;

    let newActiveTabIndex: number;
    let newActiveChildIndex: number | null;

    if (activeWasInClosedGroup) {
        // Active is gone — clamp to last tab
        newActiveTabIndex = Math.min(groupIdx, newTabs.length - 1);
        newActiveChildIndex = null;
    } else if (activeWasAfterGroup) {
        // Active shifted left by 1
        newActiveTabIndex = activeTabIndex - 1;
        newActiveChildIndex = activeChildIndex;
    } else {
        newActiveTabIndex = activeTabIndex;
        newActiveChildIndex = activeChildIndex;
    }

    return {
        tabs: newTabs,
        activeTabIndex: newActiveTabIndex,
        activeChildIndex: newActiveChildIndex,
    };
}

// ---------------------------------------------------------------------------
// moveToGroup
// ---------------------------------------------------------------------------

/**
 * Move a tab (by id) to a different group (by targetGroupId).
 *
 * The source can be a loose tab or a child of another group. If the source
 * group becomes empty, `emptyBehavior` controls whether it's dissolved.
 */
export function moveToGroup(
    state: TabState,
    tabId: string,
    targetGroupId: string,
    emptyBehavior: "dissolve" | "keep" = "dissolve",
): TabState {
    const { tabs, activeTabIndex, activeChildIndex } = state;

    const loc = findTabLocation(tabs, tabId);
    if (loc === null) return state;

    const targetGroupIdx = tabs.findIndex(t => t.id === targetGroupId && isGroupTab(t));
    if (targetGroupIdx === -1) return state;

    // Already in target group — no-op
    const targetGroup = tabs[targetGroupIdx] as GroupTab;
    if (targetGroup.children.some(ch => ch.id === tabId)) return state;

    // Track active info before mutation.
    // The moving tab may be a loose tab (activeId === tabId) or a child of a group
    // (activeTabIndex === loc.tabIndex && activeChildIndex === loc.childIndex).
    const activeId = (tabs[activeTabIndex] as Tab)?.id;
    const isActiveMoving =
        activeId === tabId || // loose active tab
        (loc.childIndex !== null &&
            activeTabIndex === loc.tabIndex &&
            activeChildIndex === loc.childIndex);

    // Step 1: extract the leaf tab from its current position
    let leafTab: LeafTab;
    let intermediateTabs: Tab[];

    if (loc.childIndex === null) {
        // Loose tab
        const t = tabs[loc.tabIndex];
        if (!isLeafTab(t)) return state;
        leafTab = t;
        intermediateTabs = removeAt(tabs, loc.tabIndex);
    } else {
        // Child of a group
        const srcGroup = tabs[loc.tabIndex] as GroupTab;
        leafTab = srcGroup.children[loc.childIndex];
        const newChildren = removeAt(srcGroup.children, loc.childIndex);
        const groupBecomesEmpty = newChildren.length === 0;

        if (groupBecomesEmpty && emptyBehavior === "dissolve") {
            intermediateTabs = removeAt(tabs, loc.tabIndex);
        } else {
            const updatedSrc: GroupTab = { ...srcGroup, children: newChildren };
            intermediateTabs = replaceAt(tabs, loc.tabIndex, updatedSrc);
        }
    }

    // Step 2: add leaf to target group
    const newTargetIdx = intermediateTabs.findIndex(t => t.id === targetGroupId);
    if (newTargetIdx === -1) {
        // Target group was dissolved (shouldn't happen since target != source normally,
        // but guard anyway)
        return state;
    }
    const currentTarget = intermediateTabs[newTargetIdx] as GroupTab;
    const newChildren = [...currentTarget.children, leafTab];
    const leafChildIndex = newChildren.length - 1;
    const updatedTarget: GroupTab = { ...currentTarget, children: newChildren };
    const newTabs = replaceAt(intermediateTabs, newTargetIdx, updatedTarget);

    // Step 3: adjust active tracking
    let newActiveTabIndex: number;
    let newActiveChildIndex: number | null;

    if (isActiveMoving) {
        newActiveTabIndex = newTargetIdx;
        newActiveChildIndex = leafChildIndex;
    } else {
        const activeItemId = resolveActiveId(state);
        const relocated = relocateActive(newTabs, activeItemId ?? "", activeTabIndex);
        newActiveTabIndex = relocated.activeTabIndex;
        newActiveChildIndex = relocated.activeChildIndex;
    }

    return {
        tabs: newTabs,
        activeTabIndex: newActiveTabIndex,
        activeChildIndex: newActiveChildIndex,
    };
}

// ---------------------------------------------------------------------------
// pinGroup
// ---------------------------------------------------------------------------

/**
 * Toggle the `pinned` flag of a group, then enforce pinned-first ordering
 * across the top-level tabs array.
 */
export function pinGroup(state: TabState, groupId: string): TabState {
    const { tabs, activeTabIndex, activeChildIndex } = state;

    const groupIdx = tabs.findIndex(t => t.id === groupId);
    if (groupIdx === -1) return state;

    const group = tabs[groupIdx];
    if (!isGroupTab(group)) return state;

    const toggled: GroupTab = { ...group, pinned: !group.pinned };
    const updatedTabs = replaceAt(tabs, groupIdx, toggled);
    const orderedTabs = enforcePinnedOrder(updatedTabs);

    // Re-find active item after reorder using child id if needed
    const activeItemId = resolveActiveId(state);
    const relocated = relocateActive(orderedTabs, activeItemId ?? "", activeTabIndex);

    return {
        tabs: orderedTabs,
        activeTabIndex: relocated.activeTabIndex,
        activeChildIndex: relocated.activeChildIndex,
    };
}

// ---------------------------------------------------------------------------
// moveWithinGroup
// ---------------------------------------------------------------------------

/**
 * Reorder children within a group. Moves the child at index `from` to index
 * `to`. No-op if indices are out of range or equal.
 */
export function moveWithinGroup(
    state: TabState,
    groupId: string,
    from: number,
    to: number,
): TabState {
    const { tabs, activeTabIndex, activeChildIndex } = state;

    const groupIdx = tabs.findIndex(t => t.id === groupId);
    if (groupIdx === -1) return state;

    const group = tabs[groupIdx];
    if (!isGroupTab(group)) return state;

    const children = group.children;
    if (from === to) return state;
    if (from < 0 || from >= children.length || to < 0 || to >= children.length) return state;

    // Perform the move
    const newChildren = [...children];
    const [moved] = newChildren.splice(from, 1);
    newChildren.splice(to, 0, moved);

    const updatedGroup: GroupTab = { ...group, children: newChildren };
    const newTabs = replaceAt(tabs, groupIdx, updatedGroup);

    // Adjust activeChildIndex if the active group is this one
    let newActiveChildIndex = activeChildIndex;
    if (activeTabIndex === groupIdx && activeChildIndex !== null) {
        const activeChild = children[activeChildIndex];
        const newIdx = newChildren.findIndex(ch => ch.id === activeChild.id);
        newActiveChildIndex = newIdx >= 0 ? newIdx : activeChildIndex;
    }

    return {
        tabs: newTabs,
        activeTabIndex: activeTabIndex,
        activeChildIndex: newActiveChildIndex,
    };
}

// ---------------------------------------------------------------------------
// renameGroupInState
// ---------------------------------------------------------------------------

/**
 * Set the name of a group tab. Returns a new TabState with the group's name
 * replaced; no-op if the groupId is not found or is not a group.
 */
export function renameGroupInState(state: TabState, groupId: string, name: string): TabState {
    const { tabs, activeTabIndex, activeChildIndex } = state;
    const groupIdx = tabs.findIndex(t => t.id === groupId);
    if (groupIdx === -1) return state;
    const group = tabs[groupIdx];
    if (!isGroupTab(group)) return state;
    const updated: GroupTab = { ...group, name };
    return { tabs: replaceAt(tabs, groupIdx, updated), activeTabIndex, activeChildIndex };
}

// ---------------------------------------------------------------------------
// setGroupColorInState
// ---------------------------------------------------------------------------

/**
 * Set (or clear) the color of a group tab. Pass `null` to remove the color.
 */
export function setGroupColorInState(state: TabState, groupId: string, color: string | null): TabState {
    const { tabs, activeTabIndex, activeChildIndex } = state;
    const groupIdx = tabs.findIndex(t => t.id === groupId);
    if (groupIdx === -1) return state;
    const group = tabs[groupIdx];
    if (!isGroupTab(group)) return state;
    const updated: GroupTab = { ...group, color };
    return { tabs: replaceAt(tabs, groupIdx, updated), activeTabIndex, activeChildIndex };
}

// ---------------------------------------------------------------------------
// toggleCollapsedInState
// ---------------------------------------------------------------------------

/**
 * Toggle the collapsed flag of a group tab.
 */
export function toggleCollapsedInState(state: TabState, groupId: string): TabState {
    const { tabs, activeTabIndex, activeChildIndex } = state;
    const groupIdx = tabs.findIndex(t => t.id === groupId);
    if (groupIdx === -1) return state;
    const group = tabs[groupIdx];
    if (!isGroupTab(group)) return state;
    const updated: GroupTab = { ...group, collapsed: !group.collapsed };
    return { tabs: replaceAt(tabs, groupIdx, updated), activeTabIndex, activeChildIndex };
}

// ---------------------------------------------------------------------------
// pinChildInGroup
// ---------------------------------------------------------------------------

export function pinChildInGroup(state: TabState, groupId: string, childId: string): TabState {
    const { tabs, activeTabIndex, activeChildIndex } = state;

    const groupIdx = tabs.findIndex(t => t.id === groupId);
    if (groupIdx === -1) return state;

    const group = tabs[groupIdx];
    if (!isGroupTab(group)) return state;

    const childIdx = group.children.findIndex(ch => ch.id === childId);
    if (childIdx === -1) return state;

    // Toggle pin
    const toggled: LeafTab = { ...group.children[childIdx], pinned: !group.children[childIdx].pinned };
    const updatedChildren = replaceAt(group.children, childIdx, toggled);
    const orderedChildren = enforcePinnedOrder(updatedChildren);
    const updatedGroup: GroupTab = { ...group, children: orderedChildren };
    const newTabs = replaceAt(tabs, groupIdx, updatedGroup);

    // Re-find active child within this group after reorder
    let newActiveChildIndex = activeChildIndex;
    if (activeTabIndex === groupIdx && activeChildIndex !== null) {
        const prevActiveChild = group.children[activeChildIndex];
        const newIdx = orderedChildren.findIndex(ch => ch.id === prevActiveChild.id);
        newActiveChildIndex = newIdx >= 0 ? newIdx : activeChildIndex;
    }

    return {
        tabs: newTabs,
        activeTabIndex: activeTabIndex,
        activeChildIndex: newActiveChildIndex,
    };
}
