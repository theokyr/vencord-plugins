import { describe, expect, it } from "vitest";

import { emptyMeta, type EmbedMeta } from "../../../plugins/embedFix/embedMeta";
import {
    findCandidateLinks,
    matchEmbedToCandidate,
    planIncomingMessage,
    scoreNativeEmbed,
    type LinkState,
    type NativeEmbedLike,
} from "../../../plugins/embedFix/incomingPlan";
import { DEFAULT_PLATFORMS } from "../../../plugins/embedFix/providerMap";
import { canonicalUrlKey } from "../../../plugins/embedFix/urlRewriter";

const PLATFORMS = DEFAULT_PLATFORMS;

function resolved(providerUrl: string, overrides: Partial<EmbedMeta> = {}): LinkState {
    return {
        status: "resolved",
        providerDomain: new URL(providerUrl).hostname,
        providerUrl,
        meta: {
            ...emptyMeta(providerUrl),
            title: "A post",
            imageUrl: "https://cdn/i.jpg",
            videoUrl: "https://cdn/v.mp4",
            ...overrides,
        },
    };
}

function states(entries: Record<string, LinkState>): Map<string, LinkState> {
    return new Map(Object.entries(entries).map(([url, state]) => [canonicalUrlKey(url), state]));
}

describe("embedFix/incomingPlan — candidate discovery", () => {
    it("finds supported links and ignores everything else", () => {
        const content = "look https://x.com/a/status/1 and https://example.com/page and https://reddit.com/r/x/comments/1/t/";
        const candidates = findCandidateLinks(content, PLATFORMS);

        expect(candidates.map(c => c.platform.id)).toEqual(["twitter", "reddit"]);
    });

    it("strips tracking params into cleanUrl but keeps the original verbatim", () => {
        const [candidate] = findCandidateLinks("https://x.com/a/status/1?s=20&t=abc&lang=en", PLATFORMS);

        expect(candidate.original).toBe("https://x.com/a/status/1?s=20&t=abc&lang=en");
        expect(candidate.cleanUrl).toBe("https://x.com/a/status/1?lang=en");
    });

    it("deduplicates the same link posted twice", () => {
        const candidates = findCandidateLinks(
            "https://x.com/a/status/1 again https://www.x.com/a/status/1/",
            PLATFORMS,
        );
        expect(candidates).toHaveLength(1);
    });

    it("marks an already-rewritten link as a provider link", () => {
        const [candidate] = findCandidateLinks("https://vxtwitter.com/a/status/1", PLATFORMS);

        expect(candidate.isProviderLink).toBe(true);
        expect(candidate.platform.id).toBe("twitter");
    });

    it("does not choke on malformed or partial URLs", () => {
        expect(findCandidateLinks("https:// x.com http://[bad", PLATFORMS)).toHaveLength(0);
    });

    it("ignores bare domains and home pages — there is no post to embed", () => {
        expect(findCandidateLinks("https://x.com https://reddit.com/ https://bsky.app", PLATFORMS)).toHaveLength(0);
    });

    it("handles trailing punctuation the way a reader would", () => {
        const [candidate] = findCandidateLinks("see https://x.com/a/status/1.", PLATFORMS);
        expect(candidate.original).toBe("https://x.com/a/status/1");
    });
});

