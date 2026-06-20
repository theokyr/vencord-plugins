import { React } from "@webpack/common";

import type { KeywordMode, VipMentionType, VipProfile, VipRule, VipRuleConditions } from "../types";

interface RuleEditorProps {
    rule: VipRule | null;
    profiles: VipProfile[];
    mode: "full" | "compact";
    onUpdateRule(ruleId: string, patch: Partial<VipRule>): void;
}

type ArrayConditionKey =
    | "authorUserIds"
    | "dmChannelIds"
    | "groupDmChannelIds"
    | "guildChannelIds"
    | "categoryIds"
    | "guildIds"
    | "mentionedRoleIds"
    | "keywords";

const ARRAY_CONDITION_FIELDS: Array<{ key: ArrayConditionKey; label: string; placeholder: string; }> = [
    { key: "authorUserIds", label: "Author User IDs", placeholder: "123, 456" },
    { key: "dmChannelIds", label: "DM Channel IDs", placeholder: "123, 456" },
    { key: "groupDmChannelIds", label: "Group DM Channel IDs", placeholder: "123, 456" },
    { key: "guildChannelIds", label: "Guild Channel IDs", placeholder: "123, 456" },
    { key: "categoryIds", label: "Category IDs", placeholder: "123, 456" },
    { key: "guildIds", label: "Guild IDs", placeholder: "123, 456" },
    { key: "mentionedRoleIds", label: "Mentioned Role IDs", placeholder: "123, 456" },
    { key: "keywords", label: "Keywords", placeholder: "release, incident, urgent" },
];

const MENTION_TYPES: Array<{ value: VipMentionType; label: string }> = [
    { value: "user", label: "User mention" },
    { value: "role", label: "Role mention" },
    { value: "everyone", label: "@everyone" },
    { value: "here", label: "@here" },
];

const KEYWORD_MODES: Array<{ value: KeywordMode; label: string }> = [
    { value: "any", label: "Any keyword" },
    { value: "all", label: "All keywords" },
];

function commaList(value: string[] | undefined): string {
    return (value ?? []).join(", ");
}

function parseCommaList(value: string): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const item of value.split(",")) {
        const trimmed = item.trim();
        if (!trimmed || seen.has(trimmed))
            continue;

        seen.add(trimmed);
        result.push(trimmed);
    }

    return result;
}

function withArrayCondition(conditions: VipRuleConditions, key: ArrayConditionKey, rawValue: string): VipRuleConditions {
    const next = { ...conditions };
    const values = parseCommaList(rawValue);

    if (values.length)
        next[key] = values as any;
    else
        delete next[key];

    return next;
}

function withMentionType(conditions: VipRuleConditions, mentionType: VipMentionType, enabled: boolean): VipRuleConditions {
    const current = conditions.mentionTypes ?? [];
    const nextTypes = enabled
        ? [...current.filter(type => type !== mentionType), mentionType]
        : current.filter(type => type !== mentionType);
    const next = { ...conditions };

    if (nextTypes.length)
        next.mentionTypes = nextTypes;
    else
        delete next.mentionTypes;

    return next;
}

function Field({ label, children }: { label: string; children: any; }) {
    return (
        <label className="vc-vipNotifications-field">
            <span className="vc-vipNotifications-fieldLabel">{label}</span>
            {children}
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

export function RuleEditor({ rule, profiles, mode, onUpdateRule }: RuleEditorProps) {
    if (!rule) {
        return (
            <section className={`vc-vipNotifications-section vc-vipNotifications-ruleEditor vc-vipNotifications-ruleEditor-${mode}`}>
                <div className="vc-vipNotifications-emptyState">Create or select a rule to edit matching conditions.</div>
            </section>
        );
    }

    const conditions = rule.conditions ?? {};
    const profileExists = profiles.some(profile => profile.id === rule.profileId);

    return (
        <section className={`vc-vipNotifications-section vc-vipNotifications-ruleEditor vc-vipNotifications-ruleEditor-${mode}`}>
            <div className="vc-vipNotifications-sectionHeader">
                <div>
                    <div className="vc-vipNotifications-sectionTitle">Rule Editor</div>
                    <div className="vc-vipNotifications-sectionSubtitle">Condition groups are OR lists; filled groups combine with AND.</div>
                </div>
            </div>

            <div className="vc-vipNotifications-formGrid">
                <Field label="Name">
                    <input
                        className="vc-vipNotifications-input"
                        type="text"
                        value={rule.name}
                        onChange={(event: any) => onUpdateRule(rule.id, { name: event.currentTarget.value })}
                    />
                </Field>

                <Field label="Profile">
                    <select
                        className="vc-vipNotifications-input"
                        value={rule.profileId}
                        onChange={(event: any) => onUpdateRule(rule.id, { profileId: event.currentTarget.value })}
                    >
                        {!profileExists && <option value={rule.profileId}>Missing profile ({rule.profileId})</option>}
                        {profiles.map(profile => (
                            <option key={profile.id} value={profile.id}>{profile.name}</option>
                        ))}
                    </select>
                </Field>

                <Field label="Keyword Mode">
                    <select
                        className="vc-vipNotifications-input"
                        value={conditions.keywordMode ?? "any"}
                        onChange={(event: any) => onUpdateRule(rule.id, {
                            conditions: { ...conditions, keywordMode: event.currentTarget.value as KeywordMode },
                        })}
                    >
                        {KEYWORD_MODES.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </Field>
            </div>

            <div className="vc-vipNotifications-toggleGrid">
                <ToggleField
                    label="Enabled"
                    checked={rule.enabled}
                    onChange={enabled => onUpdateRule(rule.id, { enabled })}
                />
                <ToggleField
                    label="Keyword case sensitive"
                    checked={Boolean(conditions.keywordCaseSensitive)}
                    onChange={keywordCaseSensitive => onUpdateRule(rule.id, {
                        conditions: { ...conditions, keywordCaseSensitive },
                    })}
                />
            </div>

            <div className="vc-vipNotifications-subsectionTitle">Condition Groups</div>
            <div className="vc-vipNotifications-formGrid">
                {ARRAY_CONDITION_FIELDS.map(field => (
                    <Field key={field.key} label={field.label}>
                        <input
                            className="vc-vipNotifications-input"
                            type="text"
                            placeholder={field.placeholder}
                            value={commaList(conditions[field.key])}
                            onChange={(event: any) => onUpdateRule(rule.id, {
                                conditions: withArrayCondition(conditions, field.key, event.currentTarget.value),
                            })}
                        />
                    </Field>
                ))}
            </div>

            <div className="vc-vipNotifications-subsectionTitle">Mention Types</div>
            <div className="vc-vipNotifications-toggleGrid">
                {MENTION_TYPES.map(mentionType => (
                    <ToggleField
                        key={mentionType.value}
                        label={mentionType.label}
                        checked={conditions.mentionTypes?.includes(mentionType.value) ?? false}
                        onChange={enabled => onUpdateRule(rule.id, {
                            conditions: withMentionType(conditions, mentionType.value, enabled),
                        })}
                    />
                ))}
            </div>
        </section>
    );
}
