export type PresetName = "minimal" | "smooth" | "expressive";
export type SpeedTier = "fast" | "normal" | "slow";

export interface Preset {
    speedFast: number;
    speed: number;
    speedSlow: number;
    ease: string;
    easeOut: string;
    easeSpring: string;
    stagger: number;
}

export const PRESETS: Record<PresetName, Preset> = {
    minimal: {
        speedFast: 0,
        speed: 80,
        speedSlow: 100,
        ease: "ease",
        easeOut: "ease-out",
        easeSpring: "ease-out",
        stagger: 0,
    },
    smooth: {
        speedFast: 100,
        speed: 150,
        speedSlow: 250,
        ease: "ease",
        easeOut: "ease-out",
        easeSpring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        stagger: 40,
    },
    expressive: {
        speedFast: 100,
        speed: 200,
        speedSlow: 350,
        ease: "ease",
        easeOut: "ease-out",
        easeSpring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        stagger: 40,
    },
};

export function getSpeed(preset: PresetName, tier: SpeedTier): number {
    const p = PRESETS[preset];
    if (tier === "fast") return p.speedFast;
    if (tier === "slow") return p.speedSlow;
    return p.speed;
}

export function getStagger(preset: PresetName, index: number): string {
    const p = PRESETS[preset];
    return `${p.stagger * index}ms`;
}

export function getEase(preset: PresetName): string {
    return PRESETS[preset].ease;
}
