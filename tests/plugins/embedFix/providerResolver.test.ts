import { describe, expect, it, vi } from "vitest";

import { emptyMeta, type EmbedMeta } from "../../../plugins/embedFix/embedMeta";
import type { PlatformEntry } from "../../../plugins/embedFix/providerMap";
import { ProviderResolver, type ProbeFn } from "../../../plugins/embedFix/providerResolver";

const TWITTER: PlatformEntry = {
    id: "twitter",
    label: "Twitter / X",
    domains: ["twitter.com", "x.com"],
    providers: [
        { domain: "vxtwitter.com", label: "VxTwitter" },
        { domain: "fxtwitter.com", label: "FxTwitter" },
        { domain: "xcancel.com", label: "XCancel" },
    ],
};

function ok(url: string, overrides: Partial<EmbedMeta> = {}): EmbedMeta {
    return { ...emptyMeta(url), title: "A post", imageUrl: "https://cdn/i.jpg", ...overrides };
}

function hardError(url: string, message = "HTTP 502"): EmbedMeta {
    return { ...emptyMeta(url), error: message };
}

function softError(url: string, message = "provider error page"): EmbedMeta {
    return { ...emptyMeta(url), title: "Not found", softError: message };
}

function hostOf(url: string): string {
    return new URL(url).hostname;
}

/** A clock the test drives by hand. */
function clock(start = 1_000_000) {
    let value = start;
    return {
        now: () => value,
        advance(ms: number) { value += ms; },
    };
}

function makeResolver(probe: ProbeFn, options: Partial<ConstructorParameters<typeof ProviderResolver>[0]> = {}) {
    const time = clock();
    const resolver = new ProviderResolver({ probe, now: time.now, ...options });
    return { resolver, time };
}

describe("embedFix/providerResolver — per-link resolution", () => {
    it("resolves each link separately: the same provider can win one link and lose another", async () => {
        const probe: ProbeFn = async url => {
            const host = hostOf(url);
            const isVideo = url.includes("/video/");
            if (host === "vxtwitter.com") return isVideo ? ok(url, { videoUrl: "https://v" }) : softError(url);
            return ok(url);
        };
        const { resolver } = makeResolver(probe);

        const video = await resolver.resolve("https://x.com/a/video/1", TWITTER);
        const photo = await resolver.resolve("https://x.com/a/photo/2", TWITTER);

        expect(video.providerDomain).toBe("vxtwitter.com");
        expect(photo.providerDomain).toBe("fxtwitter.com");
    });

    it("stops at the first good-enough provider instead of probing the rest", async () => {
        const probe = vi.fn<ProbeFn>(async url => ok(url));
        const { resolver } = makeResolver(probe);

        const result = await resolver.resolve("https://x.com/a/status/1", TWITTER);

        expect(result.providerDomain).toBe("vxtwitter.com");
        expect(probe).toHaveBeenCalledTimes(1);
    });

    it("keeps looking past a title-only result and prefers the richer provider", async () => {
        const probe = vi.fn<ProbeFn>(async url => (
            hostOf(url) === "vxtwitter.com"
                ? ok(url, { imageUrl: null, title: "Only a title" })
                : ok(url, { videoUrl: "https://v" })
        ));
        const { resolver } = makeResolver(probe);

        const result = await resolver.resolve("https://x.com/a/status/1", TWITTER);

        expect(result.providerDomain).toBe("fxtwitter.com");
        expect(probe).toHaveBeenCalledTimes(2);
    });

    it("falls back to the weak result when nothing better exists", async () => {
        const probe: ProbeFn = async url => (
            hostOf(url) === "xcancel.com"
                ? ok(url, { imageUrl: null, title: "Only a title" })
                : hardError(url)
        );
        const { resolver } = makeResolver(probe);

        const result = await resolver.resolve("https://x.com/a/status/1", TWITTER);

        expect(result.providerDomain).toBe("xcancel.com");
        expect(result.score).toBe(1);
    });

    it("returns a null resolution — not a throw — when every provider fails", async () => {
        const { resolver } = makeResolver(async url => hardError(url));

        const result = await resolver.resolve("https://x.com/a/status/1", TWITTER);

        expect(result.providerDomain).toBeNull();
        expect(result.providerUrl).toBeNull();
        expect(result.attempts).toHaveLength(3);
    });

    it("survives a probe that throws instead of resolving", async () => {
        const probe: ProbeFn = async url => {
            if (hostOf(url) === "vxtwitter.com") throw new Error("native module unavailable");
            return ok(url);
        };
        const { resolver } = makeResolver(probe);

        const result = await resolver.resolve("https://x.com/a/status/1", TWITTER);

        expect(result.providerDomain).toBe("fxtwitter.com");
        expect(result.attempts[0]).toMatchObject({ domain: "vxtwitter.com", error: "native module unavailable" });
    });

    it("handles a platform with no providers at all", async () => {
        const probe = vi.fn<ProbeFn>(async url => ok(url));
        const { resolver } = makeResolver(probe);

        const result = await resolver.resolve("https://x.com/a/status/1", { ...TWITTER, providers: [] });

        expect(result.providerDomain).toBeNull();
        expect(probe).not.toHaveBeenCalled();
    });

    it("probes the provider URL, not the source URL", async () => {
        const seen: string[] = [];
        const { resolver } = makeResolver(async url => {
            seen.push(url);
            return ok(url);
        });

        await resolver.resolve("https://x.com/user/status/1?lang=en", TWITTER);

        expect(seen).toEqual(["https://vxtwitter.com/user/status/1?lang=en"]);
    });

    it("respects the caller's provider ordering", async () => {
        const reordered: PlatformEntry = {
            ...TWITTER,
            providers: [TWITTER.providers[2], TWITTER.providers[0], TWITTER.providers[1]],
        };
        const { resolver } = makeResolver(async url => ok(url));

        const result = await resolver.resolve("https://x.com/a/status/1", reordered);

        expect(result.providerDomain).toBe("xcancel.com");
    });
});

