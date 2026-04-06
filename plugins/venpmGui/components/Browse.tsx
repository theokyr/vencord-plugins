import { useState, useEffect } from "@webpack/common";
import { showToast, Toasts } from "@webpack/common";
import type { AvailablePlugin } from "../types";
import { PluginList } from "./PluginList";
import { Native } from "../nativeApi";

function buildAvailablePlugins(
    cache: { entries?: Record<string, { body?: string }> },
    installed: Record<string, { version: string }>
): { plugins: AvailablePlugin[]; repos: string[] } {
    const plugins: AvailablePlugin[] = [];
    const repoSet = new Set<string>();

    for (const entry of Object.values(cache.entries ?? {})) {
        if (!entry.body) continue;
        try {
            const index = JSON.parse(entry.body);
            const repoName = index.name ?? "unknown";
            repoSet.add(repoName);

            for (const [name, info] of Object.entries(index.plugins ?? {})) {
                const p = info as {
                    version: string;
                    description?: string;
                    authors?: { name: string; id: string }[];
                    dependencies?: string[];
                    optionalDependencies?: string[];
                };
                plugins.push({
                    name,
                    version: p.version,
                    description: p.description ?? "",
                    authors: p.authors ?? [],
                    repo: repoName,
                    dependencies: p.dependencies,
                    optionalDependencies: p.optionalDependencies,
                    installed: name in installed,
                    installedVersion: installed[name]?.version,
                });
            }
        } catch {}
    }

    return { plugins: plugins.sort((a, b) => a.name.localeCompare(b.name)), repos: [...repoSet].sort() };
}

export function Browse() {
    const [query, setQuery] = useState("");
    const [activeRepo, setActiveRepo] = useState<string | null>(null);
    const [allPlugins, setAllPlugins] = useState<AvailablePlugin[]>([]);
    const [repos, setRepos] = useState<string[]>([]);
    const [installing, setInstalling] = useState<string | null>(null);

    const loadData = async () => {
        const [cache, lockfile] = await Promise.all([
            Native.readCachedIndexes(),
            Native.readLockfile(),
        ]);
        if (cache) {
            const result = buildAvailablePlugins(cache, lockfile?.installed ?? {});
            setAllPlugins(result.plugins);
            setRepos(result.repos);
        }
    };

    useEffect(() => {
        loadData().catch(() => {
            // native calls failed — stay in empty (not loading) state
        });
    }, []);

    const filtered = allPlugins.filter(p => {
        if (activeRepo && p.repo !== activeRepo) return false;
        if (query) {
            const q = query.toLowerCase();
            return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
        }
        return true;
    });

    const handleInstall = async (name: string) => {
        const plugin = allPlugins.find(p => p.name === name);

        // Warn about hard dependencies before confirming
        if (plugin?.dependencies?.length) {
            const depList = plugin.dependencies.join(", ");
            if (!window.confirm(`This will also install: ${depList}\n\nContinue?`)) return;
        }

        setInstalling(name);
        const result = await Native.runVenpm(["install", name]);
        if (result.success) {
            showToast(`${name} installed successfully`, Toasts.Type.SUCCESS);

            // Tip: optional deps that aren't installed yet
            if (plugin?.optionalDependencies?.length) {
                // Re-read lockfile to see what's now installed
                const lockfile = await Native.readLockfile().catch(() => null);
                const nowInstalled = lockfile?.installed ?? {};
                const missing = plugin.optionalDependencies.filter(d => !(d in nowInstalled));
                if (missing.length) {
                    showToast(
                        `Tip: optional plugin${missing.length > 1 ? "s" : ""} available — ${missing.join(", ")}`,
                        Toasts.Type.MESSAGE
                    );
                }
            }

            // Prompt to rebuild Vencord
            if (window.confirm("Rebuild Vencord to activate the plugin?")) {
                Native.runVenpm(["rebuild"]);
            }
        } else {
            showToast(result.error ?? "Install failed", Toasts.Type.FAILURE);
        }
        await loadData();
        setInstalling(null);
    };

    return (
        <div>
            <input
                className="vc-venpmGui-search"
                type="text"
                placeholder="Search plugins..."
                value={query}
                onChange={e => setQuery(e.target.value)}
            />

            {repos.length > 1 && (
                <div className="vc-venpmGui-pills">
                    <span
                        className={`vc-venpmGui-pill ${activeRepo === null ? "vc-venpmGui-pill-active" : ""}`}
                        onClick={() => setActiveRepo(null)}
                    >
                        All repos
                    </span>
                    {repos.map(r => (
                        <span
                            key={r}
                            className={`vc-venpmGui-pill ${activeRepo === r ? "vc-venpmGui-pill-active" : ""}`}
                            onClick={() => setActiveRepo(r)}
                        >
                            {r}
                        </span>
                    ))}
                </div>
            )}

            {filtered.length === 0 ? (
                <div style={{ opacity: 0.5, padding: 20, textAlign: "center" }}>
                    {allPlugins.length === 0 ? "No cached plugin indexes. Add a repository in the Advanced tab." : "No plugins match your search."}
                </div>
            ) : (
                <PluginList
                    plugins={filtered}
                    context="browse"
                    onInstall={handleInstall}
                    busyPlugin={installing}
                />
            )}
        </div>
    );
}
