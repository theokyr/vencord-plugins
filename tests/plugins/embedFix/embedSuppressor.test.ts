// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";

import {
    HIDDEN_ATTR,
    hrefsMatchTargets,
    restoreAll,
    suppressionKeys,
    syncSuppression,
    watchSuppression,
} from "../../../plugins/embedFix/embedSuppressor";
import type { SuppressTarget } from "../../../plugins/embedFix/incomingPlan";

function target(url: string, reason: SuppressTarget["reason"] = "replaced", index = 0): SuppressTarget {
    return { url, reason, index };
}

function makeContainer(html: string): HTMLElement {
    const container = document.createElement("div");
    container.id = "message-accessories-1";
    container.innerHTML = html;
    document.body.appendChild(container);
    return container;
}

function nativeEmbed(href: string, extra = ""): string {
    return `<article class="embedFull_abc embed_def"${extra}><a href="${href}">link</a></article>`;
}

afterEach(() => {
    document.body.innerHTML = "";
});

describe("embedFix/embedSuppressor — matching", () => {
    it("matches an embed link to a target ignoring scheme, www and trailing slash", () => {
        const keys = suppressionKeys([target("https://x.com/a/status/1")]);

        expect(hrefsMatchTargets(["http://www.x.com/a/status/1/"], keys)).toBe(true);
    });

    it("ignores query strings when pairing an embed with its link", () => {
        const keys = suppressionKeys([target("https://x.com/a/status/1")]);

        expect(hrefsMatchTargets(["https://x.com/a/status/1?s=20"], keys)).toBe(true);
    });

    it("does not match a different post on the same host", () => {
        const keys = suppressionKeys([target("https://x.com/a/status/1")]);

        expect(hrefsMatchTargets(["https://x.com/a/status/2"], keys)).toBe(false);
    });

    it("does not match the same path on a different host", () => {
        const keys = suppressionKeys([target("https://x.com/a/status/1")]);

        expect(hrefsMatchTargets(["https://evil.com/a/status/1"], keys)).toBe(false);
    });

    it("ignores unparseable hrefs", () => {
        const keys = suppressionKeys([target("https://x.com/a/status/1")]);

        expect(hrefsMatchTargets(["", "javascript:void(0)", "not a url"], keys)).toBe(false);
    });

    it("produces no keys for an empty target list", () => {
        expect(suppressionKeys([]).size).toBe(0);
    });
});

describe("embedFix/embedSuppressor — DOM", () => {
    it("hides only the embed named by the plan", () => {
        const container = makeContainer(
            nativeEmbed("https://x.com/a/status/1") + nativeEmbed("https://youtube.com/watch?v=1"),
        );

        const hidden = syncSuppression(container, [target("https://x.com/a/status/1")]);

        const embeds = container.querySelectorAll("article");
        expect(hidden).toBe(1);
        expect((embeds[0] as HTMLElement).style.display).toBe("none");
        expect((embeds[1] as HTMLElement).style.display).toBe("");
    });

    it("hides nothing when the plan is empty", () => {
        const container = makeContainer(nativeEmbed("https://x.com/a/status/1"));

        expect(syncSuppression(container, [])).toBe(0);
        expect((container.querySelector("article") as HTMLElement).style.display).toBe("");
    });

    it("restores an embed as soon as it leaves the plan", () => {
        const container = makeContainer(nativeEmbed("https://x.com/a/status/1"));
        const embed = container.querySelector("article") as HTMLElement;

        syncSuppression(container, [target("https://x.com/a/status/1")]);
        expect(embed.style.display).toBe("none");

        syncSuppression(container, []);
        expect(embed.style.display).toBe("");
        expect(embed.hasAttribute(HIDDEN_ATTR)).toBe(false);
    });

    it("never hides our own replacement embed", () => {
        const container = makeContainer(
            `<div data-embedfix="true">${nativeEmbed("https://x.com/a/status/1")}</div>`,
        );

        expect(syncSuppression(container, [target("https://x.com/a/status/1")])).toBe(0);
    });

    it("preserves and restores an inline display the embed already had", () => {
        const container = makeContainer(nativeEmbed("https://x.com/a/status/1", ' style="display:flex"'));
        const embed = container.querySelector("article") as HTMLElement;

        syncSuppression(container, [target("https://x.com/a/status/1")]);
        expect(embed.style.display).toBe("none");

        syncSuppression(container, []);
        expect(embed.style.display).toBe("flex");
    });

    it("is idempotent — a second pass does not lose the original display", () => {
        const container = makeContainer(nativeEmbed("https://x.com/a/status/1", ' style="display:flex"'));
        const embed = container.querySelector("article") as HTMLElement;
        const targets = [target("https://x.com/a/status/1")];

        syncSuppression(container, targets);
        syncSuppression(container, targets);
        syncSuppression(container, []);

        expect(embed.style.display).toBe("flex");
    });

    it("restoreAll un-hides everything the module touched", () => {
        const container = makeContainer(
            nativeEmbed("https://x.com/a/status/1") + nativeEmbed("https://reddit.com/r/x/comments/1/t/"),
        );
        syncSuppression(container, [
            target("https://x.com/a/status/1"),
            target("https://reddit.com/r/x/comments/1/t/"),
        ]);

        restoreAll(document);

        for (const embed of container.querySelectorAll("article")) {
            expect((embed as HTMLElement).style.display).toBe("");
        }
    });

    it("catches an embed Discord renders after the first pass", async () => {
        const container = makeContainer("");
        const stop = watchSuppression(container, () => [target("https://x.com/a/status/1")]);

        container.insertAdjacentHTML("beforeend", nativeEmbed("https://x.com/a/status/1"));
        await new Promise(resolve => setTimeout(resolve, 10));

        expect((container.querySelector("article") as HTMLElement).style.display).toBe("none");
        stop();
    });

    it("teardown restores every embed it hid", async () => {
        const container = makeContainer(nativeEmbed("https://x.com/a/status/1"));
        const stop = watchSuppression(container, () => [target("https://x.com/a/status/1")]);
        await new Promise(resolve => setTimeout(resolve, 5));

        stop();

        expect((container.querySelector("article") as HTMLElement).style.display).toBe("");
    });

    it("stops reacting to mutations after teardown", async () => {
        const container = makeContainer("");
        const stop = watchSuppression(container, () => [target("https://x.com/a/status/1")]);
        stop();

        container.insertAdjacentHTML("beforeend", nativeEmbed("https://x.com/a/status/1"));
        await new Promise(resolve => setTimeout(resolve, 10));

        expect((container.querySelector("article") as HTMLElement).style.display).toBe("");
    });
});

