/**
 * Minimal Vencord API stubs for unit testing plugin pure-logic modules.
 * Only stubs what's actually imported by testable modules.
 */

// @utils/Logger
export class Logger {
    constructor(public name: string) {}
    info(..._args: unknown[]) {}
    warn(..._args: unknown[]) {}
    error(..._args: unknown[]) {}
    debug(..._args: unknown[]) {}
    log(..._args: unknown[]) {}
}

// @utils/types — OptionType enum
export const OptionType = {
    STRING: 0,
    NUMBER: 1,
    BIGINT: 2,
    BOOLEAN: 3,
    SELECT: 4,
    SLIDER: 5,
    COMPONENT: 6,
} as const;

// @api/Settings
export function definePluginSettings(settings: Record<string, unknown>) {
    return {
        def: settings,
        store: new Proxy({} as Record<string, unknown>, {
            get: (_target, prop: string) => settings[prop] && (settings[prop] as any).default,
        }),
    };
}
