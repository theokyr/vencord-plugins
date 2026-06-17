import type { ProbeResult } from "./probeCache";
import type { PlatformEntry, ProviderDef } from "./providerMap";

export type ProviderProbeResult = ProbeResult & {
    oembedType?: string;
    error?: string;
};

export type ProbeProvider = (providerDomain: string, originalPath: string) => Promise<ProviderProbeResult>;

export interface WorkingProvider {
    provider: ProviderDef;
    result: ProviderProbeResult;
    path: string;
}

export function getProviderProbePath(cleanUrl: string): string | null {
    try {
        const parsed = new URL(cleanUrl);
        return parsed.pathname + parsed.search + parsed.hash;
    } catch {
        return null;
    }
}

export function isUsableProviderResult(result: ProviderProbeResult): boolean {
    return !result.error && result.score > 0;
}

export async function chooseWorkingProvider(
    platform: PlatformEntry,
    cleanUrl: string,
    probeProvider: ProbeProvider,
): Promise<WorkingProvider | null> {
    const path = getProviderProbePath(cleanUrl);
    if (!path) return null;

    for (const provider of platform.providers) {
        const result = await probeProvider(provider.domain, path);
        if (isUsableProviderResult(result)) {
            return { provider, result, path };
        }
    }

    return null;
}
