/*
 * Vencord userplugin — minimalCallBar
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { openUserProfile } from "@utils/discord";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import { ContextMenuApi, Menu, React, UserStore, useStateFromStores } from "@webpack/common";

const MediaEngineStore = findStoreLazy("MediaEngineStore") as {
    getLocalVolume: (userId: string) => number;
    isLocalMute: (userId: string) => boolean;
    isSoundboardMuted?: (userId: string) => boolean;
};

const MediaEngineActions = findByPropsLazy("setLocalVolume", "toggleLocalMute") as {
    setLocalVolume: (userId: string, volume: number) => void;
    toggleLocalMute: (userId: string) => void;
    toggleLocalSoundboardMute: (userId: string) => void;
};

const MAX_VOLUME = 200;

function userLabel(userId: string) {
    const user = UserStore.getUser(userId) as any;
    return user?.globalName ?? user?.username ?? "User";
}

/**
 * Local mute / soundboard mute / volume items for one user.
 *
 * Discord's Menu API only accepts Menu items (or groups of them) as children —
 * a wrapper component or fragment throws "Menu API only allows Items and groups
 * of Items as children". So this is a plain function returning an item array,
 * not a React component, and the store subscription lives in the menu itself.
 */
function voiceUserItems(userId: string) {
    const volume = MediaEngineStore.getLocalVolume(userId);
    const muted = MediaEngineStore.isLocalMute(userId);
    const soundboardMuted = MediaEngineStore.isSoundboardMuted?.(userId) ?? false;

    return [
        <Menu.MenuCheckboxItem
            key="mute"
            id={`vc-mcb-local-mute-${userId}`}
            label="Mute"
            checked={muted}
            action={() => MediaEngineActions.toggleLocalMute(userId)}
        />,
        <Menu.MenuCheckboxItem
            key="soundboard"
            id={`vc-mcb-soundboard-mute-${userId}`}
            label="Mute Soundboard"
            checked={soundboardMuted}
            action={() => MediaEngineActions.toggleLocalSoundboardMute(userId)}
        />,
        <Menu.MenuControlItem
            key="volume"
            id={`vc-mcb-volume-${userId}`}
            label="User Volume"
            control={(props: any, ref: any) => (
                <Menu.MenuSliderControl
                    {...props}
                    ref={ref}
                    value={volume}
                    minValue={0}
                    maxValue={MAX_VOLUME}
                    onChange={(value: number) => MediaEngineActions.setLocalVolume(userId, value)}
                    renderValue={(value: number) => `${Math.round(value)}%`}
                />
            )}
        />,
    ];
}

/** Re-render the menu whenever local volume / mute state changes. */
function useMediaEngineVersion() {
    useStateFromStores([MediaEngineStore], () => ({}));
}

function VoiceUserMenu({ userId, isSelf, onClose }: { userId: string; isSelf: boolean; onClose?: () => void; }) {
    useMediaEngineVersion();
    const label = userLabel(userId);

    return (
        <Menu.Menu
            navId="vc-minimalCallBar-user"
            onClose={() => { ContextMenuApi.closeContextMenu(); onClose?.(); }}
            aria-label={`${label} voice options`}
        >
            <Menu.MenuGroup label={label}>
                <Menu.MenuItem
                    id="vc-mcb-profile"
                    label="View Profile"
                    action={() => openUserProfile(userId)}
                />
            </Menu.MenuGroup>

            {!isSelf && <Menu.MenuGroup>{voiceUserItems(userId)}</Menu.MenuGroup>}

            <Menu.MenuGroup>
                <Menu.MenuItem
                    id="vc-mcb-copy-id"
                    label="Copy User ID"
                    action={() => navigator.clipboard?.writeText(userId)}
                />
            </Menu.MenuGroup>
        </Menu.Menu>
    );
}

/** Menu listing the participants hidden behind the "+N" label, one submenu each. */
function HiddenUsersMenu({ userIds, selfId }: { userIds: string[]; selfId?: string; }) {
    useMediaEngineVersion();

    return (
        <Menu.Menu
            navId="vc-minimalCallBar-hidden-users"
            onClose={() => ContextMenuApi.closeContextMenu()}
            aria-label="Other participants"
        >
            <Menu.MenuGroup label={`${userIds.length} more in call`}>
                {userIds.map(id => (
                    <Menu.MenuItem key={id} id={`vc-mcb-user-${id}`} label={userLabel(id)}>
                        {[
                            <Menu.MenuItem
                                key="profile"
                                id={`vc-mcb-profile-${id}`}
                                label="View Profile"
                                action={() => openUserProfile(id)}
                            />,
                            ...(id === selfId ? [] : voiceUserItems(id)),
                        ]}
                    </Menu.MenuItem>
                ))}
            </Menu.MenuGroup>
        </Menu.Menu>
    );
}

/**
 * Opens the per-user voice options menu (profile, local mute, volume).
 * `onClose` lets the caller keep its own hover UI alive while the menu is open.
 */
export function openVoiceUserContextMenu(event: React.MouseEvent, userId: string, onClose?: () => void) {
    event.preventDefault();
    event.stopPropagation();
    const isSelf = userId === UserStore.getCurrentUser()?.id;
    ContextMenuApi.openContextMenu(event as any, () => (
        <VoiceUserMenu userId={userId} isSelf={isSelf} onClose={onClose} />
    ));
}

/** Opens a menu for the participants collapsed behind the "+N" label. */
export function openHiddenUsersContextMenu(event: React.MouseEvent, userIds: string[]) {
    event.preventDefault();
    event.stopPropagation();
    if (userIds.length === 0) return;
    const selfId = UserStore.getCurrentUser()?.id;
    ContextMenuApi.openContextMenu(event as any, () => (
        <HiddenUsersMenu userIds={userIds} selfId={selfId} />
    ));
}