describe("embedFix/incomingPlan — the core invariant", () => {
    const content = "https://x.com/a/status/1";
    const nativeEmbed: NativeEmbedLike = {
        url: "https://x.com/a/status/1",
        rawTitle: "Someone on X",
        rawDescription: "text only",
    };

    it("NEVER hides Discord's embed while the lookup is still pending", () => {
        const plan = planIncomingMessage({
            content,
            embeds: [nativeEmbed],
            platforms: PLATFORMS,
            states: states({ "https://x.com/a/status/1": { status: "pending" } }),
        });

        expect(plan.suppress).toEqual([]);
        expect(plan.render).toEqual([]);
    });

    it("NEVER hides Discord's embed when no provider could render the link", () => {
        const plan = planIncomingMessage({
            content,
            embeds: [nativeEmbed],
            platforms: PLATFORMS,
            states: states({ "https://x.com/a/status/1": { status: "unresolved" } }),
        });

        expect(plan.suppress).toEqual([]);
        expect(plan.render).toEqual([]);
    });

    it("NEVER hides Discord's embed before the link has even been looked at", () => {
        const plan = planIncomingMessage({
            content,
            embeds: [nativeEmbed],
            platforms: PLATFORMS,
            states: new Map(),
        });

        expect(plan.suppress).toEqual([]);
        expect(plan.needsResolution.map(c => c.original)).toEqual(["https://x.com/a/status/1"]);
    });

    it("hides Discord's embed only once a better replacement exists", () => {
        const plan = planIncomingMessage({
            content,
            embeds: [nativeEmbed],
            platforms: PLATFORMS,
            states: states({ "https://x.com/a/status/1": resolved("https://vxtwitter.com/a/status/1") }),
        });

        expect(plan.render).toHaveLength(1);
        expect(plan.render[0].reason).toBe("better-than-native");
        expect(plan.suppress).toEqual([{ index: 0, url: "https://x.com/a/status/1", reason: "replaced" }]);
    });

    it("renders a replacement when Discord produced no embed at all", () => {
        const plan = planIncomingMessage({
            content,
            embeds: [],
            platforms: PLATFORMS,
            states: states({ "https://x.com/a/status/1": resolved("https://vxtwitter.com/a/status/1") }),
        });

        expect(plan.render[0].reason).toBe("no-native-embed");
        expect(plan.suppress).toEqual([]);
    });

    it("refuses to render a resolution whose metadata is empty", () => {
        const state: LinkState = {
            status: "resolved",
            providerDomain: "vxtwitter.com",
            providerUrl: "https://vxtwitter.com/a/status/1",
            meta: emptyMeta("https://vxtwitter.com/a/status/1"),
        };
        const plan = planIncomingMessage({
            content,
            embeds: [nativeEmbed],
            platforms: PLATFORMS,
            states: states({ "https://x.com/a/status/1": state }),
        });

        expect(plan.render).toEqual([]);
        expect(plan.suppress).toEqual([]);
    });
});

describe("embedFix/incomingPlan — leaving good embeds alone", () => {
    it("skips only a genuine downgrade — Discord has media the provider could not get", () => {
        const richNative: NativeEmbedLike = {
            url: "https://reddit.com/r/x/comments/1/t/",
            rawTitle: "Title",
            rawDescription: "Description",
            image: { url: "https://i" },
            video: { url: "https://v" },
        };

        const plan = planIncomingMessage({
            content: "https://reddit.com/r/x/comments/1/t/",
            embeds: [richNative],
            platforms: PLATFORMS,
            states: states({
                // Provider managed only a bare title — replacing would lose the video.
                "https://reddit.com/r/x/comments/1/t/": resolved("https://vxreddit.com/r/x/comments/1/t/", { videoUrl: null, imageUrl: null, description: null }),
            }),
        });

        expect(plan.render).toEqual([]);
        expect(plan.suppress).toEqual([]);
    });

    it("replaces on a tie — the user picked the provider, and requiring a strict win meant doing nothing", () => {
        // The reported case: a photo tweet where Discord and the provider both
        // produce title + description + image.
        const nativeTie: NativeEmbedLike = {
            url: "https://x.com/a/status/1",
            rawTitle: "Someone on X",
            rawDescription: "post text",
            image: { url: "https://pbs.twimg.com/media/x.jpg" },
        };

        const plan = planIncomingMessage({
            content: "https://x.com/a/status/1",
            embeds: [nativeTie],
            platforms: PLATFORMS,
            states: states({
                "https://x.com/a/status/1": resolved("https://vxtwitter.com/a/status/1", {
                    videoUrl: null,
                    description: "post text",
                }),
            }),
        });

        expect(plan.render).toHaveLength(1);
        expect(plan.suppress).toEqual([{ index: 0, url: "https://x.com/a/status/1", reason: "replaced" }]);
    });

    it("replaces a reddit link whose native embed matches ours field for field", () => {
        const plan = planIncomingMessage({
            content: "https://reddit.com/r/x/comments/1/t/",
            embeds: [{
                url: "https://reddit.com/r/x/comments/1/t/",
                rawTitle: "A post",
                rawDescription: "body",
                image: { url: "https://i" },
            }],
            platforms: PLATFORMS,
            states: states({
                "https://reddit.com/r/x/comments/1/t/": resolved("https://vxreddit.com/r/x/comments/1/t/", {
                    videoUrl: null,
                    description: "body",
                }),
            }),
        });

        expect(plan.render).toHaveLength(1);
    });

    it("replaces a good native embed anyway when the user turns the guard off", () => {
        const richNative: NativeEmbedLike = {
            url: "https://reddit.com/r/x/comments/1/t/",
            rawTitle: "Title",
            image: { url: "https://i" },
            video: { url: "https://v" },
        };

        const plan = planIncomingMessage({
            content: "https://reddit.com/r/x/comments/1/t/",
            embeds: [richNative],
            platforms: PLATFORMS,
            replaceOnlyWhenBetter: false,
            states: states({
                "https://reddit.com/r/x/comments/1/t/": resolved("https://vxreddit.com/r/x/comments/1/t/", { videoUrl: null, imageUrl: null, description: null }),
            }),
        });

        expect(plan.render).toHaveLength(1);
        expect(plan.suppress[0].reason).toBe("replaced");
    });

    it("ignores links the sender already rewrote themselves", () => {
        const plan = planIncomingMessage({
            content: "https://vxtwitter.com/a/status/1",
            embeds: [{ url: "https://vxtwitter.com/a/status/1", rawTitle: "t", video: {} }],
            platforms: PLATFORMS,
            states: new Map(),
        });

        expect(plan.needsResolution).toEqual([]);
        expect(plan.render).toEqual([]);
        expect(plan.suppress).toEqual([]);
    });
});

