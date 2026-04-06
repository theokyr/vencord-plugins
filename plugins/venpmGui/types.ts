export interface VenpmPaths {
    configDir: string;
    configPath: string;
    lockfilePath: string;
    cachePath: string;
}

export interface VenpmDetection {
    found: boolean;
    version?: string;
    path?: string;
}

export interface EnvironmentStatus {
    node: string;
    npm: boolean;
    git: boolean;
    pnpm: boolean;
    vencordPath: string | null;
    discordBinary: string | null;
}

export interface InstalledPluginInfo {
    name: string;
    version: string;
    repo: string;
    method: string;
    pinned: boolean;
    latestVersion?: string;
    hasUpdate?: boolean;
}

export interface AvailablePlugin {
    name: string;
    version: string;
    description: string;
    authors: { name: string; id: string }[];
    repo: string;
    dependencies?: string[];
    optionalDependencies?: string[];
    installed: boolean;
    installedVersion?: string;
}

export interface RepoInfo {
    name: string;
    url: string;
}

export interface HealthItem {
    label: string;
    status: "green" | "yellow" | "red";
    detail: string;
    fixHint?: string;
}

export interface JsonEnvelope<T = unknown> {
    success: boolean;
    error?: string;
    data?: T;
}

export type TabId = "installed" | "browse" | "advanced";
