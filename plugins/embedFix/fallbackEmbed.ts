/*
 * DOM fallback for messages where Discord rendered the rewritten link but the
 * MessageAccessories React hook did not mount for the already-visible row.
 */

export interface EmbedData {
    url: string;
    title: string | null;
    description: string | null;
    siteName: string | null;
    imageUrl: string | null;
    videoUrl: string | null;
    videoWidth: number | null;
    videoHeight: number | null;
    authorName: string | null;
    authorUrl: string | null;
    themeColor: string | null;
    type: string | null;
    error?: string;
}

export interface RefreshFallbackContext {
    messageId?: string;
    channelId?: string;
    trigger?: Element | null;
    fetchEmbedData?: (url: string) => Promise<EmbedData>;
    root?: Document;
}

export interface RefreshFallbackRequest extends RefreshFallbackContext {
    rewrittenUrl: string;
}

function getNativeFetchEmbedData(): ((url: string) => Promise<EmbedData>) | null {
    try {
        const Native = (window as any).VencordNative?.pluginHelpers?.EmbedFix;
        return typeof Native?.fetchEmbedData === "function"
            ? (url: string) => Native.fetchEmbedData(url) as Promise<EmbedData>
            : null;
    } catch {
        return null;
    }
}

function isUsableEmbedData(data: EmbedData | null | undefined): data is EmbedData {
    return !!data && !data.error && !!(data.title || data.imageUrl || data.videoUrl);
}

function idSuffix(id: string, prefix: string): string | null {
    return id.startsWith(prefix) ? id.slice(prefix.length) : null;
}

export function findMessageIdForRefreshTarget(target: Element | null | undefined): string | null {
    if (!target) return null;

    const contentEl = target.closest<HTMLElement>('[id^="message-content-"]');
    if (contentEl) return idSuffix(contentEl.id, "message-content-");

    const accessoriesEl = target.closest<HTMLElement>('[id^="message-accessories-"]');
    if (accessoriesEl) return idSuffix(accessoriesEl.id, "message-accessories-");

    const rowEl = target.closest<HTMLElement>('[id^="chat-messages-"]');
    if (!rowEl) return null;

    const parts = rowEl.id.split("-");
    const maybeMessageId = parts[parts.length - 1];
    return /^\d+$/.test(maybeMessageId) ? maybeMessageId : null;
}

function getAccessoriesContainer(doc: Document, messageId: string): HTMLElement | null {
    return doc.getElementById(`message-accessories-${messageId}`);
}

function findFallbackEmbed(container: HTMLElement, rewrittenUrl: string): HTMLElement | null {
    return Array.from(container.querySelectorAll<HTMLElement>(".vc-embedFix-fallbackEmbed"))
        .find(el => el.dataset.embedfixFallbackUrl === rewrittenUrl) ?? null;
}

function restoreSuppressedNativeEmbeds(container: HTMLElement) {
    container.querySelectorAll<HTMLElement>('[data-embedfix-suppressed="true"]').forEach(embedEl => {
        delete embedEl.dataset.embedfixSuppressed;
        embedEl.dataset.embedfixManualVisible = "true";
        embedEl.style.display = "";
    });
}

function hideManuallyRestoredNativeEmbeds(container: HTMLElement) {
    container.querySelectorAll<HTMLElement>('[data-embedfix-manual-visible="true"]').forEach(embedEl => {
        delete embedEl.dataset.embedfixManualVisible;
        embedEl.dataset.embedfixSuppressed = "true";
        embedEl.style.display = "none";
    });
}

function appendText(parent: HTMLElement, className: string, text: string | null | undefined): HTMLElement | null {
    if (!text) return null;

    const el = parent.ownerDocument.createElement("div");
    el.className = className;
    el.textContent = text;
    parent.appendChild(el);
    return el;
}

export function buildFallbackEmbedElement(data: EmbedData, rewrittenUrl: string, doc: Document = document): HTMLElement {
    const article = doc.createElement("article");
    article.className = "vc-embedFix-fallbackEmbed";
    article.dataset.embedfix = "true";
    article.dataset.embedfixFallbackUrl = rewrittenUrl;

    if (data.themeColor && /^#[0-9a-f]{6}$/i.test(data.themeColor)) {
        article.style.setProperty("--vc-embedFix-fallbackColor", data.themeColor);
    }

    const body = doc.createElement("div");
    body.className = "vc-embedFix-fallbackBody";
    article.appendChild(body);

    const sourceLine = data.authorName || data.siteName;
    appendText(body, "vc-embedFix-fallbackSource", sourceLine);

    if (data.title) {
        const title = doc.createElement("a");
        title.className = "vc-embedFix-fallbackTitle";
        title.href = rewrittenUrl;
        title.target = "_blank";
        title.rel = "noreferrer noopener";
        title.textContent = data.title;
        body.appendChild(title);
    }

    appendText(body, "vc-embedFix-fallbackDescription", data.description);

    if (data.imageUrl) {
        const image = doc.createElement("img");
        image.className = "vc-embedFix-fallbackImage";
        image.src = data.imageUrl;
        image.alt = "";
        image.loading = "lazy";
        body.appendChild(image);
    } else if (data.videoUrl) {
        const video = doc.createElement("a");
        video.className = "vc-embedFix-fallbackVideoLink";
        video.href = data.videoUrl;
        video.target = "_blank";
        video.rel = "noreferrer noopener";
        video.textContent = data.videoUrl;
        body.appendChild(video);
    }

    if (data.siteName && data.siteName !== sourceLine) {
        appendText(body, "vc-embedFix-fallbackFooter", data.siteName);
    }

    return article;
}

export async function refreshFallbackEmbed({
    rewrittenUrl,
    messageId,
    trigger,
    fetchEmbedData,
    root = document,
}: RefreshFallbackRequest): Promise<boolean> {
    const resolvedMessageId = findMessageIdForRefreshTarget(trigger) ?? messageId;
    if (!resolvedMessageId) return false;

    const container = getAccessoriesContainer(root, resolvedMessageId);
    if (!container) return false;

    if (container.querySelector(".vc-embedFix-accessory")) {
        return false;
    }

    const fetcher = fetchEmbedData ?? getNativeFetchEmbedData();
    if (!fetcher) return false;

    const existing = findFallbackEmbed(container, rewrittenUrl);

    try {
        const data = await fetcher(rewrittenUrl);
        if (!isUsableEmbedData(data)) {
            existing?.remove();
            restoreSuppressedNativeEmbeds(container);
            return false;
        }

        const fallback = buildFallbackEmbedElement(data, rewrittenUrl, root);
        hideManuallyRestoredNativeEmbeds(container);
        if (existing) {
            existing.replaceWith(fallback);
        } else {
            container.appendChild(fallback);
        }
        return true;
    } catch (e) {
        console.error(`[EmbedFix] Fallback refresh failed: ${rewrittenUrl}`, e);
        existing?.remove();
        restoreSuppressedNativeEmbeds(container);
        return false;
    }
}