describe("embedFix/incomingPlan — stale embeds", () => {
    it("leaves a leftover embed for the SAME post alone after our own rewrite", () => {
        // Content now says vxtwitter; Discord's embed is the one it made for the
        // original x.com link. Same post, so hiding it risks leaving the message
        // with nothing while Discord re-scrapes. In practice Discord replaces
        // the whole embeds array on edit, so this barely arises.
        const plan = planIncomingMessage({
            content: "https://vxtwitter.com/a/status/1",
            embeds: [{ url: "https://x.com/a/status/1", rawTitle: "leftover" }],
            platforms: PLATFORMS,
            states: new Map(),
        });

        expect(plan.suppress).toEqual([]);
    });

    it("hides a leftover embed for a DIFFERENT post that is no longer linked", () => {
        const plan = planIncomingMessage({
            content: "https://vxtwitter.com/a/status/1",
            embeds: [{ url: "https://x.com/someoneelse/status/999", rawTitle: "stale" }],
            platforms: PLATFORMS,
            states: new Map(),
        });

        expect(plan.suppress).toEqual([{ index: 0, url: "https://x.com/someoneelse/status/999", reason: "stale" }]);
    });

    it("does not call an embed stale just because tracking params were stripped", () => {
        const plan = planIncomingMessage({
            content: "https://x.com/a/status/1?s=20",
            embeds: [{ url: "https://x.com/a/status/1", rawTitle: "fine" }],
            platforms: PLATFORMS,
            states: new Map(),
        });

        expect(plan.suppress).toEqual([]);
    });

    it("never touches embeds for platforms it does not handle", () => {
        const plan = planIncomingMessage({
            content: "https://vxtwitter.com/a/status/1",
            embeds: [
                { url: "https://youtube.com/watch?v=1", rawTitle: "a video" },
                { url: "https://github.com/a/b", rawTitle: "a repo" },
            ],
            platforms: PLATFORMS,
            states: new Map(),
        });

        expect(plan.suppress).toEqual([]);
    });

    it("leaves an unattributable embed alone", () => {
        const plan = planIncomingMessage({
            content: "https://x.com/a/status/1",
            embeds: [{ rawTitle: "no url at all" }],
            platforms: PLATFORMS,
            states: states({ "https://x.com/a/status/1": resolved("https://vxtwitter.com/a/status/1") }),
        });

        expect(plan.suppress).toEqual([]);
    });
});

