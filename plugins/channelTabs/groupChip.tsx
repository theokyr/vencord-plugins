/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findStoreLazy } from "@webpack";
import type { GroupTab, LeafTab } from "./types";
import { getTabMeta } from "./tabMeta";

const ReadStateStore = findStoreLazy("ReadStateStore") as {
    getMentionCount: (channelId: string) => number;
    hasUnread: (channelId: string) => boolean;
    lastMessageId: (channelId: string) => string | null;
};

export interface GroupChipProps {
    group: GroupTab;
    index: number;
    isActive: boolean;
    maxIcons: number;
    chipStyle: "compact" | "minimal";
    activeChildIndex: number | null;
    showIcon: boolean;
    onToggleCollapsed: (groupId: string) => void;
    onActivateChild: (groupIndex: number, childIndex: number) => void;
    onCloseChild: (groupId: string, childId: string) => void;
    onMoveChild: (groupId: string, from: number, to: number) => void;
    onDropToGroup: (tabId: string, groupId: string) => void;
    onDropFromGroup: (tabId: string, dropIndex: number) => void;
    onContextMenu: (e: React.MouseEvent, index: number) => void;
    onChildContextMenu: (e: React.MouseEvent, groupId: string, childIndex: number) => void;
    onMove: (from: number, to: number) => void;
}

function ChildBadge({ child }: { child: LeafTab }) {
    if (child.type !== "channel") return null;
    const mentions = ReadStateStore.getMentionCount(child.channelId);
    const hasUnread = ReadStateStore.hasUnread(child.channelId);

    if (mentions > 0) {
        return <span className="vc-channelTabs-group-badge vc-channelTabs-group-badge-mention">{mentions}</span>;
    }
    if (hasUnread) {
        return <span className="vc-channelTabs-group-badge vc-channelTabs-group-badge-unread" />;
    }
    return null;
}

function ChildIcon({ child, showIcon, isActiveChild }: { child: LeafTab; showIcon: boolean; isActiveChild: boolean }) {
    const meta = getTabMeta(child, showIcon);
    return (
        <div
            className={`vc-channelTabs-group-icon ${isActiveChild ? "vc-channelTabs-group-icon-active" : ""}`}
            title={meta.name}
        >
            {meta.icon && <img src={meta.icon} alt="" width={16} height={16} style={{ borderRadius: "50%" }} />}
            <ChildBadge child={child} />
        </div>
    );
}

export function GroupChip({
    group,
    index,
    isActive,
    maxIcons,
    chipStyle,
    activeChildIndex,
    showIcon,
    onToggleCollapsed,
    onActivateChild,
    onCloseChild,
    onMoveChild,
    onDropToGroup,
    onDropFromGroup,
    onContextMenu,
    onChildContextMenu,
    onMove,
}: GroupChipProps) {
    // Sort children: active child first in icon strip
    const iconChildren = [...group.children];
    if (activeChildIndex !== null && activeChildIndex >= 0 && activeChildIndex < iconChildren.length) {
        const [active] = iconChildren.splice(activeChildIndex, 1);
        iconChildren.unshift(active);
    }
    const visibleIcons = iconChildren.slice(0, maxIcons);
    const overflow = group.children.length - maxIcons;

    const colorStyle = group.color
        ? { borderLeftColor: group.color, borderLeftWidth: "3px", borderLeftStyle: "solid" as const }
        : {};

    return (
        <div
            className={`vc-channelTabs-tab vc-channelTabs-group-chip ${isActive ? "vc-channelTabs-tab-active" : ""} ${group.pinned ? "vc-channelTabs-tab-pinned" : ""}`}
            style={colorStyle}
            onClick={() => onToggleCollapsed(group.id)}
            onContextMenu={e => onContextMenu(e, index)}
            draggable
            onDragStart={e => {
                e.dataTransfer.setData("text/plain", String(index));
                e.dataTransfer.setData("application/x-tab-type", "group");
                e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                e.currentTarget.classList.add("vc-channelTabs-drop-target");
            }}
            onDragLeave={e => {
                e.currentTarget.classList.remove("vc-channelTabs-drop-target");
            }}
            onDrop={e => {
                e.preventDefault();
                e.currentTarget.classList.remove("vc-channelTabs-drop-target");
                const tabType = e.dataTransfer.getData("application/x-tab-type");
                if (tabType === "group") {
                    const src = parseInt(e.dataTransfer.getData("text/plain"));
                    if (!isNaN(src)) onMove(src, index);
                } else if (tabType === "child") {
                    const tabId = e.dataTransfer.getData("application/x-tab-id");
                    if (tabId) onDropToGroup(tabId, group.id);
                } else if (tabType === "tab") {
                    const tabId = e.dataTransfer.getData("application/x-tab-id");
                    if (tabId) onDropToGroup(tabId, group.id);
                } else {
                    // Unknown/external drag type — ignore
                }
            }}
        >
            <span className="vc-channelTabs-group-name">{group.name}</span>

            {chipStyle === "compact" && (
                <div className="vc-channelTabs-group-icons">
                    {visibleIcons.map(child => (
                        <ChildIcon
                            key={child.id}
                            child={child}
                            showIcon={showIcon}
                            isActiveChild={activeChildIndex !== null && activeChildIndex >= 0 && child.id === group.children[activeChildIndex]?.id}
                        />
                    ))}
                    {overflow > 0 && <span className="vc-channelTabs-group-overflow">+{overflow}</span>}
                </div>
            )}

            <span className="vc-channelTabs-group-count">{group.children.length}</span>
            <span className="vc-channelTabs-group-chevron">{group.collapsed ? "\u25BE" : "\u25B4"}</span>
        </div>
    );
}
