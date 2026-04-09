export const Native = (window as any).VencordNative?.pluginHelpers?.VenpmGui as {
    detectVenpm: () => Promise<{ found: boolean; version?: string; path?: string }>;
    detectEnvironment: () => Promise<{ node: string; npm: boolean; git: boolean; pnpm: boolean; vencordPath: string | null; discordBinary: string | null }>;
    installVenpm: () => Promise<{ success: boolean; error?: string }>;
    getVenpmPaths: () => Promise<{ configDir: string; configPath: string; lockfilePath: string; cachePath: string }>;
    readConfig: () => Promise<unknown | null>;
    readLockfile: () => Promise<{ installed: Record<string, { version: string; repo: string; method: string; pinned: boolean }> } | null>;
    readCachedIndexes: () => Promise<{ entries?: Record<string, { body?: string }> } | null>;
    runVenpm: (args: string[]) => Promise<{ success: boolean; error?: string; data?: unknown }>;
} | undefined;