describe("embedFix/incomingPlan — multiple links", () => {
    const content = [
        "https://x.com/a/status/1",
        "https://x.com/b/status/2",
        "https://reddit.com/r/x/comments/3/t/",
    ].join(" ");

    const embeds: NativeEmbedLike[] = [
        { url: "https://reddit.com/r/x/comments/3/t/", rawTitle: "reddit" },
        { url: "https://x.com/b/status/2", rawTitle: "second tweet" },
        { url: "https://x.com/a/status/1", rawTitle: "first tweet" },
    ];

    it("pairs embeds with links by URL, not by array position", () => {
        const plan = planIncomingMessage({
            content,
            embeds,
            platforms: PLATFORMS,
            states: states({ "https://x.com/b/status/2": resolved("https://vxtwitter.com/b/status/2") }),
        });

        expect(plan.render.map(item => item.sourceUrl)).toEqual(["https://x.com/b/status/2"]);
        expect(plan.suppress).toEqual([{ index: 1, url: "https://x.com/b/status/2", reason: "replaced" }]);
    });

    it("handles one link resolving while another fails and a third is still pending", () => {
        const plan = planIncomingMessage({
            content,
            embeds,
            platforms: PLATFORMS,
            states: states({
                "https://x.com/a/status/1": resolved("https://vxtwitter.com/a/status/1"),
                "https://x.com/b/status/2": { status: "unresolved" },
                "https://reddit.com/r/x/comments/3/t/": { status: "pending" },
            }),
        });

        expect(plan.render.map(item => item.sourceUrl)).toEqual(["https://x.com/a/status/1"]);
        expect(plan.suppress.map(target => target.url)).toEqual(["https://x.com/a/status/1"]);
        expect(plan.needsResolution).toEqual([]);
    });

    it("reports only the links that have never been looked at", () => {
        const plan = planIncomingMessage({
            content,
            embeds,
            platforms: PLATFORMS,
            states: states({ "https://x.com/a/status/1": { status: "pending" } }),
        });

        expect(plan.needsResolution.map(c => c.original)).toEqual([
            "https://x.com/b/status/2",
            "https://reddit.com/r/x/comments/3/t/",
        ]);
    });

    it("does not let one platform's embed suppress another platform's link", () => {
        const plan = planIncomingMessage({
            content,
            embeds,
            platforms: PLATFORMS,
            states: states({ "https://reddit.com/r/x/comments/3/t/": resolved("https://vxreddit.com/r/x/comments/3/t/") }),
        });

        expect(plan.suppress).toEqual([{ index: 0, url: "https://reddit.com/r/x/comments/3/t/", reason: "replaced" }]);
    });
});

