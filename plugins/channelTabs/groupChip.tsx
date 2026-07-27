/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useRef } from "@webpack/common";
import { findStoreLazy } from "@webpack";
import type { GroupTab, LeafTab } from "./types";
import { getTabMeta } from "./tabMeta";
import { setDrag, setDragGhost } from "./dragState";

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
    /** This chip is the tab currently being dragged. */
    isDragging?: boolean;
    /** This chip just received a dropped tab. */
    isSettling?: boolean;
    /** A leaf is hovering the chip's absorb band. */
    isAbsorbTarget?: boolean;
    onDragStateChange?: (id: string | null) => void;
    onToggleCollapsed: (groupId: string) => void;
    onContextMenu: (e: React.MouseEvent, index: number) => void;
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
    isDragging,
    isSettling,
    isAbsorbTarget,
    onDragStateChange,
    onToggleCollapsed,
    onContextMenu,
}: GroupChipProps) {
    const chipRef = useRef<HTMLDivElement>(null);
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

    let className = "vc-channelTabs-tab vc-channelTabs-group-chip";
    if (isActive) className += " vc-channelTabs-tab-active";
    if (group.pinned) className += " vc-channelTabs-tab-pinned";
    if (isDragging) className += " vc-channelTabs-tab-dragging";
    if (isSettling) className += " vc-channelTabs-tab-settling";
    if (isAbsorbTarget) className += " vc-channelTabs-drop-target";

    return (
        <div
            ref={chipRef}
            data-vc-group-id={group.id}
            className={className}
            style={colorStyle}
            onClick={() => onToggleCollapsed(group.id)}
            onContextMenu={e => onContextMenu(e, index)}
            draggable
            onDragStart={e => {
                e.dataTransfer.setData("text/plain", String(index));
                e.dataTransfer.setData("application/x-tab-type", "group");
                e.dataTransfer.setData("application/x-tab-id", group.id);
                e.dataTransfer.effectAllowed = "move";
                if (chipRef.current) setDragGhost(e, chipRef.current);
                setDrag({ kind: "group", id: group.id, index });
                onDragStateChange?.(group.id);
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
