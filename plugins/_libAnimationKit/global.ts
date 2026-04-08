import { PresetName, SpeedTier, getSpeed, getStagger, getEase } from "./presets";

export interface VcAnim {
    readonly preset: PresetName;
    isEnabled(): boolean;
    speed(tier: SpeedTier): number;
    stagger(index: number): string;
    ease(): string;
}

let currentPreset: PresetName = "smooth";
let enabled = true;

const vcAnim: VcAnim = {
    get preset(): PresetName {
        return currentPreset;
    },
    isEnabled(): boolean {
        return enabled;
    },
    speed(tier: SpeedTier): number {
        if (!enabled) return 0;
        return getSpeed(currentPreset, tier);
    },
    stagger(index: number): string {
        if (!enabled) return "0ms";
        return getStagger(currentPreset, index);
    },
    ease(): string {
        return getEase(currentPreset);
    },
};

export function initVcAnim(preset?: PresetName, isEnabled?: boolean): void {
    if ((globalThis as any).__vcAnim) {
        // Update existing instance with new values if provided
        if (preset !== undefined) currentPreset = preset;
        if (isEnabled !== undefined) enabled = isEnabled;
        return;
    }
    if (preset !== undefined) currentPreset = preset;
    if (isEnabled !== undefined) enabled = isEnabled;
    (globalThis as any).__vcAnim = vcAnim;
}

export function setPreset(preset: PresetName): void {
    currentPreset = preset;
}

export function setEnabled(value: boolean): void {
    enabled = value;
}