describe("embedFix/providerResolver — caching", () => {
    it("serves a repeat lookup from cache without probing again", async () => {
        const probe = vi.fn<ProbeFn>(async url => ok(url));
        const { resolver } = makeResolver(probe);

        await resolver.resolve("https://x.com/a/status/1", TWITTER);
        await resolver.resolve("https://x.com/a/status/1", TWITTER);

        expect(probe).toHaveBeenCalledTimes(1);
    });

    it("treats URLs that differ only in noise as the same link", async () => {
        const probe = vi.fn<ProbeFn>(async url => ok(url));
        const { resolver } = makeResolver(probe);

        await resolver.resolve("https://x.com/a/status/1", TWITTER);
        await resolver.resolve("https://www.X.com/a/status/1/", TWITTER);
        await resolver.resolve("https://x.com/a/status/1#reply", TWITTER);

        expect(probe).toHaveBeenCalledTimes(1);
    });

    it("does NOT collapse links that differ in a meaningful query param", async () => {
        const probe = vi.fn<ProbeFn>(async url => ok(url));
        const { resolver } = makeResolver(probe);

        await resolver.resolve("https://x.com/a/status/1", TWITTER);
        await resolver.resolve("https://x.com/a/status/1?photo=2", TWITTER);

        expect(probe).toHaveBeenCalledTimes(2);
    });

    it("shares one probe chain between concurrent lookups of the same link", async () => {
        let calls = 0;
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const probe: ProbeFn = async url => {
            calls++;
            await gate;
            return ok(url);
        };
        const { resolver } = makeResolver(probe);

        const a = resolver.resolve("https://x.com/a/status/1", TWITTER);
        const b = resolver.resolve("https://x.com/a/status/1", TWITTER);
        release();
        const [first, second] = await Promise.all([a, b]);

        expect(calls).toBe(1);
        expect(first).toBe(second);
    });

    it("expires a success after the TTL and a failure much sooner", async () => {
        const probe = vi.fn<ProbeFn>(async url => (
            hostOf(url) === "vxtwitter.com" ? ok(url) : hardError(url)
        ));
        const { resolver, time } = makeResolver(probe, { successTtlMs: 1000, failureTtlMs: 100 });

        await resolver.resolve("https://x.com/good/status/1", TWITTER);
        const badPlatform: PlatformEntry = { ...TWITTER, providers: [TWITTER.providers[1]] };
        await resolver.resolve("https://x.com/bad/status/1", badPlatform);
        probe.mockClear();

        time.advance(200);
        await resolver.resolve("https://x.com/good/status/1", TWITTER);
        expect(probe).not.toHaveBeenCalled();

        await resolver.resolve("https://x.com/bad/status/1", badPlatform);
        expect(probe).toHaveBeenCalledTimes(1);
    });

    it("evicts the oldest entries once the cache is full", async () => {
        const { resolver, time } = makeResolver(async url => ok(url), { maxEntries: 2 });

        await resolver.resolve("https://x.com/a/status/1", TWITTER);
        time.advance(10);
        await resolver.resolve("https://x.com/a/status/2", TWITTER);
        time.advance(10);
        await resolver.resolve("https://x.com/a/status/3", TWITTER);

        expect(resolver.peek("https://x.com/a/status/1")).toBeNull();
        expect(resolver.peek("https://x.com/a/status/3")).not.toBeNull();
        expect(resolver.stats().resolutions).toBe(2);
    });

    it("invalidate forces exactly one link to be re-probed", async () => {
        const probe = vi.fn<ProbeFn>(async url => ok(url));
        const { resolver } = makeResolver(probe);

        await resolver.resolve("https://x.com/a/status/1", TWITTER);
        await resolver.resolve("https://x.com/a/status/2", TWITTER);
        resolver.invalidate("https://x.com/a/status/1");
        probe.mockClear();

        await resolver.resolve("https://x.com/a/status/2", TWITTER);
        expect(probe).not.toHaveBeenCalled();

        await resolver.resolve("https://x.com/a/status/1", TWITTER);
        expect(probe).toHaveBeenCalledTimes(1);
    });

    it("peek never triggers network work", () => {
        const probe = vi.fn<ProbeFn>(async url => ok(url));
        const { resolver } = makeResolver(probe);

        expect(resolver.peek("https://x.com/a/status/1")).toBeNull();
        expect(probe).not.toHaveBeenCalled();
    });
});

