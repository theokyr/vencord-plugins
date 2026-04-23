import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProbeCache, type ProbeResult, type CacheEntry } from "../../../plugins/embedFix/probeCache";

const HOUR_MS = 60 * 60 * 1000;

function makeResults(entries: Array<{ domain: string; score: number }>): ProbeResult[] {
    return entries.map(({ domain, score }) => ({
        domain,
        score,
        hasVideo: false,
        hasAudio: false,
        hasImage: false,
        hasTitle: false,
    }));
}

describe("embedFix/ProbeCache", () => {
    let mockSave: ReturnType<typeof vi.fn>;
    let cache: ProbeCache;

    beforeEach(() => {
        mockSave = vi.fn();
        cache = new ProbeCache(24, mockSave);
    });

    // -------------------------------------------------------------------------
    // get
    // -------------------------------------------------------------------------
    describe("get", () => {
        it("returns null on empty cache", () => {
            expect(cache.get("twitter")).toBeNull();
        });

        it("returns cached provider domain after set", () => {
            const results = makeResults([
                { domain: "vxtwitter.com", score: 3 },
                { domain: "fxtwitter.com", score: 1 },
            ]);
            cache.set("twitter", results, "/status/123");
            expect(cache.get("twitter")).toBe("vxtwitter.com");
        });

        it("returns null for expired entry (probedAt 25 hours ago)", () => {
            const results = makeResults([{ domain: "vxtwitter.com", score: 3 }]);
            cache.set("twitter", results, "/status/123");

            // Manually age the entry by 25 hours
            const entry = cache.getEntry("twitter")!;
            (entry as any).probedAt = Date.now() - 25 * HOUR_MS;

            expect(cache.get("twitter")).toBeNull();
        });
    });

    // -------------------------------------------------------------------------
    // set
    // -------------------------------------------------------------------------
    describe("set", () => {
        it("stores entry and calls save", () => {
            const results = makeResults([{ domain: "vxtwitter.com", score: 2 }]);
            cache.set("twitter", results, "/status/123");

            expect(mockSave).toHaveBeenCalledOnce();
            const entry = cache.getEntry("twitter");
            expect(entry).toBeDefined();
            expect(entry!.platform).toBe("twitter");
            expect(entry!.testPath).toBe("/status/123");
        });

        it("picks highest-scoring provider as bestProvider", () => {
            const results = makeResults([
                { domain: "low.com", score: 1 },
                { domain: "high.com", score: 5 },
                { domain: "mid.com", score: 3 },
            ]);
            cache.set("twitter", results, "/status/123");

            const entry = cache.getEntry("twitter")!;
            expect(entry.bestProvider).toBe("high.com");
        });

        it("returns null bestProvider if all scores are 0", () => {
            const results = makeResults([
                { domain: "a.com", score: 0 },
                { domain: "b.com", score: 0 },
            ]);
            cache.set("twitter", results, "/status/123");

            const entry = cache.getEntry("twitter")!;
            expect(entry.bestProvider).toBeNull();
            expect(cache.get("twitter")).toBeNull();
        });
    });

    // -------------------------------------------------------------------------
    // flush
    // -------------------------------------------------------------------------
    describe("flush", () => {
        it("clears all entries and calls save", () => {
            cache.set("twitter", makeResults([{ domain: "vxtwitter.com", score: 2 }]), "/s/1");
            cache.set("reddit", makeResults([{ domain: "vxreddit.com", score: 3 }]), "/r/test");

            mockSave.mockClear();
            cache.flush();

            expect(cache.get("twitter")).toBeNull();
            expect(cache.get("reddit")).toBeNull();
            expect(mockSave).toHaveBeenCalledOnce();
        });
    });

    // -------------------------------------------------------------------------
    // serialize / restore
    // -------------------------------------------------------------------------
    describe("serialize/restore", () => {
        it("round-trips through JSON", () => {
            const results = makeResults([{ domain: "vxtwitter.com", score: 4 }]);
            cache.set("twitter", results, "/status/42");

            const json = cache.serialize();
            const cache2 = new ProbeCache(24, vi.fn());
            cache2.restore(json);

            expect(cache2.get("twitter")).toBe("vxtwitter.com");
            const entry = cache2.getEntry("twitter")!;
            expect(entry.testPath).toBe("/status/42");
        });

        it("handles empty string restore (leaves cache empty)", () => {
            cache.restore("");
            expect(cache.get("twitter")).toBeNull();
        });

        it("handles invalid JSON restore (leaves cache empty)", () => {
            cache.restore("{ this is not valid json ]]]");
            expect(cache.get("twitter")).toBeNull();
        });
    });

    // -------------------------------------------------------------------------
    // getAllScores
    // -------------------------------------------------------------------------
    describe("getAllScores", () => {
        it("returns scores map for a platform", () => {
            const results = makeResults([
                { domain: "vxtwitter.com", score: 3 },
                { domain: "fxtwitter.com", score: 1 },
                { domain: "xcancel.com", score: 2 },
            ]);
            cache.set("twitter", results, "/status/123");

            const scores = cache.getAllScores("twitter");
            expect(scores).toEqual({
                "vxtwitter.com": 3,
                "fxtwitter.com": 1,
                "xcancel.com": 2,
            });
        });

        it("returns empty object for unknown platform", () => {
            expect(cache.getAllScores("unknown")).toEqual({});
        });
    });

    // -------------------------------------------------------------------------
    // setTTL
    // -------------------------------------------------------------------------
    describe("setTTL", () => {
        it("updates TTL so previously-valid entries expire under new shorter TTL", () => {
            const results = makeResults([{ domain: "vxtwitter.com", score: 3 }]);
            cache.set("twitter", results, "/status/123");

            // Age entry by 2 hours — still valid at 24h TTL
            const entry = cache.getEntry("twitter")!;
            (entry as any).probedAt = Date.now() - 2 * HOUR_MS;
            expect(cache.get("twitter")).toBe("vxtwitter.com");

            // Reduce TTL to 1 hour — now expired
            cache.setTTL(1);
            expect(cache.get("twitter")).toBeNull();
        });
    });
});
