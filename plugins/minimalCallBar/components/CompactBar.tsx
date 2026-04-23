/*
 * Vencord userplugin — minimalCallBar
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByPropsLazy, findStoreLazy } from "@webpack";
import { FluxDispatcher, React, UserStore, useStateFromStores } from "@webpack/common";

import { settings } from "../index";
import { CallTooltip } from "./CallTooltip";
import { ControlButton } from "./ControlButton";

const VoiceStateStore = findStoreLazy("VoiceStateStore") as {
    getVoiceStatesForChannel: (channelId: string) => Record<string, { userId: string; selfMute: boolean; selfDeaf: boolean; mute: boolean; deaf: boolean; selfVideo: boolean; selfStream: boolean; }>;
};

const SpeakingStore = findStoreLazy("SpeakingStore") as {
    isSpeaking: (userId: string) => boolean;
};

const MediaEngineActions = findByPropsLazy("toggleSelfMute", "toggleSelfDeaf") as {
    toggleSelfMute: () => void;
    toggleSelfDeaf: () => void;
};

const VideoActions = findByPropsLazy("toggleVideo") as {
    toggleVideo: () => void;
};

const ScreenshareActions = findByPropsLazy("toggleScreenShare") as {
    toggleScreenShare: () => void;
};

const VoiceChannelActions = findByPropsLazy("selectVoiceChannel") as {
    selectVoiceChannel: (channelId: string) => void;
    disconnect: () => void;
};

const MediaEngineStore = findStoreLazy("MediaEngineStore") as {
    isSelfMute: () => boolean;
    isSelfDeaf: () => boolean;
    isScreenSharing: () => boolean;
};

export interface CompactBarProps {
    channelId: string;
    channelName: string;
    callStartedAt: number;
    mode: "strip" | "bottom";
    isConnected: boolean;
    ping: number;
    onToggleOverlay: () => void;
    onRejoin: () => void;
    onBarClick: () => void;
}

export function CompactBar({ channelId, channelName, callStartedAt, mode, isConnected, ping, onToggleOverlay, onRejoin, onBarClick }: CompactBarProps) {
    const [now, setNow] = React.useState(Date.now());
    const [showTooltip, setShowTooltip] = React.useState(false);
    const [showOverflow, setShowOverflow] = React.useState(false);
    const [isMuted, setIsMuted] = React.useState(false);
    const [isDeafened, setIsDeafened] = React.useState(false);
    const [isSelfStreaming, setIsSelfStreaming] = React.useState(false);
    const barRef = React.useRef<HTMLDivElement>(null);
    const hoverTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    // Timer tick
    React.useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    // Track speaking state
    const [speakingUsers, setSpeakingUsers] = React.useState<Set<string>>(new Set());
    React.useEffect(() => {
        const onSpeaking = () => {
            try {
                const states = VoiceStateStore?.getVoiceStatesForChannel?.(channelId) ?? {};
                const speaking = new Set<string>();
                for (const vs of Object.values(states)) {
                    if (SpeakingStore?.isSpeaking?.(vs.userId)) speaking.add(vs.userId);
                }
                setSpeakingUsers(speaking);
            } catch { /* store not ready */ }
        };
        FluxDispatcher.subscribe("SPEAKING", onSpeaking);
        return () => { FluxDispatcher.unsubscribe("SPEAKING", onSpeaking); };
    }, [channelId]);

    // Sync mute/deaf state
    React.useEffect(() => {
        const sync = () => {
            try {
                setIsMuted(MediaEngineStore.isSelfMute());
                setIsDeafened(MediaEngineStore.isSelfDeaf());
            } catch { /* store not ready */ }
        };
        sync();
        FluxDispatcher.subscribe("AUDIO_TOGGLE_SELF_MUTE", sync);
        FluxDispatcher.subscribe("AUDIO_TOGGLE_SELF_DEAF", sync);
        return () => {
            FluxDispatcher.unsubscribe("AUDIO_TOGGLE_SELF_MUTE", sync);
            FluxDispatcher.unsubscribe("AUDIO_TOGGLE_SELF_DEAF", sync);
        };
    }, []);

    // Sync self-stream state
    React.useEffect(() => {
        const sync = () => {
            try { setIsSelfStreaming(MediaEngineStore.isScreenSharing()); } catch { /* store not ready */ }
        };
        sync();
        FluxDispatcher.subscribe("STREAM_START", sync);
        FluxDispatcher.subscribe("STREAM_STOP", sync);
        FluxDispatcher.subscribe("STREAM_CREATE", sync);
        FluxDispatcher.subscribe("STREAM_DELETE", sync);
        return () => {
            FluxDispatcher.unsubscribe("STREAM_START", sync);
            FluxDispatcher.unsubscribe("STREAM_STOP", sync);
            FluxDispatcher.unsubscribe("STREAM_CREATE", sync);
            FluxDispatcher.unsubscribe("STREAM_DELETE", sync);
        };
    }, []);

    // Hover handlers
    const onMouseEnter = React.useCallback(() => {
        hoverTimeout.current = setTimeout(() => setShowTooltip(true), settings.store.hoverDelay);
    }, []);
    const onMouseLeave = React.useCallback(() => {
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
        setShowTooltip(false);
    }, []);

    // Avatar stack
    const voiceStates = VoiceStateStore?.getVoiceStatesForChannel?.(channelId) ?? {};
    const participants = Object.values(voiceStates);
    const maxAvatars = settings.store.maxVisibleAvatars;
    const visibleParticipants = participants.slice(0, maxAvatars);
    const overflowCount = Math.max(0, participants.length - maxAvatars);

    // Duration
    const elapsed = now - callStartedAt;
    const s = Math.floor(elapsed / 1000) % 60;
    const m = Math.floor(elapsed / 60000) % 60;
    const h = Math.floor(elapsed / 3600000);
    const duration = h > 0
        ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
        : `${m}:${String(s).padStart(2, "0")}`;

    const baseClass = mode === "strip"
        ? "vc-minimalCallBar-strip"
        : "vc-minimalCallBar-bottom";
    const className = isSelfStreaming ? `${baseClass} vc-minimalCallBar-streaming` : baseClass;

    const tooltipPosition = mode === "bottom" ? "above" : "below";

    const dotClass = isConnected
        ? "vc-minimalCallBar-statusDot"
        : "vc-minimalCallBar-statusDot vc-minimalCallBar-disconnected";

    return (
        <div
            ref={barRef}
            className={className}
            onClick={onBarClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <div className={dotClass} />
            <span className="vc-minimalCallBar-statusText" style={isConnected ? undefined : { color: "#949ba4" }}>
                {isConnected ? "In Call" : "Call Active"}
            </span>
            <span className="vc-minimalCallBar-separator">&bull;</span>
            <span className="vc-minimalCallBar-timer">{duration}</span>

            {/* Channel name */}
            <span className="vc-minimalCallBar-separator">&bull;</span>
            <span className="vc-minimalCallBar-channelName">{channelName}</span>

            {/* Ping (connected only, non-zero) */}
            {isConnected && ping > 0 && (
                <>
                    <span className="vc-minimalCallBar-separator">&bull;</span>
                    <span className="vc-minimalCallBar-ping">{Math.round(ping)}ms</span>
                </>
            )}

            {/* Avatar stack */}
            <div className="vc-minimalCallBar-avatarStack">
                {visibleParticipants.map(vs => {
                    let user: any;
                    try { user = UserStore.getUser(vs.userId); } catch { return null; }
                    if (!user) return null;
                    const isDeaf = vs.selfDeaf || vs.deaf;
                    const isMute = vs.selfMute || vs.mute;
                    const isVideo = vs.selfVideo;
                    const isStreaming = vs.selfStream;
                    const isSpeaking = speakingUsers.has(vs.userId);
                    const avatarClass = isSpeaking
                        ? "vc-minimalCallBar-avatar vc-minimalCallBar-speaking"
                        : "vc-minimalCallBar-avatar";
                    return (
                        <div key={vs.userId} className="vc-minimalCallBar-avatarWrap">
                            <img
                                className={avatarClass}
                                src={user.getAvatarURL(undefined, 32)}
                                alt={user.globalName ?? user.username}
                            />
                            {isStreaming ? (
                                <div className="vc-minimalCallBar-avatarBadge vc-minimalCallBar-badgeStream">
                                    <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
                                        <path d="M2 4.5C2 3.39 2.9 2.5 4 2.5H20C21.1 2.5 22 3.39 22 4.5V15.5C22 16.6 21.1 17.5 20 17.5H13V19.5H16V21.5H8V19.5H11V17.5H4C2.9 17.5 2 16.6 2 15.5V4.5ZM4 4.5V15.5H20V4.5H4Z" />
                                    </svg>
                                </div>
                            ) : isVideo ? (
                                <div className="vc-minimalCallBar-avatarBadge vc-minimalCallBar-badgeVideo">
                                    <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
                                        <path d="M18 7C18 5.9 17.1 5 16 5H4C2.9 5 2 5.9 2 7V17C2 18.1 2.9 19 4 19H16C17.1 19 18 18.1 18 17V13.5L22 17.5V6.5L18 10.5V7Z" />
                                    </svg>
                                </div>
                            ) : isDeaf ? (
                                <div className="vc-minimalCallBar-avatarBadge">
                                    <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
                                        <path d="M22.7 2.7a1 1 0 0 0-1.4-1.4l-20 20a1 1 0 1 0 1.4 1.4l20-20ZM17.06 2.94a.48.48 0 0 0-.11-.77A11 11 0 0 0 2.18 16.94c.14.3.53.35.76.12l3.2-3.2c.25-.25.15-.68-.2-.76a5 5 0 0 0-1.02-.1H3.05a9 9 0 0 1 12.66-9.2c.2.09.44.05.59-.1l.76-.76ZM20.2 8.28a.52.52 0 0 1 .1-.58l.76-.76a.48.48 0 0 1 .77.11 11 11 0 0 1-4.5 14.57c-1.27.71-2.73.23-3.55-.74a3.1 3.1 0 0 1-.17-3.78l1.38-1.97a5 5 0 0 1 4.1-2.13h1.86a9.1 9.1 0 0 0-.75-4.72ZM10.1 17.9c.25-.25.65-.18.74.14a3.1 3.1 0 0 1-.62 2.84 2.85 2.85 0 0 1-3.55.74.16.16 0 0 1-.04-.25l3.48-3.48Z" />
                                    </svg>
                                </div>
                            ) : isMute ? (
                                <div className="vc-minimalCallBar-avatarBadge">
                                    <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
                                        <path d="m2.7 22.7 20-20a1 1 0 0 0-1.4-1.4l-20 20a1 1 0 1 0 1.4 1.4ZM10.8 17.32c-.21.21-.1.58.2.62V20H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.06A8 8 0 0 0 20 10a1 1 0 0 0-2 0c0 1.45-.52 2.79-1.38 3.83l-.02.02A5.99 5.99 0 0 1 12.32 16a.52.52 0 0 0-.34.15l-1.18 1.18ZM15.36 4.52c.15-.15.19-.38.08-.56A4 4 0 0 0 8 6v4c0 .3.03.58.1.86.07.34.49.43.74.18l6.52-6.52ZM5.06 13.98c.16.28.53.31.75.09l.75-.75c.16-.16.19-.4.08-.61A5.97 5.97 0 0 1 6 10a1 1 0 0 0-2 0c0 1.45.39 2.81 1.06 3.98Z" />
                                    </svg>
                                </div>
                            ) : null}
                        </div>
                    );
                })}
                {overflowCount > 0 && (
                    <span className="vc-minimalCallBar-avatarCount">+{overflowCount}</span>
                )}
            </div>

            {/* Controls */}
            <div className="vc-minimalCallBar-controls">
                {isConnected ? (
                    <>
                        {settings.store.showMic && (
                            <ControlButton type="mic" muted={isMuted} onClick={() => MediaEngineActions.toggleSelfMute()} title={isMuted ? "Unmute" : "Mute"} />
                        )}
                        {settings.store.showDeafen && (
                            <ControlButton type="deafen" muted={isDeafened} onClick={() => MediaEngineActions.toggleSelfDeaf()} title={isDeafened ? "Undeafen" : "Deafen"} />
                        )}
                        {settings.store.showCamera && (
                            <ControlButton type="camera" onClick={() => VideoActions.toggleVideo()} title="Toggle Camera" />
                        )}
                        {settings.store.showScreenshare && (
                            <ControlButton type="screenshare" onClick={() => ScreenshareActions.toggleScreenShare()} title="Share Screen" />
                        )}
                        {/* Overflow menu for hidden controls */}
                        {(() => {
                            const hiddenControls: Array<{ type: "mic" | "deafen" | "camera" | "screenshare"; label: string; action: () => void; muted?: boolean }> = [];
                            if (!settings.store.showMic) hiddenControls.push({ type: "mic", label: isMuted ? "Unmute" : "Mute", action: () => MediaEngineActions.toggleSelfMute(), muted: isMuted });
                            if (!settings.store.showDeafen) hiddenControls.push({ type: "deafen", label: isDeafened ? "Undeafen" : "Deafen", action: () => MediaEngineActions.toggleSelfDeaf(), muted: isDeafened });
                            if (!settings.store.showCamera) hiddenControls.push({ type: "camera", label: "Toggle Camera", action: () => VideoActions.toggleVideo() });
                            if (!settings.store.showScreenshare) hiddenControls.push({ type: "screenshare", label: "Share Screen", action: () => ScreenshareActions.toggleScreenShare() });

                            if (hiddenControls.length === 0) return null;

                            return (
                                <div style={{ position: "relative" }}>
                                    <ControlButton type="overflow" onClick={() => setShowOverflow(!showOverflow)} title="More" />
                                    {showOverflow && (
                                        <div className="vc-minimalCallBar-overflowMenu" onClick={e => e.stopPropagation()}>
                                            {hiddenControls.map(ctrl => (
                                                <button
                                                    key={ctrl.type}
                                                    className="vc-minimalCallBar-overflowItem"
                                                    onClick={e => { e.stopPropagation(); ctrl.action(); }}
                                                >
                                                    <ControlButton type={ctrl.type} muted={ctrl.muted} onClick={ctrl.action} title={ctrl.label} />
                                                    <span>{ctrl.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                        <ControlButton type="hangup" onClick={() => VoiceChannelActions.disconnect()} title="Disconnect" />
                    </>
                ) : (
                    <ControlButton type="rejoin" onClick={e => { e.stopPropagation(); onRejoin(); }} title="Rejoin Call" />
                )}
            </div>

            {/* Tooltip */}
            {showTooltip && barRef.current && (
                <CallTooltip
                    channelId={channelId}
                    channelName={channelName}
                    callStartedAt={callStartedAt}
                    position={tooltipPosition}
                    anchorRect={barRef.current.getBoundingClientRect()}
                />
            )}
        </div>
    );
}