describe("embedFix/incomingPlan — embed matching", () => {
    it("matches on host and path, ignoring query noise on either side", () => {
        const candidates = findCandidateLinks("https://x.com/a/status/1?s=20", PLATFORMS);
        const match = matchEmbedToCandidate({ url: "https://twitter.com/a/status/1" }, candidates);
        // Different host (twitter.com vs x.com) — falls back to the single
        // candidate on that platform.
        expect(match?.original).toBe("https://x.com/a/status/1?s=20");
    });

    it("pairs x.com links with the twitter.com embed Discord actually returns", () => {
        // Observed live: Discord rewrites the host on the embed it hands back.
        const candidates = findCandidateLinks("https://x.com/a/status/123", PLATFORMS);
        const match = matchEmbedToCandidate({ url: "https://twitter.com/a/status/123" }, candidates);

        expect(match?.original).toBe("https://x.com/a/status/123");
    });

    it("still pairs correctly when TWO x.com links make the host fallback ambiguous", () => {
        const candidates = findCandidateLinks(
            "https://x.com/a/status/111 https://x.com/b/status/222",
            PLATFORMS,
        );

        expect(matchEmbedToCandidate({ url: "https://twitter.com/a/status/111" }, candidates)?.original)
            .toBe("https://x.com/a/status/111");
        expect(matchEmbedToCandidate({ url: "https://twitter.com/b/status/222" }, candidates)?.original)
            .toBe("https://x.com/b/status/222");
    });

    it("suppresses both native embeds when a message has two x.com links", () => {
        const plan = planIncomingMessage({
            content: "https://x.com/a/status/111 https://x.com/b/status/222",
            embeds: [
                { url: "https://twitter.com/a/status/111", rawTitle: "one" },
                { url: "https://twitter.com/b/status/222", rawTitle: "two" },
            ],
            platforms: PLATFORMS,
            states: states({
                "https://x.com/a/status/111": resolved("https://vxtwitter.com/a/status/111"),
                "https://x.com/b/status/222": resolved("https://vxtwitter.com/b/status/222"),
            }),
        });

        expect(plan.render).toHaveLength(2);
        expect(plan.suppress.map(t => t.reason)).toEqual(["replaced", "replaced"]);
    });

    it("does not cross-pair a matching path on an unrelated platform", () => {
        const candidates = findCandidateLinks("https://x.com/a/status/123", PLATFORMS);
        const match = matchEmbedToCandidate({ url: "https://reddit.com/a/status/123" }, candidates);

        expect(match).toBeNull();
    });

    it("refuses the host fallback when two links on the same platform are ambiguous", () => {
        const candidates = findCandidateLinks("https://x.com/a/status/1 https://x.com/b/status/2", PLATFORMS);
        const match = matchEmbedToCandidate({ url: "https://x.com/someone/else" }, candidates);
        expect(match).toBeNull();
    });

    it("matches an exact path even when two links are on the same platform", () => {
        const candidates = findCandidateLinks("https://x.com/a/status/1 https://x.com/b/status/2", PLATFORMS);
        const match = matchEmbedToCandidate({ url: "https://x.com/b/status/2" }, candidates);
        expect(match?.original).toBe("https://x.com/b/status/2");
    });
});

describe("embedFix/incomingPlan — native embed scoring", () => {
    it("orders native embeds on the same scale as provider metadata", () => {
        expect(scoreNativeEmbed({ rawTitle: "t", video: {} })).toBeGreaterThan(
            scoreNativeEmbed({ rawTitle: "t", rawDescription: "d", image: {} }),
        );
        expect(scoreNativeEmbed({ rawTitle: "t", rawDescription: "d", image: {} })).toBeGreaterThan(
            scoreNativeEmbed({ rawTitle: "t", image: {} }),
        );
        expect(scoreNativeEmbed({ rawTitle: "t" })).toBe(1);
        expect(scoreNativeEmbed({})).toBe(0);
        expect(scoreNativeEmbed(undefined)).toBe(0);
    });

    it("counts a gifv embed as playable media", () => {
        expect(scoreNativeEmbed({ type: "gifv", rawTitle: "t" })).toBe(4);
    });

    it("counts a thumbnail as an image", () => {
        expect(scoreNativeEmbed({ rawTitle: "t", thumbnail: { url: "https://i" } })).toBe(2);
    });
});

describe("embedFix/incomingPlan — hostile input", () => {
    it("survives a message with no content and no embeds", () => {
        const plan = planIncomingMessage({ content: "", embeds: null, platforms: PLATFORMS, states: new Map() });
        expect(plan).toMatchObject({ render: [], suppress: [], needsResolution: [], candidates: [] });
    });

    it("accepts a plain object instead of a Map for states", () => {
        const plan = planIncomingMessage({
            content: "https://x.com/a/status/1",
            embeds: [],
            platforms: PLATFORMS,
            states: { [canonicalUrlKey("https://x.com/a/status/1")]: resolved("https://vxtwitter.com/a/status/1") },
        });
        expect(plan.render).toHaveLength(1);
    });

    it("is not fooled by a lookalike domain", () => {
        expect(findCandidateLinks("https://x.com.evil.tld/a/status/1", PLATFORMS)).toHaveLength(0);
        expect(findCandidateLinks("https://notx.com/a/status/1", PLATFORMS)).toHaveLength(0);
    });

    it("does not suppress on a spoofed embed pointing at a different platform than the link", () => {
        const plan = planIncomingMessage({
            content: "https://x.com/a/status/1",
            embeds: [{ url: "https://reddit.com/r/evil/comments/1/x/", rawTitle: "unrelated" }],
            platforms: PLATFORMS,
            states: states({ "https://x.com/a/status/1": resolved("https://vxtwitter.com/a/status/1") }),
        });

        // The reddit embed is not in the message, so it is stale — but it is
        // never marked "replaced" by the twitter link.
        expect(plan.suppress.every(target => target.reason === "stale")).toBe(true);
        expect(plan.render).toHaveLength(1);
    });

    it("handles a huge message without quadratic blowup", () => {
        const content = Array.from({ length: 200 }, (_, i) => `https://x.com/a/status/${i}`).join(" ");
        const started = Date.now();
        const plan = planIncomingMessage({ content, embeds: [], platforms: PLATFORMS, states: new Map() });

        expect(plan.candidates).toHaveLength(200);
        expect(Date.now() - started).toBeLessThan(500);
    });
});

