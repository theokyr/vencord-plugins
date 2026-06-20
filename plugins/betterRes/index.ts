/*
 * Vencord userplugin - BetterRes
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";

import {
    DEFAULT_CUSTOM_FPS,
    DEFAULT_CUSTOM_RESOLUTIONS,
    getFpsValues,
    getResolutionValues,
    getStreamPresetSpecs,
} from "./options";
import { fpsOptionsMatcher, resolutionOptionsMatcher, streamPresetsMatcher } from "./patches";
import { createBetterResSchema } from "./settingsSchema";

type StreamQualityPreset = {
    resolution: number;
    fps: number;
    guildPremiumTier?: unknown;
    preset?: unknown;
    quality?: unknown;
    [key: string]: unknown;
};

type QualityOption = {
    value: number;
    label: string;
    subtext?: string;
};

type CreateOption = (value: number, label?: () => string, subtext?: () => string | undefined) => QualityOption;
type FormatResolution = (resolution: number) => string;

const settings = definePluginSettings({
    customResolutions: {
        type: OptionType.STRING,
        description: "Extra vertical resolutions in p, comma separated. Example: 144,240,360. Requires restart.",
        default: DEFAULT_CUSTOM_RESOLUTIONS,
        restartNeeded: true,
    },
    customFps: {
        type: OptionType.STRING,
        description: "Extra stream frame rates, comma separated. Example: 5,10,24,48. Requires restart.",
        default: DEFAULT_CUSTOM_FPS,
        restartNeeded: true,
    },
});

function presetKey(preset: Pick<StreamQualityPreset, "resolution" | "fps">): string {
    return `${preset.resolution}:${preset.fps}`;
}

function optionMap(options: QualityOption[]): Map<number, QualityOption> {
    return new Map(options.map(option => [option.value, option]));
}

export default definePlugin({
    name: "BetterRes",
    description: "Unlocks Discord stream quality choices and adds lower/custom resolutions and frame rates",
    authors: [{ name: "kamaras", id: 132106519264100352n }],
    tags: ["Streaming", "Voice"],
    settings,
    settingsAboutComponent() {
        const { Button, React } = require("@webpack/common");
        return React.createElement(
            Button,
            { onClick: () => (window as any).__settingsHub?.open("BetterRes") },
            "Open Full Settings",
        );
    },

    patches: [
        {
            find: "canUseCustomStickersEverywhere:",
            replacement: [
                {
                    match: /(?<=canUseHighVideoUploadQuality:function\(\i\)\{)/,
                    replace: "return true;",
                },
                {
                    match: /(?<=canStreamQuality:function\(\i,\i\)\{)/,
                    replace: "return true;",
                },
            ],
        },
        {
            find: "#{intl::STREAM_FPS_OPTION}",
            replacement: [
                {
                    match: /default:throw Error\(`Unknown resolution: \$\{\i\}`\)/,
                    replace: "default:return arguments[0]",
                },
                {
                    match: /default:throw Error\(`Unknown frame rate: \$\{\i\}`\)/,
                    replace: "default:return arguments[0]",
                },
                {
                    match: streamPresetsMatcher,
                    replace: (_, presetsVar, presetsBody, createOption) =>
                        `let ${presetsVar}=$self.patchStreamPresets([${presetsBody}]);function ${createOption}(`,
                },
                {
                    match: /guildPremiumTier:\i\.\i\.TIER_\d,?/g,
                    replace: "",
                },
                {
                    match: resolutionOptionsMatcher,
                    replace: (_, declarationPrefix, optionsVar, optionsBody, createOption, formatResolution) =>
                        `${declarationPrefix}${optionsVar}=$self.patchResolutionOptions([${optionsBody}],${createOption},${formatResolution})`,
                },
                {
                    match: fpsOptionsMatcher,
                    replace: (_, optionsVar, optionsBody, createOption) =>
                        `let ${optionsVar}=$self.patchFpsOptions([${optionsBody}],${createOption})`,
                },
            ],
        },
    ],

    start() {
        (window as any).__settingsHub?.register(createBetterResSchema(settings));
    },

    stop() {
        (window as any).__settingsHub?.unregister("BetterRes");
    },

    patchStreamPresets(presets: StreamQualityPreset[]): StreamQualityPreset[] {
        const seen = new Set(presets.map(presetKey));
        const sourceQuality = presets.find(preset => preset.resolution === 0 && preset.quality !== undefined)?.quality;
        const sourceLowFpsPreset = presets.find(preset => preset.resolution === 0 && preset.fps <= 5 && preset.preset !== undefined)?.preset;
        const midQuality = presets.find(preset => preset.resolution >= 720 && preset.quality !== undefined)?.quality;

        for (const spec of getStreamPresetSpecs(settings.store.customResolutions, settings.store.customFps)) {
            if (seen.has(presetKey(spec))) continue;

            const preset: StreamQualityPreset = { ...spec };
            if (spec.resolution === 0 && spec.fps <= 5 && sourceLowFpsPreset !== undefined) {
                preset.preset = sourceLowFpsPreset;
            } else if (spec.resolution === 0 && sourceQuality !== undefined) {
                preset.quality = sourceQuality;
            } else if ((spec.resolution >= 720 || spec.fps >= 60) && midQuality !== undefined) {
                preset.quality = midQuality;
            }

            presets.push(preset);
            seen.add(presetKey(spec));
        }

        return presets;
    },

    patchResolutionOptions(
        options: QualityOption[],
        createOption: CreateOption,
        formatResolution: FormatResolution,
    ): QualityOption[] {
        const existingOptions = optionMap(options);

        return getResolutionValues(settings.store.customResolutions).map(value =>
            existingOptions.get(value) ?? createOption(value, () => formatResolution(value))
        );
    },

    patchFpsOptions(options: QualityOption[], createOption: CreateOption): QualityOption[] {
        const existingOptions = optionMap(options);

        return getFpsValues(settings.store.customFps).map(value =>
            existingOptions.get(value) ?? createOption(value, () => `${value} FPS`)
        );
    },
});
