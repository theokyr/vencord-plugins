/*
 * embedFix — Replacement embed rendering.
 *
 * Prefers Discord's own Embed component so the card is pixel-identical to a
 * real embed, and falls back to a hand-rolled card if that module ever moves.
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { findComponentByCodeLazy } from "@webpack";
import { React, Tooltip } from "@webpack/common";

import type { EmbedMeta } from "../embedMeta";
import type { MediaProxy } from "../mediaProxy";

/**
 * Discord's own Embed component. This is a lazy proxy: it is always truthy, and
 * it throws at *render* time if Discord moved the module. Vencord wraps message
 * accessories in `<ErrorBoundary noop>`, so such a failure would silently
 * render nothing at all — hence the explicit fallback below.
 */
const NativeEmbed = findComponentByCodeLazy("renderSuppressButton");

let embedIdCounter = 0;

/** Discord wants a 24-bit int, not a CSS colour string. */
export function parseThemeColor(value: string | null | undefined): number | null {
    if (!value) return null;

    const hex = value.trim().replace(/^#/, "");
    if (/^[0-9a-f]{6}$/i.test(hex)) return parseInt(hex, 16);
    if (/^[0-9a-f]{3}$/i.test(hex)) {
        const [r, g, b] = hex.split("");
        return parseInt(`${r}${r}${g}${g}${b}${b}`, 16);
    }

    const rgb = value.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
    if (rgb) {
        const [, r, g, b] = rgb;
        const packed = (Number(r) << 16) | (Number(g) << 8) | Number(b);
        return Number.isFinite(packed) ? packed : null;
    }

    return null;
}

/** Shape a Discord embed object out of provider metadata. */
export function buildSyntheticEmbed(meta: EmbedMeta, providerUrl: string, id?: string): any {
    const embed: any = {
        id: id ?? `embedfix-${++embedIdCounter}`,
        url: providerUrl,
        type: "article",
        rawTitle: meta.title ?? undefined,
        rawDescription: meta.description ?? undefined,
        referenceId: null,
        flags: 0,
        contentScanVersion: 0,
        fields: [],
    };

    if (meta.siteName) embed.provider = { name: meta.siteName, url: providerUrl };

    if (meta.authorName) {
        embed.author = {
            name: meta.authorName,
            url: meta.authorUrl ?? providerUrl,
        };
    }

    const color = parseThemeColor(meta.themeColor);
    if (color !== null) embed.color = color;

    if (meta.imageUrl) {
        embed.image = {
            url: meta.imageUrl,
            proxyURL: meta.imageUrl,
            width: meta.videoWidth ?? 550,
            height: meta.videoHeight ?? 350,
            srcIsAnimated: false,
            flags: 0,
        };
    }

    return embed;
}

function FallbackCard({ meta, providerUrl }: { meta: EmbedMeta; providerUrl: string }) {
    const color = parseThemeColor(meta.themeColor);
    const style = color !== null
        ? { "--vc-embedFix-accent": `#${color.toString(16).padStart(6, "0")}` } as React.CSSProperties
        : undefined;

    return (
        <article className="vc-embedFix-card" style={style}>
            <div className="vc-embedFix-cardBody">
                {(meta.authorName || meta.siteName) && (
                    <div className="vc-embedFix-cardSource">{meta.authorName ?? meta.siteName}</div>
                )}
                {meta.title && (
                    <a className="vc-embedFix-cardTitle" href={providerUrl} target="_blank" rel="noreferrer noopener">
                        {meta.title}
                    </a>
                )}
                {meta.description && (
                    <div className="vc-embedFix-cardDescription">{meta.description}</div>
                )}
                {meta.imageUrl && (
                    <img className="vc-embedFix-cardImage" src={meta.imageUrl} alt="" loading="lazy" />
                )}
            </div>
        </article>
    );
}

/**
 * Video whose host Discord's CSP blocks. We can still play it — the main
 * process fetches the bytes and we feed them in as a blob: URL — but only when
 * the user asks, because these files run to tens of megabytes.
 */
function ProxiedVideo({ meta, proxy }: { meta: EmbedMeta; proxy: MediaProxy; }) {
    const [objectUrl, setObjectUrl] = React.useState<string | null>(() => proxy.peek(meta.videoUrl!));
    const [loading, setLoading] = React.useState(false);
    const [failed, setFailed] = React.useState(false);

    if (objectUrl) {
        return (
            <video
                className="vc-embedFix-cardVideo"
                src={objectUrl}
                poster={meta.imageUrl ?? undefined}
                controls
                autoPlay
                loop
                muted
            />
        );
    }

    return (
        <button
            type="button"
            className="vc-embedFix-playButton"
            disabled={loading}
            onClick={async () => {
                setLoading(true);
                const url = await proxy.load(meta.videoUrl!, "video");
                setLoading(false);
                if (url) setObjectUrl(url);
                else setFailed(true);
            }}
            style={meta.imageUrl ? { backgroundImage: `url("${meta.imageUrl}")` } : undefined}
        >
            <span className="vc-embedFix-playGlyph">
                {loading ? "…" : failed ? "!" : "▶"}
            </span>
            <span className="vc-embedFix-playLabel">
                {loading ? "Loading video…" : failed ? "Could not load video" : "Play video"}
            </span>
        </button>
    );
}

export function EmbedCard({
    meta,
    providerUrl,
    providerDomain,
    onRefresh,
    proxy,
}: {
    meta: EmbedMeta;
    providerUrl: string;
    providerDomain: string;
    onRefresh?: () => void;
    proxy?: MediaProxy | null;
}) {
    const embed = React.useMemo(
        () => buildSyntheticEmbed(meta, providerUrl, `embedfix-${providerUrl}`),
        [providerUrl, meta],
    );

    return (
        <div className="vc-embedFix-embed" data-embedfix="true" data-embedfix-provider={providerDomain}>
            <ErrorBoundary fallback={() => <FallbackCard meta={meta} providerUrl={providerUrl} />}>
                <NativeEmbed embed={embed} />
            </ErrorBoundary>
            {meta.videoNeedsProxy && meta.videoUrl && proxy && (
                <ProxiedVideo meta={meta} proxy={proxy} />
            )}
            <div className="vc-embedFix-badgeRow">
                <span className="vc-embedFix-badge">via {providerDomain}</span>
                {onRefresh && (
                    <Tooltip text="Re-check providers for this link">
                        {(tooltipProps: any) => (
                            <button
                                {...tooltipProps}
                                type="button"
                                className="vc-embedFix-refresh"
                                aria-label="Re-check providers for this link"
                                onClick={onRefresh}
                            >
                                ↻
                            </button>
                        )}
                    </Tooltip>
                )}
            </div>
        </div>
    );
}
