/*
 * Vencord userplugin — embedFix
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Tooltip } from "@webpack/common";

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
    onRefresh?: () => void;
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
                                    onRefresh?.();
                                }}
                                onKeyDown={(e: any) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        onRefresh?.();
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
