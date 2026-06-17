import type {
    HeaderContext,
    HeaderItemDefinition,
    HeaderItemId,
    HeaderMode,
    HeaderRegistration,
    HeaderTitleOverride,
    HeaderZone,
} from "./api";

type Listener = (ctx: HeaderContext) => void;

export interface HeaderLayoutRegistry {
    registerItem<TId extends HeaderItemId>(item: HeaderItemDefinition<TId>): HeaderRegistration<TId>;
    setTitleOverride<TId extends HeaderItemId>(id: TId, override: HeaderTitleOverride): HeaderRegistration<TId>;
    getItemsForZone(zone: HeaderZone, ctx?: HeaderContext): readonly HeaderItemDefinition[];
    getTitleOverride(): HeaderTitleOverride | null;
    removeItem(id: HeaderItemId): boolean;
    clear(): void;
    subscribe(listener: Listener): HeaderRegistration<`${string}:subscription`>;
    notify(ctx?: HeaderContext): void;
    update(ctx?: HeaderContext): void;
    renderItem(id: HeaderItemId, ctx?: HeaderContext): HTMLElement | null;
    updateItem(id: HeaderItemId, ctx?: HeaderContext): HTMLElement | null;
    setContext(ctx: HeaderContext): void;
    getContext(): HeaderContext;
}

interface ItemEntry<TId extends HeaderItemId = HeaderItemId> {
    readonly item: HeaderItemDefinition<TId>;
    readonly order: number;
    readonly token: symbol;
    renderedElement: HTMLElement | null;
}

interface TitleOverrideEntry<TId extends HeaderItemId = HeaderItemId> {
    readonly id: TId;
    readonly override: HeaderTitleOverride;
    readonly order: number;
    readonly token: symbol;
}

const ROUTE_PATHS = new Set(["/channels/@me", "/message-requests", "/store", "/shop", "/quest-home"]);

const DEFAULT_CONTEXT: HeaderContext = {
    active: false,
    guildId: null,
    channelId: null,
    path: "",
    mode: "unknown",
};

function byPriorityThenOrder(a: ItemEntry, b: ItemEntry): number {
    const priorityDelta = (a.item.priority ?? 0) - (b.item.priority ?? 0);
    if (priorityDelta !== 0) return priorityDelta;
    return a.order - b.order;
}

function cleanupEntry(entry: ItemEntry): void {
    if (!entry.renderedElement) return;
    const el = entry.renderedElement;
    entry.renderedElement = null;
    try {
        entry.item.cleanup?.(el);
    } catch {
        // Plugin cleanup is best-effort; registry state must keep advancing.
    }
}

function isVisible(entry: ItemEntry, ctx: HeaderContext): boolean {
    try {
        return entry.item.visible?.(ctx) !== false;
    } catch {
        return false;
    }
}

export function classifyHeaderMode(input: { channelId: string | null; path: string; }): HeaderMode {
    if (input.channelId) return "channel";
    if (input.path.startsWith("@@")) return "virtual";
    if (ROUTE_PATHS.has(input.path)) return "route";
    return "unknown";
}

export function createHeaderLayoutRegistry(): HeaderLayoutRegistry {
    const items = new Map<HeaderItemId, ItemEntry>();
    const titleOverrides = new Map<HeaderItemId, TitleOverrideEntry>();
    const listeners = new Map<HeaderItemId, Listener>();
    let nextOrder = 0;
    let nextSubscription = 0;
    let context = DEFAULT_CONTEXT;

    function notify(ctx: HeaderContext = context): void {
        context = ctx;
        listeners.forEach(listener => {
            try {
                listener(ctx);
            } catch {
                // Subscriber failures must not block other listeners or updates.
            }
        });
    }

    function removeItem(id: HeaderItemId, token?: symbol): boolean {
        const entry = items.get(id);
        if (!entry || (token && entry.token !== token)) return false;
        items.delete(id);
        cleanupEntry(entry);
        notify();
        return true;
    }

    function removeTitleOverride(id: HeaderItemId, token?: symbol): boolean {
        const entry = titleOverrides.get(id);
        if (!entry || (token && entry.token !== token)) return false;
        titleOverrides.delete(id);
        notify();
        return true;
    }

    function registerItem<TId extends HeaderItemId>(item: HeaderItemDefinition<TId>): HeaderRegistration<TId> {
        const previous = items.get(item.id);
        if (previous) cleanupEntry(previous);

        const token = Symbol(item.id);
        items.set(item.id, {
            item,
            order: nextOrder++,
            token,
            renderedElement: null,
        });
        notify();

        return {
            id: item.id,
            dispose: () => { removeItem(item.id, token); },
        };
    }

    function setTitleOverride<TId extends HeaderItemId>(id: TId, override: HeaderTitleOverride): HeaderRegistration<TId> {
        const token = Symbol(id);
        titleOverrides.set(id, {
            id,
            override,
            order: nextOrder++,
            token,
        });
        notify();

        return {
            id,
            dispose: () => { removeTitleOverride(id, token); },
        };
    }

    function getItemsForZone(zone: HeaderZone, ctx?: HeaderContext): readonly HeaderItemDefinition[] {
        return [...items.values()]
            .filter(entry => entry.item.zone === zone)
            .filter(entry => !ctx || isVisible(entry, ctx))
            .sort(byPriorityThenOrder)
            .map(entry => entry.item);
    }

    function getTitleOverride(): HeaderTitleOverride | null {
        const entries = [...titleOverrides.values()];
        if (entries.length === 0) return null;

        entries.sort((a, b) => {
            const priorityDelta = (b.override.priority ?? 0) - (a.override.priority ?? 0);
            if (priorityDelta !== 0) return priorityDelta;
            return b.order - a.order;
        });
        return entries[0].override;
    }

    function renderItem(id: HeaderItemId, ctx: HeaderContext = context): HTMLElement | null {
        const entry = items.get(id);
        if (!entry) return null;

        context = ctx;
        if (!isVisible(entry, ctx)) {
            cleanupEntry(entry);
            return null;
        }

        if (!entry.renderedElement) {
            try {
                entry.renderedElement = entry.item.render(ctx);
            } catch {
                return null;
            }
            return entry.renderedElement;
        }

        try {
            entry.item.update?.(entry.renderedElement, ctx);
        } catch {
            // Keep the last rendered element; the next update can recover.
        }
        return entry.renderedElement;
    }

    function clear(): void {
        const entries = [...items.values()];
        items.clear();
        titleOverrides.clear();
        listeners.clear();
        entries.forEach(cleanupEntry);
    }

    function subscribe(listener: Listener): HeaderRegistration<`${string}:subscription`> {
        const id = `enrichedHeader:${++nextSubscription}:subscription` as const;
        listeners.set(id, listener);
        return {
            id,
            dispose: () => { listeners.delete(id); },
        };
    }

    return {
        registerItem,
        setTitleOverride,
        getItemsForZone,
        getTitleOverride,
        removeItem,
        clear,
        subscribe,
        notify,
        update: notify,
        renderItem,
        updateItem: renderItem,
        setContext: notify,
        getContext: () => context,
    };
}
