import { useState, useEffect } from "@webpack/common";
import { showToast, Toasts } from "@webpack/common";
import type { RepoInfo } from "../types";
import { Native } from "../nativeApi";

export function Advanced() {
    const [repos, setRepos] = useState<RepoInfo[]>([]);
    const [vencordPath, setVencordPath] = useState("");
    const [rebuildMode, setRebuildMode] = useState("ask");
    const [discordRestart, setDiscordRestart] = useState("ask");
    const [showAddRepo, setShowAddRepo] = useState(false);
    const [newRepoUrl, setNewRepoUrl] = useState("");
    const [newRepoName, setNewRepoName] = useState("");
    const [loading, setLoading] = useState(true);
    const [checkingHealth, setCheckingHealth] = useState(false);
    const [healthResult, setHealthResult] = useState<{ passed: boolean; output?: string } | null>(null);

    const loadConfig = async () => {
        try {
            const config = await Native.readConfig();
            if (config) {
                setRepos(config.repos ?? []);
                setVencordPath(config.vencord?.path ?? "");
                setRebuildMode(config.rebuild?.mode ?? "ask");
                setDiscordRestart(config.discord?.restart ?? "ask");
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadConfig().catch(() => setLoading(false));
    }, []);

    const handleAddRepo = async () => {
        if (!newRepoUrl.trim()) return;
        const args = ["repo", "add", newRepoUrl.trim()];
        if (newRepoName.trim()) {
            args.push("--name", newRepoName.trim());
        }
        const result = await Native.runVenpm(args);
        if (result.success) {
            showToast("Repository added", Toasts.Type.SUCCESS);
            setNewRepoUrl("");
            setNewRepoName("");
            setShowAddRepo(false);
            await loadConfig();
        } else {
            showToast(result.error ?? "Failed to add repo", Toasts.Type.FAILURE);
        }
    };

    const handleRemoveRepo = async (name: string) => {
        const result = await Native.runVenpm(["repo", "remove", name]);
        if (result.success) {
            showToast(`Repository "${name}" removed`, Toasts.Type.SUCCESS);
            await loadConfig();
        } else {
            showToast(result.error ?? "Failed to remove repo", Toasts.Type.FAILURE);
        }
    };

    const handleRefreshAll = async () => {
        // Workaround: venpm has no dedicated "refresh index" command; running
        // `search ""` triggers a full index re-fetch as a side effect.
        const result = await Native.runVenpm(["search", ""]);
        if (result.success) {
            showToast("Indexes refreshed", Toasts.Type.SUCCESS);
        } else {
            showToast(result.error ?? "Refresh failed", Toasts.Type.FAILURE);
        }
    };

    const handleConfigChange = async (key: string, value: string) => {
        const result = await Native.runVenpm(["config", "set", key, value]);
        if (result.success) {
            showToast("Configuration updated", Toasts.Type.SUCCESS);
            await loadConfig();
        } else {
            showToast(result.error ?? "Failed to update config", Toasts.Type.FAILURE);
        }
    };

    const handleCheckHealth = async () => {
        setCheckingHealth(true);
        setHealthResult(null);
        const result = await Native.runVenpm(["doctor"]);
        setHealthResult({
            passed: result.success,
            output: result.error,
        });
        setCheckingHealth(false);
    };

    return (
        <div>
            {/* Repositories */}
            <div className="vc-venpmGui-section-header">Repositories</div>
            {repos.map(repo => (
                <div key={repo.name} className="vc-venpmGui-repo-row">
                    <span className="vc-venpmGui-repo-name">{repo.name}</span>
                    <span className="vc-venpmGui-repo-url">{repo.url}</span>
                    <button
                        className="vc-venpmGui-btn vc-venpmGui-btn-danger"
                        onClick={() => handleRemoveRepo(repo.name)}
                    >
                        Remove
                    </button>
                </div>
            ))}

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                    className="vc-venpmGui-btn vc-venpmGui-btn-primary"
                    onClick={() => setShowAddRepo(!showAddRepo)}
                >
                    {showAddRepo ? "Cancel" : "Add Repo"}
                </button>
                <button
                    className="vc-venpmGui-btn vc-venpmGui-btn-secondary"
                    onClick={handleRefreshAll}
                >
                    Refresh All
                </button>
            </div>

            {showAddRepo && repos.length <= 1 && (
                <div style={{ marginTop: 8, padding: "8px 12px", background: "var(--background-secondary, #2b2d31)", borderRadius: 6, fontSize: 13, color: "var(--text-warning, #faa61a)" }}>
                    Community repos contain user-created plugins. Make sure you trust the source before installing.
                </div>
            )}

            {showAddRepo && (
                <div className="vc-venpmGui-inline-form">
                    <input
                        className="vc-venpmGui-input"
                        type="text"
                        placeholder="Repository URL"
                        value={newRepoUrl}
                        onChange={e => setNewRepoUrl(e.target.value)}
                    />
                    <input
                        className="vc-venpmGui-input"
                        type="text"
                        placeholder="Name (optional)"
                        value={newRepoName}
                        onChange={e => setNewRepoName(e.target.value)}
                        style={{ maxWidth: 150 }}
                    />
                    <button
                        className="vc-venpmGui-btn vc-venpmGui-btn-primary"
                        onClick={handleAddRepo}
                    >
                        Add
                    </button>
                </div>
            )}

            {repos.length === 0 && (
                <div style={{ opacity: 0.5, padding: "12px 0", fontSize: 13 }}>
                    No repositories configured. Add one to start browsing plugins.
                </div>
            )}

            {/* Configuration */}
            <div className="vc-venpmGui-section-header" style={{ marginTop: 24 }}>Configuration</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <label style={{ fontSize: 13, minWidth: 120 }}>Vencord Path</label>
                    <input
                        className="vc-venpmGui-input"
                        type="text"
                        value={vencordPath}
                        onChange={e => setVencordPath(e.target.value)}
                        onBlur={() => handleConfigChange("vencord.path", vencordPath)}
                    />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <label style={{ fontSize: 13, minWidth: 120 }}>Rebuild Mode</label>
                    <select
                        className="vc-venpmGui-input"
                        value={rebuildMode}
                        onChange={e => {
                            setRebuildMode(e.target.value);
                            handleConfigChange("rebuild.mode", e.target.value);
                        }}
                        style={{ flex: "none", width: 120 }}
                    >
                        <option value="ask">Ask</option>
                        <option value="always">Always</option>
                        <option value="never">Never</option>
                    </select>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <label style={{ fontSize: 13, minWidth: 120 }}>Discord Restart</label>
                    <select
                        className="vc-venpmGui-input"
                        value={discordRestart}
                        onChange={e => {
                            setDiscordRestart(e.target.value);
                            handleConfigChange("discord.restart", e.target.value);
                        }}
                        style={{ flex: "none", width: 120 }}
                    >
                        <option value="ask">Ask</option>
                        <option value="always">Always</option>
                        <option value="never">Never</option>
                    </select>
                </div>
            </div>

            {/* Health Check */}
            <div className="vc-venpmGui-section-header" style={{ marginTop: 24 }}>Health Check</div>
            <button
                className="vc-venpmGui-btn vc-venpmGui-btn-secondary"
                onClick={handleCheckHealth}
                disabled={checkingHealth}
            >
                {checkingHealth ? "Checking..." : "Check Health"}
            </button>

            {healthResult !== null && (
                <div style={{ marginTop: 8 }}>
                    <div className="vc-venpmGui-health-item">
                        <div className={`vc-venpmGui-health-dot ${healthResult.passed ? "green" : "red"}`} />
                        <span>{healthResult.passed ? "All checks passed" : healthResult.output ?? "Health check failed"}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
