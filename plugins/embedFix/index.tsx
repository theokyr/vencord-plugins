/*
 * Vencord userplugin — EmbedFix
 * Replaces social media URLs with embed-friendly alternatives from third-party providers.
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addMessageAccessory, removeMessageAccessory } from "@api/MessageAccessories";
import type { MessageObject } from "@api/MessageEvents";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { Button, FluxDispatcher, React, UserStore } from "@webpack/common";

import { createEmbedAccessory } from "./components/EmbedAccessory";
import { ProviderPriorityEditor } from "./components/ProviderPriorityEditor";
import type { EmbedMeta } from "./embedMeta";
import { restoreAll } from "./embedSuppressor";
import { MediaHostRegistry, createDomImageLoader, createDomVideoLoader } from "./mediaProbe";
import { MediaProxy, createDomObjectUrls } from "./mediaProxy";
import { IncomingController } from "./incomingController";
import { findCandidateLinks, planIncomingMessage } from "./incomingPlan";
import { applyReplacements, pendingKey, planOutgoing, type DeferredLink, type LinkKnowledge } from "./outgoing";
import { DEFAULT_PLATFORMS, mergeUserOverrides, type PlatformEntry } from "./providerMap";
import { applyProviderOrder } from "./providerPriority";
import { ProviderResolver } from "./providerResolver";
import { createEmbedFixSchema } from "./settingsSchema";

import "./style.css";

const MessageActions = findByPropsLazy("editMessage", "sendMessage");

// --- Settings ---------------------------------------------------------------

const settings = definePluginSettings({
    rewriteOutgoing: {
        type: OptionType.BOOLEAN,
        description: "Rewrite URLs in your own messages before sending",
        default: true,
    },
    rewriteIncoming: {
        type: OptionType.BOOLEAN,
        description: "Add a working embed to supported links from other users",
        default: true,
    },
    replaceOnlyWhenBetter: {
        type: OptionType.BOOLEAN,
        description: "Only replace Discord's embed when the provider's is richer",
        default: true,
    },
    parallelProbes: {
        type: OptionType.BOOLEAN,
        description: "Check every provider at once instead of stopping at the first good one",
        default: false,
    },
    debugLogging: {
        type: OptionType.BOOLEAN,
        description: "Log every provider check to the console",
        default: false,
    },
    cacheTTLHours: {
        type: OptionType.NUMBER,
        description: "How long a successful link lookup stays cached, in hours",
        default: 24,
    },
    enableTwitter: { type: OptionType.BOOLEAN, description: "Twitter / X", default: true },
    enableReddit: { type: OptionType.BOOLEAN, description: "Reddit", default: true },
    enableInstagram: { type: OptionType.BOOLEAN, description: "Instagram", default: true },
    enableTiktok: { type: OptionType.BOOLEAN, description: "TikTok", default: true },
    enablePixiv: { type: OptionType.BOOLEAN, description: "Pixiv", default: true },
    enableBluesky: { type: OptionType.BOOLEAN, description: "Bluesky", default: true },
    enableThreads: { type: OptionType.BOOLEAN, description: "Threads", default: true },
    providerOrder: {
        type: OptionType.STRING,
        description: "Internal provider priority order",
        default: "",
        hidden: true,
    },
    providerPriorities: {
        type: OptionType.COMPONENT,
        description: "Provider priority",
        component: () => (
            <ProviderPriorityEditor
                platforms={mergeUserOverrides(DEFAULT_PLATFORMS, settings.store.customProviders)}
                value={settings.store.providerOrder}
                onChange={value => {
                    settings.store.providerOrder = value;
                }}
            />
        ),
    },
    customProviders: {
        type: OptionType.STRING,
        description: "Custom provider overrides (JSON array)",
        default: "",
    },
    recheckProviders: {
        type: OptionType.COMPONENT,
        description: "Forget every cached lookup",
        component: () => {
            const [done, setDone] = React.useState(false);
            return (
                <Button
                    size={Button.Sizes.SMALL}
                    onClick={() => {
                        resolver.flush();
                        controller.reset();
                        setDone(true);
                        setTimeout(() => setDone(false), 1500);
                    }}
                >
                    {done ? "Cache cleared" : "Re-check All Links"}
                </Button>
            );
        },
    },
    linkCache: {
        type: OptionType.STRING,
        description: "Internal per-link resolution cache (do not edit)",
        default: "",
        hidden: true,
    },
});

// --- Logging ----------------------------------------------------------------

function log(message: string) {
    if (settings.store.debugLogging) console.log(`[EmbedFix] ${message}`);
}

// --- Native bridge ----------------------------------------------------------

interface NativeApi {
    fetchEmbedMeta(url: string, sourceHosts: string[]): Promise<EmbedMeta>;
    fetchMedia(url: string, maxBytes: number): Promise<{
        ok: boolean; contentType: string | null; bytes: Uint8Array | null; size: number; error?: string;
    }>;
}

function getNative(): NativeApi | null {
    try {
        return (window as any).VencordNative?.pluginHelpers?.EmbedFix ?? null;
    } catch {
        return null;
    }
}

// --- Resolver ---------------------------------------------------------------

let persistTimer: ReturnType<typeof setTimeout> | null = null;

const resolver = new ProviderResolver({
    probe: async (providerUrl, sourceHosts) => {
        const Native = getNative();
        if (!Native?.fetchEmbedMeta) throw new Error("native module unavailable");
        return await Native.fetchEmbedMeta(providerUrl, sourceHosts);
    },
    onPersist: () => {
        // Settings writes hit disk — coalesce the burst from one message.
        if (persistTimer) return;
        persistTimer = setTimeout(() => {
            persistTimer = null;
            try {
                settings.store.linkCache = resolver.serialize();
            } catch {
                // Persistence is best-effort.
            }
        }, 2000);
    },
    log,
});

/**
 * Discord's CSP blocks media from hosts outside its allowlist, so an og:image
 * or og:video is only worth something if it actually paints or plays.
 * Measured per host and per kind — img-src and media-src differ.
 */
