/*
 * Vencord userplugin — EmbedFix
 * Replaces social media URLs with embed-friendly alternatives from third-party providers.
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { MessageObject } from "@api/MessageEvents";
import { addMessageAccessory, removeMessageAccessory } from "@api/MessageAccessories";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher, UserStore } from "@webpack/common";

import { DEFAULT_PLATFORMS, matchPlatform, mergeUserOverrides, type PlatformEntry } from "./providerMap";
import { rewriteMessageContent, rewriteUrl, stripTrackingParams } from "./urlRewriter";
import { ProbeCache, type ProbeResult } from "./probeCache";
import { RewrittenLink } from "./components/RewrittenLink";
import { createEmbedAccessory, triggerEmbedRefresh } from "./components/EmbedAccessory";

import "./style.css";

const MessageActions = findByPropsLazy("editMessage", "sendMessage");

// Native module access — lazy getter to avoid TDZ issues at module scope.
// The plugin name "EmbedFix" must match the definePlugin name exactly.
function getNative(): {
    probeProvider(providerDomain: string, originalPath: string): Promise<ProbeResult & { oembedType?: string; error?: string }>;
    probeAllProviders(providers: { domain: string }[], originalPath: string): Promise<(ProbeResult & { oembedType?: string; error?: string })[]>;
} | null {
    try {
        return (window as any).VencordNative?.pluginHelpers?.EmbedFix ?? null;
    } catch {
        return null;
    }
}

// --- Settings ---

const settings = definePluginSettings({
    rewriteOutgoing: {
        type: OptionType.BOOLEAN,
        description: "Rewrite URLs in your own messages before sending",
        default: true,
    },
    rewriteIncoming: {
        type: OptionType.BOOLEAN,
        description: "Visually replace URLs from other users (restart required)",
        default: true,
    },
    cacheTTLHours: {
        type: OptionType.NUMBER,
        description: "Probe result cache lifetime in hours",
        default: 24,
    },
    enableTwitter: { type: OptionType.BOOLEAN, description: "Twitter / X", default: true },
    enableReddit: { type: OptionType.BOOLEAN, description: "Reddit", default: true },
    enableInstagram: { type: OptionType.BOOLEAN, description: "Instagram", default: true },
    enableTiktok: { type: OptionType.BOOLEAN, description: "TikTok", default: true },
    enablePixiv: { type: OptionType.BOOLEAN, description: "Pixiv", default: true },
    enableBluesky: { type: OptionType.BOOLEAN, description: "Bluesky", default: true },
    enableThreads: { type: OptionType.BOOLEAN, description: "Threads", default: true },
    customProviders: {
        type: OptionType.STRING,
        description: "Custom provider overrides (JSON array)",
        default: "",
    },
    recheckProviders: {
        type: OptionType.COMPONENT,
        description: "Re-check all providers",
        component: () => {
            const { React, Button } = require("@webpack/common");
            const [checking, setChecking] = React.useState(false);
            return (
                <Button
                    size={Button.Sizes.SMALL}
                    disabled={checking}
                    onClick={async () => {
                        setChecking(true);
                        console.log("[EmbedFix] Flushing probe cache and re-checking all providers...");
                        probeCache.flush();
                        await prewarmCache();
                        console.log("[EmbedFix] Re-check complete. Cache:", probeCache.serialize());
                        setChecking(false);
                    }}
                >
                    {checking ? "Checking..." : "Re-check Providers"}
                </Button>
            );
        },
    },
    probeCache: {
        type: OptionType.STRING,
        description: "Internal probe cache (do not edit)",
        default: "",
        hidden: true,
    },
});

// --- Probe Cache ---

const probeCache = new ProbeCache(24, () => {
    settings.store.probeCache = probeCache.serialize();
});

// --- Helpers ---

/**
 * Merge user overrides with defaults, then filter by per-platform toggles.
 */
function getActivePlatforms(): PlatformEntry[] {
    const all = mergeUserOverrides(DEFAULT_PLATFORMS, settings.store.customProviders);
    const toggles: Record<string, boolean> = {
        twitter: settings.store.enableTwitter,
        reddit: settings.store.enableReddit,
        instagram: settings.store.enableInstagram,
        tiktok: settings.store.enableTiktok,
        pixiv: settings.store.enablePixiv,
        bluesky: settings.store.enableBluesky,
        threads: settings.store.enableThreads,
    };
    return all.filter(p => toggles[p.id] !== false);
}

