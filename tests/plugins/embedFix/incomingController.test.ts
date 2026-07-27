import { describe, expect, it, vi } from "vitest";

import { emptyMeta, type EmbedMeta } from "../../../plugins/embedFix/embedMeta";
import { IncomingController } from "../../../plugins/embedFix/incomingController";
import { findCandidateLinks, planIncomingMessage } from "../../../plugins/embedFix/incomingPlan";
import { DEFAULT_PLATFORMS } from "../../../plugins/embedFix/providerMap";
import { ProviderResolver, type ProbeFn } from "../../../plugins/embedFix/providerResolver";
import { MediaProxy } from "../../../plugins/embedFix/mediaProxy";

function ok(url: string, overrides: Partial<EmbedMeta> = {}): EmbedMeta {
    return { ...emptyMeta(url), title: "A post", imageUrl: "https://cdn/i.jpg", ...overrides };
}

function setup(probe: ProbeFn) {
    const resolver = new ProviderResolver({ probe });
    const controller = new IncomingController(resolver);
    return { resolver, controller };
}

function candidates(content: string) {
    return findCandidateLinks(content, DEFAULT_PLATFORMS);
}

/** Let queued promise callbacks run. */
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe("embedFix/incomingController", () => {
    it("marks a link pending immediately and resolved once the probe answers", async () => {
        const { controller } = setup(async url => ok(url));
        const links = candidates("https://x.com/a/status/1");

        controller.ensure(links);
        expect(controller.getStates().get(links[0].key)).toEqual({ status: "pending" });

        await flush();
        expect(controller.getStates().get(links[0].key)).toMatchObject({
            status: "resolved",
            providerDomain: "vxtwitter.com",
        });
    });

    it("records unresolved when no provider works, and does not retry on the next render", async () => {
        const probe = vi.fn<ProbeFn>(async url => ({ ...emptyMeta(url), error: "HTTP 500" }));
        const { controller } = setup(probe);
        const links = candidates("https://x.com/a/status/1");

        controller.ensure(links);
        await flush();
        expect(controller.getStates().get(links[0].key)).toEqual({ status: "unresolved" });

        const callsAfterFirst = probe.mock.calls.length;
        controller.ensure(links);
        controller.ensure(links);
        await flush();
        expect(probe).toHaveBeenCalledTimes(callsAfterFirst);
    });

    it("only probes once even when many message rows mount for the same link", async () => {
        const probe = vi.fn<ProbeFn>(async url => ok(url));
        const { controller } = setup(probe);
        const links = candidates("https://x.com/a/status/1");

        for (let i = 0; i < 10; i++) controller.ensure(links);
        await flush();

        expect(probe).toHaveBeenCalledTimes(1);
    });

    it("notifies subscribers when an answer lands", async () => {
        const { controller } = setup(async url => ok(url));
        const listener = vi.fn();
        controller.subscribe(listener);

        controller.ensure(candidates("https://x.com/a/status/1"));
        const before = listener.mock.calls.length;
        await flush();

        expect(listener.mock.calls.length).toBeGreaterThan(before);
    });

    it("stops notifying after unsubscribe", async () => {
        const { controller } = setup(async url => ok(url));
        const listener = vi.fn();
        controller.subscribe(listener)();

        controller.ensure(candidates("https://x.com/a/status/1"));
        await flush();

        expect(listener).not.toHaveBeenCalled();
    });

    it("one throwing subscriber does not starve the others", async () => {
        const { controller } = setup(async url => ok(url));
        const good = vi.fn();
        controller.subscribe(() => { throw new Error("bad listener"); });
        controller.subscribe(good);

        expect(() => controller.ensure(candidates("https://x.com/a/status/1"))).not.toThrow();
        await flush();
        expect(good).toHaveBeenCalled();
    });

    it("adopts a cached resolution synchronously, without a pending flash", async () => {
        const probe = vi.fn<ProbeFn>(async url => ok(url));
        const { resolver, controller } = setup(probe);
        const links = candidates("https://x.com/a/status/1");

        await resolver.resolve(links[0].cleanUrl, links[0].platform);
        controller.ensure(links);

        expect(controller.getStates().get(links[0].key)).toMatchObject({ status: "resolved" });
        expect(probe).toHaveBeenCalledTimes(1);
    });

    it("treats a resolution whose metadata is unusable as unresolved", async () => {
        const { controller } = setup(async url => ({ ...emptyMeta(url), title: "Not found", softError: "provider error page" }));
        const links = candidates("https://x.com/a/status/1");

        controller.ensure(links);
        await flush();

        expect(controller.getStates().get(links[0].key)).toEqual({ status: "unresolved" });
    });

    it("refresh forgets the answer and probes again", async () => {
        let everythingDown = true;
        const probe = vi.fn<ProbeFn>(async url => (
            everythingDown ? { ...emptyMeta(url), error: "HTTP 500" } : ok(url)
        ));
        const { controller } = setup(probe);
        const links = candidates("https://x.com/a/status/1");

        controller.ensure(links);
        await flush();
        expect(controller.getStates().get(links[0].key)).toEqual({ status: "unresolved" });

        everythingDown = false;
        controller.refresh(links[0]);
        await flush();

        expect(controller.getStates().get(links[0].key)).toMatchObject({ status: "resolved" });
    });

    it("survives a resolver that rejects outright", async () => {
        const resolver = {
            peek: () => null,
            resolve: () => Promise.reject(new Error("exploded")),
            invalidate: () => { /* noop */ },
        } as unknown as ProviderResolver;
        const controller = new IncomingController(resolver);
        const links = candidates("https://x.com/a/status/1");

        controller.ensure(links);
        await flush();

        expect(controller.getStates().get(links[0].key)).toEqual({ status: "unresolved" });
    });

    it("reset clears everything and notifies", async () => {
        const { controller } = setup(async url => ok(url));
        const listener = vi.fn();
        controller.ensure(candidates("https://x.com/a/status/1"));
        await flush();
        controller.subscribe(listener);

        controller.reset();

        expect(controller.getStates().size).toBe(0);
        expect(listener).toHaveBeenCalled();
    });

    it("keeps separate state for two links that share a platform", async () => {
        const { controller } = setup(async url => (
            url.includes("/b/") ? { ...emptyMeta(url), error: "HTTP 404" } : ok(url)
        ));
        const links = candidates("https://x.com/a/status/1 https://x.com/b/status/2");

        controller.ensure(links);
        await flush();

        expect(controller.getStates().get(links[0].key)).toMatchObject({ status: "resolved" });
        expect(controller.getStates().get(links[1].key)).toEqual({ status: "unresolved" });
    });
});

