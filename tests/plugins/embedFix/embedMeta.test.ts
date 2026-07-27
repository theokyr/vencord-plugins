import { describe, expect, it } from "vitest";

import {
    EmbedScore,
    shouldRetryWithAlternateAgent,
    decodeEntities,
    detectSoftError,
    emptyMeta,
    extractFirstMeta,
    extractMeta,
    extractOembedHref,
    finalizeMeta,
    isUsableMeta,
    parseEmbedHtml,
    scoreEmbedMeta,
    type EmbedMeta,
} from "../../../plugins/embedFix/embedMeta";

function meta(overrides: Partial<EmbedMeta> = {}): EmbedMeta {
    return { ...emptyMeta("https://vxtwitter.com/a/status/1"), ...overrides };
}

describe("embedFix/embedMeta — extractMeta", () => {
    it("reads content when it precedes the property attribute", () => {
        const html = `<meta content="Hello there" property="og:title">`;
        expect(extractMeta(html, "og:title")).toBe("Hello there");
    });

    it("reads name= as well as property=", () => {
        expect(extractMeta(`<meta name="twitter:title" content="Tweet">`, "twitter:title")).toBe("Tweet");
    });

    it("does not let og:image match og:image:width", () => {
        const html = `<meta property="og:image:width" content="1200"><meta property="og:image" content="https://cdn/x.jpg">`;
        expect(extractMeta(html, "og:image")).toBe("https://cdn/x.jpg");
    });

    it("treats an empty content attribute as absent", () => {
        expect(extractMeta(`<meta property="og:title" content="">`, "og:title")).toBeNull();
        expect(extractMeta(`<meta property="og:title" content="   ">`, "og:title")).toBeNull();
    });

    it("does not treat regex metacharacters in the property name as a pattern", () => {
        // "og.title" must not match "og:title"
        expect(extractMeta(`<meta property="og:title" content="X">`, "og.title")).toBeNull();
    });

    it("handles single quotes and extra attributes between property and content", () => {
        const html = `<meta data-rh='true' property='og:description' data-x='1' content='A description'>`;
        expect(extractMeta(html, "og:description")).toBe("A description");
    });

    it("decodes the entities providers actually emit", () => {
        const html = `<meta property="og:title" content="Tom &amp; Jerry &#8212; &quot;quoted&quot;">`;
        expect(extractMeta(html, "og:title")).toBe(`Tom & Jerry — "quoted"`);
    });

    it("leaves unknown entities alone rather than mangling them", () => {
        expect(decodeEntities("&notarealentity; &amp;")).toBe("&notarealentity; &");
    });

    it("returns the first non-empty key from a preference list", () => {
        const html = `<meta property="og:title" content=""><meta name="twitter:title" content="Second">`;
        expect(extractFirstMeta(html, ["og:title", "twitter:title"])).toBe("Second");
    });
});

describe("embedFix/embedMeta — oEmbed discovery", () => {
    it("finds the href in either attribute order", () => {
        expect(extractOembedHref(`<link type="application/json+oembed" href="/oembed?u=1">`)).toBe("/oembed?u=1");
        expect(extractOembedHref(`<link href="/oembed?u=2" type="application/json+oembed">`)).toBe("/oembed?u=2");
    });

    it("ignores the XML oembed variant", () => {
        expect(extractOembedHref(`<link type="text/xml+oembed" href="/oembed.xml">`)).toBeNull();
    });
});

