/*
 * Vencord userplugin — embedFix
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Tooltip } from "@webpack/common";

import { findMessageIdForRefreshTarget, type RefreshFallbackContext } from "../fallbackEmbed";

function buildRefreshContext(
    trigger: Element | null,
    messageId?: string,
    channelId?: string,
): RefreshFallbackContext {
    return {
        messageId: findMessageIdForRefreshTarget(trigger) ?? messageId,
        channelId,
        trigger,
    };
}

export function RewrittenLink({
    href,
    originalHref,
    children,
    title,
    onClick,
    onRefresh,
    messageId,
    channelId,
}: {
    href: string;
    originalHref: string;
    children: any;
    title?: string;
    onClick?: (e: MouseEvent) => void;
    onRefresh?: (context: RefreshFallbackContext) => void;
    messageId?: string;
    channelId?: string;
}) {
    return (
        <Tooltip text={`Original: ${originalHref}`}>
            {(tooltipProps: any) => (
                <span {...tooltipProps} className="vc-embedFix-rewritten">
                    <a
                        href={href}
                        title={title}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="vc-embedFix-link"
                        onClick={onClick as any}
                    >
                        {children}
                    </a>
                    <Tooltip text="Refresh embed">
                        {(refreshTipProps: any) => (
                            <span
                                {...refreshTipProps}
                                className="vc-embedFix-indicator"
                                role="button"
                                tabIndex={0}
                                aria-label="Refresh embed"
                                onClick={(e: any) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onRefresh?.(buildRefreshContext(e.currentTarget, messageId, channelId));
                                }}
                                onKeyDown={(e: any) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onRefresh?.(buildRefreshContext(e.currentTarget, messageId, channelId));
                                    }
                                }}
                            />
                        )}
                    </Tooltip>
                </span>
            )}
        </Tooltip>
    );
}
