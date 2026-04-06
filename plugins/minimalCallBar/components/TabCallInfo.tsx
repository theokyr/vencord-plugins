/*
 * Vencord userplugin — minimalCallBar
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, UserStore } from "@webpack/common";

export interface TabCallInfoProps {
    channelId: string;
    callStartedAt: number;
    participants: Array<{ userId: string; muted: boolean; deafened: boolean }>;
    maxAvatars: number;
    controls: {
        toggleMute: () => void;
        toggleDeafen: () => void;
        disconnect: () => void;
    };
    isSelfMuted: boolean;
    isSelfDeafened: boolean;
}

export function TabCallInfo({ channelId, callStartedAt, participants, maxAvatars, controls, isSelfMuted, isSelfDeafened }: TabCallInfoProps) {
    const [now, setNow] = React.useState(Date.now());

    React.useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    const elapsed = now - callStartedAt;
    const s = Math.floor(elapsed / 1000) % 60;
    const m = Math.floor(elapsed / 60000) % 60;
    const h = Math.floor(elapsed / 3600000);
    const duration = h > 0
        ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
        : `${m}:${String(s).padStart(2, "0")}`;

    const visibleParticipants = participants.slice(0, maxAvatars);
    const overflowCount = Math.max(0, participants.length - maxAvatars);

    return (
        <>
            <span className="vc-minimalCallBar-tabTimer">{duration}</span>
            <div className="vc-minimalCallBar-tabAvatarStack">
                {visibleParticipants.map(p => {
                    let user: any;
                    try { user = UserStore.getUser(p.userId); } catch { return null; }
                    if (!user) return null;
                    return (
                        <img
                            key={p.userId}
                            className="vc-minimalCallBar-tabAvatar"
                            src={user.getAvatarURL(undefined, 32)}
                            alt={user.globalName ?? user.username}
                        />
                    );
                })}
                {overflowCount > 0 && (
                    <span className="vc-minimalCallBar-avatarCount" style={{ fontSize: "9px", marginLeft: "2px" }}>+{overflowCount}</span>
                )}
            </div>
            <div className="vc-minimalCallBar-tabControls">
                <button
                    className={`vc-minimalCallBar-tabControlBtn${isSelfMuted ? " vc-minimalCallBar-muted" : ""}`}
                    onClick={e => { e.stopPropagation(); controls.toggleMute(); }}
                    title={isSelfMuted ? "Unmute" : "Mute"}
                >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d={isSelfMuted
                            ? "M14.99 11C14.99 12.66 13.66 14 12 14C10.34 14 9 12.66 9 11V5C9 3.34 10.34 2 12 2C13.66 2 15 3.34 15 5L14.99 11ZM12 16.1C14.76 16.1 17.3 14 17.3 11H18.3C18.3 14.42 15.76 17.24 12.5 17.72V21H11.5V17.72C8.24 17.24 5.7 14.42 5.7 11H6.7C6.7 14 9.24 16.1 12 16.1ZM2.7 2.7L21.3 21.3L20.6 22L2 3.4L2.7 2.7Z"
                            : "M14.99 11C14.99 12.66 13.66 14 12 14C10.34 14 9 12.66 9 11V5C9 3.34 10.34 2 12 2C13.66 2 15 3.34 15 5L14.99 11ZM12 16.1C14.76 16.1 17.3 14 17.3 11H18.3C18.3 14.42 15.76 17.24 12.5 17.72V21H11.5V17.72C8.24 17.24 5.7 14.42 5.7 11H6.7C6.7 14 9.24 16.1 12 16.1Z"
                        } />
                    </svg>
                </button>
                <button
                    className={`vc-minimalCallBar-tabControlBtn${isSelfDeafened ? " vc-minimalCallBar-muted" : ""}`}
                    onClick={e => { e.stopPropagation(); controls.toggleDeafen(); }}
                    title={isSelfDeafened ? "Undeafen" : "Deafen"}
                >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12V20C2 21.1 2.9 22 4 22H6C7.1 22 8 21.1 8 20V16C8 14.9 7.1 14 6 14H4V12C4 7.58 7.58 4 12 4S20 7.58 20 12V14H18C16.9 14 16 14.9 16 16V20C16 21.1 16.9 22 18 22H20C21.1 22 22 21.1 22 20V12C22 6.48 17.52 2 12 2Z" />
                    </svg>
                </button>
                <button
                    className="vc-minimalCallBar-tabControlBtn vc-minimalCallBar-hangup"
                    onClick={e => { e.stopPropagation(); controls.disconnect(); }}
                    title="Disconnect"
                >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 9C10.4 9 8.85 9.25 7.4 9.72V12.82C7.4 13.21 7.17 13.56 6.84 13.72C5.86 14.21 4.97 14.84 4.18 15.57C3.95 15.78 3.58 15.78 3.34 15.54L0.71 12.91C0.47 12.67 0.48 12.28 0.73 12.05C3.71 9.43 7.68 7.85 12 7.85C16.32 7.85 20.29 9.43 23.27 12.05C23.52 12.28 23.53 12.67 23.29 12.91L20.66 15.54C20.42 15.78 20.06 15.78 19.82 15.57C19.03 14.84 18.14 14.21 17.16 13.72C16.83 13.56 16.6 13.21 16.6 12.82V9.72C15.15 9.25 13.6 9 12 9Z" />
                    </svg>
                </button>
            </div>
        </>
    );
}
