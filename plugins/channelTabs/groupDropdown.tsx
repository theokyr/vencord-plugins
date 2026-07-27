/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useCallback, useEffect, useRef, useState } from "@webpack/common";
import { findStoreLazy } from "@webpack";
import type { GroupTab, LeafTab } from "./types";
import { getTabMeta } from "./tabMeta";
import { getDrag, setDrag, setDragGhost } from "./dragState";
import { computeChildSlot, slotToMoveTarget } from "./dragGeometry";

const ReadStateStore = findStoreLazy("ReadStateStore") as {
    getMentionCount: (channelId: string) => number;
    hasUnread: (channelId: string) => boolean;
};

export interface GroupDropdownProps {
    group: GroupTab;
    groupIndex: number;
    activeChildIndex: number | null;
    showIcon: boolean;
    chipRef: React.RefObject<HTMLElement>;
    onActivateChild: (groupIndex: number, childIndex: number) => void;
    onCloseChild: (groupId: string, childId: string) => void;
    onMoveChild: (groupId: string, from: number, to: number) => void;
    onPinChild: (groupId: string, childId: string) => void;
    onChildContextMenu: (e: React.MouseEvent, groupId: string, childIndex: number) => void;
    onClose: () => void;
    onAddCurrentTab: () => void;
    onDropToGroup: (tabId: string, groupId: string) => void;
    onDragStateChange?: (id: string | null) => void;
}

function DropdownItem({
    child,
    childIndex,
    isActive,
    isDragging,
    showIcon,
    groupId,
    onActivate,
    onClose,
    onContextMenu,
    onDragStateChange,
}: {
    child: LeafTab;
    childIndex: number;
    isActive: boolean;
    isDragging: boolean;
    showIcon: boolean;
    groupId: string;
    onActivate: () => void;
    onClose: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
    onDragStateChange?: (id: string | null) => void;
}) {
    const meta = getTabMeta(child, showIcon);
    const itemRef = useRef<HTMLDivElement>(null);
    const mentions = child.type === "channel" ? ReadStateStore.getMentionCount(child.channelId) : 0;
    const hasUnread = child.type === "channel" ? ReadStateStore.hasUnread(child.channelId) : false;

    return (
        <div
            ref={itemRef}
            data-vc-child-index={childIndex}
            className={`vc-channelTabs-dropdown-item ${isActive ? "vc-channelTabs-dropdown-item-active" : ""} ${child.pinned ? "vc-channelTabs-dropdown-item-pinned" : ""} ${isDragging ? "vc-channelTabs-dropdown-item-dragging" : ""}`}
            onClick={e => { e.stopPropagation(); onActivate(); }}
            onContextMenu={e => { e.stopPropagation(); onContextMenu(e); }}
            draggable
            onDragStart={e => {
                e.stopPropagation();
                e.dataTransfer.setData("text/plain", String(childIndex));
                e.dataTransfer.setData("application/x-tab-type", "child");
                e.dataTransfer.setData("application/x-tab-id", child.id);
                e.dataTransfer.setData("application/x-source-group", groupId);
                e.dataTransfer.effectAllowed = "move";
                if (itemRef.current) setDragGhost(e, itemRef.current);
                setDrag({ kind: "child", id: child.id, index: childIndex, sourceGroupId: groupId });
                onDragStateChange?.(child.id);
            }}
        >
            {child.pinned && <span className="vc-channelTabs-dropdown-pin" />}
            {showIcon && meta.icon && <img src={meta.icon} alt="" width={16} height={16} style={{ borderRadius: "50%" }} />}
            <span className="vc-channelTabs-dropdown-name">{meta.name}</span>
            {mentions > 0 && <span className="vc-channelTabs-tab-mention">{mentions}</span>}
            {!mentions && hasUnread && <span className="vc-channelTabs-tab-unread" />}
            {!child.pinned && (
                <button
                    className="vc-channelTabs-dropdown-close"
                    onClick={e => { e.stopPropagation(); onClose(); }}
                >
                    ×
                </button>
            )}
        </div>
    );
}

