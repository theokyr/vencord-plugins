/**
 * embedFix — TTL cache for provider probe results, with JSON serialization.
 * Pure TypeScript, no Discord dependencies.
 */

export interface ProbeResult {
    domain: string;
    score: number;
    hasVideo: boolean;
    hasAudio: boolean;
    hasImage: boolean;
    hasTitle: boolean;
}

export interface CacheEntry {
    platform: string;
    bestProvider: string | null;
    results: ProbeResult[];
    probedAt: number;
    testPath: string;
}

export class ProbeCache {
    private ttlMs: number;
    private readonly save: () => void;
    private entries: Map<string, CacheEntry> = new Map();

    constructor(ttlHours: number, save: () => void) {
        this.ttlMs = ttlHours * 60 * 60 * 1000;
        this.save = save;
    }

    /** Update the TTL. Affects all subsequent get() calls. */
    setTTL(hours: number): void {
        this.ttlMs = hours * 60 * 60 * 1000;
    }

    /**
     * Return the best provider domain for a platform, or null on cache miss / expired entry.
     */
    get(platformId: string): string | null {
        const entry = this.entries.get(platformId);
        if (!entry) return null;

        if (Date.now() - entry.probedAt > this.ttlMs) return null;

        return entry.bestProvider;
    }

    /** Return the full cache entry (no TTL check), or undefined if not present. */
    getEntry(platformId: string): CacheEntry | undefined {
        return this.entries.get(platformId);
    }

    /**
     * Store probe results for a platform. Picks the highest-scoring result as
     * bestProvider (null if all scores are 0). Calls save() afterwards.
     */
    set(platformId: string, results: ProbeResult[], testPath: string): void {
        // Sort descending by score so index 0 is the best.
        const sorted = [...results].sort((a, b) => b.score - a.score);
        const best = sorted[0];
        const bestProvider = (best && best.score > 0) ? best.domain : null;

        const entry: CacheEntry = {
            platform: platformId,
            bestProvider,
            results: sorted,
            probedAt: Date.now(),
            testPath,
        };

        this.entries.set(platformId, entry);
        this.save();
    }

    /** Return a map of domain → score for every result stored under a platform. */
    getAllScores(platformId: string): Record<string, number> {
        const entry = this.entries.get(platformId);
        if (!entry) return {};

        const scores: Record<string, number> = {};
        for (const result of entry.results) {
            scores[result.domain] = result.score;
        }
        return scores;
    }

    /** Clear all entries and call save(). */
    flush(): void {
        this.entries.clear();
        this.save();
    }

    /** Serialize all entries to a JSON string for settings.store persistence. */
    serialize(): string {
        const obj: Record<string, CacheEntry> = {};
        for (const [key, value] of this.entries) {
            obj[key] = value;
        }
        return JSON.stringify(obj);
    }

    /**
     * Populate the cache from a previously serialized JSON string.
     * Handles empty string and invalid JSON gracefully (leaves cache empty).
     */
    restore(json: string): void {
        if (!json.trim()) return;

        let parsed: unknown;
        try {
            parsed = JSON.parse(json);
        } catch {
            return;
        }

        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            return;
        }

        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            // Basic shape validation — require the minimum fields.
            if (
                value &&
                typeof value === "object" &&
                !Array.isArray(value) &&
                "platform" in value &&
                "bestProvider" in value &&
                "results" in value &&
                "probedAt" in value &&
                "testPath" in value
            ) {
                this.entries.set(key, value as CacheEntry);
            }
        }
    }
}
