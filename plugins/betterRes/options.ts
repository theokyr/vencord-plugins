export const DEFAULT_CUSTOM_RESOLUTIONS = "240,360";
export const DEFAULT_CUSTOM_FPS = "5,10,24,48";

const BASE_RESOLUTIONS = [480, 720, 1080, 1440, 0] as const;
const BASE_FPS = [15, 30, 60] as const;

export interface NumberListBounds {
    min: number;
    max: number;
}

export interface StreamPresetSpec {
    resolution: number;
    fps: number;
}

export function parseNumberList(input: string | null | undefined, bounds: NumberListBounds): number[] {
    const values: number[] = [];
    const seen = new Set<number>();

    for (const match of input?.matchAll(/(?:^|[,\s])(\d+)\s*(?:p|fps)?(?=$|[,\s])/gi) ?? []) {
        const value = Number(match[1]);
        if (!Number.isSafeInteger(value) || value < bounds.min || value > bounds.max || seen.has(value)) continue;

        seen.add(value);
        values.push(value);
    }

    return values;
}

export function getResolutionValues(customResolutions: string | null | undefined): number[] {
    const sourceEnabled = BASE_RESOLUTIONS.includes(0);
    const values = new Set<number>();

    for (const value of BASE_RESOLUTIONS) {
        if (value > 0) values.add(value);
    }

    for (const value of parseNumberList(customResolutions, { min: 1, max: 4320 })) {
        values.add(value);
    }

    const sorted = [...values].sort((a, b) => a - b);
    return sourceEnabled ? [...sorted, 0] : sorted;
}

export function getFpsValues(customFps: string | null | undefined): number[] {
    const values = new Set<number>(BASE_FPS);

    for (const value of parseNumberList(customFps, { min: 1, max: 240 })) {
        values.add(value);
    }

    return [...values].sort((a, b) => a - b);
}

export function getStreamPresetSpecs(
    customResolutions: string | null | undefined,
    customFps: string | null | undefined,
): StreamPresetSpec[] {
    const presets: StreamPresetSpec[] = [];

    for (const resolution of getResolutionValues(customResolutions)) {
        for (const fps of getFpsValues(customFps)) {
            presets.push({ resolution, fps });
        }
    }

    return presets;
}
