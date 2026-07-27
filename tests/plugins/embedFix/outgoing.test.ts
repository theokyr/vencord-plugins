import { describe, expect, it, vi } from "vitest";

import {
    applyReplacements,
    pendingKey,
    planOutgoing,
    type KnowledgeLookup,
    type LinkKnowledge,
} from "../../../plugins/embedFix/outgoing";
import { DEFAULT_PLATFORMS } from "../../../plugins/embedFix/providerMap";

const PLATFORMS = DEFAULT_PLATFORMS;

const ALL_ENABLED: Record<string, boolean> = {
    twitter: true, reddit: true, instagram: true, tiktok: true, pixiv: true, bluesky: true, threads: true,
};

const unknown: KnowledgeLookup = () => ({ status: "unknown" });

function knows(map: Record<string, LinkKnowledge>): KnowledgeLookup {
    return cleanUrl => map[cleanUrl] ?? { status: "unknown" };
}

describe("embedFix/outgoing — planOutgoing", () => {
    it("rewrites inline when the link is already known", () => {
        const plan = planOutgoing(
            "check https://x.com/a/status/1 out",
            PLATFORMS,
            ALL_ENABLED,
            knows({ "https://x.com/a/status/1": { status: "provider", domain: "vxtwitter.com", label: "VxTwitter" } }),
        );

        expect(plan.content).toBe("check https://vxtwitter.com/a/status/1 out");
        expect(plan.applied).toHaveLength(1);
        expect(plan.deferred).toEqual([]);
        expect(plan.changed).toBe(true);
    });

    it("sends an unknown link clean and queues it for a background check", () => {
        const plan = planOutgoing("https://x.com/a/status/1?s=20&t=x", PLATFORMS, ALL_ENABLED, unknown);

        expect(plan.content).toBe("https://x.com/a/status/1");
        expect(plan.applied).toEqual([]);
        expect(plan.deferred).toEqual([
            { sentUrl: "https://x.com/a/status/1", cleanUrl: "https://x.com/a/status/1", offset: 0, platformId: "twitter" },
        ]);
    });

    it("does NOT re-queue a link already known to have no working provider", () => {
        const plan = planOutgoing(
            "https://x.com/a/status/1",
            PLATFORMS,
            ALL_ENABLED,
            knows({ "https://x.com/a/status/1": { status: "none" } }),
        );

        expect(plan.deferred).toEqual([]);
        expect(plan.content).toBe("https://x.com/a/status/1");
    });

    it("decides each link on its own merits inside one message", () => {
        const plan = planOutgoing(
            "a https://x.com/a/status/1 b https://x.com/b/status/2 c https://x.com/c/status/3",
            PLATFORMS,
            ALL_ENABLED,
            knows({
                "https://x.com/a/status/1": { status: "provider", domain: "vxtwitter.com", label: "VxTwitter" },
                "https://x.com/b/status/2": { status: "none" },
            }),
        );

        expect(plan.content).toBe("a https://vxtwitter.com/a/status/1 b https://x.com/b/status/2 c https://x.com/c/status/3");
        expect(plan.applied.map(r => r.original)).toEqual(["https://x.com/a/status/1"]);
        expect(plan.deferred.map(d => d.cleanUrl)).toEqual(["https://x.com/c/status/3"]);
    });

    it("records deferred offsets against the SENT content, not the typed content", () => {
        const plan = planOutgoing(
            "https://x.com/a/status/1 then https://reddit.com/r/x/comments/2/t/?ref=abc",
            PLATFORMS,
            ALL_ENABLED,
            knows({ "https://x.com/a/status/1": { status: "provider", domain: "vxtwitter.com", label: "VxTwitter" } }),
        );

        const deferred = plan.deferred[0];
        expect(plan.content.slice(deferred.offset, deferred.offset + deferred.sentUrl.length)).toBe(deferred.sentUrl);
    });

    it("skips disabled platforms entirely", () => {
        const lookup = vi.fn(unknown);
        const plan = planOutgoing(
            "https://x.com/a/status/1",
            PLATFORMS,
            { ...ALL_ENABLED, twitter: false },
            lookup,
        );

        expect(plan.content).toBe("https://x.com/a/status/1");
        expect(plan.deferred).toEqual([]);
        expect(lookup).not.toHaveBeenCalled();
    });

    it("leaves an already-rewritten link alone instead of double-rewriting it", () => {
        const plan = planOutgoing("https://vxtwitter.com/a/status/1", PLATFORMS, ALL_ENABLED, unknown);

        expect(plan.content).toBe("https://vxtwitter.com/a/status/1");
        expect(plan.deferred).toEqual([]);
    });

    it("asks about each distinct link exactly once", () => {
        const lookup = vi.fn(unknown);
        planOutgoing(
            "https://x.com/a/status/1 https://x.com/a/status/1",
            PLATFORMS,
            ALL_ENABLED,
            lookup,
        );

        expect(lookup).toHaveBeenCalledTimes(1);
    });

    it("leaves a message with no supported links completely untouched", () => {
        const content = "hello https://example.com/x world";
        const plan = planOutgoing(content, PLATFORMS, ALL_ENABLED, unknown);

        expect(plan.content).toBe(content);
        expect(plan.changed).toBe(false);
    });

    it("does not rewrite a bare platform home page", () => {
        const plan = planOutgoing("https://x.com", PLATFORMS, ALL_ENABLED, unknown);

        expect(plan.content).toBe("https://x.com");
        expect(plan.deferred).toEqual([]);
    });
});