describe("embedFix/incomingPlan — the invariant, across Discord's host rewriting", () => {
    // Discord returns twitter.com for an x.com link. Pairing handles that for
    // replacement; the stale rule must not then hide the same embed just
    // because the hosts differ, or a pending link loses its embed entirely.
    const content = "https://x.com/a/status/1";
    const discordEmbed: NativeEmbedLike = { url: "https://twitter.com/a/status/1", rawTitle: "A tweet", image: { url: "https://p" } };

    it("does not hide a cross-host embed while the lookup is pending", () => {
        const plan = planIncomingMessage({
            content, embeds: [discordEmbed], platforms: PLATFORMS,
            states: states({ "https://x.com/a/status/1": { status: "pending" } }),
        });

        expect(plan.suppress).toEqual([]);
    });

    it("does not hide a cross-host embed when no provider worked", () => {
        const plan = planIncomingMessage({
            content, embeds: [discordEmbed], platforms: PLATFORMS,
            states: states({ "https://x.com/a/status/1": { status: "unresolved" } }),
        });

        expect(plan.suppress).toEqual([]);
    });

    it("does not hide a cross-host embed that simply outranks ours", () => {
        const plan = planIncomingMessage({
            content,
            embeds: [{ ...discordEmbed, rawDescription: "d", video: { url: "https://v" } }],
            platforms: PLATFORMS,
            states: states({
                "https://x.com/a/status/1": resolved("https://vxtwitter.com/a/status/1", { videoUrl: null, imageUrl: null, description: null }),
            }),
        });

        expect(plan.render).toEqual([]);
        expect(plan.suppress).toEqual([]);
    });

    it("still hides it once we have a replacement", () => {
        const plan = planIncomingMessage({
            content, embeds: [discordEmbed], platforms: PLATFORMS,
            states: states({ "https://x.com/a/status/1": resolved("https://vxtwitter.com/a/status/1") }),
        });

        expect(plan.suppress).toEqual([{ index: 0, url: "https://twitter.com/a/status/1", reason: "replaced" }]);
    });

    it("never hides more embeds than it renders replacements, for any state", () => {
        const linkStates: LinkState[] = [
            { status: "pending" },
            { status: "unresolved" },
            resolved("https://vxtwitter.com/a/status/1"),
        ];

        for (const state of linkStates) {
            const plan = planIncomingMessage({
                content, embeds: [discordEmbed], platforms: PLATFORMS,
                states: states({ "https://x.com/a/status/1": state }),
            });
            const replaced = plan.suppress.filter(t => t.reason === "replaced").length;
            expect(replaced).toBeLessThanOrEqual(plan.render.length);
        }
    });

    it("a genuinely stale embed is still hidden — our own deferred rewrite", () => {
        const plan = planIncomingMessage({
            content: "https://vxtwitter.com/a/status/1",
            embeds: [{ url: "https://twitter.com/b/status/999", rawTitle: "leftover" }],
            platforms: PLATFORMS,
            states: new Map(),
        });

        expect(plan.suppress).toEqual([{ index: 0, url: "https://twitter.com/b/status/999", reason: "stale" }]);
    });
});
