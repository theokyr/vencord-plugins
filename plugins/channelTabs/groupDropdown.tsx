/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useCallback, useEffect } from "@webpack/common";
import { findStoreLazy } from "@webpack";
import type { GroupTab, LeafTab } from "./types";
import { getTabMeta } from "./tabMeta";

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
    onDropFromGroup: (tabId: string, dropIndex: number) => void;
}

function DropdownItem({
    child,
    childIndex,
    isActive,
    showIcon,
    groupId,
    onActivate,
    onClose,
    onContextMenu,
}: {
    child: LeafTab;
    childIndex: number;
    isActive: boolean;
    showIcon: boolean;
    groupId: string;
    onActivate: () => void;
    onClose: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
}) {
    const meta = getTabMeta(child, showIcon);
    const mentions = child.type === "channel" ? ReadStateStore.getMentionCount(child.channelId) : 0;
    const hasUnread = child.type === "channel" ? ReadStateStore.hasUnread(child.channelId) : false;

    return (
        <div
            className={`vc-channelTabs-dropdown-item ${isActive ? "vc-channelTabs-dropdown-item-active" : ""} ${child.pinned ? "vc-channelTabs-dropdown-item-pinned" : ""}`}
            onClick={e => { e.stopPropagation(); onActivate(); }}
            onContextMenu={e => { e.stopPropagation(); onContextMenu(e); }}
            draggable
            onDragStart={e => {
                e.dataTransfer.setData("text/plain", String(childIndex));
                e.dataTransfer.setData("application/x-tab-type", "child");
                e.dataTransfer.setData("application/x-tab-id", child.id);
                e.dataTransfer.setData("application/x-source-group", groupId);
                e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
            onDrop={e => {
                e.preventDefault();
                e.stopPropagation();
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
    onDropFromGroup,
}: GroupDropdownProps) {
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

    return (
        <div
            className="vc-channelTabs-dropdown"
            style={group.color ? { borderTopColor: group.color } : undefined}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
            onDrop={e => {
                e.preventDefault();
                const tabType = e.dataTransfer.getData("application/x-tab-type");
                if (tabType === "child") {
                    const srcGroup = e.dataTransfer.getData("application/x-source-group");
                    if (srcGroup === group.id) {
                        const from = parseInt(e.dataTransfer.getData("text/plain"));
                        const to = group.children.length - 1;
                        if (!isNaN(from)) onMoveChild(group.id, from, to);
                    }
                }
            }}
        >
            {sortedChildren.map((child, sortedIdx) => {
                const originalIdx = originalIndices[sortedIdx];
                return (
                    <DropdownItem
                        key={child.id}
                        child={child}
                        childIndex={originalIdx}
                        isActive={activeChildIndex === originalIdx}
                        showIcon={showIcon}
                        groupId={group.id}
                        onActivate={() => onActivateChild(groupIndex, originalIdx)}
                        onClose={() => onCloseChild(group.id, child.id)}
                        onContextMenu={e => onChildContextMenu(e, group.id, originalIdx)}
                    />
                );
            })}
            <button
                className="vc-channelTabs-dropdown-addCurrent"
                onClick={e => { e.stopPropagation(); onAddCurrentTab(); }}
            >
                + Add current tab
            </button>
        </div>
    );
}