const mediaHosts = new MediaHostRegistry({
    loaders: {
        image: createDomImageLoader(),
        video: createDomVideoLoader(),
    },
});

/**
 * The main process has no CSP, so it can fetch what the renderer cannot and
 * hand the bytes over as a blob: URL.
 */
const mediaProxy = new MediaProxy({
    fetcher: async (url, maxBytes) => {
        const Native = getNative();
        if (!Native?.fetchMedia) throw new Error("native module unavailable");
        return await Native.fetchMedia(url, maxBytes);
    },
    objectUrls: createDomObjectUrls(),
    log,
});

const controller = new IncomingController(
    resolver,
    log,
    (url, kind) => mediaHosts.canPresent(url, kind),
    mediaProxy,
);
controller.peekMedia = (url, kind) => mediaHosts.peek(url, kind);

// --- Platform configuration -------------------------------------------------

const TOGGLE_KEYS: Record<string, keyof typeof settings.store> = {
    twitter: "enableTwitter",
    reddit: "enableReddit",
    instagram: "enableInstagram",
    tiktok: "enableTiktok",
    pixiv: "enablePixiv",
    bluesky: "enableBluesky",
    threads: "enableThreads",
};

function buildEnabledMap(): Record<string, boolean> {
    const map: Record<string, boolean> = {};
    for (const [platformId, key] of Object.entries(TOGGLE_KEYS)) {
        map[platformId] = settings.store[key] !== false;
    }
    return map;
}

/** Enabled platforms, with providers in the user's priority order. */
function getActivePlatforms(): PlatformEntry[] {
    const merged = mergeUserOverrides(DEFAULT_PLATFORMS, settings.store.customProviders);
    const ordered = applyProviderOrder(merged, settings.store.providerOrder);
    const enabled = buildEnabledMap();
    return ordered.filter(platform => enabled[platform.id] !== false);
}

// --- Outgoing ---------------------------------------------------------------

interface PendingMessage {
    channelId: string;
    content: string;
    links: DeferredLink[];
    platforms: PlatformEntry[];
    queuedAt: number;
}

const pending = new Map<string, PendingMessage>();
const PENDING_TTL_MS = 60_000;

