import type { EventFilters, EventMessage } from "./protocol.js";

interface Subscription {
    id: string;
    events: string[];
    filters?: EventFilters;
}

export class SubscriptionManager {
    private subscriptions = new Map<string, Subscription>();
    private counter = 0;

    create(events: string[], filters?: EventFilters): string {
        const id = `sub_${++this.counter}`;
        this.subscriptions.set(id, { id, events, filters });
        return id;
    }

    remove(id: string): boolean {
        return this.subscriptions.delete(id);
    }

    getAll(): Subscription[] {
        return Array.from(this.subscriptions.values());
    }

    /** Matches by event type only — filter matching happens plugin-side */
    match(event: EventMessage): string[] {
        const matching: string[] = [];
        for (const sub of this.subscriptions.values()) {
            if (!sub.events.includes(event.event)) continue;
            matching.push(sub.id);
        }
        return matching;
    }

    clear() {
        this.subscriptions.clear();
        this.counter = 0;
    }
}
