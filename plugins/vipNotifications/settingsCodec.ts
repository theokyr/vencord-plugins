import { createDefaultConfig, createDefaultProfile } from "./defaults";
import type {
    CooldownKey,
    Diagnostic,
    KeywordMode,
    PrivacyMode,
    SoundKind,
    VipConfig,
    VipProfile,
    VipRule,
    VipRuleConditions,
} from "./types";

interface ParseResult {
    config: VipConfig;
    diagnostics: Diagnostic[];
}

const PRIVACY_MODES = new Set<PrivacyMode>(["streamerAware", "full", "senderOnly", "generic"]);
const COOLDOWN_KEYS = new Set<CooldownKey>(["profileChannel", "profileRule", "profileAuthor", "profileOnly"]);
const SOUND_KINDS = new Set<SoundKind>(["disabled", "builtIn", "custom"]);
const KEYWORD_MODES = new Set<KeywordMode>(["any", "all"]);
const MENTION_TYPES = new Set<NonNullable<VipRuleConditions["mentionTypes"]>[number]>(["user", "role", "everyone", "here"]);

const ARRAY_CONDITION_KEYS = [
    "authorUserIds",
    "dmChannelIds",
    "groupDmChannelIds",
    "guildChannelIds",
    "categoryIds",
    "guildIds",
    "mentionedRoleIds",
    "keywords",
] as const;

type ArrayConditionKey = typeof ARRAY_CONDITION_KEYS[number];