describe("embedFix/providerResolver — domain health", () => {
    it("puts a repeatedly failing domain on cooldown and stops paying for it", async () => {
        const probe = vi.fn<ProbeFn>(async url => (
            hostOf(url) === "vxtwitter.com" ? hardError(url) : ok(url)
        ));
        const { resolver } = makeResolver(probe, { failureThreshold: 2 });

        await resolver.resolve("https://x.com/a/status/1", TWITTER);
        await resolver.resolve("https://x.com/a/status/2", TWITTER);
        expect(resolver.isCooling("vxtwitter.com")).toBe(true);

        probe.mockClear();
        const third = await resolver.resolve("https://x.com/a/status/3", TWITTER);

        expect(probe.mock.calls.map(([url]) => hostOf(url))).toEqual(["fxtwitter.com"]);
        expect(third.attempts.find(a => a.domain === "vxtwitter.com")?.skipped).toBe("cooldown");
    });

    it("lifts the cooldown once it expires", async () => {
        const probe: ProbeFn = async url => hardError(url);
        const { resolver, time } = makeResolver(probe, { failureThreshold: 1, cooldownBaseMs: 500 });

        await resolver.resolve("https://x.com/a/status/1", TWITTER);
        expect(resolver.isCooling("vxtwitter.com")).toBe(true);

        time.advance(501);
        expect(resolver.isCooling("vxtwitter.com")).toBe(false);
    });

    it("backs off exponentially but never past the cap", async () => {
        const { resolver, time } = makeResolver(async url => hardError(url), {
            failureThreshold: 1,
            cooldownBaseMs: 100,
            cooldownMaxMs: 400,
        });
        const single: PlatformEntry = { ...TWITTER, providers: [TWITTER.providers[0]] };

        for (let i = 0; i < 6; i++) {
            time.advance(10_000);
            await resolver.resolve(`https://x.com/a/status/${i}`, single);
        }

        const health = resolver.stats().health.find(entry => entry.domain === "vxtwitter.com")!;
        expect(health.cooldownUntil - time.now()).toBeLessThanOrEqual(400);
    });

    it("still tries the top provider when every domain is cooling, rather than giving up", async () => {
        const probe = vi.fn<ProbeFn>(async url => hardError(url));
        const { resolver } = makeResolver(probe, { failureThreshold: 1 });

        await resolver.resolve("https://x.com/a/status/1", TWITTER);
        expect(resolver.isCooling("vxtwitter.com")).toBe(true);
        expect(resolver.isCooling("xcancel.com")).toBe(true);

        probe.mockClear();
        await resolver.resolve("https://x.com/a/status/2", TWITTER);

        expect(probe).toHaveBeenCalledTimes(1);
        expect(hostOf(probe.mock.calls[0][0])).toBe("vxtwitter.com");
    });

    it("a soft error does NOT count against the provider — the domain is alive", async () => {
        const probe: ProbeFn = async url => (
            hostOf(url) === "vxtwitter.com" ? softError(url) : ok(url)
        );
        const { resolver } = makeResolver(probe, { failureThreshold: 1 });

        await resolver.resolve("https://x.com/a/status/1", TWITTER);
        await resolver.resolve("https://x.com/a/status/2", TWITTER);

        expect(resolver.isCooling("vxtwitter.com")).toBe(false);
    });

    it("one success clears an accumulated failure streak", async () => {
        let fail = true;
        const { resolver } = makeResolver(async url => (
            hostOf(url) === "vxtwitter.com" && fail ? hardError(url) : ok(url)
        ), { failureThreshold: 3 });

        await resolver.resolve("https://x.com/a/status/1", TWITTER);
        fail = false;
        await resolver.resolve("https://x.com/a/status/2", TWITTER);

        expect(resolver.stats().health.find(e => e.domain === "vxtwitter.com")?.failures).toBe(0);
    });

    it("clearCooldowns un-benches every provider without dropping resolutions", async () => {
        const { resolver } = makeResolver(async url => (
            hostOf(url) === "vxtwitter.com" ? hardError(url) : ok(url)
        ), { failureThreshold: 1 });

        await resolver.resolve("https://x.com/a/status/1", TWITTER);
        expect(resolver.isCooling("vxtwitter.com")).toBe(true);

        resolver.clearCooldowns();

        expect(resolver.isCooling("vxtwitter.com")).toBe(false);
        expect(resolver.peek("https://x.com/a/status/1")).not.toBeNull();
    });
});