/** What we already know about a link, without touching the network. */
function lookupKnowledge(cleanUrl: string): LinkKnowledge {
    const cached = resolver.peek(cleanUrl);
    if (!cached) return { status: "unknown" };
    if (!cached.providerDomain) return { status: "none" };
    return { status: "provider", domain: cached.providerDomain, label: cached.providerDomain };
}

function prunePending(now: number) {
    for (const [key, entry] of pending) {
        if (now - entry.queuedAt > PENDING_TTL_MS) pending.delete(key);
    }
}

/**
 * Check every queued link, then fix the message with a single edit.
 * Each link is checked on its own — one bad link never drags the others down.
 */
async function resolvePendingMessage(messageId: string, entry: PendingMessage) {
    const replacements = await Promise.all(entry.links.map(async link => {
        const platform = entry.platforms.find(candidate => candidate.id === link.platformId);
        if (!platform) return null;

        const resolution = await resolver.resolve(link.cleanUrl, platform);
        if (!resolution.providerUrl || resolution.providerUrl === link.sentUrl) return null;

        return { offset: link.offset, from: link.sentUrl, to: resolution.providerUrl };
    }));

    const usable = replacements.filter((value): value is NonNullable<typeof value> => value !== null);
    if (usable.length === 0) return;

    const { content, applied, skipped } = applyReplacements(entry.content, usable);
    if (applied === 0) {
        log(`deferred edit for ${messageId} skipped (${skipped} stale replacement(s))`);
        return;
    }

    try {
        await MessageActions.editMessage(entry.channelId, messageId, { content });
        log(`edited ${messageId} with ${applied} rewritten link(s)`);
    } catch (e) {
        log(`edit failed for ${messageId}: ${String(e)}`);
    }
}

function onMessageCreate(event: any) {
    try {
        const message = event?.message;
        if (!message?.id || !message.channel_id) return;

        const currentUserId = UserStore.getCurrentUser()?.id;
        if (!currentUserId || message.author?.id !== currentUserId) return;

        prunePending(Date.now());

        const key = pendingKey(message.channel_id, message.content ?? "");
        const entry = pending.get(key);
        if (!entry) return;

        pending.delete(key);
        void resolvePendingMessage(message.id, entry);
    } catch {
        // Never throw inside a Flux handler.
    }
}

// --- Diagnostics ------------------------------------------------------------

/**
 * Exposed as `window.__embedFix` for debugging from DevTools.
 *
 * Message accessories are wrapped by Vencord in `<ErrorBoundary noop>`, so a
 * render failure shows up as nothing at all. These handles make the plugin's
 * actual state inspectable without needing the MCP bridge.
 */
function buildDiagnostics() {
    return {
        /** Resolution state for every link seen this session. */
        states: () => Object.fromEntries(controller.getStates()),
        /** Cache size and per-domain health, including active cooldowns. */
        stats: () => resolver.stats(),
        /** Which CDNs actually render inside Discord, per media kind. */
        mediaHosts: () => mediaHosts.stats(),
        /** Media fetched through the main process to dodge the CSP. */
        proxied: () => mediaProxy.stats(),
        /** Platform config actually in use right now. */
        platforms: () => getActivePlatforms().map(platform => ({
            id: platform.id,
            domains: platform.domains,
            providers: platform.providers.map(provider => provider.domain),
        })),
        /** Is the Electron-main half reachable? */
        native: () => !!getNative()?.fetchEmbedMeta,
        /**
         * Force a check of one link, bypassing the cache. Returns every
         * provider attempt with its score, error or soft error.
         */
        check: async (url: string) => {
            const platforms = getActivePlatforms();
            const candidate = findCandidateLinks(url, platforms)[0];
            if (!candidate) return { error: "no supported platform matched this URL" };

            resolver.invalidate(candidate.cleanUrl);
            const resolution = await resolver.resolve(candidate.cleanUrl, candidate.platform);
            return {
                cleanUrl: candidate.cleanUrl,
                winner: resolution.providerUrl,
                score: resolution.score,
                attempts: resolution.attempts,
            };
        },
        /** Dry-run the planner against a message body. */
        explain: (content: string, embeds: any[] = []) => {
            const plan = planIncomingMessage({
                content,
                embeds,
                platforms: getActivePlatforms(),
                states: controller.getStates(),
                replaceOnlyWhenBetter: settings.store.replaceOnlyWhenBetter !== false,
            });
            return {
                candidates: plan.candidates.map(c => ({ url: c.cleanUrl, provider: c.isProviderLink })),
                needsResolution: plan.needsResolution.map(c => c.cleanUrl),
                render: plan.render.map(item => ({ url: item.providerUrl, why: item.reason })),
                suppress: plan.suppress,
            };
        },
        /** Forget everything and start over. */
        flush: () => {
            resolver.flush();
            controller.reset();
            mediaHosts.reset();
            mediaProxy.reset();
            return "cache cleared";
        },
        /** Toggle per-check console logging. */
        debug: (on = true) => {
            settings.store.debugLogging = on;
            return `debug logging ${on ? "on" : "off"}`;
        },
    };
}