/**
 * Build an enabledMap from settings toggles for rewriteMessageContent.
 */
function buildEnabledMap(): Record<string, boolean> {
    return {
        twitter: settings.store.enableTwitter,
        reddit: settings.store.enableReddit,
        instagram: settings.store.enableInstagram,
        tiktok: settings.store.enableTiktok,
        pixiv: settings.store.enablePixiv,
        bluesky: settings.store.enableBluesky,
        threads: settings.store.enableThreads,
    };
}

/**
 * Look up the best cached provider for a platform.
 *
 * probeCache.get() returns a domain string, but rewriteMessageContent expects
 * { domain, label } | null | undefined. We look up the full provider in the
 * active platform list to get the label, falling back to domain-as-label.
 *
 * If the probe cache has no result or all providers scored 0, falls back to
 * the first provider in the static priority list (better than nothing).
 */
function getCachedProvider(platformId: string): { domain: string; label: string } | null {
    const domain = probeCache.get(platformId);

    const platforms = getActivePlatforms();
    const platform = platforms.find(p => p.id === platformId);

    if (domain) {
        if (platform) {
            const provider = platform.providers.find(p => p.domain === domain);
            if (provider) return { domain: provider.domain, label: provider.label };
        }
        return { domain, label: domain };
    }

    // Fallback: use first provider in static priority when cache has no winner
    if (platform && platform.providers.length > 0) {
        const fallback = platform.providers[0];
        console.log(`[EmbedFix] Cache miss for ${platformId}, falling back to ${fallback.domain}`);
        return { domain: fallback.domain, label: fallback.label };
    }

    return null;
}

// --- Deferred Edit ---

interface PendingEdit {
    channelId: string;
    originalUrl: string;
    cleanUrl: string;
    offset: number;
    platformId: string;
    originalContent: string;
}

const pendingEdits = new Map<string, PendingEdit[]>();

/**
 * Probe all providers for each pending platform and edit the message with the
 * best provider. Edits are applied in REVERSE offset order so earlier offsets
 * remain valid after string splicing.
 */
async function probeAndEdit(messageId: string, channelId: string, edits: PendingEdit[]) {
    const Native = getNative();
    if (!Native?.probeAllProviders) return;

    const platforms = getActivePlatforms();

    for (const edit of edits) {
        const platform = platforms.find(p => p.id === edit.platformId);
        if (!platform) continue;

        try {
            let path: string;
            try {
                const parsed = new URL(edit.cleanUrl);
                path = parsed.pathname + parsed.hash;
            } catch {
                continue;
            }

            const results = await Native.probeAllProviders(
                platform.providers.map(p => ({ domain: p.domain })),
                path,
            );

            probeCache.set(platform.id, results, path);
            const bestDomain = probeCache.get(platform.id);
            if (!bestDomain) continue;

            // Check if the edit is still pending (user may have edited the message)
            const stillPending = pendingEdits.get(messageId);
            if (!stillPending) return;

            // Verify the URL is still at the expected offset in the original content
            const currentContent = edit.originalContent;
            const urlAtOffset = currentContent.slice(edit.offset, edit.offset + edit.cleanUrl.length);

            if (urlAtOffset !== edit.cleanUrl && urlAtOffset !== edit.originalUrl) continue;

            const actualUrl = urlAtOffset;
            const rewritten = rewriteUrl(edit.cleanUrl, bestDomain);

            const newContent =
                currentContent.slice(0, edit.offset) +
                rewritten +
                currentContent.slice(edit.offset + actualUrl.length);

            await MessageActions.editMessage(channelId, messageId, { content: newContent });
        } catch {
            // Probe or edit failed — silently continue
        }
    }

    pendingEdits.delete(messageId);
}

/**
 * FluxDispatcher handler for MESSAGE_CREATE.
 * When we see our own message, move pending edits from temp key to real
 * messageId and fire probeAndEdit in the background.
 */
