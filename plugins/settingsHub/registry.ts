/*
 * Vencord userplugin — settingsHub
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { SettingsSchema } from "./schema";

const schemas: SettingsSchema[] = [];
const listeners = new Set<() => void>();

export function registerSchema(schema: SettingsSchema): void {
    const idx = schemas.findIndex(s => s.plugin === schema.plugin);
    if (idx >= 0) schemas[idx] = schema;
    else schemas.push(schema);
    listeners.forEach(fn => fn());
}

export function unregisterSchema(pluginName: string): void {
    const idx = schemas.findIndex(s => s.plugin === pluginName);
    if (idx >= 0) {
        schemas.splice(idx, 1);
        listeners.forEach(fn => fn());
    }
}

export function getSchemas(): readonly SettingsSchema[] {
    return schemas;
}

export function onSchemasChange(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}