// --- Plugin -----------------------------------------------------------------

export default definePlugin({
    name: "EmbedFix",
    description: "Replaces social media URLs with embed-friendly alternatives from third-party providers",
    authors: [{ name: "kamaras", id: 132106519264100352n }],
    settings,
    settingsAboutComponent() {
        return (
            <Button onClick={() => (window as any).__settingsHub?.open("EmbedFix")}>
                Open Full Settings
            </Button>
        );
    },

    start() {
        (window as any).__settingsHub?.register(createEmbedFixSchema(settings));

        resolver.restore(settings.store.linkCache);
        resolver.setTTL(settings.store.cacheTTLHours ?? 24);
        resolver.setParallel(settings.store.parallelProbes === true);

        FluxDispatcher.subscribe("MESSAGE_CREATE", onMessageCreate);

        addMessageAccessory(
            "EmbedFix",
            createEmbedAccessory({
                getPlatforms: getActivePlatforms,
                controller,
                isEnabled: () => settings.store.rewriteIncoming !== false,
                replaceOnlyWhenBetter: () => settings.store.replaceOnlyWhenBetter !== false,
                proxy: mediaProxy,
            }),
            4,
        );

        document.body.classList.add("vc-embedFix-active");

        (window as any).__embedFix = buildDiagnostics();
    },

    stop() {
        (window as any).__settingsHub?.unregister("EmbedFix");
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessageCreate);
        removeMessageAccessory("EmbedFix");
        restoreAll(document);
        controller.reset();
        mediaProxy.reset();
        pending.clear();
        document.body.classList.remove("vc-embedFix-active");
        delete (window as any).__embedFix;

        if (persistTimer) {
            clearTimeout(persistTimer);
            persistTimer = null;
        }
        try {
            settings.store.linkCache = resolver.serialize();
        } catch {
            // best-effort
        }
    },

    onBeforeMessageSend(channelId: string, msg: MessageObject) {
        if (settings.store.rewriteOutgoing === false) return;
        if (!msg.content || !/https?:\/\//.test(msg.content)) return;

        const platforms = getActivePlatforms();
        const plan = planOutgoing(msg.content, platforms, buildEnabledMap(), lookupKnowledge);

        msg.content = plan.content;

        if (plan.applied.length > 0) {
            log(`sent with ${plan.applied.length} cached rewrite(s)`);
        }
        if (plan.deferred.length === 0) return;

        prunePending(Date.now());
        pending.set(pendingKey(channelId, plan.content), {
            channelId,
            content: plan.content,
            links: plan.deferred,
            platforms,
            queuedAt: Date.now(),
        });
        log(`queued ${plan.deferred.length} link(s) for a deferred check`);
    },

    onBeforeMessageEdit(_channelId: string, _messageId: string, msg: MessageObject) {
        if (settings.store.rewriteOutgoing === false) return;
        if (!msg.content || !/https?:\/\//.test(msg.content)) return;

        // Only apply what we already know — an edit must not trigger a second
        // edit a few seconds later.
        const plan = planOutgoing(msg.content, getActivePlatforms(), buildEnabledMap(), lookupKnowledge);
        msg.content = plan.content;
    },
});
