import { describe, expect, it, vi } from "vitest";

import { MediaProxy, type MediaFetcher, type ObjectUrlFactory } from "../../../plugins/embedFix/mediaProxy";

function urls(): ObjectUrlFactory & { live: Set<string>; created: number } {
    const live = new Set<string>();
    let created = 0;
    return {
        live,
        get created() { return created; },
        create() {
            const url = `blob:mock/${++created}`;
            live.add(url);
            return url;
        },
        revoke(url: string) { live.delete(url); },
    };
}

const bytes = (n: number) => new Uint8Array(n).fill(1);

function okFetch(size = 1024): MediaFetcher {
    return async () => ({ ok: true, contentType: "image/gif", bytes: bytes(size), size });
}

describe("embedFix/mediaProxy", () => {
    it("turns fetched bytes into a blob URL", async () => {
        const factory = urls();
        const proxy = new MediaProxy({ fetcher: okFetch(), objectUrls: factory });

        const url = await proxy.load("https://i.redd.it/a.gif", "image");

        expect(url).toMatch(/^blob:mock\//);
        expect(factory.live.size).toBe(1);
    });

    it("fetches an asset once, however many embeds ask", async () => {
        const fetcher = vi.fn<MediaFetcher>(okFetch());
        const proxy = new MediaProxy({ fetcher, objectUrls: urls() });

        await proxy.load("https://i.redd.it/a.gif", "image");
        await proxy.load("https://i.redd.it/a.gif", "image");
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("shares one fetch between concurrent callers", async () => {
        let calls = 0;
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        const proxy = new MediaProxy({
            fetcher: async () => { calls++; await gate; return { ok: true, contentType: "image/gif", bytes: bytes(10), size: 10 }; },
            objectUrls: urls(),
        });

        const both = Promise.all([
            proxy.load("https://i.redd.it/a.gif", "image"),
            proxy.load("https://i.redd.it/a.gif", "image"),
        ]);
        release();
        const [a, b] = await both;

        expect(calls).toBe(1);
        expect(a).toBe(b);
    });

    it("passes the per-kind size cap down to the fetcher", async () => {
        const fetcher = vi.fn<MediaFetcher>(okFetch());
        const proxy = new MediaProxy({ fetcher, objectUrls: urls(), maxBytes: { image: 111, video: 222 } });

        await proxy.load("https://i.redd.it/a.gif", "image");
        await proxy.load("https://cdn/v.mp4", "video");

        expect(fetcher.mock.calls[0][1]).toBe(111);
        expect(fetcher.mock.calls[1][1]).toBe(222);
    });

    it("remembers a failure and does not retry it", async () => {
        const fetcher = vi.fn<MediaFetcher>(async () => ({ ok: false, contentType: null, bytes: null, size: 0, error: "too large" }));
        const proxy = new MediaProxy({ fetcher, objectUrls: urls() });

        expect(await proxy.load("https://i.redd.it/big.gif", "image")).toBeNull();
        expect(await proxy.load("https://i.redd.it/big.gif", "image")).toBeNull();
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(proxy.hasFailed("https://i.redd.it/big.gif")).toBe(true);
    });

    it("treats a throwing fetcher as a failure", async () => {
        const proxy = new MediaProxy({ fetcher: async () => { throw new Error("ipc died"); }, objectUrls: urls() });

        expect(await proxy.load("https://i.redd.it/a.gif", "image")).toBeNull();
    });

    it("rejects an empty payload rather than making a zero-byte blob", async () => {
        const proxy = new MediaProxy({
            fetcher: async () => ({ ok: true, contentType: "image/gif", bytes: new Uint8Array(0), size: 0 }),
            objectUrls: urls(),
        });

        expect(await proxy.load("https://i.redd.it/a.gif", "image")).toBeNull();
    });

    it("revokes the oldest object URLs once the cache is full", async () => {
        const factory = urls();
        const proxy = new MediaProxy({ fetcher: okFetch(), objectUrls: factory, maxEntries: 2 });

        const first = await proxy.load("https://i.redd.it/1.gif", "image");
        await proxy.load("https://i.redd.it/2.gif", "image");
        await proxy.load("https://i.redd.it/3.gif", "image");

        expect(factory.live.size).toBe(2);
        expect(factory.live.has(first!)).toBe(false);
        expect(proxy.peek("https://i.redd.it/1.gif")).toBeNull();
    });

    it("tracks how many bytes it is holding alive", async () => {
        const proxy = new MediaProxy({ fetcher: okFetch(2048), objectUrls: urls() });

        await proxy.load("https://i.redd.it/a.gif", "image");
        await proxy.load("https://i.redd.it/b.gif", "image");

        expect(proxy.bytesHeld()).toBe(4096);
    });

    it("peek never fetches", async () => {
        const fetcher = vi.fn<MediaFetcher>(okFetch());
        const proxy = new MediaProxy({ fetcher, objectUrls: urls() });

        expect(proxy.peek("https://i.redd.it/a.gif")).toBeNull();
        expect(fetcher).not.toHaveBeenCalled();
    });

    it("reset revokes everything it was holding", async () => {
        const factory = urls();
        const proxy = new MediaProxy({ fetcher: okFetch(), objectUrls: factory });

        await proxy.load("https://i.redd.it/a.gif", "image");
        proxy.reset();

        expect(factory.live.size).toBe(0);
        expect(proxy.stats()).toEqual({ held: 0, bytes: 0, failed: 0 });
    });
});
