import { describe, it, expect } from "vitest";
import {
    GLOBAL_STRIP_PARAMS,
    extractUrls,
    stripTrackingParams,
    rewriteUrl,
    rewriteMessageContent,
    type UrlMatch,
    type RewriteResult,
} from "../../../plugins/embedFix/urlRewriter";
import type { PlatformEntry } from "../../../plugins/embedFix/providerMap";

// Minimal platform stub for tests that need platform filtering
const MOCK_PLATFORMS: PlatformEntry[] = [
    {
        id: "twitter",
        label: "Twitter / X",
        domains: ["twitter.com", "x.com"],
        providers: [
            { domain: "vxtwitter.com", label: "VxTwitter" },
            { domain: "fxtwitter.com", label: "FxTwitter" },
        ],
        stripParams: ["s"],
    },
    {
        id: "reddit",
        label: "Reddit",
        domains: ["reddit.com"],
        providers: [
            { domain: "rxddit.com", label: "RxDdit" },
        ],
    },
];

describe("embedFix/urlRewriter", () => {
    // -------------------------------------------------------------------------
    // GLOBAL_STRIP_PARAMS
    // -------------------------------------------------------------------------
    describe("GLOBAL_STRIP_PARAMS", () => {
        it("contains common UTM tracking params", () => {
            expect(GLOBAL_STRIP_PARAMS).toContain("utm_source");
            expect(GLOBAL_STRIP_PARAMS).toContain("utm_medium");
            expect(GLOBAL_STRIP_PARAMS).toContain("utm_campaign");
            expect(GLOBAL_STRIP_PARAMS).toContain("utm_term");
            expect(GLOBAL_STRIP_PARAMS).toContain("utm_content");
        });

        it("contains social and ad tracking params", () => {
            expect(GLOBAL_STRIP_PARAMS).toContain("fbclid");
            expect(GLOBAL_STRIP_PARAMS).toContain("gclid");
            expect(GLOBAL_STRIP_PARAMS).toContain("si");
            expect(GLOBAL_STRIP_PARAMS).toContain("igshid");
            expect(GLOBAL_STRIP_PARAMS).toContain("ref");
        });

        it("contains misc tracking params", () => {
            expect(GLOBAL_STRIP_PARAMS).toContain("feature");
            expect(GLOBAL_STRIP_PARAMS).toContain("t");
            expect(GLOBAL_STRIP_PARAMS).toContain("share_id");
            expect(GLOBAL_STRIP_PARAMS).toContain("amp");
        });
    });

    // -------------------------------------------------------------------------
    // extractUrls
    // -------------------------------------------------------------------------
    describe("extractUrls", () => {
        it("finds a single URL and returns its offset", () => {
            const text = "Check out https://twitter.com/user/status/123 please";
            const results = extractUrls(text);
            expect(results).toHaveLength(1);
            expect(results[0].url).toBe("https://twitter.com/user/status/123");
            expect(results[0].offset).toBe(10); // "Check out ".length
        });

        it("finds multiple URLs in text", () => {
            const text = "https://twitter.com/a and https://reddit.com/r/test";
            const results = extractUrls(text);
            expect(results).toHaveLength(2);
            expect(results[0].url).toBe("https://twitter.com/a");
            expect(results[1].url).toBe("https://reddit.com/r/test");
        });

        it("returns empty array when no URLs present", () => {
            const results = extractUrls("just some plain text with no links");
            expect(results).toHaveLength(0);
        });

        it("correctly captures URLs with query params", () => {
            const text = "See https://twitter.com/user/status/123?s=20&utm_source=foo here";
            const results = extractUrls(text);
            expect(results).toHaveLength(1);
            expect(results[0].url).toContain("?s=20");
        });

        it("when platforms provided, only returns URLs matching a platform", () => {
            const text = "https://twitter.com/user https://youtube.com/watch?v=abc123";
            const results = extractUrls(text, MOCK_PLATFORMS);
            expect(results).toHaveLength(1);
            expect(results[0].url).toBe("https://twitter.com/user");
        });

        it("when platforms provided, does not match provider/embed domains", () => {
            // vxtwitter is a provider domain, not a source domain — should not be returned
            const text = "https://vxtwitter.com/user/status/123";
            const results = extractUrls(text, MOCK_PLATFORMS);
            expect(results).toHaveLength(0);
        });
    });

    // -------------------------------------------------------------------------
    // stripTrackingParams
    // -------------------------------------------------------------------------
    describe("stripTrackingParams", () => {
        it("strips global UTM params", () => {
            const url = "https://twitter.com/user/status/123?utm_source=test&utm_medium=social";
            const result = stripTrackingParams(url, []);
            expect(result).toBe("https://twitter.com/user/status/123");
        });

        it("preserves non-tracking params", () => {
            const url = "https://example.com/page?page=2&sort=asc&utm_source=foo";
            const result = stripTrackingParams(url, []);
            expect(result).toBe("https://example.com/page?page=2&sort=asc");
        });

        it("returns URL unchanged when no tracking params present", () => {
            const url = "https://twitter.com/user/status/123?lang=en";
            const result = stripTrackingParams(url, []);
            expect(result).toBe("https://twitter.com/user/status/123?lang=en");
        });

        it("strips platform-specific params in addition to global ones", () => {
            const url = "https://twitter.com/user/status/123?s=20&lang=en";
            const result = stripTrackingParams(url, ["s"]);
            expect(result).toBe("https://twitter.com/user/status/123?lang=en");
        });

        it("removes trailing ? when all params stripped", () => {
            const url = "https://twitter.com/user/status/123?utm_source=foo&si=abc";
            const result = stripTrackingParams(url, []);
            expect(result).toBe("https://twitter.com/user/status/123");
        });
    });

    // -------------------------------------------------------------------------
    // rewriteUrl
    // -------------------------------------------------------------------------
    describe("rewriteUrl", () => {
        it("swaps the hostname to the provider domain", () => {
            const result = rewriteUrl("https://twitter.com/user/status/123", "vxtwitter.com");
            expect(result).toBe("https://vxtwitter.com/user/status/123");
        });

        it("preserves path and fragment", () => {
            const result = rewriteUrl("https://reddit.com/r/test/comments/abc#comment-xyz", "rxddit.com");
            expect(result).toBe("https://rxddit.com/r/test/comments/abc#comment-xyz");
        });

        it("strips www from original domain when replacing", () => {
            const result = rewriteUrl("https://www.twitter.com/user/status/123", "vxtwitter.com");
            expect(result).toBe("https://vxtwitter.com/user/status/123");
        });

        it("preserves query params that survive after stripping", () => {
            const result = rewriteUrl("https://twitter.com/user/status/123?lang=en", "vxtwitter.com");
            expect(result).toBe("https://vxtwitter.com/user/status/123?lang=en");
        });
    });

    // -------------------------------------------------------------------------
    // rewriteMessageContent
    // -------------------------------------------------------------------------
    describe("rewriteMessageContent", () => {
        it("rewrites a single URL with a cached provider", () => {
            const content = "Check this: https://twitter.com/user/status/123";
            const getProvider = (_platformId: string) => ({ domain: "vxtwitter.com", label: "VxTwitter" });
            const enabledMap = { twitter: true };

            const result = rewriteMessageContent(content, MOCK_PLATFORMS, getProvider, enabledMap);

            expect(result.rewrites).toHaveLength(1);
            expect(result.rewrites[0].original).toBe("https://twitter.com/user/status/123");
            expect(result.rewrites[0].rewritten).toContain("vxtwitter.com");
            expect(result.rewrites[0].platformId).toBe("twitter");
            expect(result.content).toContain("vxtwitter.com");
            expect(result.cacheMisses).toHaveLength(0);
        });

        it("rewrites multiple URLs", () => {
            const content = "https://twitter.com/a/status/1 and https://reddit.com/r/test/comments/abc";
            const getProvider = (platformId: string) => {
                if (platformId === "twitter") return { domain: "vxtwitter.com", label: "VxTwitter" };
                if (platformId === "reddit") return { domain: "rxddit.com", label: "RxDdit" };
                return null;
            };
            const enabledMap = { twitter: true, reddit: true };

            const result = rewriteMessageContent(content, MOCK_PLATFORMS, getProvider, enabledMap);

            expect(result.rewrites).toHaveLength(2);
            expect(result.content).toContain("vxtwitter.com");
            expect(result.content).toContain("rxddit.com");
        });

        it("skips URLs for disabled platforms", () => {
            const content = "Check this: https://twitter.com/user/status/123";
            const getProvider = (_platformId: string) => ({ domain: "vxtwitter.com", label: "VxTwitter" });
            const enabledMap = { twitter: false };

            const result = rewriteMessageContent(content, MOCK_PLATFORMS, getProvider, enabledMap);

            expect(result.rewrites).toHaveLength(0);
            expect(result.cacheMisses).toHaveLength(0);
            // Content should be unchanged (though tracking params may still be stripped)
            expect(result.content).not.toContain("vxtwitter.com");
        });

        it("returns cache misses with correct offsets when provider not cached", () => {
            const content = "See https://twitter.com/user/status/123 here";
            const getProvider = (_platformId: string) => null; // cache miss
            const enabledMap = { twitter: true };

            const result = rewriteMessageContent(content, MOCK_PLATFORMS, getProvider, enabledMap);

            expect(result.rewrites).toHaveLength(0);
            expect(result.cacheMisses).toHaveLength(1);
            expect(result.cacheMisses[0].platformId).toBe("twitter");
            expect(result.cacheMisses[0].url).toBe("https://twitter.com/user/status/123");
            expect(typeof result.cacheMisses[0].offset).toBe("number");
        });

        it("strips tracking params before rewriting", () => {
            const content = "https://twitter.com/user/status/123?utm_source=discord&s=20";
            const getProvider = (_platformId: string) => ({ domain: "vxtwitter.com", label: "VxTwitter" });
            const enabledMap = { twitter: true };

            const result = rewriteMessageContent(content, MOCK_PLATFORMS, getProvider, enabledMap);

            expect(result.rewrites).toHaveLength(1);
            // Rewritten URL should not contain tracking params
            expect(result.rewrites[0].rewritten).not.toContain("utm_source");
            expect(result.rewrites[0].rewritten).not.toContain("s=20");
            expect(result.content).not.toContain("utm_source");
        });
    });
});