export function GroupDropdown({
    group,
    groupIndex,
    activeChildIndex,
    showIcon,
    chipRef,
    onActivateChild,
    onCloseChild,
    onMoveChild,
    onPinChild,
    onChildContextMenu,
    onClose,
    onAddCurrentTab,
    onDropToGroup,
    onDragStateChange,
}: GroupDropdownProps) {
    const listRef = useRef<HTMLDivElement>(null);
    /** Insertion slot (0..children.length) for a child being reordered. */
    const [dropSlot, setDropSlot] = useState<number | null>(null);
    /** A loose tab from the bar is hovering — dropping adds it to this group. */
    const [absorbing, setAbsorbing] = useState(false);
    const dropRef = useRef<{ slot: number | null; absorb: boolean; }>({ slot: null, absorb: false });

    const resetDrop = useCallback(() => {
        dropRef.current = { slot: null, absorb: false };
        setDropSlot(null);
        setAbsorbing(false);
    }, []);

    useEffect(() => {
        const onDragEnd = () => resetDrop();
        document.addEventListener("dragend", onDragEnd, true);
        return () => document.removeEventListener("dragend", onDragEnd, true);
    }, [resetDrop]);

    const onListDragOver = useCallback((e: React.DragEvent) => {
        const drag = getDrag();
        if (!drag) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";

        if (drag.kind === "child" && drag.sourceGroupId === group.id) {
            const slot = listRef.current
                ? computeChildSlot(listRef.current, e.clientY, group.children.length)
                : group.children.length;
            dropRef.current = { slot, absorb: false };
            setDropSlot(slot);
            setAbsorbing(false);
        } else if (drag.kind !== "group") {
            dropRef.current = { slot: null, absorb: true };
            setDropSlot(null);
            setAbsorbing(true);
        }
    }, [group.id, group.children.length]);

    const onListDragLeave = useCallback((e: React.DragEvent) => {
        const next = e.relatedTarget as Node | null;
        if (next && listRef.current?.contains(next)) return;
        resetDrop();
    }, [resetDrop]);

    const onListDrop = useCallback((e: React.DragEvent) => {
        const drag = getDrag();
        const { slot, absorb } = dropRef.current;
        resetDrop();
        if (!drag) return;
        e.preventDefault();
        e.stopPropagation();

        if (absorb) {
            if (drag.sourceGroupId !== group.id) onDropToGroup(drag.id, group.id);
            return;
        }
        if (slot === null || drag.kind !== "child") return;
        // `slot` is an insertion position; moveWithinGroup wants a post-removal index.
        const to = slotToMoveTarget(slot, drag.index, group.children.length);
        if (to !== null) onMoveChild(group.id, drag.index, to);
    }, [group.id, group.children.length, onMoveChild, onDropToGroup, resetDrop]);

    // Close on click-outside (but not during drag)
    const handleClickOutside = useCallback((e: MouseEvent) => {
        const el = chipRef.current;
        if (el && !el.contains(e.target as Node)) {
            onClose();
        }
    }, [onClose, chipRef]);

    useEffect(() => {
        // Delay listener to avoid closing on the same click that opened it
        const timer = setTimeout(() => {
            document.addEventListener("mousedown", handleClickOutside);
        }, 0);
        return () => {
            clearTimeout(timer);
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [handleClickOutside]);

    // Stable sort: pinned first, preserve relative order
    const sortedChildren = [...group.children].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return 0;
    });

    // Map sorted back to original indices
    const indexById = new Map(group.children.map((c, i) => [c.id, i]));
    const originalIndices = sortedChildren.map(c => indexById.get(c.id)!);

    const draggingChildId = getDrag()?.kind === "child" ? getDrag()!.id : null;

    const rows: React.ReactNode[] = [];
    let caretPlaced = false;
    sortedChildren.forEach((child, sortedIdx) => {
        const originalIdx = originalIndices[sortedIdx];
        if (dropSlot === originalIdx && !caretPlaced) {
            rows.push(<div key="vc-channelTabs-childCaret" className="vc-channelTabs-dropdown-caret" aria-hidden="true" />);
            caretPlaced = true;
        }
        rows.push(
            <DropdownItem
                key={child.id}
                child={child}
                childIndex={originalIdx}
                isActive={activeChildIndex === originalIdx}
                isDragging={draggingChildId === child.id}
                showIcon={showIcon}
                groupId={group.id}
                onActivate={() => onActivateChild(groupIndex, originalIdx)}
                onClose={() => onCloseChild(group.id, child.id)}
                onContextMenu={e => onChildContextMenu(e, group.id, originalIdx)}
                onDragStateChange={onDragStateChange}
            />,
        );
    });
    if (dropSlot !== null && !caretPlaced) {
        rows.push(<div key="vc-channelTabs-childCaret" className="vc-channelTabs-dropdown-caret" aria-hidden="true" />);
    }

    return (
        <div
            ref={listRef}
            className={`vc-channelTabs-dropdown${absorbing ? " vc-channelTabs-dropdown-absorbing" : ""}`}
            style={group.color ? { borderTopColor: group.color } : undefined}
            onDragOver={onListDragOver}
            onDragLeave={onListDragLeave}
            onDrop={onListDrop}
        >
            {rows}
            <button
                className="vc-channelTabs-dropdown-addCurrent"
                onClick={e => { e.stopPropagation(); onAddCurrentTab(); }}
            >
                + Add current tab
            </button>
        </div>
    );
}