function onMessageCreate(event: { message: { id: string; author: { id: string }; channel_id: string; content: string } }) {
    try {
        const msg = event.message;

        // Get current user ID — try-catch for TDZ safety
        let currentUserId: string | undefined;
        try {
            currentUserId = UserStore.getCurrentUser()?.id;
        } catch {
            return;
        }
        if (!currentUserId || msg.author.id !== currentUserId) return;

        // Find pending edits for this channel (keyed by temp key)
        const channelPending = [...pendingEdits.entries()].find(
            ([key, edits]) => key.startsWith("pending_") && edits[0]?.channelId === msg.channel_id,
        );
        if (!channelPending) return;

        const [tempKey, edits] = channelPending;
        pendingEdits.delete(tempKey);
        pendingEdits.set(msg.id, edits);

        // Fire deferred probe+edit in background
        probeAndEdit(msg.id, msg.channel_id, edits);
    } catch {
        // Never crash FluxDispatcher
    }
}

/**
 * FluxDispatcher handler for MESSAGE_UPDATE.
 * If the user edited the message, cancel our pending edit.
 */
function onMessageUpdate(event: { message: { id: string } }) {
    try {
        pendingEdits.delete(event.message.id);
    } catch {
        // Never crash FluxDispatcher
    }
}

// --- Pre-warm ---

/**
 * Hardcoded test paths per platform for cache prewarm probes.
 * Must be real, popular URLs that return rich OG tags.
 */
const PREWARM_TEST_PATHS: Record<string, string> = {
    twitter: "/elikiiii/status/1629978420",
    reddit: "/r/pics/comments/haukpf/test_post_please_ignore/",
    instagram: "/p/CwwMGPWrPbQ/",
    tiktok: "/@tiktok/video/7106594312292453675",
    pixiv: "/en/artworks/118153342",
    bluesky: "/profile/bsky.app/post/3jxsxdcx7rs2n",
    threads: "/@zuck/post/CuVDT24PmIm",
};

/**
 * Probe all enabled platforms in the background.
 * Skips platforms that already have a valid cached result.
 */
async function prewarmCache() {
    const Native = getNative();
    if (!Native?.probeAllProviders) {
        console.log("[EmbedFix] Prewarm: native module not available, skipping");
        return;
    }

    console.log("[EmbedFix] Prewarm: starting provider checks...");
    const platforms = getActivePlatforms();

    for (const platform of platforms) {
        if (probeCache.get(platform.id)) {
            console.log(`[EmbedFix] Prewarm: ${platform.id} already cached, skipping`);
            continue;
        }
        const path = PREWARM_TEST_PATHS[platform.id] ?? "/";
        try {
            console.log(`[EmbedFix] Prewarm: probing ${platform.id} with path ${path}`);
            const results = await Native.probeAllProviders(
                platform.providers.map(p => ({ domain: p.domain })),
                path,
            );
            probeCache.set(platform.id, results, path);
            const best = probeCache.get(platform.id);
            console.log(`[EmbedFix] Prewarm: ${platform.id} → best=${best}, scores=[${results.map(r => `${r.domain}:${r.score}`).join(", ")}]`);
        } catch (e) {
            console.error(`[EmbedFix] Prewarm: ${platform.id} failed:`, e);
        }
    }
    console.log("[EmbedFix] Prewarm: complete");
}

// --- Plugin ---

