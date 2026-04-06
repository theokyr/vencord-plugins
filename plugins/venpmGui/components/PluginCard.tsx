import type { InstalledPluginInfo, AvailablePlugin } from "../types";

type PluginData = InstalledPluginInfo | AvailablePlugin;

interface PluginCardProps {
    plugin: PluginData;
    mode: "list" | "grid";
    context: "installed" | "browse";
    onInstall?: (name: string) => void;
    onUninstall?: (name: string) => void;
    onUpdate?: (name: string) => void;
    busy?: boolean;
}

function isInstalled(p: PluginData): p is InstalledPluginInfo {
    return "method" in p;
}

function isAvailable(p: PluginData): p is AvailablePlugin {
    return "installed" in p;
}

function Badge({ plugin, context, onUpdate }: { plugin: PluginData; context: string; onUpdate?: (name: string) => void }) {
    if (context === "browse" && isAvailable(plugin)) {
        if (plugin.installed) {
            return <span className="vc-venpmGui-badge vc-venpmGui-badge-installed">Installed</span>;
        }
        return null;
    }

    if (context === "installed" && isInstalled(plugin)) {
        if (plugin.method === "local") {
            return <span className="vc-venpmGui-badge vc-venpmGui-badge-pinned">Local dev</span>;
        }
        if (plugin.pinned) {
            return <span className="vc-venpmGui-badge vc-venpmGui-badge-pinned">Pinned</span>;
        }
        if (plugin.hasUpdate && plugin.latestVersion) {
            return (
                <span
                    className="vc-venpmGui-badge vc-venpmGui-badge-update"
                    onClick={() => onUpdate?.(plugin.name)}
                >
                    Update to {plugin.latestVersion}
                </span>
            );
        }
        return <span className="vc-venpmGui-badge vc-venpmGui-badge-current">Up to date</span>;
    }

    return null;
}

function ActionButton({ plugin, context, onInstall, onUninstall, busy }: Pick<PluginCardProps, "plugin" | "context" | "onInstall" | "onUninstall" | "busy">) {
    if (context === "browse" && isAvailable(plugin) && !plugin.installed) {
        return (
            <button
                className="vc-venpmGui-btn vc-venpmGui-btn-primary"
                onClick={() => onInstall?.(plugin.name)}
                disabled={busy}
            >
                {busy ? "Installing..." : "Install"}
            </button>
        );
    }

    if (context === "installed") {
        return (
            <button
                className="vc-venpmGui-btn vc-venpmGui-btn-danger"
                onClick={() => onUninstall?.(plugin.name)}
                disabled={busy}
            >
                Uninstall
            </button>
        );
    }

    return null;
}

export function PluginCard({ plugin, mode, context, onInstall, onUninstall, onUpdate, busy }: PluginCardProps) {
    const description = isAvailable(plugin) ? plugin.description : "";
    const version = isInstalled(plugin) ? plugin.version : isAvailable(plugin) ? plugin.version : "";
    const repo = isInstalled(plugin) ? plugin.repo : isAvailable(plugin) ? plugin.repo : "";

    if (mode === "grid") {
        return (
            <div className="vc-venpmGui-plugin-card">
                <div className="vc-venpmGui-plugin-name">{plugin.name}</div>
                {description && <div className="vc-venpmGui-plugin-desc">{description}</div>}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Badge plugin={plugin} context={context} onUpdate={onUpdate} />
                    <span className="vc-venpmGui-plugin-version">{version}</span>
                    <div style={{ marginLeft: "auto" }}>
                        <ActionButton plugin={plugin} context={context} onInstall={onInstall} onUninstall={onUninstall} busy={busy} />
                    </div>
                </div>
            </div>
        );
    }

    // List mode
    return (
        <div className={`vc-venpmGui-plugin-row ${context === "browse" && isAvailable(plugin) && plugin.installed ? "vc-venpmGui-dimmed" : ""}`}>
            <div className="vc-venpmGui-plugin-info">
                <div className="vc-venpmGui-plugin-name">{plugin.name}</div>
                {description && <div className="vc-venpmGui-plugin-desc">{description}</div>}
                {repo && <div className="vc-venpmGui-plugin-meta">{repo}</div>}
            </div>
            <span className="vc-venpmGui-plugin-version">{version}</span>
            <Badge plugin={plugin} context={context} onUpdate={onUpdate} />
            <ActionButton plugin={plugin} context={context} onInstall={onInstall} onUninstall={onUninstall} busy={busy} />
        </div>
    );
}
