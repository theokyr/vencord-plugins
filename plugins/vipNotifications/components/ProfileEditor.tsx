import { Button, React } from "@webpack/common";

import type { CooldownKey, PrivacyMode, SoundKind, VipConfig, VipProfile } from "../types";

interface ProfileEditorProps {
    config: VipConfig;
    mode: "full" | "compact";
    selectedProfileId: string | null;
    onSelectProfile(profileId: string): void;
    onCreateProfile(): void;
    onDeleteProfile(profileId: string): void;
    onSetDefaultProfile(profileId: string): void;
    onUpdateProfile(profileId: string, patch: Partial<VipProfile>): void;
}

const SOUND_KIND_OPTIONS: Array<{ value: SoundKind; label: string }> = [
    { value: "disabled", label: "Disabled" },
    { value: "builtIn", label: "Built-in" },
    { value: "custom", label: "Custom URL" },
];

const PRIVACY_MODE_OPTIONS: Array<{ value: PrivacyMode; label: string }> = [
    { value: "streamerAware", label: "Streamer aware" },
    { value: "full", label: "Full content" },
    { value: "senderOnly", label: "Sender only" },
    { value: "generic", label: "Generic" },
];

const COOLDOWN_KEY_OPTIONS: Array<{ value: CooldownKey; label: string }> = [
    { value: "profileChannel", label: "Profile + channel" },
    { value: "profileRule", label: "Profile + rule" },
    { value: "profileAuthor", label: "Profile + author" },
    { value: "profileOnly", label: "Profile only" },
];

function numberFromInput(value: string, fallback: number, min: number, max?: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return fallback;

    const lowerBounded = Math.max(min, parsed);
    return typeof max === "number" ? Math.min(max, lowerBounded) : lowerBounded;
}

function Field({ label, note, children }: { label: string; note?: string; children: any; }) {
    return (
        <label className="vc-vipNotifications-field">
            <span className="vc-vipNotifications-fieldLabel">{label}</span>
            {children}
            {note && <span className="vc-vipNotifications-fieldNote">{note}</span>}
        </label>
    );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void; }) {
    return (
        <label className="vc-vipNotifications-toggleField">
            <input
                type="checkbox"
                checked={checked}
                onChange={(event: any) => onChange(Boolean(event.currentTarget.checked))}
            />
            <span>{label}</span>
        </label>
    );
}