describe("embedFix/providerResolver — parallel mode", () => {
    it("probes every provider at once and keeps the richest", async () => {
        const probe = vi.fn<ProbeFn>(async url => {
            const host = hostOf(url);
            if (host === "vxtwitter.com") return ok(url, { imageUrl: null, title: "weak" });
            if (host === "fxtwitter.com") return ok(url, { videoUrl: "https://v" });
            return ok(url);
        });
        const { resolver } = makeResolver(probe, { parallel: true });

        const result = await resolver.resolve("https://x.com/a/status/1", TWITTER);

        expect(probe).toHaveBeenCalledTimes(3);
        expect(result.providerDomain).toBe("fxtwitter.com");
    });

    it("keeps the user's ordering when two providers tie", async () => {
        const { resolver } = makeResolver(async url => ok(url), { parallel: true });

        const result = await resolver.resolve("https://x.com/a/status/1", TWITTER);

        expect(result.providerDomain).toBe("vxtwitter.com");
    });
});

describe("embedFix/providerResolver — persistence", () => {
    it("round-trips resolutions and health through serialize/restore", async () => {
        const { resolver, time } = makeResolver(async url => (
            hostOf(url) === "vxtwitter.com" ? hardError(url) : ok(url)
        ), { failureThreshold: 1 });

        await resolver.resolve("https://x.com/a/status/1", TWITTER);
        const json = resolver.serialize();

        const restored = new ProviderResolver({ probe: async url => ok(url), now: time.now });
        restored.restore(json);

        expect(restored.peek("https://x.com/a/status/1")?.providerDomain).toBe("fxtwitter.com");
        expect(restored.isCooling("vxtwitter.com")).toBe(true);
    });

    it("ignores empty, malformed, wrong-shaped and stale-version payloads", () => {
        const { resolver } = makeResolver(async url => ok(url));

        for (const payload of ["", "   ", "not json", "[1,2,3]", "null", JSON.stringify({ v: 1, resolutions: [] })]) {
            expect(() => resolver.restore(payload)).not.toThrow();
        }
        expect(resolver.stats().resolutions).toBe(0);
    });

    it("drops individual malformed entries but keeps the good ones", () => {
        const { resolver } = makeResolver(async url => ok(url));

        resolver.restore(JSON.stringify({
            v: 2,
            resolutions: [
                { nope: true },
                null,
                { key: "x.com/a/status/1", sourceUrl: "https://x.com/a/status/1", platformId: "twitter", providerDomain: "vxtwitter.com", providerUrl: "https://vxtwitter.com/a/status/1", meta: null, score: 2, resolvedAt: 1_000_000, attempts: [] },
            ],
            health: [{ domain: "vxtwitter.com", failures: "lots" }, null],
        }));

        expect(resolver.stats().resolutions).toBe(1);
        expect(resolver.stats().health.find(e => e.domain === "vxtwitter.com")?.failures).toBe(0);
    });

    it("notifies the persistence hook when state changes, not on cache hits", async () => {
        const onPersist = vi.fn();
        const time = clock();
        const resolver = new ProviderResolver({ probe: async url => ok(url), now: time.now, onPersist });

        await resolver.resolve("https://x.com/a/status/1", TWITTER);
        expect(onPersist).toHaveBeenCalledTimes(1);

        await resolver.resolve("https://x.com/a/status/1", TWITTER);
        expect(onPersist).toHaveBeenCalledTimes(1);
    });
});

