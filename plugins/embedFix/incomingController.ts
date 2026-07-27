/*
 * embedFix — Shared incoming-link state for the renderer.
 *
 * Message rows mount and unmount constantly as you scroll, so resolution state
 * cannot live in component state: it would restart a probe every time a row
 * came back into view. This controller owns one state map for the whole client
 * and notifies subscribers when an answer arrives.
 *
 * Only depends on the resolver, so it is fully testable without React.
 */

import type { CandidateLink, LinkState } from "./incomingPlan";
import { isUsableMeta } from "./embedMeta";
import type { ProviderResolver } from "./providerResolver";

import type { MediaKind } from "./mediaProbe";
import type { MediaProxy } from "./mediaProxy";

/** Answers whether a media URL will actually be presented by the renderer. */
export type MediaVerifier = (url: string, kind: MediaKind) => Promise<boolean>;

export class IncomingController {
    private readonly states = new Map<string, LinkState>();
    private readonly listeners = new Set<() => void>();

    constructor(
        private readonly resolver: ProviderResolver,
        private readonly log: (message: string) => void = () => { /* noop */ },
        /**
         * Optional gate on the winning media. Anything the renderer cannot
         * present must not count toward the embed's score, or we replace a
         * working native embed with a picture-less or unplayable one.
         */
        private readonly verifyMedia: MediaVerifier | null = null,
        /**
         * Fetches CSP-blocked media through the main process. When present, a
         * blocked image is proxied instead of discarded, and a blocked video
         * becomes click-to-load rather than vanishing.
         */
        private readonly proxy: MediaProxy | null = null,
    ) { }

    getStates(): Map<string, LinkState> {
        return this.states;
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    private notify(): void {
        for (const listener of this.listeners) {
            try {
                listener();
            } catch {
                // A broken subscriber must not stop the others.
            }
        }
    }

    private adopt(key: string, state: LinkState): void {
        const previous = this.states.get(key);
        if (previous && previous.status === state.status && state.status !== "resolved") return;
        this.states.set(key, state);
        this.notify();
    }

    /**
     * Make sure every candidate has, or is getting, an answer.
     * Safe to call on every render — already-known links cost nothing.
     */
    ensure(candidates: CandidateLink[]): void {
        for (const candidate of candidates) {
            if (this.states.has(candidate.key)) continue;

            const cached = this.resolver.peek(candidate.cleanUrl);
            if (cached) {
                const state = toState(cached);
                // A cached resolution whose media host is already known-bad can
                // be corrected synchronously; an unmeasured host is vetted in
                // the background so the row does not block on it.
                this.states.set(candidate.key, this.vetMediaSync(state));
                if (state.status === "resolved" && (state.meta.imageUrl || state.meta.videoUrl)) {
                    void this.vetMedia(state).then(vetted => this.adopt(candidate.key, vetted));
                }
                continue;
            }

            this.states.set(candidate.key, { status: "pending" });
            void this.resolver.resolve(candidate.cleanUrl, candidate.platform)
                .then(async resolution => {
                    this.adopt(candidate.key, await this.vetMedia(toState(resolution)));
                    this.log(
                        resolution.providerDomain
                            ? `${candidate.cleanUrl} → ${resolution.providerDomain} (score ${resolution.score})`
                            : `${candidate.cleanUrl} → no working provider (${resolution.attempts.map(a => `${a.domain}:${a.softError ?? a.error ?? a.score}`).join(", ")})`,
                    );
                })
                .catch(e => {
                    this.adopt(candidate.key, { status: "unresolved" });
                    this.log(`resolve failed for ${candidate.cleanUrl}: ${String(e)}`);
                });
        }

        // `ensure` may have filled states synchronously from the cache.
        this.notify();
    }

    /** Forget one link and probe it again from scratch. */
    refresh(candidate: CandidateLink): void {
        this.resolver.invalidate(candidate.cleanUrl);
        this.states.delete(candidate.key);
        this.ensure([candidate]);
    }

    /**
     * Drop media the renderer cannot present, and downgrade the whole
     * resolution if that leaves nothing worth showing.
     */
    private async vetMedia(state: LinkState): Promise<LinkState> {
        if (!this.verifyMedia || state.status !== "resolved") return state;

        let next: LinkState = state;

        if (next.meta.videoUrl && !(await this.verifyMedia(next.meta.videoUrl, "video"))) {
            if (this.proxy && !this.proxy.hasFailed(next.meta.videoUrl)) {
                // Do not download it yet — the user has to ask.
                this.log(`video from ${next.meta.videoUrl} is CSP-blocked; offering click-to-load`);
                next = { ...next, meta: { ...next.meta, videoNeedsProxy: true, type: null } };
            } else {
                this.log(`video from ${next.meta.videoUrl} cannot be played here — not counting it`);
                next = this.withoutVideo(next);
            }
        }

        if (next.status === "resolved" && next.meta.imageUrl && !(await this.verifyMedia(next.meta.imageUrl, "image"))) {
            const proxied = this.proxy ? await this.proxy.load(next.meta.imageUrl, "image") : null;
            if (proxied) {
                this.log(`image from ${next.meta.imageUrl} proxied through the main process`);
                next = { ...next, meta: { ...next.meta, imageUrl: proxied } };
            } else {
                this.log(`image from ${next.meta.imageUrl} cannot be displayed — not counting it`);
                next = this.withoutImage(next);
            }
        }

        return next;
    }

    /** Same, but only using verdicts already measured. Never awaits. */
    private vetMediaSync(state: LinkState): LinkState {
        if (!this.peekMedia || state.status !== "resolved") return state;

        let next: LinkState = state;
        if (next.meta.videoUrl && this.peekMedia(next.meta.videoUrl, "video") === false) {
            next = this.withoutVideo(next);
        }
        if (next.status === "resolved" && next.meta.imageUrl && this.peekMedia(next.meta.imageUrl, "image") === false) {
            next = this.withoutImage(next);
        }
        return next;
    }

    private withoutVideo(state: LinkState): LinkState {
        if (state.status !== "resolved") return state;

        // `type` must go too: the scorer treats og:type=video as media on its
        // own, so leaving it would keep the inflated score we just disproved.
        const meta = {
            ...state.meta,
            videoUrl: null,
            audioUrl: null,
            type: state.meta.type === "video" || state.meta.type === "player" ? null : state.meta.type,
        };
        return this.demote({ ...state, meta });
    }

    private withoutImage(state: LinkState): LinkState {
        if (state.status !== "resolved") return state;
        return this.demote({ ...state, meta: { ...state.meta, imageUrl: null } });
    }

    private demote(state: LinkState): LinkState {
        return state.status === "resolved" && isUsableMeta(state.meta)
            ? state
            : { status: "unresolved" };
    }

    /** Optional synchronous peek at a previously measured media host. */
    peekMedia: ((url: string, kind: MediaKind) => boolean | null) | null = null;

    /** Drop all in-memory state (plugin stop, or a settings change). */
    reset(): void {
        this.states.clear();
        this.notify();
    }
}

function toState(resolution: { providerDomain: string | null; providerUrl: string | null; meta: unknown }): LinkState {
    if (
        resolution.providerDomain
        && resolution.providerUrl
        && isUsableMeta(resolution.meta as never)
    ) {
        return {
            status: "resolved",
            providerDomain: resolution.providerDomain,
            providerUrl: resolution.providerUrl,
            meta: resolution.meta as never,
        };
    }
    return { status: "unresolved" };
}
