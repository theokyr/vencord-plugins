/*
 * Vencord userplugin — minimalCallBar
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findStoreLazy } from "@webpack";
import { React, UserStore } from "@webpack/common";

import { settings } from "../index";

const VoiceStateStore = findStoreLazy("VoiceStateStore") as {
    getVoiceStatesForChannel: (channelId: string) => Record<string, { userId: string; selfMute: boolean; selfDeaf: boolean; mute: boolean; deaf: boolean; }>;
};

function formatDuration(ms: number): string {
    const s = Math.floor(ms / 1000) % 60;
    const m = Math.floor(ms / 60000) % 60;
    const h = Math.floor(ms / 3600000);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
}

export interface CallTooltipProps {
    channelId: string;
    channelName: string;
    callStartedAt: number;
    position: "above" | "below";
    anchorRect: DOMRect;
}

export function CallTooltip({ channelId, channelName, callStartedAt, position, anchorRect }: CallTooltipProps) {
    const [now, setNow] = React.useState(Date.now());

    React.useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    const voiceStates = VoiceStateStore?.getVoiceStatesForChannel?.(channelId) ?? {};
    const participants = Object.values(voiceStates);

    const style: React.CSSProperties = {
        position: "fixed",
        left: anchorRect.left,
        zIndex: 1001,
    };
    if (position === "above") {
        style.bottom = window.innerHeight - anchorRect.top + 4;
    } else {
        style.top = anchorRect.bottom + 4;
    }

    return (
        <div className="vc-minimalCallBar-tooltip" style={style}>
            {settings.store.tooltipChannel && (
                <div className="vc-minimalCallBar-tooltipHeader">{channelName}</div>
            )}
            {settings.store.tooltipDuration && (
                <div className="vc-minimalCallBar-tooltipDuration">
                    {formatDuration(now - callStartedAt)}
                </div>
            )}
            {settings.store.tooltipUsers && participants.map(vs => {
                let user: any;
                try { user = UserStore.getUser(vs.userId); } catch { return null; }
                if (!user) return null;

                let statusText = "";
                if (vs.selfDeaf || vs.deaf) statusText = "Deafened";
                else if (vs.selfMute || vs.mute) statusText = "Muted";

                return (
                    <div key={vs.userId} className="vc-minimalCallBar-tooltipUser">
                        <img
                            className="vc-minimalCallBar-tooltipUserAvatar"
                            src={user.getAvatarURL(undefined, 32)}
                            alt=""
                        />
                        <span className="vc-minimalCallBar-tooltipUserName">
                            {user.globalName ?? user.username}
                        </span>
                        {statusText && (
                            <span className="vc-minimalCallBar-tooltipUserStatus">{statusText}</span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
