import { describe, expect, it, vi } from "vitest";

import { MediaHostRegistry, type MediaLoader } from "../../../plugins/embedFix/mediaProbe";

function clock(start = 1_000_000) {
    let value = start;
    return { now: () => value, advance(ms: number) { value += ms; } };
}

function make(loader: MediaLoader, options: Record<string, unknown> = {}) {
    const time = clock();
    const loaders = { image: loader, video: loader };
    return { registry: new MediaHostRegistry({ loaders, now: time.now, ...options }), time };
}

describe("embedFix/mediaProbe", () => {
    it("reports a host whose images load", async () => {
        const { registry } = make(async () => true);

        expect(await registry.canPresent("https://pbs.twimg.com/media/a.jpg", "image")).toBe(true);
    });

    it("declares a host unusable once enough distinct images fail", async () => {
        const loader = vi.fn<MediaLoader>(async () => false);
        const { registry } = make(loader, { failureThreshold: 2 });

        expect(await registry.canPresent("https://i.redd.it/a.gif", "image")).toBe(false);
        expect(registry.peek("https://i.redd.it/a.gif", "image")).toBeNull(); // one failure: undecided

        expect(await registry.canPresent("https://i.redd.it/b.gif", "image")).toBe(false);
        expect(registry.peek("https://i.redd.it/c.gif", "image")).toBe(false); // verdict now stands
    });

    it("does not condemn a host for one dead image", async () => {
        let first = true;
        const { registry } = make(async () => {
            const result = !first;
            first = false;
            return result;
        }, { failureThreshold: 2 });

        await registry.canPresent("https://cdn.example/deleted.jpg", "image");
        expect(await registry.canPresent("https://cdn.example/alive.jpg", "image")).toBe(true);
        expect(registry.peek("https://cdn.example/other.jpg", "image")).toBe(true);
    });

    it("caches per host, so one probe covers the whole CDN", async () => {
        const loader = vi.fn<MediaLoader>(async () => true);
        const { registry } = make(loader);

        await registry.canPresent("https://cdn.example/a.jpg", "image");
        await registry.canPresent("https://cdn.example/b.jpg", "image");
        await registry.canPresent("https://cdn.example/c.jpg", "image");

        expect(loader).toHaveBeenCalledTimes(1);
    });

    it("keeps verdicts separate per host", async () => {
        const { registry } = make(async url => url.includes("good"), { failureThreshold: 1 });

        expect(await registry.canPresent("https://good.cdn/a.jpg", "image")).toBe(true);
        expect(await registry.canPresent("https://bad.cdn/a.jpg", "image")).toBe(false);
        expect(registry.peek("https://good.cdn/z.jpg", "image")).toBe(true);
        expect(registry.peek("https://bad.cdn/z.jpg", "image")).toBe(false);
    });

    it("shares one probe between concurrent questions about a host", async () => {
        let calls = 0;
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const { registry } = make(async () => { calls++; await gate; return true; });

        const both = Promise.all([
            registry.canPresent("https://cdn.example/a.jpg", "image"),
            registry.canPresent("https://cdn.example/b.jpg", "image"),
        ]);
        release();

        expect(await both).toEqual([true, true]);
        expect(calls).toBe(1);
    });

    it("re-measures after the verdict goes stale", async () => {
        const loader = vi.fn<MediaLoader>(async () => true);
        const { registry, time } = make(loader, { ttlMs: 1000 });

        await registry.canPresent("https://cdn.example/a.jpg", "image");
        time.advance(1001);
        await registry.canPresent("https://cdn.example/a.jpg", "image");

        expect(loader).toHaveBeenCalledTimes(2);
    });

    it("treats a throwing loader as a failure rather than propagating", async () => {
        const { registry } = make(async () => { throw new Error("boom"); }, { failureThreshold: 1 });

        expect(await registry.canPresent("https://cdn.example/a.jpg", "image")).toBe(false);
    });

    it("rejects unparseable URLs without probing", async () => {
        const loader = vi.fn<MediaLoader>(async () => true);
        const { registry } = make(loader);

        expect(await registry.canPresent("not a url", "image")).toBe(false);
        expect(loader).not.toHaveBeenCalled();
    });

    it("forgets everything on reset", async () => {
        const loader = vi.fn<MediaLoader>(async () => true);
        const { registry } = make(loader);

        await registry.canPresent("https://cdn.example/a.jpg", "image");
        registry.reset();
        await registry.canPresent("https://cdn.example/a.jpg", "image");

        expect(loader).toHaveBeenCalledTimes(2);
    });
});

describe("embedFix/mediaProbe — image and video are judged separately", () => {
    it("a host that serves images but blocks video is recorded as both", async () => {
        const time = clock();
        const registry = new MediaHostRegistry({
            loaders: {
                image: async () => true,
                video: async () => false,
            },
            now: time.now,
            failureThreshold: 1,
        });

        expect(await registry.canPresent("https://vxtwitter.com/pic.jpg", "image")).toBe(true);
        expect(await registry.canPresent("https://vxtwitter.com/tvid/x", "video")).toBe(false);
        expect(registry.peek("https://vxtwitter.com/other.jpg", "image")).toBe(true);
        expect(registry.peek("https://vxtwitter.com/tvid/y", "video")).toBe(false);
    });

    it("uses the loader matching the kind asked for", async () => {
        const image = vi.fn<MediaLoader>(async () => true);
        const video = vi.fn<MediaLoader>(async () => true);
        const registry = new MediaHostRegistry({ loaders: { image, video } });

        await registry.canPresent("https://cdn.example/a.mp4", "video");

        expect(video).toHaveBeenCalledTimes(1);
        expect(image).not.toHaveBeenCalled();
    });

    it("reports both kinds in stats", async () => {
        const registry = new MediaHostRegistry({ loaders: { image: async () => true, video: async () => false } });

        await registry.canPresent("https://cdn.example/a.jpg", "image");
        await registry.canPresent("https://cdn.example/a.mp4", "video");

        expect(registry.stats().map(r => `${r.host}/${r.kind}`).sort())
            .toEqual(["cdn.example/image", "cdn.example/video"]);
    });
});