describe("embedFix/embedMeta — parseEmbedHtml", () => {
    it("pulls a full video embed out of a provider page", () => {
        const html = `
            <head>
            <meta property="og:title" content="Cool video">
            <meta property="og:description" content="Look at this">
            <meta property="og:video" content="https://vxtwitter.com/v.mp4">
            <meta property="og:video:width" content="1280">
            <meta property="og:video:height" content="720">
            <meta property="og:site_name" content="vxTwitter">
            <meta property="theme-color" content="#1d9bf0">
            </head>`;
        const parsed = parseEmbedHtml(html, "https://vxtwitter.com/a/status/1");

        expect(parsed.videoUrl).toBe("https://vxtwitter.com/v.mp4");
        expect(parsed.videoWidth).toBe(1280);
        expect(parsed.videoHeight).toBe(720);
        expect(parsed.themeColor).toBe("#1d9bf0");
        expect(scoreEmbedMeta(parsed)).toBe(EmbedScore.MEDIA);
    });

    it("rejects nonsense dimensions instead of propagating NaN", () => {
        const html = `<meta property="og:video:width" content="not-a-number"><meta property="og:video:height" content="-5">`;
        const parsed = parseEmbedHtml(html, "https://p/x");
        expect(parsed.videoWidth).toBeNull();
        expect(parsed.videoHeight).toBeNull();
    });

    it("counts twitter:player as playable media", () => {
        const html = `<meta property="og:title" content="t"><meta name="twitter:player" content="https://p/embed">`;
        expect(scoreEmbedMeta(parseEmbedHtml(html, "https://p/x"))).toBe(EmbedScore.MEDIA);
    });

    it("produces an empty meta for a page with no tags at all", () => {
        const parsed = parseEmbedHtml("<head></head>", "https://p/x");
        expect(scoreEmbedMeta(parsed)).toBe(EmbedScore.NONE);
        expect(parsed.title).toBeNull();
    });
});

describe("embedFix/embedMeta — scoring", () => {
    it("ranks media above rich above image above title", () => {
        const media = meta({ title: "t", videoUrl: "https://v" });
        const rich = meta({ title: "t", description: "d", imageUrl: "https://i" });
        const image = meta({ title: "t", imageUrl: "https://i" });
        const title = meta({ title: "t" });

        expect(scoreEmbedMeta(media)).toBeGreaterThan(scoreEmbedMeta(rich));
        expect(scoreEmbedMeta(rich)).toBeGreaterThan(scoreEmbedMeta(image));
        expect(scoreEmbedMeta(image)).toBeGreaterThan(scoreEmbedMeta(title));
        expect(scoreEmbedMeta(title)).toBeGreaterThan(EmbedScore.NONE);
    });

    it("scores a hard error at zero no matter how rich the metadata looks", () => {
        expect(scoreEmbedMeta(meta({ title: "t", videoUrl: "https://v", error: "HTTP 500" }))).toBe(EmbedScore.NONE);
    });

    it("scores a soft error at zero — a live provider that cannot render this link is worthless for it", () => {
        expect(scoreEmbedMeta(meta({ title: "Not found", softError: "provider error page" }))).toBe(EmbedScore.NONE);
    });

    it("treats a description-only page as usable but weak", () => {
        expect(scoreEmbedMeta(meta({ description: "just a description" }))).toBe(EmbedScore.TITLE_ONLY);
    });

    it("isUsableMeta rejects errors, soft errors and empties", () => {
        expect(isUsableMeta(meta({ title: "t" }))).toBe(true);
        expect(isUsableMeta(meta({ title: "t", error: "boom" }))).toBe(false);
        expect(isUsableMeta(meta({ title: "t", softError: "nope" }))).toBe(false);
        expect(isUsableMeta(meta())).toBe(false);
        expect(isUsableMeta(null)).toBe(false);
    });
});