export default definePlugin({
    name: "EmbedFix",
    description: "Replaces social media URLs with embed-friendly alternatives from third-party providers",
    authors: [{ name: "kamaras", id: 132106519264100352n }],
    settings,

    patches: [
        {
            // Patch the link render rule (markdown autolinks/urls) to intercept URL
            // display for incoming messages. Injects before the return statement in
            // the react() method. If _patchedLinkRender returns non-null, it short-
            // circuits the default <a> render.
            // No predicate — settings.store is undefined at registration time.
            // Runtime check is in _patchedLinkRender instead.
            find: "mustConfirmExternalLink",
            replacement: {
                match: /return (\i)\.noStyleAndInteraction\?/,
                replace: "{let _vr=$self._patchedLinkRender(arguments[0],arguments[2]);if(_vr!=null)return _vr;}return arguments[2].noStyleAndInteraction?",
            },
        },
    ],

    /**
     * Intercept link rendering for incoming messages.
     * Called from the patched link render rule with the parsed node and render state.
     * Returns a RewrittenLink component if the URL matches a known platform
     * with a cached provider, or null to fall through to default render.
     *
     * @param node - Parsed markdown node: { target: string, content: any[], title?: string }
     * @param state - Render state: { key?: string, messageId?: string, channelId?: string }
     */
    _patchedLinkRender(node: { target: string; content: any[] }, state: { key?: string; messageId?: string; channelId?: string }) {
        if (!settings.store.rewriteIncoming) return null;

        const originalUrl = node.target;
        const platforms = getActivePlatforms();
        const platform = matchPlatform(originalUrl, platforms);
        if (!platform) return null;

        const provider = getCachedProvider(platform.id);
        if (!provider) {
            console.log(`[EmbedFix] Incoming: no provider for ${platform.id}, skipping ${originalUrl}`);
            return null;
        }

        const cleanUrl = stripTrackingParams(originalUrl, platform.stripParams ?? []);
        const rewrittenUrl = rewriteUrl(cleanUrl, provider.domain);
        console.log(`[EmbedFix] Incoming: ${originalUrl} → ${rewrittenUrl}`);

        return (
            <RewrittenLink
                href={rewrittenUrl}
                originalHref={originalUrl}
                title={`${provider.label} embed`}
                messageId={state.messageId}
                channelId={state.channelId}
                onRefresh={() => triggerEmbedRefresh(rewrittenUrl)}
            >
                {rewrittenUrl}
            </RewrittenLink>
        );
    },

    start() {
        // Restore probe cache from persisted settings
        const saved = settings.store.probeCache;
        if (saved) probeCache.restore(saved);
        probeCache.setTTL(settings.store.cacheTTLHours ?? 24);

        // Subscribe to FluxDispatcher for deferred edits
        FluxDispatcher.subscribe("MESSAGE_CREATE", onMessageCreate);
        FluxDispatcher.subscribe("MESSAGE_UPDATE", onMessageUpdate);

        // Register embed accessory for incoming messages
        addMessageAccessory(
            "EmbedFix",
            createEmbedAccessory(
                getActivePlatforms,
                probeCache,
                () => settings.store.rewriteIncoming,
            ),
            4, // position: near embeds
        );

        // Body class for CSS embed suppression
        document.body.classList.add("vc-embedFix-active");

        // Pre-warm cache in background
        prewarmCache();
    },

    stop() {
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessageCreate);
        FluxDispatcher.unsubscribe("MESSAGE_UPDATE", onMessageUpdate);
        removeMessageAccessory("EmbedFix");
        document.body.classList.remove("vc-embedFix-active");
        pendingEdits.clear();
    },

    onBeforeMessageSend(_channelId: string, msg: MessageObject) {
        if (!settings.store.rewriteOutgoing) return;
        if (!/https?:\/\//.test(msg.content)) return;

        const platforms = getActivePlatforms();
        const enabledMap = buildEnabledMap();
        const { content, rewrites, cacheMisses } = rewriteMessageContent(
            msg.content,
            platforms,
            getCachedProvider,
            enabledMap,
        );

        if (rewrites.length > 0) {
            console.log(`[EmbedFix] Outgoing: rewrote ${rewrites.length} URL(s):`, rewrites.map(r => `${r.original} → ${r.rewritten}`));
        }
        if (cacheMisses.length > 0) {
            console.log(`[EmbedFix] Outgoing: ${cacheMisses.length} cache miss(es), queuing deferred edit:`, cacheMisses.map(m => m.url));
        }

        msg.content = content;

        // Queue deferred edits for cache misses
        if (cacheMisses.length > 0) {
            const tempKey = `pending_${Date.now()}`;
            pendingEdits.set(tempKey, cacheMisses.map(m => ({
                channelId: _channelId,
                originalUrl: m.url,
                cleanUrl: m.cleanUrl,
                offset: m.offset,
                platformId: m.platformId,
                originalContent: content,
            })));
        }
    },

    onBeforeMessageEdit(_cid: string, _mid: string, msg: MessageObject) {
        if (!settings.store.rewriteOutgoing) return;
        if (!/https?:\/\//.test(msg.content)) return;

        const platforms = getActivePlatforms();
        const enabledMap = buildEnabledMap();
        const { content } = rewriteMessageContent(
            msg.content,
            platforms,
            getCachedProvider,
            enabledMap,
        );

        msg.content = content;
        // No deferred edit for manual edits — only rewrite what's cached
    },
});
