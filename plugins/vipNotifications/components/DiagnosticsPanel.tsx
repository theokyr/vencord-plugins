import { Button, React } from "@webpack/common";

import { probeNativeDiscordCapabilities } from "../adapters/nativeDiscordAdapter";
import { readConfig } from "../settings";

export function DiagnosticsPanel() {
    const [, rerender] = React.useState(0);
    const { config, diagnostics } = readConfig();
    const capabilities = probeNativeDiscordCapabilities();
    const enabledProfiles = config.profiles.filter(profile => profile.enabled).length;
    const enabledRules = config.rules.filter(rule => rule.enabled).length;
    const defaultProfileValid = config.profiles.some(profile => profile.id === config.defaultProfileId);

    return (
        <section className="vc-vipNotifications-section vc-vipNotifications-diagnosticsPanel">
            <div className="vc-vipNotifications-sectionHeader">
                <div>
                    <div className="vc-vipNotifications-sectionTitle">Diagnostics</div>
                    <div className="vc-vipNotifications-sectionSubtitle">Config parsing, repairs, and delivery capability summary.</div>
                </div>
                <Button size={Button.Sizes.SMALL} onClick={() => rerender((value: number) => value + 1)}>
                    Refresh
                </Button>
            </div>

            <div className="vc-vipNotifications-summaryGrid">
                <div className="vc-vipNotifications-summaryItem">
                    <span>Profiles</span>
                    <strong>{enabledProfiles}/{config.profiles.length}</strong>
                </div>
                <div className="vc-vipNotifications-summaryItem">
                    <span>Rules</span>
                    <strong>{enabledRules}/{config.rules.length}</strong>
                </div>
                <div className="vc-vipNotifications-summaryItem">
                    <span>Default Profile</span>
                    <strong>{defaultProfileValid ? config.defaultProfileId : "Invalid"}</strong>
                </div>
                <div className="vc-vipNotifications-summaryItem">
                    <span>Decision TTL</span>
                    <strong>{Math.round(config.decisionTtlMs / 1000)}s</strong>
                </div>
                <div className="vc-vipNotifications-summaryItem">
                    <span>Native Sound</span>
                    <strong>{capabilities.native.sound ? "Available" : "Unavailable"}</strong>
                </div>
                <div className="vc-vipNotifications-summaryItem">
                    <span>Native Desktop</span>
                    <strong>{capabilities.native.desktop ? "Available" : "Unavailable"}</strong>
                </div>
                <div className="vc-vipNotifications-summaryItem">
                    <span>Quick Add</span>
                    <strong>{config.quickAddPlacement}</strong>
                </div>
                <div className="vc-vipNotifications-summaryItem">
                    <span>Version</span>
                    <strong>{config.version}</strong>
                </div>
            </div>

            <div className="vc-vipNotifications-diagnosticsList">
                {diagnostics.length === 0 ? (
                    <div className="vc-vipNotifications-diagnostic vc-vipNotifications-diagnostic-ok">
                        Config parsed without repairs.
                    </div>
                ) : (
                    diagnostics.map(diagnostic => (
                        <div
                            className={`vc-vipNotifications-diagnostic vc-vipNotifications-diagnostic-${diagnostic.severity ?? "warning"}`}
                            key={`${diagnostic.code}:${diagnostic.path ?? ""}`}
                        >
                            <strong>{diagnostic.code}</strong>
                            {diagnostic.path && <span> at {diagnostic.path}</span>}
                            <span>: {diagnostic.message}</span>
                        </div>
                    ))
                )}
            </div>
        </section>
    );
}
