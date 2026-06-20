import { Button, React } from "@webpack/common";

import { createDefaultConfig } from "../defaults";
import {
    addProfileToConfig,
    addRuleToConfig,
    moveRuleInConfig,
    readConfig,
    removeProfileFromConfig,
    setDefaultProfileInConfig,
    updateConfig,
    writeConfig,
} from "../settings";
import type { VipConfig, VipProfile, VipRule } from "../types";
import { ProfileEditor } from "./ProfileEditor";
import { RuleEditor } from "./RuleEditor";
import { RuleList } from "./RuleList";

export interface VipManagerProps {
    mode: "full" | "compact";
}

function numberFromInput(value: string, fallback: number, min: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(min, parsed) : fallback;
}

function RootSettings({ config, onUpdate }: {
    config: VipConfig;
    onUpdate(patch: Partial<Pick<VipConfig, "quickAddPlacement" | "decisionTtlMs">>): void;
}) {
    return (
        <section className="vc-vipNotifications-section vc-vipNotifications-rootSettings">
            <div className="vc-vipNotifications-sectionHeader">
                <div>
                    <div className="vc-vipNotifications-sectionTitle">General</div>
                    <div className="vc-vipNotifications-sectionSubtitle">Global matching and quick-add behavior.</div>
                </div>
            </div>
            <div className="vc-vipNotifications-formGrid">
                <label className="vc-vipNotifications-field">
                    <span className="vc-vipNotifications-fieldLabel">Quick Add Placement</span>
                    <select
                        className="vc-vipNotifications-input"
                        value={config.quickAddPlacement}
                        onChange={(event: any) => onUpdate({ quickAddPlacement: event.currentTarget.value })}
                    >
                        <option value="top">Top</option>
                        <option value="bottom">Bottom</option>
                    </select>
                </label>
                <label className="vc-vipNotifications-field">
                    <span className="vc-vipNotifications-fieldLabel">Decision TTL</span>
                    <input
                        className="vc-vipNotifications-input"
                        type="number"
                        min={0}
                        value={config.decisionTtlMs}
                        onChange={(event: any) => onUpdate({
                            decisionTtlMs: numberFromInput(event.currentTarget.value, config.decisionTtlMs, 0),
                        })}
                    />
                </label>
            </div>
        </section>
    );
}

export function VipManager({ mode }: VipManagerProps) {
    const [, rerender] = React.useState(0);
    const [selectedProfileId, setSelectedProfileId] = React.useState(null as string | null);
    const [selectedRuleId, setSelectedRuleId] = React.useState(null as string | null);
    const { config, diagnostics } = readConfig();
    const enabledProfiles = config.profiles.filter(profile => profile.enabled).length;
    const enabledRules = config.rules.filter(rule => rule.enabled).length;
    const activeProfileId = selectedProfileId && config.profiles.some(profile => profile.id === selectedProfileId)
        ? selectedProfileId
        : config.defaultProfileId;
    const activeRuleId = selectedRuleId && config.rules.some(rule => rule.id === selectedRuleId)
        ? selectedRuleId
        : config.rules[0]?.id ?? null;
    const selectedRule = config.rules.find(rule => rule.id === activeRuleId) ?? null;

    function force() {
        rerender((value: number) => value + 1);
    }

    function commit(mutator: (config: VipConfig) => VipConfig | void): VipConfig {
        const result = updateConfig(mutator);
        force();
        return result.config;
    }

    function resetToDefault() {
        writeConfig(createDefaultConfig());
        setSelectedProfileId("default");
        setSelectedRuleId(null);
        force();
    }

    function updateRoot(patch: Partial<Pick<VipConfig, "quickAddPlacement" | "decisionTtlMs">>) {
        commit(current => ({ ...current, ...patch }));
    }

    function createProfile() {
        const next = commit(addProfileToConfig);
        setSelectedProfileId(next.profiles[next.profiles.length - 1]?.id ?? next.defaultProfileId);
    }

    function deleteProfile(profileId: string) {
        const next = commit(current => removeProfileFromConfig(current, profileId));
        setSelectedProfileId(next.profiles.some(profile => profile.id === activeProfileId) ? activeProfileId : next.defaultProfileId);
    }

    function updateProfile(profileId: string, patch: Partial<VipProfile>) {
        commit(current => ({
            ...current,
            profiles: current.profiles.map(profile => (
                profile.id === profileId ? { ...profile, ...patch } : profile
            )),
        }));
    }

    function createRule() {
        const next = commit(addRuleToConfig);
        setSelectedRuleId(next.rules[next.rules.length - 1]?.id ?? null);
    }

    function updateRule(ruleId: string, patch: Partial<VipRule>) {
        commit(current => ({
            ...current,
            rules: current.rules.map(rule => (
                rule.id === ruleId ? { ...rule, ...patch } : rule
            )),
        }));
    }

    function deleteRule(ruleId: string) {
        const currentIndex = config.rules.findIndex(rule => rule.id === ruleId);
        const next = commit(current => ({
            ...current,
            rules: current.rules.filter(rule => rule.id !== ruleId),
        }));
        const fallbackIndex = Math.min(Math.max(currentIndex, 0), next.rules.length - 1);

        setSelectedRuleId(next.rules[fallbackIndex]?.id ?? null);
    }

    function moveRule(fromIndex: number, toIndex: number) {
        commit(current => moveRuleInConfig(current, fromIndex, toIndex));
    }

    return (
        <div className={`vc-vipNotifications-manager vc-vipNotifications-manager-${mode}`}>
            <div className="vc-vipNotifications-managerHeader">
                <div>
                    <div className="vc-vipNotifications-title">VIP Notifications</div>
                    <div className="vc-vipNotifications-subtitle">Profiles, rules, priority order, and notification overrides.</div>
                </div>
                <Button size={Button.Sizes.SMALL} onClick={resetToDefault}>
                    Reset Defaults
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
                    <span>Default</span>
                    <strong>{config.defaultProfileId}</strong>
                </div>
                <div className="vc-vipNotifications-summaryItem">
                    <span>TTL</span>
                    <strong>{Math.round(config.decisionTtlMs / 1000)}s</strong>
                </div>
            </div>

            {diagnostics.length > 0 && (
                <div className="vc-vipNotifications-diagnosticsList">
                    {diagnostics.slice(0, 4).map(diagnostic => (
                        <div
                            className={`vc-vipNotifications-diagnostic vc-vipNotifications-diagnostic-${diagnostic.severity ?? "warning"}`}
                            key={`${diagnostic.code}:${diagnostic.path ?? ""}`}
                        >
                            {diagnostic.message}
                        </div>
                    ))}
                </div>
            )}

            <RootSettings config={config} onUpdate={updateRoot} />

            <ProfileEditor
                config={config}
                mode={mode}
                selectedProfileId={activeProfileId}
                onSelectProfile={setSelectedProfileId}
                onCreateProfile={createProfile}
                onDeleteProfile={deleteProfile}
                onSetDefaultProfile={profileId => commit(current => setDefaultProfileInConfig(current, profileId))}
                onUpdateProfile={updateProfile}
            />

            <RuleList
                rules={config.rules}
                selectedRuleId={activeRuleId}
                mode={mode}
                onCreateRule={createRule}
                onSelectRule={setSelectedRuleId}
                onToggleRule={(ruleId, enabled) => updateRule(ruleId, { enabled })}
                onDeleteRule={deleteRule}
                onMoveRule={moveRule}
            />

            <RuleEditor
                rule={selectedRule}
                profiles={config.profiles}
                mode={mode}
                onUpdateRule={updateRule}
            />
        </div>
    );
}
