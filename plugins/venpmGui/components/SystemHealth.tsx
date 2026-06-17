import { useState, useEffect } from "@webpack/common";
import type { HealthItem, VenpmDetection, EnvironmentStatus, RepoInfo } from "../types";
import { Native } from "../nativeApi";

function buildHealthItems(venpm: VenpmDetection, env: EnvironmentStatus, repos: RepoInfo[]): HealthItem[] {
    const items: HealthItem[] = [];

    items.push(venpm.found
        ? { label: "venpm", status: "green", detail: `v${venpm.version}` }
        : { label: "venpm", status: "red", detail: "Not found", fixHint: "Run: npm install -g @kamaras/venpm" }
    );

    items.push(env.git
        ? { label: "git", status: "green", detail: "Available" }
        : { label: "git", status: "yellow", detail: "Not found", fixHint: "Recommended — without git, plugins install via tarball which is slower" }
    );

    items.push(env.pnpm
        ? { label: "pnpm", status: "green", detail: "Available" }
        : { label: "pnpm", status: "yellow", detail: "Not found", fixHint: "Recommended — needed for Vencord rebuilds" }
    );

    items.push(env.vencordPath
        ? { label: "Vencord", status: "green", detail: env.vencordPath }
        : { label: "Vencord", status: "red", detail: "Path not configured", fixHint: "Set vencord.path in venpm config or run the setup wizard" }
    );

    items.push(env.discordBinary
        ? { label: "Discord", status: "green", detail: env.discordBinary }
        : { label: "Discord", status: "red", detail: "Binary not found", fixHint: "Discord binary path could not be auto-detected" }
    );

    items.push(repos.length > 0
        ? { label: "Repos", status: "green", detail: `${repos.length} configured` }
        : { label: "Repos", status: "yellow", detail: "No repos configured", fixHint: "Add a repository in the Advanced tab" }
    );

    return items;
}

export function SystemHealth() {
    const [items, setItems] = useState<HealthItem[]>([]);
    const [expandedHint, setExpandedHint] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            const [venpm, env, config] = await Promise.all([
                Native.detectVenpm(),
                Native.detectEnvironment(),
                Native.readConfig(),
            ]);
            const repos = (config as { repos?: RepoInfo[] })?.repos ?? [];
            setItems(buildHealthItems(venpm, env, repos));
        })();
    }, []);

    if (items.length === 0) return null;

    return (
        <div className="vc-venpmGui-health">
            <div className="vc-venpmGui-section-header">System Health</div>
            {items.map(item => (
                <div key={item.label}>
                    <div
                        className="vc-venpmGui-health-item"
                        onClick={() => item.fixHint && setExpandedHint(expandedHint === item.label ? null : item.label)}
                        style={item.fixHint ? { cursor: "pointer" } : undefined}
                    >
                        <div className={`vc-venpmGui-health-dot ${item.status}`} />
                        <span>{item.label}</span>
                        <span style={{ opacity: 0.5 }}>{item.detail}</span>
                    </div>
                    {item.fixHint && expandedHint === item.label && (
                        <div className="vc-venpmGui-health-hint">{item.fixHint}</div>
                    )}
                </div>
            ))}
        </div>
    );
}
