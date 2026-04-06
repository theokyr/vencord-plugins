import type { InstalledPluginInfo, AvailablePlugin } from "../types";
import { PluginCard } from "./PluginCard";

interface PluginGridProps {
    plugins: (InstalledPluginInfo | AvailablePlugin)[];
    context: "installed" | "browse";
    onInstall?: (name: string) => void;
    onUninstall?: (name: string) => void;
    onUpdate?: (name: string) => void;
    busyPlugin?: string | null;
}

export function PluginGrid({ plugins, context, onInstall, onUninstall, onUpdate, busyPlugin }: PluginGridProps) {
    return (
        <div className="vc-venpmGui-plugin-grid">
            {plugins.map(p => (
                <PluginCard
                    key={p.name}
                    plugin={p}
                    mode="grid"
                    context={context}
                    onInstall={onInstall}
                    onUninstall={onUninstall}
                    onUpdate={onUpdate}
                    busy={busyPlugin === p.name}
                />
            ))}
        </div>
    );
}
