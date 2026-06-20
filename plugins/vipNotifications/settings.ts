import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { createDefaultConfig } from "./defaults";
import { parseConfig, serializeConfig } from "./settingsCodec";
import type { Diagnostic, VipConfig, VipProfile, VipRule } from "./types";

export interface VipConfigReadResult {
    config: VipConfig;
    diagnostics: Diagnostic[];
}

const DEFAULT_CONFIG_JSON = serializeConfig(createDefaultConfig());

function nextNumericId(prefix: string, ids: Iterable<string>): string {
    const seen = new Set(ids);
    let index = 1;

    while (seen.has(`${prefix}-${index}`))
        index++;

    return `${prefix}-${index}`;
}

function numericSuffix(id: string, prefix: string): number | null {
    const match = id.match(new RegExp(`^${prefix}-(\\d+)$`));
    return match ? Number(match[1]) : null;
}

function nextDisplayNumber(prefix: string, ids: Iterable<string>): number {
    let max = 0;

    for (const id of ids) {
        const suffix = numericSuffix(id, prefix);
        if (suffix && suffix > max)
            max = suffix;
    }

    return max + 1;
}

function validDefaultProfileId(config: VipConfig): string {
    return config.profiles.some(profile => profile.id === config.defaultProfileId)
        ? config.defaultProfileId
        : config.profiles[0]?.id ?? "default";
}

export function createProfileForConfig(config: VipConfig): VipProfile {
    const ids = config.profiles.map(profile => profile.id);
    const id = nextNumericId("profile", ids);
    const displayNumber = nextDisplayNumber("profile", ids);

    return {
        ...createDefaultConfig().profiles[0],
        id,
        name: `Profile ${displayNumber}`,
    };
}

export function createRuleForConfig(config: VipConfig): VipRule {
    const ids = config.rules.map(rule => rule.id);
    const id = nextNumericId("rule", ids);
    const displayNumber = nextDisplayNumber("rule", ids);

    return {
        id,
        name: `Rule ${displayNumber}`,
        enabled: true,
        profileId: validDefaultProfileId(config),
        conditions: {},
    };
}

export function addProfileToConfig(config: VipConfig): VipConfig {
    const profile = createProfileForConfig(config);
    const defaultProfileId = config.profiles.length > 0 ? validDefaultProfileId(config) : profile.id;

    return {
        ...config,
        defaultProfileId,
        profiles: [...config.profiles, profile],
    };
}

export function addRuleToConfig(config: VipConfig): VipConfig {
    return {
        ...config,
        defaultProfileId: validDefaultProfileId(config),
        rules: [...config.rules, createRuleForConfig(config)],
    };
}

export function setDefaultProfileInConfig(config: VipConfig, profileId: string): VipConfig {
    if (!config.profiles.some(profile => profile.id === profileId))
        return config;

    return {
        ...config,
        defaultProfileId: profileId,
    };
}

export function removeProfileFromConfig(config: VipConfig, profileId: string): VipConfig {
    if (config.profiles.length <= 1)
        return config;

    const profiles = config.profiles.filter(profile => profile.id !== profileId);
    if (profiles.length === config.profiles.length)
        return config;

    const defaultProfileId = profiles.some(profile => profile.id === config.defaultProfileId)
        ? config.defaultProfileId
        : profiles[0].id;

    return {
        ...config,
        defaultProfileId,
        profiles,
        rules: config.rules.map(rule => (
            rule.profileId === profileId ? { ...rule, profileId: defaultProfileId } : rule
        )),
    };
}

export function moveRuleInConfig(config: VipConfig, fromIndex: number, toIndex: number): VipConfig {
    if (
        fromIndex === toIndex
        || fromIndex < 0
        || toIndex < 0
        || fromIndex >= config.rules.length
        || toIndex >= config.rules.length
    )
        return config;

    const rules = [...config.rules];
    const [rule] = rules.splice(fromIndex, 1);
    rules.splice(toIndex, 0, rule);

    return {
        ...config,
        rules,
    };
}

function diagnostic(code: string, message: string, severity: Diagnostic["severity"] = "warning"): Diagnostic {
    return { code, message, severity };
}

export const settings = definePluginSettings({
    configJson: {
        type: OptionType.STRING,
        description: "VIP notification configuration JSON",
        default: DEFAULT_CONFIG_JSON,
        hidden: true,
    },
    manager: {
        type: OptionType.COMPONENT,
        description: "VIP notification manager",
        component: () => {
            const { React } = require("@webpack/common");
            const { VipManager } = require("./components/VipManager") as typeof import("./components/VipManager");

            return React.createElement(VipManager, { mode: "compact" });
        },
    },
});

function readRawConfigJson(): string {
    try {
        const raw = settings.store.configJson;
        return typeof raw === "string" ? raw : DEFAULT_CONFIG_JSON;
    } catch {
        return DEFAULT_CONFIG_JSON;
    }
}

function writeRawConfigJson(raw: string): void {
    try {
        settings.store.configJson = raw;
    } catch {
        // Vencord settings may be unavailable during very early startup.
    }
}

function shouldPersistRepair(raw: string, parsed: VipConfigReadResult): boolean {
    if (!raw.trim())
        return false;

    if (parsed.diagnostics.length > 0)
        return true;

    try {
        return JSON.stringify(JSON.parse(raw)) !== serializeConfig(parsed.config);
    } catch {
        return true;
    }
}

export function readConfig(): VipConfigReadResult {
    const raw = readRawConfigJson();
    const source = raw.trim() ? raw : DEFAULT_CONFIG_JSON;

    try {
        const parsed = parseConfig(source);
        if (shouldPersistRepair(raw, parsed))
            writeRawConfigJson(serializeConfig(parsed.config));

        return parsed;
    } catch {
        const config = createDefaultConfig();
        return {
            config,
            diagnostics: [diagnostic("read_failed", "Config could not be read; defaults are active.", "error")],
        };
    }
}

export function writeConfig(next: VipConfig): VipConfigReadResult {
    try {
        const serialized = serializeConfig(next);
        writeRawConfigJson(serialized);
        return parseConfig(serialized);
    } catch {
        const config = createDefaultConfig();
        writeRawConfigJson(serializeConfig(config));
        return {
            config,
            diagnostics: [diagnostic("write_failed", "Config could not be saved; defaults were restored.", "error")],
        };
    }
}

export function updateConfig(mutator: (config: VipConfig) => VipConfig | void): VipConfigReadResult {
    const current = readConfig();

    try {
        const next = mutator(current.config) ?? current.config;
        return writeConfig(next);
    } catch {
        return {
            config: current.config,
            diagnostics: [
                ...current.diagnostics,
                diagnostic("update_failed", "Config update failed before it could be saved.", "error"),
            ],
        };
    }
}
