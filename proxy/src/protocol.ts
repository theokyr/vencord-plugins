// ─── Proxy → Plugin messages ───────────────────────────────────────────

export interface HelloMessage {
    type: "hello";
    version: number;
}

export interface ToolCallMessage {
    type: "tool_call";
    id: string;
    tool: string;
    params: Record<string, unknown>;
}

export interface SubscribeMessage {
    type: "subscribe";
    id: string;
    events: string[];
    filters?: EventFilters;
}

export interface UnsubscribeMessage {
    type: "unsubscribe";
    subscriptionId: string;
}

export type ProxyMessage = HelloMessage | ToolCallMessage | SubscribeMessage | UnsubscribeMessage;

export interface SecondaryHelloMessage {
    type: "secondary_hello";
    version: number;
}

export interface BridgeDisconnectedMessage {
    type: "bridge_disconnected";
}

// ─── Plugin → Proxy messages ───────────────────────────────────────────

export interface ReadyMessage {
    type: "ready";
    version: number;
    tools: string[];
}

export interface ToolResultMessage {
    type: "tool_result";
    id: string;
    success: boolean;
    data?: unknown;
    error?: string;
}

export interface PromptPendingMessage {
    type: "prompt_pending";
    id: string;
    tool: string;
    paramsSummary: string;
    timeoutMs?: number; // 0 = no timeout
}

export interface EventMessage {
    type: "event";
    subscription: string;
    event: string;
    data: unknown;
}

export type PluginMessage = ReadyMessage | ToolResultMessage | PromptPendingMessage | EventMessage;

// ─── Shared types ──────────────────────────────────────────────────────

export interface EventFilters {
    guildId?: string;
    channelId?: string;
    userId?: string;
}

export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 21420;

// ─── Timeouts (ms) ────────────────────────────────────────────────────

export const TIMEOUTS = {
    handshake: 5_000,
    toolCall: 10_000,
    eval: 30_000,
    prompt: 60_000,
} as const;

// ─── Tool names ────────────────────────────────────────────────────────

export const TOOL_NAMES = {
    // Read
    listGuilds: "discord_list_guilds",
    listChannels: "discord_list_channels",
    readMessages: "discord_read_messages",
    getUser: "discord_get_user",
    getGuild: "discord_get_guild",
    getChannel: "discord_get_channel",
    getPinnedMessages: "discord_get_pinned_messages",
    getThread: "discord_get_thread",
    // State
    getPresence: "discord_get_presence",
    getUnread: "discord_get_unread",
    getSelected: "discord_get_selected",
    listOnline: "discord_list_online",
    // Actions
    sendMessage: "discord_send_message",
    react: "discord_react",
    editMessage: "discord_edit_message",
    deleteMessage: "discord_delete_message",
    setPresence: "discord_set_presence",
    joinVoice: "discord_join_voice",
    leaveVoice: "discord_leave_voice",
    // Events
    subscribe: "discord_subscribe",
    unsubscribe: "discord_unsubscribe",
    // DevTools
    eval: "discord_eval",
    querySelector: "discord_query_selector",
    getWebpackModule: "discord_get_webpack_module",
    getStore: "discord_get_store",
    getVencordPlugins: "discord_get_vencord_plugins",
    // Build
    rebuildPlugins: "discord_rebuild_plugins",
    // Utility
    testPrompt: "discord_test_prompt",
} as const;

export type ToolName = typeof TOOL_NAMES[keyof typeof TOOL_NAMES];
