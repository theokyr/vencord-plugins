export const HEADER_ZONES = ["leading", "beforeBreadcrumb", "breadcrumb", "title", "afterTitle", "toolbar", "trailing"] as const;

export type HeaderZone = typeof HEADER_ZONES[number];
export type HeaderItemId = `${string}:${string}`;
export type HeaderMode = "channel" | "route" | "virtual" | "unknown";

export interface HeaderContext {
    readonly active: boolean;
    readonly guildId: string | null;
    readonly channelId: string | null;
    readonly path: string;
    readonly mode: HeaderMode;
}

export interface HeaderItemDefinition<TId extends HeaderItemId = HeaderItemId> {
    readonly id: TId;
    readonly zone: HeaderZone;
    readonly priority?: number;
    readonly render: (ctx: HeaderContext) => HTMLElement;
    readonly update?: (el: HTMLElement, ctx: HeaderContext) => void;
    readonly cleanup?: (el: HTMLElement) => void;
    readonly visible?: (ctx: HeaderContext) => boolean;
}

export interface HeaderTitleOverride {
    readonly label: string;
    readonly icon?: HTMLElement | string;
    readonly priority?: number;
}

export interface HeaderRegistration<TId extends HeaderItemId = HeaderItemId> {
    readonly id: TId;
    dispose(): void;
}

export interface EnrichedHeaderAPI {
    readonly version: 1;
    registerItem<TId extends HeaderItemId>(item: HeaderItemDefinition<TId>): HeaderRegistration<TId>;
    setTitleOverride<TId extends HeaderItemId>(id: TId, override: HeaderTitleOverride): HeaderRegistration<TId>;
    refresh(): void;
    isActive(): boolean;
    ownsSidebarControls(): boolean;
    subscribe(listener: (ctx: HeaderContext) => void): HeaderRegistration<`${string}:subscription`>;
}

declare global {
    interface Window {
        __enrichedHeader?: EnrichedHeaderAPI;
    }
}

