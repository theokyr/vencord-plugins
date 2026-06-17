// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    findMessageIdForRefreshTarget,
    refreshFallbackEmbed,
    type EmbedData,
} from "../../../plugins/embedFix/fallbackEmbed";
import { suppressStaleNativeEmbeds } from "../../../plugins/embedFix/domSuppressor";
import { DEFAULT_PLATFORMS } from "../../../plugins/embedFix/providerMap";

function embedData(overrides: Partial<EmbedData> = {}): EmbedData {
    return {
        url: "https://vxtwitter.com/Blobifie/status/2060156557598634225",
        title: "Blobifi (@Blobifie)",
        description: "New glenn has yet to explode",
        siteName: "vxTwitter",
        imageUrl: "https://example.test/card.jpg",
        videoUrl: null,
        videoWidth: null,
        videoHeight: null,
        authorName: null,
        authorUrl: null,
        themeColor: null,
        type: "article",
        ...overrides,
    };
}

describe("embedFix/fallbackEmbed", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
    });

    it("finds the message id from a refresh button inside message content", () => {
        document.body.innerHTML = `
            <div id="message-content-1509742085761142965">
                <span class="vc-embedFix-indicator"></span>
            </div>
        `;

        const target = document.querySelector(".vc-embedFix-indicator") as HTMLElement;

        expect(findMessageIdForRefreshTarget(target)).toBe("1509742085761142965");
    });

    it("inserts a provider-backed fallback embed when no React accessory is mounted", async () => {
        document.body.innerHTML = `
            <div id="message-content-1509742085761142965">
                <a href="https://vxtwitter.com/Blobifie/status/2060156557598634225">https://vxtwitter.com/Blobifie/status/2060156557598634225</a>
                <span class="vc-embedFix-indicator"></span>
            </div>
            <div id="message-accessories-1509742085761142965">
                <article class="embed" data-embedfix-suppressed="true" style="display: none">
                    <a href="https://twitter.com/Blobifie/status/2060156557598634225">X</a>
                </article>
            </div>
        `;
        const fetchEmbedData = vi.fn(async () => embedData());
        const target = document.querySelector(".vc-embedFix-indicator") as HTMLElement;

        const refreshed = await refreshFallbackEmbed({
            rewrittenUrl: "https://vxtwitter.com/Blobifie/status/2060156557598634225",
            trigger: target,
            fetchEmbedData,
        });

        const fallback = document.querySelector(".vc-embedFix-fallbackEmbed") as HTMLElement;
        expect(refreshed).toBe(true);
        expect(fetchEmbedData).toHaveBeenCalledWith("https://vxtwitter.com/Blobifie/status/2060156557598634225");
        expect(fallback).not.toBeNull();
        expect(fallback.dataset.embedfix).toBe("true");
        expect(fallback.textContent).toContain("Blobifi (@Blobifie)");
        expect(fallback.textContent).toContain("New glenn has yet to explode");
        expect(fallback.querySelector("img")?.getAttribute("src")).toBe("https://example.test/card.jpg");
        expect(document.querySelector("article")?.getAttribute("style")).toContain("display: none");
    });

    it("prefers the mounted DOM row id over a stale render-state message id", async () => {
        document.body.innerHTML = `
            <div id="message-content-1509742085761142965">
                <span class="vc-embedFix-indicator"></span>
            </div>
            <div id="message-accessories-1509742085761142965">
                <article class="embed" data-embedfix-suppressed="true" style="display: none">X fallback</article>
            </div>
        `;

        const refreshed = await refreshFallbackEmbed({
            rewrittenUrl: "https://vxtwitter.com/Blobifie/status/2060156557598634225",
            messageId: "stale-render-state-id",
            trigger: document.querySelector(".vc-embedFix-indicator") as HTMLElement,
            fetchEmbedData: vi.fn(async () => embedData()),
        });

        expect(refreshed).toBe(true);
        expect(document.querySelector(".vc-embedFix-fallbackEmbed")?.textContent).toContain("Blobifi (@Blobifie)");
    });

    it("restores the suppressed native embed if provider data is unusable", async () => {
        document.body.innerHTML = `
            <div id="message-content-1509742085761142965">
                <a href="https://vxtwitter.com/Blobifie/status/2060156557598634225">https://vxtwitter.com/Blobifie/status/2060156557598634225</a>
                <span class="vc-embedFix-indicator"></span>
            </div>
            <div id="message-accessories-1509742085761142965">
                <article class="embed" data-embedfix-suppressed="true" style="display: none">
                    <a href="https://twitter.com/Blobifie/status/2060156557598634225">X fallback</a>
                </article>
            </div>
        `;

        const refreshed = await refreshFallbackEmbed({
            rewrittenUrl: "https://vxtwitter.com/Blobifie/status/2060156557598634225",
            trigger: document.querySelector(".vc-embedFix-indicator") as HTMLElement,
            fetchEmbedData: vi.fn(async () => embedData({ title: null, description: null, imageUrl: null, error: "missing metadata" })),
        });

        const nativeEmbed = document.querySelector("article") as HTMLElement;
        expect(refreshed).toBe(false);
        expect(document.querySelector(".vc-embedFix-fallbackEmbed")).toBeNull();
        expect(nativeEmbed.dataset.embedfixSuppressed).toBeUndefined();
        expect(nativeEmbed.style.display).toBe("");

        suppressStaleNativeEmbeds(DEFAULT_PLATFORMS);
        expect(nativeEmbed.dataset.embedfixSuppressed).toBeUndefined();
        expect(nativeEmbed.style.display).toBe("");
    });
});