function diagnostic(code: string, message: string, path?: string, severity: Diagnostic["severity"] = "warning"): Diagnostic {
    return { code, message, path, severity };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string {
    if (typeof value !== "string")
        return fallback;

    const trimmed = value.trim();
    return trimmed || fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
    return typeof value === "string" && allowed.has(value as T) ? value as T : fallback;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function uniqueNonEmptyStrings(value: unknown): string[] | undefined {
    if (!Array.isArray(value))
        return undefined;

    const seen = new Set<string>();
    const strings: string[] = [];

    for (const item of value) {
        if (typeof item !== "string")
            continue;

        const trimmed = item.trim();
        if (!trimmed || seen.has(trimmed))
            continue;

        seen.add(trimmed);
        strings.push(trimmed);
    }

    return strings;
}

function normalizeProfile(value: unknown, index: number, diagnostics: Diagnostic[]): VipProfile | null {
    if (!isRecord(value)) {
        diagnostics.push(diagnostic("invalid_profile", "Profile must be an object.", `profiles.${index}`));
        return null;
    }

    const defaults = createDefaultProfile();
    const id = stringValue(value.id, "");
    if (!id) {
        diagnostics.push(diagnostic("invalid_profile_id", "Profile id must be a non-empty string.", `profiles.${index}.id`));
        return null;
    }

    return {
        id,
        name: stringValue(value.name, defaults.name),
        enabled: booleanValue(value.enabled, defaults.enabled),
        soundKind: enumValue(value.soundKind, SOUND_KINDS, defaults.soundKind),
        soundId: typeof value.soundId === "string" ? value.soundId : defaults.soundId,
        customSoundUrl: typeof value.customSoundUrl === "string" ? value.customSoundUrl : defaults.customSoundUrl,
        soundVolume: clamp(finiteNumber(value.soundVolume, defaults.soundVolume), 0, 100),
        showDesktopNotification: booleanValue(value.showDesktopNotification, defaults.showDesktopNotification),
        showVencordNotification: booleanValue(value.showVencordNotification, defaults.showVencordNotification),
        privacyMode: enumValue(value.privacyMode, PRIVACY_MODES, defaults.privacyMode),
        allowDndOverride: booleanValue(value.allowDndOverride, defaults.allowDndOverride),
        allowStreamerModeOverride: booleanValue(value.allowStreamerModeOverride, defaults.allowStreamerModeOverride),
        allowStreamerContent: booleanValue(value.allowStreamerContent, defaults.allowStreamerContent),
        allowMuteOverride: booleanValue(value.allowMuteOverride, defaults.allowMuteOverride),
        cooldownMs: Math.max(0, finiteNumber(value.cooldownMs, defaults.cooldownMs)),
        cooldownKey: enumValue(value.cooldownKey, COOLDOWN_KEYS, defaults.cooldownKey),
    };
}

function normalizeProfiles(value: unknown, diagnostics: Diagnostic[]): VipProfile[] {
    if (!Array.isArray(value)) {
        diagnostics.push(diagnostic("invalid_profiles", "Profiles must be an array.", "profiles"));
        return [createDefaultProfile()];
    }

    const seen = new Set<string>();
    const profiles: VipProfile[] = [];

    value.forEach((profileValue, index) => {
        const profile = normalizeProfile(profileValue, index, diagnostics);
        if (!profile)
            return;

        if (seen.has(profile.id)) {
            diagnostics.push(diagnostic("duplicate_profile_id", "Duplicate profile id removed.", `profiles.${index}.id`));
            return;
        }

        seen.add(profile.id);
        profiles.push(profile);
    });

    if (profiles.length === 0) {
        diagnostics.push(diagnostic("missing_profiles", "At least one profile is required.", "profiles"));
        return [createDefaultProfile()];
    }

    return profiles;
}

function normalizeConditions(value: unknown): VipRuleConditions {
    if (!isRecord(value))
        return {};

    const conditions: VipRuleConditions = {};

    for (const key of ARRAY_CONDITION_KEYS) {
        const strings = uniqueNonEmptyStrings(value[key]);
        if (strings?.length)
            conditions[key as ArrayConditionKey] = strings;
    }

    const mentionTypes = uniqueNonEmptyStrings(value.mentionTypes)
        ?.filter((mentionType): mentionType is NonNullable<VipRuleConditions["mentionTypes"]>[number] => MENTION_TYPES.has(mentionType as NonNullable<VipRuleConditions["mentionTypes"]>[number]));
    if (mentionTypes?.length)
        conditions.mentionTypes = mentionTypes;

    if (typeof value.keywordMode === "string" && KEYWORD_MODES.has(value.keywordMode as KeywordMode))
        conditions.keywordMode = value.keywordMode as KeywordMode;

    if (typeof value.keywordCaseSensitive === "boolean")
        conditions.keywordCaseSensitive = value.keywordCaseSensitive;

    return conditions;
}

function normalizeRule(value: unknown, index: number, diagnostics: Diagnostic[]): VipRule | null {
    if (!isRecord(value)) {
        diagnostics.push(diagnostic("invalid_rule", "Rule must be an object.", `rules.${index}`));
        return null;
    }

    const id = stringValue(value.id, "");
    if (!id) {
        diagnostics.push(diagnostic("invalid_rule_id", "Rule id must be a non-empty string.", `rules.${index}.id`));
        return null;
    }

    return {
        id,
        name: stringValue(value.name, "Untitled Rule"),
        enabled: booleanValue(value.enabled, true),
        profileId: stringValue(value.profileId, "default"),
        conditions: normalizeConditions(value.conditions),
    };
}

function normalizeRules(value: unknown, diagnostics: Diagnostic[]): VipRule[] {
    if (!Array.isArray(value)) {
        diagnostics.push(diagnostic("invalid_rules", "Rules must be an array.", "rules"));
        return [];
    }

    const seen = new Set<string>();
    const rules: VipRule[] = [];

    value.forEach((ruleValue, index) => {
        const rule = normalizeRule(ruleValue, index, diagnostics);
        if (!rule)
            return;

        if (seen.has(rule.id)) {
            diagnostics.push(diagnostic("duplicate_rule_id", "Duplicate rule id removed.", `rules.${index}.id`));
            return;
        }

        seen.add(rule.id);
        rules.push(rule);
    });

    return rules;
}

export function parseConfig(raw: string): ParseResult {
    const diagnostics: Diagnostic[] = [];
    let parsed: unknown;

    try {
        parsed = JSON.parse(raw);
    } catch {
        return {
            config: createDefaultConfig(),
            diagnostics: [diagnostic("invalid_json", "Config JSON could not be parsed.", undefined, "error")],
        };
    }

    if (!isRecord(parsed)) {
        return {
            config: createDefaultConfig(),
            diagnostics: [diagnostic("invalid_config", "Config must be an object.", undefined, "error")],
        };
    }

    const defaultConfig = createDefaultConfig();
    if (parsed.version !== 1)
        diagnostics.push(diagnostic("invalid_version", "Unsupported or missing config version repaired.", "version"));

    const profiles = normalizeProfiles(parsed.profiles, diagnostics);
    const profileIds = new Set(profiles.map(profile => profile.id));
    const requestedDefaultProfileId = stringValue(parsed.defaultProfileId, defaultConfig.defaultProfileId);
    const defaultProfileId = profileIds.has(requestedDefaultProfileId) ? requestedDefaultProfileId : profiles[0].id;

    if (defaultProfileId !== requestedDefaultProfileId)
        diagnostics.push(diagnostic("invalid_default_profile_id", "Default profile id did not match a known profile.", "defaultProfileId"));

    return {
        config: {
            version: 1,
            defaultProfileId,
            quickAddPlacement: parsed.quickAddPlacement === "bottom" ? "bottom" : "top",
            decisionTtlMs: Math.max(0, finiteNumber(parsed.decisionTtlMs, defaultConfig.decisionTtlMs)),
            profiles,
            rules: normalizeRules(parsed.rules, diagnostics),
        },
        diagnostics,
    };
}

export function serializeConfig(config: VipConfig): string {
    return JSON.stringify(config);
}
