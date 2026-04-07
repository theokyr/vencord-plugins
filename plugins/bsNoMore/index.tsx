/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";
import "../_libAnimationKit/animations.css";

import definePlugin from "@utils/types";
import { bsNoMoreSchema } from "./settingsSchema";
import { settings, barListeners, BODY_CLASSES, BodyClassKey, toggleBodyClass } from "./settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { FluxDispatcher, NavigationRouter, Tooltip, useEffect, useState } from "@webpack/common";

interface NavButton {
    id: string;
    label: string;
    route: string;
    settingKey: "showFriends" | "showMessageRequests" | "showNitroHome" | "showShop" | "showQuests";
    icon: () => JSX.Element;
}

const FriendsIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M13 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
        <path d="M3 5v-.75C3 3.56 3.56 3 4.25 3s1.25.56 1.25 1.25V5H6a1 1 0 0 1 0 2H5.5v.75c0 .69-.56 1.25-1.25 1.25S3 8.44 3 7.75V7H2a1 1 0 0 1 0-2h1Z" />
        <path d="M13 12c-3.73 0-9 1.87-9 5.5V20h18v-2.5c0-3.63-5.27-5.5-9-5.5Z" />
    </svg>
);

const MessageRequestsIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2Z" />
    </svg>
);

const NitroIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M2.41 7.51A9.92 9.92 0 0 1 12 2a9.92 9.92 0 0 1 9.59 5.51l.4.89-.4.89A9.92 9.92 0 0 1 12 14.8a9.92 9.92 0 0 1-9.59-5.51l-.4-.89.4-.89ZM12 12.8a4.4 4.4 0 1 0 0-8.8 4.4 4.4 0 0 0 0 8.8Z" />
        <path d="m2.32 15.05.46-.9.76 1.72A10.97 10.97 0 0 0 12 20.77c3.58 0 6.91-1.9 8.46-4.9l.76-1.72.46.9-8.05 6.82a2.33 2.33 0 0 1-3.26 0l-8.05-6.82Z" />
    </svg>
);

const ShopIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h17A1.5 1.5 0 0 1 22 5.5V7H2V5.5ZM2 9v7.5A1.5 1.5 0 0 0 3.5 18h17a1.5 1.5 0 0 0 1.5-1.5V9H2Zm7 3a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2h-4a1 1 0 0 1-1-1Z" />
    </svg>
);

const QuestsIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93Zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39Z" />
    </svg>
);

const NAV_BUTTONS: NavButton[] = [
    { id: "friends", label: "Friends", route: "/channels/@me", settingKey: "showFriends", icon: FriendsIcon },
    { id: "messageRequests", label: "Requests", route: "/message-requests", settingKey: "showMessageRequests", icon: MessageRequestsIcon },
    { id: "nitro", label: "Nitro", route: "/store", settingKey: "showNitroHome", icon: NitroIcon },
    { id: "shop", label: "Shop", route: "/shop", settingKey: "showShop", icon: ShopIcon },
    { id: "quests", label: "Quests", route: "/quest-home", settingKey: "showQuests", icon: QuestsIcon },
];

