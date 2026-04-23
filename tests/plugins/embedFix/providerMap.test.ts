import { describe, it, expect } from "vitest";
import {
    DEFAULT_PLATFORMS,
    matchPlatform,
    mergeUserOverrides,
    type PlatformEntry,
} from "../../../plugins/embedFix/providerMap";

describe("embedFix/providerMap", () => {
    describe("DEFAULT_PLATFORMS", () => {
        it("has exactly 7 entries", () => {
            expect(DEFAULT_PLATFORMS).toHaveLength(7);
        });

        it("each platform has at least 1 provider", () => {
            for (const platform of DEFAULT_PLATFORMS) {
                expect(platform.providers.length).toBeGreaterThanOrEqual(1);
            }
        });

        it("contains expected platform ids", () => {
            const ids = DEFAULT_PLATFORMS.map(p => p.id);
            expect(ids).toContain("twitter");
            expect(ids).toContain("reddit");
            expect(ids).toContain("instagram");
            expect(ids).toContain("tiktok");
            expect(ids).toContain("pixiv");
            expect(ids).toContain("bluesky");
            expect(ids).toContain("threads");
        });
    });

    describe("matchPlatform", () => {
        it("matches exact domain (twitter.com)", () => {
            const result = matchPlatform("https://twitter.com/user/status/123");
            expect(result).not.toBeNull();
            expect(result!.id).toBe("twitter");
        });

        it("matches www subdomain (www.twitter.com)", () => {
            const result = matchPlatform("https://www.twitter.com/user/status/123");
            expect(result).not.toBeNull();
            expect(result!.id).toBe("twitter");
        });

        it("matches m subdomain (m.reddit.com)", () => {
            const result = matchPlatform("https://m.reddit.com/r/test/comments/abc");
            expect(result).not.toBeNull();
            expect(result!.id).toBe("reddit");
        });

        it("matches old subdomain (old.reddit.com)", () => {
            const result = matchPlatform("https://old.reddit.com/r/test/comments/abc");
            expect(result).not.toBeNull();
            expect(result!.id).toBe("reddit");
        });

        it("matches x.com as twitter", () => {
            const result = matchPlatform("https://x.com/user/status/456");
            expect(result).not.toBeNull();
            expect(result!.id).toBe("twitter");
        });

        it("returns null for non-matching domain", () => {
            const result = matchPlatform("https://youtube.com/watch?v=abc123");
            expect(result).toBeNull();
        });

        it("returns null for invalid URL", () => {
            const result = matchPlatform("not-a-url");
            expect(result).toBeNull();
        });

        it("returns null for provider domains (no double-rewrite)", () => {
            // vxtwitter is already an embed-friendly provider domain
            const result = matchPlatform("https://vxtwitter.com/user/status/123");
            expect(result).toBeNull();
        });

        it("returns null for another provider domain (ddinstagram)", () => {
            const result = matchPlatform("https://ddinstagram.com/p/abc");
            expect(result).toBeNull();
        });
    });

    describe("mergeUserOverrides", () => {
        it("returns defaults on empty string", () => {
            const result = mergeUserOverrides(DEFAULT_PLATFORMS, "");
            expect(result).toEqual(DEFAULT_PLATFORMS);
        });

        it("returns defaults on invalid JSON", () => {
            const result = mergeUserOverrides(DEFAULT_PLATFORMS, "{ not valid json");
            expect(result).toEqual(DEFAULT_PLATFORMS);
        });

        it("adds a custom platform from override JSON", () => {
            const customPlatform: PlatformEntry = {
                id: "mastodon",
                label: "Mastodon",
                domains: ["mastodon.social"],
                providers: [{ domain: "mastofx.social", label: "MastoFX" }],
            };
            const result = mergeUserOverrides(DEFAULT_PLATFORMS, JSON.stringify([customPlatform]));
            expect(result.length).toBe(DEFAULT_PLATFORMS.length + 1);
            const found = result.find(p => p.id === "mastodon");
            expect(found).not.toBeUndefined();
            expect(found!.providers[0].domain).toBe("mastofx.social");
        });

        it("overrides provider order for existing platform", () => {
            const twitterOverride: PlatformEntry = {
                id: "twitter",
                label: "Twitter / X",
                domains: ["twitter.com", "x.com"],
                providers: [
                    { domain: "fxtwitter.com", label: "FxTwitter" },
                    { domain: "vxtwitter.com", label: "VxTwitter" },
                ],
            };
            const result = mergeUserOverrides(DEFAULT_PLATFORMS, JSON.stringify([twitterOverride]));
            // Total count stays the same (replaced, not added)
            expect(result.length).toBe(DEFAULT_PLATFORMS.length);
            const twitter = result.find(p => p.id === "twitter");
            expect(twitter).not.toBeUndefined();
            // First provider is now fxtwitter
            expect(twitter!.providers[0].domain).toBe("fxtwitter.com");
        });
    });
});
