import { resolvePlatformUrl, type PlatformEntry } from "./providerMap";

const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
const STRIP_WWW = /^(www|m|mobile|old)\./;

function normalizeHostname(hostname: string): string {
    return hostname.replace(STRIP_WWW, "");
}

function hostnameOf(url: string): string | null {
    try {
        return normalizeHostname(new URL(url).hostname);
    } catch {
        return null;
    }
}

function extractUrls(text: string): string[] {
    return Array.from(text.matchAll(URL_REGEX), match => match[1]);
}

function includesProviderText(text: string, platform: PlatformEntry): boolean {
    const lower = text.toLowerCase();
    return platform.providers.some(provider => {
        const label = provider.label.toLowerCase();
        const domain = provider.domain.toLowerCase();
        const shortDomain = domain.split(".")[0];
        return lower.includes(label) || lower.includes(domain) || lower.includes(shortDomain);
    });
}

export function shouldSuppressNativeEmbed(
    displayedUrls: string[],
    embedUrls: string[],
    embedText: string,
    platforms: PlatformEntry[],
): boolean {
    for (const displayedUrl of displayedUrls) {
        const resolved = resolvePlatformUrl(displayedUrl, platforms);
        if (!resolved) continue;

        const sourceDomains = new Set(resolved.platform.domains.map(normalizeHostname));
        const providerDomains = new Set(resolved.platform.providers.map(provider => normalizeHostname(provider.domain)));

        const embedHosts = embedUrls
            .map(hostnameOf)
            .filter((host): host is string => !!host);

        const hasSourceDomain = embedHosts.some(host => sourceDomains.has(host));
        if (!hasSourceDomain) continue;

        const hasProviderDomain = embedHosts.some(host => providerDomains.has(host));
        if (!hasProviderDomain && !includesProviderText(embedText, resolved.platform)) {
            return true;
        }
    }

    return false;
}

function getDisplayedUrls(contentEl: Element): string[] {
    const urls = new Set<string>();

    contentEl.querySelectorAll<HTMLAnchorElement>("a[href]").forEach(anchor => urls.add(anchor.href));
    extractUrls(contentEl.textContent ?? "").forEach(url => urls.add(url));

    return [...urls];
}

function getEmbedUrls(embedEl: Element): string[] {
    const urls = new Set<string>();

    embedEl.querySelectorAll<HTMLAnchorElement>("a[href]").forEach(anchor => urls.add(anchor.href));
    extractUrls(embedEl.textContent ?? "").forEach(url => urls.add(url));

    return [...urls];
}

export function suppressStaleNativeEmbeds(platforms: PlatformEntry[], root: ParentNode = document) {
    const containers = root.querySelectorAll<HTMLElement>('[id^="message-accessories-"]');

    for (const container of containers) {
        const messageId = container.id.replace("message-accessories-", "");
        if (!messageId) continue;

        const contentEl = document.getElementById(`message-content-${messageId}`);
        if (!contentEl) continue;

        const displayedUrls = getDisplayedUrls(contentEl);
        if (displayedUrls.length === 0) continue;

        const embeds = container.querySelectorAll<HTMLElement>('article[class*="embed"]');
        for (const embedEl of embeds) {
            if (embedEl.dataset.embedfix) continue;
            if (embedEl.dataset.embedfixManualVisible === "true") continue;

            const shouldHide = shouldSuppressNativeEmbed(
                displayedUrls,
                getEmbedUrls(embedEl),
                embedEl.textContent ?? "",
                platforms,
            );

            if (shouldHide) {
                embedEl.dataset.embedfixSuppressed = "true";
                embedEl.style.display = "none";
            } else if (embedEl.dataset.embedfixSuppressed === "true") {
                delete embedEl.dataset.embedfixSuppressed;
                embedEl.style.display = "";
            }
        }
    }
}

export function startIncomingEmbedSuppressor(
    getActivePlatforms: () => PlatformEntry[],
    isEnabled: () => boolean,
) {
    const sweep = () => {
        if (!isEnabled()) return;
        suppressStaleNativeEmbeds(getActivePlatforms());
    };

    sweep();

    const observer = new MutationObserver(sweep);
    observer.observe(document.body, { childList: true, subtree: true });

    const timers = [
        window.setTimeout(sweep, 250),
        window.setTimeout(sweep, 1000),
        window.setInterval(sweep, 3000),
    ];

    return () => {
        observer.disconnect();
        timers.forEach(timer => window.clearTimeout(timer));
        document.querySelectorAll<HTMLElement>('[data-embedfix-suppressed="true"]').forEach(embedEl => {
            delete embedEl.dataset.embedfixSuppressed;
            embedEl.style.display = "";
        });
        document.querySelectorAll<HTMLElement>('[data-embedfix-manual-visible="true"]').forEach(embedEl => {
            delete embedEl.dataset.embedfixManualVisible;
        });
    };
}
