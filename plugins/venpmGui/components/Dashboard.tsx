import { useState, useEffect } from "@webpack/common";
import { showToast, Toasts } from "@webpack/common";
import { settings } from "../settings";
import type { TabId, InstalledPluginInfo } from "../types";
import { TabNav } from "./TabNav";
import { StatusBar } from "./StatusBar";
import { PluginList } from "./PluginList";
import { PluginGrid } from "./PluginGrid";
import { SystemHealth } from "./SystemHealth";
import { Browse } from "./Browse";
import { Advanced } from "./Advanced";
import { Wizard } from "./Wizard";
import { Native } from "../nativeApi";

function buildInstalledPlugins(
    lockfile: { installed?: Record<string, { version: string; repo?: string; method?: string; pinned?: boolean }> },
    cache: { entries?: Record<string, { body?: string }> } | null
): InstalledPluginInfo[] {
    const installed = lockfile.installed ?? {};
    const plugins: InstalledPluginInfo[] = [];

    // Build a map of latest versions from cache
    const latestVersions: Record<string, string> = {};
    if (cache?.entries) {
        for (const entry of Object.values(cache.entries)) {
            if (!entry.body) continue;
            try {
                const index = JSON.parse(entry.body);
                for (const [name, info] of Object.entries(index.plugins ?? {})) {
                    latestVersions[name] = (info as { version: string }).version;
                }
            } catch {}
        }
    }

    for (const [name, info] of Object.entries(installed)) {
        const latest = latestVersions[name];
        const isLocal = info.method === "local";
        plugins.push({
            name,
            version: info.version,
            repo: info.repo ?? "",
            method: info.method ?? "git",
            pinned: info.pinned ?? false,
            latestVersion: latest,
            hasUpdate: isLocal ? false : (latest ? latest !== info.version : false),
        });
    }

    return plugins.sort((a, b) => a.name.localeCompare(b.name));
}

export function Dashboard() {
    const [activeTab, setActiveTab] = useState<TabId>("installed");
    const [plugins, setPlugins] = useState<InstalledPluginInfo[]>([]);
    const [venpmVersion, setVenpmVersion] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [busyPlugin, setBusyPlugin] = useState<string | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const [detection, lockfile, cache] = await Promise.all([
                Native.detectVenpm(),
                Native.readLockfile(),
                Native.readCachedIndexes(),
            ]);
            setVenpmVersion(detection.version ?? null);
            if (lockfile) {
                setPlugins(buildInstalledPlugins(lockfile, cache));
            }
        } catch {}
        setLoading(false);
    };

    useEffect(() => {
        loadData().catch(() => {
            // native calls failed — stay in empty (not loading) state
            setLoading(false);
        });
    }, []);

    if (!settings.store.setupComplete) {
        return <Wizard onComplete={loadData} />;
    }

    const handleUpdateAll = async () => {
        setUpdating(true);
        const result = await Native.runVenpm(["update"]);
        if (result.success) {
            showToast("All plugins updated", Toasts.Type.SUCCESS);
        } else {
            showToast(result.error ?? "Update failed", Toasts.Type.FAILURE);
        }
        await loadData();
        setUpdating(false);
    };

    const handleUpdate = async (name: string) => {
        setBusyPlugin(name);
        const result = await Native.runVenpm(["update", name]);
        if (result.success) {
            showToast(`${name} updated`, Toasts.Type.SUCCESS);
        } else {
            showToast(result.error ?? "Update failed", Toasts.Type.FAILURE);
        }
        await loadData();
        setBusyPlugin(null);
    };

    const handleUninstall = async (name: string) => {
        // Check if any other installed plugin depends on this one
        const cache = await Native.readCachedIndexes().catch(() => null);
        const dependents: string[] = [];
        if (cache?.entries) {
            for (const entry of Object.values(cache.entries)) {
                if (!entry.body) continue;
                try {
                    const index = JSON.parse(entry.body);
                    for (const [pName, pInfo] of Object.entries(index.plugins ?? {})) {
                        if (pName === name) continue;
                        const deps: string[] = (pInfo as { dependencies?: string[] }).dependencies ?? [];
                        if (deps.includes(name) && plugins.some(p => p.name === pName)) {
                            dependents.push(pName);
                        }
                    }
                } catch {}
            }
        }

        if (dependents.length) {
            const depList = dependents.join(", ");
            if (!window.confirm(`Warning: ${depList} depend${dependents.length === 1 ? "s" : ""} on ${name}.\n\nUninstalling may break them. Continue?`)) return;
        }

        setBusyPlugin(name);
        const result = await Native.runVenpm(["uninstall", name]);
        if (result.success) {
            showToast(`${name} uninstalled`, Toasts.Type.SUCCESS);
        } else {
            showToast(result.error ?? "Uninstall failed", Toasts.Type.FAILURE);
        }
        await loadData();
        setBusyPlugin(null);
    };

    const viewMode = settings.store.dashboardViewMode as string ?? "list";

    return (
        <div>
            <StatusBar
                venpmVersion={venpmVersion}
                plugins={plugins}
                onUpdateAll={handleUpdateAll}
                updating={updating}
            />
            <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

            {activeTab === "installed" && (
                loading ? (
                    <div style={{ opacity: 0.5, padding: 20, textAlign: "center" }}>Loading...</div>
                ) : plugins.length === 0 ? (
                    <div style={{ opacity: 0.5, padding: 20, textAlign: "center" }}>
                        No plugins installed via venpm. Browse available plugins to get started.
                    </div>
                ) : viewMode === "grid" ? (
                    <PluginGrid
                        plugins={plugins}
                        context="installed"
                        onUninstall={handleUninstall}
                        onUpdate={handleUpdate}
                        busyPlugin={busyPlugin}
                    />
                ) : (
                    <PluginList
                        plugins={plugins}
                        context="installed"
                        onUninstall={handleUninstall}
                        onUpdate={handleUpdate}
                        busyPlugin={busyPlugin}
                    />
                )
            )}

            {activeTab === "browse" && <Browse />}
            {activeTab === "advanced" && <Advanced />}

            {activeTab === "installed" && <SystemHealth />}
        </div>
    );
}
