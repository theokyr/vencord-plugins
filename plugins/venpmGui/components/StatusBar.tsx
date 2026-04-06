import type { InstalledPluginInfo } from "../types";

interface StatusBarProps {
    venpmVersion: string | null;
    plugins: InstalledPluginInfo[];
    onUpdateAll: () => void;
    updating: boolean;
}

export function StatusBar({ venpmVersion, plugins, onUpdateAll, updating }: StatusBarProps) {
    const updateCount = plugins.filter(p => p.hasUpdate).length;

    return (
        <div className="vc-venpmGui-status-bar">
            <span>{venpmVersion ? `venpm ${venpmVersion}` : "venpm"}</span>
            <span className="vc-venpmGui-separator">|</span>
            <span>{plugins.length} installed</span>
            {updateCount > 0 && (
                <>
                    <span className="vc-venpmGui-separator">|</span>
                    <span className="vc-venpmGui-update-count">
                        {updateCount} update{updateCount > 1 ? "s" : ""} available
                    </span>
                    <span
                        className="vc-venpmGui-update-all"
                        onClick={updating ? undefined : onUpdateAll}
                        style={updating ? { opacity: 0.5 } : undefined}
                    >
                        {updating ? "Updating..." : "Update All"}
                    </span>
                </>
            )}
        </div>
    );
}