describe("embedFix/embedSuppressor — embeds with no link to their own post", () => {
    // The live failure: an image-only tweet card links the author and the
    // picture, never the status URL, so href matching found nothing and the
    // message showed our embed alongside Discord's.
    const imageOnlyCard = `<article class="embedFull_a embed_b">
        <a href="https://x.com/bomberfish77">author</a>
        <a href="https://jf.x.com/images/media-preview/2081203277400519002">pic</a>
    </article>`;

    it("falls back to position when no anchor names the post", () => {
        const container = makeContainer(imageOnlyCard);

        const hidden = syncSuppression(container, [
            { index: 0, url: "https://twitter.com/bomberfish77/status/2081203277400519002", reason: "replaced" },
        ]);

        expect(hidden).toBe(1);
        expect((container.querySelector("article") as HTMLElement).style.display).toBe("none");
    });

    it("does not count our own embed when falling back to position", () => {
        const container = makeContainer(
            `<div data-embedfix="true">${nativeEmbed("https://vxtwitter.com/a/status/1")}</div>` + imageOnlyCard,
        );

        syncSuppression(container, [
            { index: 0, url: "https://twitter.com/bomberfish77/status/2081203277400519002", reason: "replaced" },
        ]);

        const articles = container.querySelectorAll("article");
        expect((articles[0] as HTMLElement).style.display).toBe("");     // ours, untouched
        expect((articles[1] as HTMLElement).style.display).toBe("none"); // theirs, hidden
    });

    it("prefers the href match over position when both are available", () => {
        const container = makeContainer(
            nativeEmbed("https://youtube.com/watch?v=1") + nativeEmbed("https://x.com/a/status/1"),
        );

        syncSuppression(container, [
            { index: 1, url: "https://x.com/a/status/1", reason: "replaced" },
        ]);

        const articles = container.querySelectorAll("article");
        expect((articles[0] as HTMLElement).style.display).toBe("");
        expect((articles[1] as HTMLElement).style.display).toBe("none");
    });

    it("hides the right one when a message has two embeds and only one is replaced", () => {
        const container = makeContainer(imageOnlyCard + nativeEmbed("https://youtube.com/watch?v=1"));

        syncSuppression(container, [
            { index: 0, url: "https://twitter.com/bomberfish77/status/2081203277400519002", reason: "replaced" },
        ]);

        const articles = container.querySelectorAll("article");
        expect((articles[0] as HTMLElement).style.display).toBe("none");
        expect((articles[1] as HTMLElement).style.display).toBe("");
    });

    it("restores a position-hidden embed once it leaves the plan", () => {
        const container = makeContainer(imageOnlyCard);
        const targets = [{ index: 0, url: "https://twitter.com/bomberfish77/status/2081203277400519002", reason: "replaced" as const }];

        syncSuppression(container, targets);
        syncSuppression(container, []);

        expect((container.querySelector("article") as HTMLElement).style.display).toBe("");
    });

    it("ignores a position that does not exist", () => {
        const container = makeContainer(imageOnlyCard);

        expect(() => syncSuppression(container, [
            { index: 7, url: "https://twitter.com/x/status/9", reason: "replaced" },
        ])).not.toThrow();
        expect((container.querySelector("article") as HTMLElement).style.display).toBe("");
    });
});