describe("embedFix/incomingController — history and virtual scroll", () => {
    it("keeps resolving a link whose row scrolled out of view mid-probe", async () => {
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const { controller } = setup(async url => {
            await gate;
            return ok(url);
        });
        const links = candidates("https://x.com/a/status/1");

        // Row mounts and subscribes, then scrolls away and unsubscribes.
        const unsubscribe = controller.subscribe(() => { /* row listener */ });
        controller.ensure(links);
        unsubscribe();

        release();
        await flush();

        // The answer landed anyway — it is not tied to the row's lifetime.
        expect(controller.getStates().get(links[0].key)).toMatchObject({ status: "resolved" });
    });

    it("serves a remounted row synchronously, with no second probe", async () => {
        const probe = vi.fn<ProbeFn>(async url => ok(url));
        const { controller } = setup(probe);
        const links = candidates("https://x.com/a/status/1");

        controller.ensure(links);
        await flush();
        probe.mockClear();

        // Row scrolls back in: state is already there, nothing re-fetched.
        controller.ensure(links);

        expect(controller.getStates().get(links[0].key)).toMatchObject({ status: "resolved" });
        expect(probe).not.toHaveBeenCalled();
    });

    it("does not storm providers when rows thrash in and out of the viewport", async () => {
        const probe = vi.fn<ProbeFn>(async url => ok(url));
        const { controller } = setup(probe);
        const links = candidates("https://x.com/a/status/1");

        for (let i = 0; i < 25; i++) {
            const unsubscribe = controller.subscribe(() => { /* row */ });
            controller.ensure(links);
            unsubscribe();
        }
        await flush();

        expect(probe).toHaveBeenCalledTimes(1);
    });

    it("resolves every link in a bulk history load, one probe per distinct link", async () => {
        const probe = vi.fn<ProbeFn>(async url => ok(url));
        const { controller } = setup(probe);

        // Ten historical messages arrive at once; two of them share a link.
        const history = [
            "https://x.com/a/status/1",
            "https://reddit.com/r/x/comments/2/t/",
            "https://x.com/a/status/1",
            "https://x.com/b/status/3",
        ];
        for (const content of history) controller.ensure(candidates(content));
        await flush();

        const distinct = new Set(history).size;
        expect(probe).toHaveBeenCalledTimes(distinct);
        for (const content of history) {
            expect(controller.getStates().get(candidates(content)[0].key)).toMatchObject({ status: "resolved" });
        }
    });

    it("handles a message whose links resolve to different providers", async () => {
        const { controller } = setup(async url => (
            new URL(url).hostname === "vxtwitter.com" && url.includes("/b/")
                ? { ...emptyMeta(url), error: "HTTP 404" }
                : ok(url)
        ));
        const links = candidates("https://x.com/a/status/1 https://x.com/b/status/2");

        controller.ensure(links);
        await flush();

        expect(controller.getStates().get(links[0].key)).toMatchObject({ providerDomain: "vxtwitter.com" });
        expect(controller.getStates().get(links[1].key)).toMatchObject({ providerDomain: "fxtwitter.com" });
    });
});