describe("embedFix/providerResolver — useless providers", () => {
    it("benches a provider that returns nothing for link after link", async () => {
        const probe = vi.fn<ProbeFn>(async url => (
            hostOf(url) === "vxtwitter.com" ? softError(url, "no metadata") : ok(url)
        ));
        const { resolver } = makeResolver(probe, { softStreakThreshold: 3 });

        for (let i = 0; i < 3; i++) {
            await resolver.resolve(`https://x.com/a/status/${i}`, TWITTER);
        }

        expect(resolver.isCooling("vxtwitter.com")).toBe(true);
    });

    it("does not bench a provider that merely cannot do one link", async () => {
        const probe: ProbeFn = async url => (
            url.includes("/status/1") && hostOf(url) === "vxtwitter.com" ? softError(url, "no metadata") : ok(url)
        );
        const { resolver } = makeResolver(probe, { softStreakThreshold: 3 });

        await resolver.resolve("https://x.com/a/status/1", TWITTER);
        await resolver.resolve("https://x.com/a/status/2", TWITTER);
        await resolver.resolve("https://x.com/a/status/3", TWITTER);
        await resolver.resolve("https://x.com/a/status/4", TWITTER);

        expect(resolver.isCooling("vxtwitter.com")).toBe(false);
    });

    it("one success anywhere resets the soft streak", async () => {
        let blind = true;
        const { resolver } = makeResolver(async url => {
            if (hostOf(url) !== "vxtwitter.com") return ok(url);
            return blind ? softError(url, "no metadata") : ok(url);
        }, { softStreakThreshold: 3 });

        await resolver.resolve("https://x.com/a/status/1", TWITTER);
        await resolver.resolve("https://x.com/a/status/2", TWITTER);
        blind = false;
        await resolver.resolve("https://x.com/a/status/3", TWITTER);
        blind = true;
        await resolver.resolve("https://x.com/a/status/4", TWITTER);
        await resolver.resolve("https://x.com/a/status/5", TWITTER);

        expect(resolver.isCooling("vxtwitter.com")).toBe(false);
        expect(resolver.stats().health.find(h => h.domain === "vxtwitter.com")?.softStreak).toBe(2);
    });

    it("keeps soft-benching separate from hard-failure cooldown", async () => {
        const { resolver } = makeResolver(async url => (
            hostOf(url) === "vxtwitter.com" ? softError(url, "no metadata") : ok(url)
        ), { softStreakThreshold: 2, failureThreshold: 99 });

        await resolver.resolve("https://x.com/a/status/1", TWITTER);
        await resolver.resolve("https://x.com/a/status/2", TWITTER);

        const health = resolver.stats().health.find(h => h.domain === "vxtwitter.com")!;
        expect(health.failures).toBe(0);
        expect(health.softStreak).toBe(2);
        expect(resolver.isCooling("vxtwitter.com")).toBe(true);
    });
});
