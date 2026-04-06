/*
 * Vencord userplugin — minimalCallBar
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

// SVG path data for call control icons
const ICONS = {
    mic: "M14.99 11C14.99 12.66 13.66 14 12 14C10.34 14 9 12.66 9 11V5C9 3.34 10.34 2 12 2C13.66 2 15 3.34 15 5L14.99 11ZM12 16.1C14.76 16.1 17.3 14 17.3 11H18.3C18.3 14.42 15.76 17.24 12.5 17.72V21H11.5V17.72C8.24 17.24 5.7 14.42 5.7 11H6.7C6.7 14 9.24 16.1 12 16.1Z",
    micMuted: "M14.99 11C14.99 12.66 13.66 14 12 14C10.34 14 9 12.66 9 11V5C9 3.34 10.34 2 12 2C13.66 2 15 3.34 15 5L14.99 11ZM12 16.1C14.76 16.1 17.3 14 17.3 11H18.3C18.3 14.42 15.76 17.24 12.5 17.72V21H11.5V17.72C8.24 17.24 5.7 14.42 5.7 11H6.7C6.7 14 9.24 16.1 12 16.1ZM2.7 2.7L21.3 21.3L20.6 22L2 3.4L2.7 2.7Z",
    deafen: "M12 2C6.48 2 2 6.48 2 12V20C2 21.1 2.9 22 4 22H6C7.1 22 8 21.1 8 20V16C8 14.9 7.1 14 6 14H4V12C4 7.58 7.58 4 12 4S20 7.58 20 12V14H18C16.9 14 16 14.9 16 16V20C16 21.1 16.9 22 18 22H20C21.1 22 22 21.1 22 20V12C22 6.48 17.52 2 12 2Z",
    camera: "M18 7C18 5.9 17.1 5 16 5H4C2.9 5 2 5.9 2 7V17C2 18.1 2.9 19 4 19H16C17.1 19 18 18.1 18 17V13.5L22 17.5V6.5L18 10.5V7Z",
    screenshare: "M2 4.5C2 3.39 2.9 2.5 4 2.5H20C21.1 2.5 22 3.39 22 4.5V15.5C22 16.6 21.1 17.5 20 17.5H13V19.5H16V21.5H8V19.5H11V17.5H4C2.9 17.5 2 16.6 2 15.5V4.5ZM4 4.5V15.5H20V4.5H4Z",
    hangup: "M12 9C10.4 9 8.85 9.25 7.4 9.72V12.82C7.4 13.21 7.17 13.56 6.84 13.72C5.86 14.21 4.97 14.84 4.18 15.57C3.95 15.78 3.58 15.78 3.34 15.54L0.71 12.91C0.47 12.67 0.48 12.28 0.73 12.05C3.71 9.43 7.68 7.85 12 7.85C16.32 7.85 20.29 9.43 23.27 12.05C23.52 12.28 23.53 12.67 23.29 12.91L20.66 15.54C20.42 15.78 20.06 15.78 19.82 15.57C19.03 14.84 18.14 14.21 17.16 13.72C16.83 13.56 16.6 13.21 16.6 12.82V9.72C15.15 9.25 13.6 9 12 9Z",
    overflow: "M6 10C4.9 10 4 10.9 4 12S4.9 14 6 14 8 13.1 8 12 7.1 10 6 10ZM18 10C16.9 10 16 10.9 16 12S16.9 14 18 14 20 13.1 20 12 19.1 10 18 10ZM12 10C10.9 10 10 10.9 10 12S10.9 14 12 14 14 13.1 14 12 13.1 10 12 10Z",
    rejoin: "M12 9C10.4 9 8.85 9.25 7.4 9.72V12.82C7.4 13.21 7.17 13.56 6.84 13.72C5.86 14.21 4.97 14.84 4.18 15.57C3.95 15.78 3.58 15.78 3.34 15.54L0.71 12.91C0.47 12.67 0.48 12.28 0.73 12.05C3.71 9.43 7.68 7.85 12 7.85C16.32 7.85 20.29 9.43 23.27 12.05C23.52 12.28 23.53 12.67 23.29 12.91L20.66 15.54C20.42 15.78 20.06 15.78 19.82 15.57C19.03 14.84 18.14 14.21 17.16 13.72C16.83 13.56 16.6 13.21 16.6 12.82V9.72C15.15 9.25 13.6 9 12 9Z",
    minimize: "M7.41 15.41L12 10.83L16.59 15.41L18 14L12 8L6 14L7.41 15.41Z",
} as const;

export interface ControlButtonProps {
    type: keyof typeof ICONS;
    muted?: boolean;
    onClick: (e: React.MouseEvent) => void;
    title: string;
}

export function ControlButton({ type, muted, onClick, title }: ControlButtonProps) {
    let className = "vc-minimalCallBar-controlBtn";
    if (muted) className += " vc-minimalCallBar-muted";
    if (type === "hangup") className += " vc-minimalCallBar-hangup";
    if (type === "rejoin") className += " vc-minimalCallBar-rejoin";
    if (type === "minimize") className += " vc-minimalCallBar-minimize";

    const iconPath = type === "mic" && muted ? ICONS.micMuted : ICONS[type];

    return (
        <button
            className={className}
            onClick={e => { e.stopPropagation(); onClick(e); }}
            title={title}
        >
            <svg viewBox="0 0 24 24" fill="currentColor">
                <path d={iconPath} />
            </svg>
        </button>
    );
}