describe("embedFix/incomingController — unpresentable media", () => {
    const REDDIT = "https://reddit.com/r/x/comments/1/t/";

    function withImageGate(canPresent: (url: string) => Promise<boolean>) {
        const resolver = new ProviderResolver({
            probe: async url => ok(url, { imageUrl: "https://i.redd.it/a.gif", description: "body" }),
        });
        return new IncomingController(resolver, () => { /* noop */ }, url => canPresent(url));
    }

    it("strips an image the renderer cannot display, so it stops inflating the score", async () => {
        const controller = withImageGate(async () => false);
        const links = findCandidateLinks(REDDIT, DEFAULT_PLATFORMS);

        controller.ensure(links);
        await flush();

        const state = controller.getStates().get(links[0].key) as any;
        expect(state.status).toBe("resolved");
        expect(state.meta.imageUrl).toBeNull();
        expect(state.meta.title).toBe("A post");
    });

    it("keeps an image that does load", async () => {
        const controller = withImageGate(async () => true);
        const links = findCandidateLinks(REDDIT, DEFAULT_PLATFORMS);

        controller.ensure(links);
        await flush();

        const state = controller.getStates().get(links[0].key) as any;
        expect(state.meta.imageUrl).toBe("https://i.redd.it/a.gif");
    });

    it("downgrades to unresolved when the image was the only thing worth showing", async () => {
        const resolver = new ProviderResolver({
            probe: async url => ({ ...emptyMeta(url), imageUrl: "https://i.redd.it/a.gif" }),
        });
        const controller = new IncomingController(resolver, () => { /* noop */ }, async () => false);
        const links = findCandidateLinks(REDDIT, DEFAULT_PLATFORMS);

        controller.ensure(links);
        await flush();

        expect(controller.getStates().get(links[0].key)).toEqual({ status: "unresolved" });
    });

    it("the reported regression: a picture-less replacement no longer beats Discord's embed", async () => {
        const controller = withImageGate(async () => false);
        const links = findCandidateLinks(REDDIT, DEFAULT_PLATFORMS);
        controller.ensure(links);
        await flush();

        const plan = planIncomingMessage({
            content: REDDIT,
            embeds: [{ url: REDDIT, rawTitle: "A post", rawDescription: "body", image: { url: "https://proxied" } }],
            platforms: DEFAULT_PLATFORMS,
            states: controller.getStates(),
        });

        expect(plan.render).toEqual([]);
        expect(plan.suppress).toEqual([]);
    });

    it("without an image gate, behaviour is unchanged", async () => {
        const resolver = new ProviderResolver({ probe: async url => ok(url, { imageUrl: "https://i.redd.it/a.gif" }) });
        const controller = new IncomingController(resolver);
        const links = findCandidateLinks(REDDIT, DEFAULT_PLATFORMS);

        controller.ensure(links);
        await flush();

        expect((controller.getStates().get(links[0].key) as any).meta.imageUrl).toBe("https://i.redd.it/a.gif");
    });
});

