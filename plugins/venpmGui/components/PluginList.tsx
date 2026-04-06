import type { InstalledPluginInfo, AvailablePlugin } from "../types";
import { PluginCard } from "./PluginCard";

interface PluginListProps {
    plugins: (InstalledPluginInfo | AvailablePlugin)[];
    context: "installed" | "browse";
    onInstall?: (name: string) => void;
    onUninstall?: (name: string) => void;
    onUpdate?: (name: string) => void;
    busyPlugin?: string | null;
}

export function PluginList({ plugins, context, onInstall, onUninstall, onUpdate, busyPlugin }: PluginListProps) {
    return (
        <div className="vc-venpmGui-plugin-list">
            {plugins.map(p => (
                <PluginCard
                    key={p.name}
                    plugin={p}
                    mode="list"
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