describe("embedFix/embedMeta — soft-error detection", () => {
    it("flags a provider error page that still sets og:title", () => {
        const soft = detectSoftError(meta({ title: "Tweet not found" }));
        expect(soft).toMatch(/provider error page/);
    });

    it("flags a bare page with no metadata whatsoever", () => {
        expect(detectSoftError(meta())).toBe("no metadata");
    });

    it("flags a provider that redirects back to the source platform", () => {
        const soft = detectSoftError(
            meta({
                url: "https://vxtwitter.com/a/status/1",
                finalUrl: "https://x.com/a/status/1",
                title: "A real tweet",
                imageUrl: "https://i",
            }),
            ["twitter.com", "x.com"],
        );
        expect(soft).toBe("redirected back to x.com");
    });

    it("does not flag a provider that redirects within its own domain", () => {
        expect(detectSoftError(
            meta({
                url: "https://vxtwitter.com/a/status/1",
                finalUrl: "https://vxtwitter.com/a/status/1/photo/1",
                title: "A real tweet",
                imageUrl: "https://i",
            }),
            ["twitter.com", "x.com"],
        )).toBeNull();
    });

    it("does not flag a real post that merely contains the word error", () => {
        expect(detectSoftError(meta({
            title: "@dev: shipped a fix for the 500 error today",
            imageUrl: "https://i",
        }))).toBeNull();
    });

    it("does not flag long prose that happens to say not found", () => {
        const long = "a".repeat(150) + " not found";
        expect(detectSoftError(meta({ title: "Real post", description: long }))).toBeNull();
    });

    it("flags a title that is only the provider's own brand name", () => {
        expect(detectSoftError(meta({ title: "vxTwitter", siteName: "vxTwitter" }))).toBe("provider landing page");
    });

    it("does not double-report when there is already a hard error", () => {
        expect(detectSoftError(meta({ error: "HTTP 502" }))).toBeNull();
    });

    it("finalizeMeta stamps softError onto the meta it is given", () => {
        const finalized = finalizeMeta(meta({ title: "429 Too Many Requests" }));
        expect(finalized.softError).toBeTruthy();
        expect(scoreEmbedMeta(finalized)).toBe(EmbedScore.NONE);
    });
});

describe("embedFix/embedMeta — crawler identity retry", () => {
    it("retries only when the page was completely empty", () => {
        expect(shouldRetryWithAlternateAgent(finalizeMeta(meta()))).toBe(true);
    });

    it("does not retry a page that produced real metadata", () => {
        expect(shouldRetryWithAlternateAgent(finalizeMeta(meta({ title: "A post", imageUrl: "https://i" })))).toBe(false);
    });

    it("does not retry a provider error page — that is a real answer", () => {
        expect(shouldRetryWithAlternateAgent(finalizeMeta(meta({ title: "Tweet not found" })))).toBe(false);
    });

    it("does not retry a hard HTTP error", () => {
        expect(shouldRetryWithAlternateAgent(meta({ error: "HTTP 503" }))).toBe(false);
    });
});

describe("embedFix/embedMeta — click-to-load video scoring", () => {
    it("never lets proxied video reach the top tier", () => {
        const onSight = meta({ title: "t", videoUrl: "https://v" });
        const onClick = meta({ title: "t", videoUrl: "https://v", videoNeedsProxy: true });

        expect(scoreEmbedMeta(onSight)).toBe(EmbedScore.MEDIA);
        expect(scoreEmbedMeta(onClick)).toBeLessThan(EmbedScore.MEDIA);
    });

    it("still counts proxied video as real content", () => {
        expect(scoreEmbedMeta(meta({ title: "t", videoUrl: "https://v", videoNeedsProxy: true })))
            .toBeGreaterThanOrEqual(EmbedScore.IMAGE);
    });

    it("ranks proxied video with a poster above one without", () => {
        const withPoster = meta({ title: "t", description: "d", imageUrl: "https://i", videoUrl: "https://v", videoNeedsProxy: true });
        const without = meta({ title: "t", videoUrl: "https://v", videoNeedsProxy: true });

        expect(scoreEmbedMeta(withPoster)).toBeGreaterThan(scoreEmbedMeta(without));
    });

    it("loses to a native embed that simply plays", () => {
        // MEDIA is what scoreNativeEmbed gives an embed with a playable video.
        expect(scoreEmbedMeta(meta({ title: "t", videoUrl: "https://v", videoNeedsProxy: true })))
            .toBeLessThan(EmbedScore.MEDIA);
    });
});