describe("embedFix/incomingController — unplayable video", () => {
    const TWEET = "https://x.com/a/status/1";

    function withVideoGate(meta: Partial<EmbedMeta>, canPresent: (url: string, kind: string) => Promise<boolean>) {
        const resolver = new ProviderResolver({ probe: async url => ({ ...emptyMeta(url), ...meta, url }) });
        return new IncomingController(resolver, () => { /* noop */ }, (url, kind) => canPresent(url, kind));
    }

    it("stops a blocked video from claiming the top score", async () => {
        const controller = withVideoGate(
            { title: "A tweet", description: "text", videoUrl: "https://vxtwitter.com/tvid/x", imageUrl: "https://pbs.twimg.com/thumb.jpg", type: "player" },
            async (_url, kind) => kind === "image",
        );
        const links = findCandidateLinks(TWEET, DEFAULT_PLATFORMS);

        controller.ensure(links);
        await flush();

        const state = controller.getStates().get(links[0].key) as any;
        expect(state.meta.videoUrl).toBeNull();
        expect(state.meta.type).toBeNull();
        expect(state.meta.imageUrl).toBe("https://pbs.twimg.com/thumb.jpg");
    });

    it("does not replace a native embed that has a genuinely playable video", async () => {
        const controller = withVideoGate(
            { title: "A tweet", videoUrl: "https://vxtwitter.com/tvid/x", type: "video" },
            async (_url, kind) => kind === "image",
        );
        const links = findCandidateLinks(TWEET, DEFAULT_PLATFORMS);
        controller.ensure(links);
        await flush();

        const plan = planIncomingMessage({
            content: TWEET,
            embeds: [{ url: TWEET, rawTitle: "A tweet", video: { url: "https://images-ext-1.discordapp.net/x" }, image: { url: "https://p" } }],
            platforms: DEFAULT_PLATFORMS,
            states: controller.getStates(),
        });

        expect(plan.render).toEqual([]);
        expect(plan.suppress).toEqual([]);
    });

    it("keeps a video that really can be played", async () => {
        const controller = withVideoGate(
            { title: "A tweet", videoUrl: "https://allowed.cdn/v.mp4" },
            async () => true,
        );
        const links = findCandidateLinks(TWEET, DEFAULT_PLATFORMS);

        controller.ensure(links);
        await flush();

        expect((controller.getStates().get(links[0].key) as any).meta.videoUrl).toBe("https://allowed.cdn/v.mp4");
    });

    it("falls all the way to unresolved when video was the only content", async () => {
        const controller = withVideoGate(
            { videoUrl: "https://vxtwitter.com/tvid/x", type: "video" },
            async () => false,
        );
        const links = findCandidateLinks(TWEET, DEFAULT_PLATFORMS);

        controller.ensure(links);
        await flush();

        expect(controller.getStates().get(links[0].key)).toEqual({ status: "unresolved" });
    });
});

describe("embedFix/incomingController — proxying CSP-blocked media", () => {
    const REDDIT = "https://reddit.com/r/x/comments/1/t/";

    function proxyWith(fetcherOk: boolean) {
        let n = 0;
        return new MediaProxy({
            fetcher: async () => fetcherOk
                ? { ok: true, contentType: "image/gif", bytes: new Uint8Array(8).fill(1), size: 8 }
                : { ok: false, contentType: null, bytes: null, size: 0, error: "too large" },
            objectUrls: { create: () => `blob:mock/${++n}`, revoke: () => { /* noop */ } },
        });
    }

    it("swaps a blocked image for a proxied blob URL instead of dropping it", async () => {
        const resolver = new ProviderResolver({
            probe: async url => ok(url, { imageUrl: "https://i.redd.it/a.gif", description: "body" }),
        });
        const controller = new IncomingController(resolver, () => { /* noop */ }, async () => false, proxyWith(true));

        controller.ensure(findCandidateLinks(REDDIT, DEFAULT_PLATFORMS));
        await flush();

        const state = Object.values(Object.fromEntries(controller.getStates()))[0] as any;
        expect(state.meta.imageUrl).toMatch(/^blob:mock\//);
    });

    it("falls back to dropping the image when the proxy cannot fetch it", async () => {
        const resolver = new ProviderResolver({
            probe: async url => ok(url, { imageUrl: "https://i.redd.it/huge.gif", description: "body" }),
        });
        const controller = new IncomingController(resolver, () => { /* noop */ }, async () => false, proxyWith(false));

        controller.ensure(findCandidateLinks(REDDIT, DEFAULT_PLATFORMS));
        await flush();

        const state = Object.values(Object.fromEntries(controller.getStates()))[0] as any;
        expect(state.meta.imageUrl).toBeNull();
    });

    it("marks a blocked video click-to-load without downloading it up front", async () => {
        const fetcher = vi.fn(async () => ({ ok: true, contentType: "video/mp4", bytes: new Uint8Array(4), size: 4 }));
        const proxy = new MediaProxy({ fetcher, objectUrls: { create: () => "blob:mock/v", revoke: () => { /* noop */ } } });
        const resolver = new ProviderResolver({
            probe: async url => ok(url, { videoUrl: "https://vxtwitter.com/tvid/x", imageUrl: null, type: "player" }),
        });
        const controller = new IncomingController(resolver, () => { /* noop */ }, async () => false, proxy);

        controller.ensure(findCandidateLinks("https://x.com/a/status/1", DEFAULT_PLATFORMS));
        await flush();

        const state = Object.values(Object.fromEntries(controller.getStates()))[0] as any;
        expect(state.meta.videoNeedsProxy).toBe(true);
        expect(state.meta.videoUrl).toBe("https://vxtwitter.com/tvid/x");
        expect(fetcher).not.toHaveBeenCalled();
    });
});