describe("embedFix/outgoing — applyReplacements", () => {
    const content = "a https://x.com/a/status/1 b https://x.com/b/status/2 c";

    it("applies several replacements without corrupting later offsets", () => {
        const result = applyReplacements(content, [
            { offset: 2, from: "https://x.com/a/status/1", to: "https://vxtwitter.com/a/status/1" },
            { offset: 29, from: "https://x.com/b/status/2", to: "https://fx.com/b/2" },
        ]);

        expect(result.content).toBe("a https://vxtwitter.com/a/status/1 b https://fx.com/b/2 c");
        expect(result.applied).toBe(2);
    });

    it("refuses a replacement whose text is no longer at that offset", () => {
        const result = applyReplacements("someone edited this message", [
            { offset: 2, from: "https://x.com/a/status/1", to: "https://vxtwitter.com/a/status/1" },
        ]);

        expect(result.content).toBe("someone edited this message");
        expect(result.applied).toBe(0);
        expect(result.skipped).toBe(1);
    });

    it("applies the valid replacements and drops the stale ones in the same pass", () => {
        const result = applyReplacements(content, [
            { offset: 2, from: "https://x.com/a/status/1", to: "https://vxtwitter.com/a/status/1" },
            { offset: 29, from: "https://x.com/WRONG/2", to: "https://fx.com/b/2" },
        ]);

        expect(result.applied).toBe(1);
        expect(result.skipped).toBe(1);
        expect(result.content).toContain("https://x.com/b/status/2");
    });

    it("skips a no-op replacement", () => {
        const result = applyReplacements(content, [
            { offset: 2, from: "https://x.com/a/status/1", to: "https://x.com/a/status/1" },
        ]);

        expect(result.applied).toBe(0);
        expect(result.content).toBe(content);
    });

    it("is order-independent — unsorted input produces the same result", () => {
        const replacements = [
            { offset: 29, from: "https://x.com/b/status/2", to: "https://fx.com/b/2" },
            { offset: 2, from: "https://x.com/a/status/1", to: "https://vxtwitter.com/a/status/1" },
        ];

        expect(applyReplacements(content, replacements).content)
            .toBe(applyReplacements(content, [...replacements].reverse()).content);
    });

    it("handles an empty replacement list", () => {
        expect(applyReplacements(content, [])).toEqual({ content, applied: 0, skipped: 0 });
    });
});

describe("embedFix/outgoing — pendingKey", () => {
    it("distinguishes two messages sent to the same channel", () => {
        expect(pendingKey("c1", "first")).not.toBe(pendingKey("c1", "second"));
    });

    it("distinguishes the same text sent to two channels", () => {
        expect(pendingKey("c1", "same")).not.toBe(pendingKey("c2", "same"));
    });

    it("cannot be spoofed by a channel id that contains the separator", () => {
        expect(pendingKey("c1 x", "y")).not.toBe(pendingKey("c1", "x y"));
    });
});