function ButtonBar() {
    const [currentPath, setCurrentPath] = useState(window.location.pathname);
    const [, forceUpdate] = useState(0);

    useEffect(() => {
        const navHandler = () => setCurrentPath(window.location.pathname);
        const settingsHandler = () => forceUpdate(n => n + 1);

        FluxDispatcher.subscribe("CHANNEL_SELECT", navHandler);
        FluxDispatcher.subscribe("NAVIGATION", navHandler);
        barListeners.add(settingsHandler);

        return () => {
            FluxDispatcher.unsubscribe("CHANNEL_SELECT", navHandler);
            FluxDispatcher.unsubscribe("NAVIGATION", navHandler);
            barListeners.delete(settingsHandler);
        };
    }, []);

    const visibleButtons = NAV_BUTTONS.filter(btn => settings.store[btn.settingKey]);

    if (visibleButtons.length === 0) return null;

    const iconOnly = settings.store.iconOnlyMode;
    const iconSize = settings.store.iconSize;
    const textSize = settings.store.textSize;
    const alignment = settings.store.barAlignment;
    const iconBtnSize = iconSize + 8; // icon + minimal padding
    const padding = settings.store.barPadding;

    const justifyContent = alignment === "center" ? "center" : alignment === "right" ? "flex-end" : "flex-start";

    const barStyle: Record<string, string> = {
        "--vc-bsNoMore-iconSize": `${iconSize}px`,
        "--vc-bsNoMore-textSize": `${textSize}px`,
        "--vc-bsNoMore-iconBtnSize": `${iconBtnSize}px`,
        "--vc-bsNoMore-barPadding": `${padding}px`,
        justifyContent,
    };

    return (
        <div
            className={`vc-bsNoMore-bar${iconOnly ? " vc-bsNoMore-iconOnly" : ""}`}
            style={barStyle as any}
        >
            {visibleButtons.map(btn => {
                const isActive = currentPath === btn.route || currentPath.startsWith(btn.route + "/");
                const pillClass = `vc-bsNoMore-pill${isActive ? " vc-bsNoMore-active" : ""}`;

                if (iconOnly) {
                    return (
                        <Tooltip key={btn.id} text={btn.label}>
                            {tooltipProps => (
                                <button
                                    {...tooltipProps}
                                    className={pillClass}
                                    onClick={() => NavigationRouter.transitionTo(btn.route)}
                                >
                                    <btn.icon />
                                    <span className="vc-bsNoMore-label">{btn.label}</span>
                                </button>
                            )}
                        </Tooltip>
                    );
                }

                return (
                    <button
                        key={btn.id}
                        className={pillClass}
                        onClick={() => NavigationRouter.transitionTo(btn.route)}
                    >
                        <btn.icon />
                        <span className="vc-bsNoMore-label">{btn.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

export default definePlugin({
    name: "BSNoMore",
    description: "Remove upsell clutter — compacts DM nav, hides clan tags, avatar decorations, quest popups, and store UI",
    authors: [{ name: "kamaras", id: 132106519264100352n }],
    settings,
    settingsAboutComponent() {
        const { Button } = require("@webpack/common");
        return (
            <Button onClick={() => (window as any).__settingsHub?.open("BSNoMore")}>
                Open Full Settings
            </Button>
        );
    },

    patches: [
        // Replace vertical DM nav items with compact button bar
        {
            find: ".FRIENDS},\"friends\"",
            replacement: {
                match: /children:\[\(0,\i\.jsx\)\(\i,\{selected:[\s\S]+?,"quests"\),/,
                replace: "children:[$self.renderButtonBar(),"
            }
        },
        // Suppress quest delivery popups (orbs, quest ads, enrollment prompts)
        {
            find: "questToDeliverForPlacement",
            replacement: {
                match: /\(0,\i\.bG\)\(\[\i\.A\],\(\)=>\(0,\i\.\i\)\(\i\.A\.quests,\i\.A\.questToDeliverForPlacement,\i\.\i\.DESKTOP_ACCOUNT_PANEL_AREA\),\[\]\)/,
                replace: "null"
            }
        },
    ],

    start() {
        (window as any).__settingsHub?.register(bsNoMoreSchema);
        for (const key of Object.keys(BODY_CLASSES) as BodyClassKey[]) {
            toggleBodyClass(key, settings.store[key]);
        }
    },

    stop() {
        (window as any).__settingsHub?.unregister("BSNoMore");
        for (const cls of Object.values(BODY_CLASSES)) {
            document.body.classList.remove(cls);
        }
    },

    renderButtonBar: ErrorBoundary.wrap(() => <ButtonBar />, { noop: true }),
});
