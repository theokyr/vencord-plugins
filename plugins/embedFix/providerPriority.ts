import type { PlatformEntry, ProviderDef } from "./providerMap";

type ProviderOrderMap = Record<string, string[]>;

function parseProviderOrder(orderJson: string | undefined | null): ProviderOrderMap {
    if (!orderJson?.trim()) return {};

    try {
        const parsed = JSON.parse(orderJson);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

        const result: ProviderOrderMap = {};
        for (const [platformId, domains] of Object.entries(parsed)) {
            if (!Array.isArray(domains)) continue;

            const seen = new Set<string>();
            result[platformId] = domains.filter((domain): domain is string => {
                if (typeof domain !== "string" || !domain.trim() || seen.has(domain)) return false;
                seen.add(domain);
                return true;
            });
        }
        return result;
    } catch {
        return {};
    }
}

function serializeProviderOrder(order: ProviderOrderMap): string {
    const normalized: ProviderOrderMap = {};

    for (const [platformId, domains] of Object.entries(order)) {
        const seen = new Set<string>();
        const filtered = domains.filter(domain => {
            if (!domain.trim() || seen.has(domain)) return false;
            seen.add(domain);
            return true;
        });
        if (filtered.length > 0) normalized[platformId] = filtered;
    }

    return Object.keys(normalized).length > 0
        ? JSON.stringify(normalized)
        : "";
}

function orderProviders(providers: ProviderDef[], orderedDomains: string[] | undefined): ProviderDef[] {
    if (!orderedDomains?.length) return providers;

    const byDomain = new Map(providers.map(provider => [provider.domain, provider]));
    const used = new Set<string>();
    const ordered: ProviderDef[] = [];

    for (const domain of orderedDomains) {
        const provider = byDomain.get(domain);
        if (!provider || used.has(provider.domain)) continue;
        ordered.push(provider);
        used.add(provider.domain);
    }

    for (const provider of providers) {
        if (used.has(provider.domain)) continue;
        ordered.push(provider);
    }

    return ordered;
}

export function applyProviderOrder(platforms: PlatformEntry[], orderJson: string | undefined | null): PlatformEntry[] {
    const order = parseProviderOrder(orderJson);

    return platforms.map(platform => ({
        ...platform,
        providers: orderProviders(platform.providers, order[platform.id]),
    }));
}

export function getProviderOrder(
    orderJson: string | undefined | null,
    platformId: string,
    fallbackPlatform?: PlatformEntry,
): string[] {
    const order = parseProviderOrder(orderJson);
    const persisted = order[platformId];
    if (persisted?.length) return persisted;

    return fallbackPlatform?.providers.map(provider => provider.domain) ?? [];
}

export function setProviderOrder(
    orderJson: string | undefined | null,
    platformId: string,
    domains: string[],
): string {
    const order = parseProviderOrder(orderJson);
    order[platformId] = domains;
    return serializeProviderOrder(order);
}

export function resetProviderOrder(orderJson: string | undefined | null, platformId: string): string {
    const order = parseProviderOrder(orderJson);
    delete order[platformId];
    return serializeProviderOrder(order);
}

export function resetAllProviderOrders(): string {
    return "";
}