export function ProfileEditor({
    config,
    mode,
    selectedProfileId,
    onSelectProfile,
    onCreateProfile,
    onDeleteProfile,
    onSetDefaultProfile,
    onUpdateProfile,
}: ProfileEditorProps) {
    const selectedProfile = config.profiles.find(profile => profile.id === selectedProfileId)
        ?? config.profiles.find(profile => profile.id === config.defaultProfileId)
        ?? config.profiles[0];
    const canDelete = config.profiles.length > 1;

    return (
        <section className={`vc-vipNotifications-section vc-vipNotifications-profileEditor vc-vipNotifications-profileEditor-${mode}`}>
            <div className="vc-vipNotifications-sectionHeader">
                <div>
                    <div className="vc-vipNotifications-sectionTitle">Profiles</div>
                    <div className="vc-vipNotifications-sectionSubtitle">Delivery behavior for matching rules.</div>
                </div>
                <Button size={Button.Sizes.SMALL} onClick={onCreateProfile}>
                    Add Profile
                </Button>
            </div>

            <div className="vc-vipNotifications-editorGrid">
                <div className="vc-vipNotifications-listPane" role="list" aria-label="VIP profiles">
                    {config.profiles.map(profile => {
                        const selected = profile.id === selectedProfile?.id;
                        const isDefault = profile.id === config.defaultProfileId;

                        return (
                            <button
                                type="button"
                                key={profile.id}
                                className={`vc-vipNotifications-listItem${selected ? " vc-vipNotifications-listItemSelected" : ""}`}
                                onClick={() => onSelectProfile(profile.id)}
                            >
                                <span className="vc-vipNotifications-listItemTitle">{profile.name}</span>
                                <span className="vc-vipNotifications-listItemMeta">
                                    {profile.enabled ? "Enabled" : "Disabled"}{isDefault ? " / Default" : ""}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {selectedProfile && (
                    <div className="vc-vipNotifications-detailPane">
                        <div className="vc-vipNotifications-detailHeader">
                            <div className="vc-vipNotifications-detailTitle">{selectedProfile.name}</div>
                            <div className="vc-vipNotifications-detailActions">
                                <button
                                    type="button"
                                    className="vc-vipNotifications-smallButton"
                                    disabled={selectedProfile.id === config.defaultProfileId}
                                    onClick={() => onSetDefaultProfile(selectedProfile.id)}
                                >
                                    Make Default
                                </button>
                                <button
                                    type="button"
                                    className="vc-vipNotifications-smallButton vc-vipNotifications-dangerButton"
                                    disabled={!canDelete}
                                    onClick={() => onDeleteProfile(selectedProfile.id)}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>

                        <div className="vc-vipNotifications-formGrid">
                            <Field label="Name">
                                <input
                                    className="vc-vipNotifications-input"
                                    type="text"
                                    value={selectedProfile.name}
                                    onChange={(event: any) => onUpdateProfile(selectedProfile.id, { name: event.currentTarget.value })}
                                />
                            </Field>

                            <Field label="Sound">
                                <select
                                    className="vc-vipNotifications-input"
                                    value={selectedProfile.soundKind}
                                    onChange={(event: any) => onUpdateProfile(selectedProfile.id, { soundKind: event.currentTarget.value as SoundKind })}
                                >
                                    {SOUND_KIND_OPTIONS.map(option => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </Field>

                            <Field label="Built-in Sound ID">
                                <input
                                    className="vc-vipNotifications-input"
                                    type="text"
                                    value={selectedProfile.soundId}
                                    onChange={(event: any) => onUpdateProfile(selectedProfile.id, { soundId: event.currentTarget.value })}
                                />
                            </Field>

                            <Field label="Custom Sound URL">
                                <input
                                    className="vc-vipNotifications-input"
                                    type="text"
                                    value={selectedProfile.customSoundUrl}
                                    onChange={(event: any) => onUpdateProfile(selectedProfile.id, { customSoundUrl: event.currentTarget.value })}
                                />
                            </Field>

                            <Field label="Volume">
                                <input
                                    className="vc-vipNotifications-input"
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={selectedProfile.soundVolume}
                                    onChange={(event: any) => onUpdateProfile(selectedProfile.id, {
                                        soundVolume: numberFromInput(event.currentTarget.value, selectedProfile.soundVolume, 0, 100),
                                    })}
                                />
                            </Field>

                            <Field label="Privacy">
                                <select
                                    className="vc-vipNotifications-input"
                                    value={selectedProfile.privacyMode}
                                    onChange={(event: any) => onUpdateProfile(selectedProfile.id, { privacyMode: event.currentTarget.value as PrivacyMode })}
                                >
                                    {PRIVACY_MODE_OPTIONS.map(option => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </Field>

                            <Field label="Cooldown">
                                <input
                                    className="vc-vipNotifications-input"
                                    type="number"
                                    min={0}
                                    value={selectedProfile.cooldownMs}
                                    onChange={(event: any) => onUpdateProfile(selectedProfile.id, {
                                        cooldownMs: numberFromInput(event.currentTarget.value, selectedProfile.cooldownMs, 0),
                                    })}
                                />
                            </Field>

                            <Field label="Cooldown Key">
                                <select
                                    className="vc-vipNotifications-input"
                                    value={selectedProfile.cooldownKey}
                                    onChange={(event: any) => onUpdateProfile(selectedProfile.id, { cooldownKey: event.currentTarget.value as CooldownKey })}
                                >
                                    {COOLDOWN_KEY_OPTIONS.map(option => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </Field>
                        </div>

                        <div className="vc-vipNotifications-toggleGrid">
                            <ToggleField
                                label="Enabled"
                                checked={selectedProfile.enabled}
                                onChange={enabled => onUpdateProfile(selectedProfile.id, { enabled })}
                            />
                            <ToggleField
                                label="Desktop notification"
                                checked={selectedProfile.showDesktopNotification}
                                onChange={showDesktopNotification => onUpdateProfile(selectedProfile.id, { showDesktopNotification })}
                            />
                            <ToggleField
                                label="Vencord notification"
                                checked={selectedProfile.showVencordNotification}
                                onChange={showVencordNotification => onUpdateProfile(selectedProfile.id, { showVencordNotification })}
                            />
                            <ToggleField
                                label="Allow DND override"
                                checked={selectedProfile.allowDndOverride}
                                onChange={allowDndOverride => onUpdateProfile(selectedProfile.id, { allowDndOverride })}
                            />
                            <ToggleField
                                label="Allow streamer mode override"
                                checked={selectedProfile.allowStreamerModeOverride}
                                onChange={allowStreamerModeOverride => onUpdateProfile(selectedProfile.id, { allowStreamerModeOverride })}
                            />
                            <ToggleField
                                label="Allow streamer content"
                                checked={selectedProfile.allowStreamerContent}
                                onChange={allowStreamerContent => onUpdateProfile(selectedProfile.id, { allowStreamerContent })}
                            />
                            <ToggleField
                                label="Allow mute override"
                                checked={selectedProfile.allowMuteOverride}
                                onChange={allowMuteOverride => onUpdateProfile(selectedProfile.id, { allowMuteOverride })}
                            />
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
