/*
 * Shared state for DiscordMCP plugin — extracted to break circular dependencies.
 * Tool modules import from here instead of index.tsx.
 */

import { Logger } from "@utils/Logger";
import type { PluginMessage } from "../../proxy/src/protocol";

export const logger = new Logger("DiscordMCP");

// ─── Tool handler registry ─────────────────────────────────────────────

export type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;
export const toolHandlers = new Map<string, ToolHandler>();

export function registerTool(name: string, handler: ToolHandler) {
    toolHandlers.set(name, handler);
}

// ─── WebSocket send function (set by index.tsx at runtime) ─────────────

let _send: ((msg: PluginMessage) => void) | null = null;

export function setSendFn(fn: (msg: PluginMessage) => void) {
    _send = fn;
}

export function send(msg: PluginMessage) {
    _send?.(msg);
}

// ─── Active subscriptions ──────────────────────────────────────────────

export interface ActiveSubscription {
    id: string;
    events: string[];
    filters?: Record<string, unknown>;
    cleanups: (() => void)[];
}

export const activeSubscriptions = new Map<string, ActiveSubscription>();
