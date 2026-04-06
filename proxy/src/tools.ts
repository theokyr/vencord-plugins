import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const TOOLS: Tool[] = [
    // ─── Read ────────────────────────────────────────────────────────────
    {
        name: "discord_list_guilds",
        description: "List all guilds (servers) the user is a member of",
        inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
        name: "discord_list_channels",
        description: "List channels in a guild, in visual sidebar order",
        inputSchema: {
            type: "object",
            properties: { guildId: { type: "string", description: "Guild ID" } },
            required: ["guildId"],
        },
    },
    {
        name: "discord_read_messages",
        description: "Read message history from a channel",
        inputSchema: {
            type: "object",
            properties: {
                channelId: { type: "string", description: "Channel ID" },
                count: { type: "number", description: "Number of messages (default 50, max 100)" },
                before: { type: "string", description: "Message ID to read before" },
                after: { type: "string", description: "Message ID to read after" },
            },
            required: ["channelId"],
        },
    },
    {
        name: "discord_get_user",
        description: "Get user info. Omit userId to get the current user.",
        inputSchema: {
            type: "object",
            properties: { userId: { type: "string", description: "User ID (optional, defaults to self)" } },
        },
    },
    {
        name: "discord_get_guild",
        description: "Get guild metadata",
        inputSchema: {
            type: "object",
            properties: { guildId: { type: "string", description: "Guild ID" } },
            required: ["guildId"],
        },
    },
    {
        name: "discord_get_channel",
        description: "Get channel metadata",
        inputSchema: {
            type: "object",
            properties: { channelId: { type: "string", description: "Channel ID" } },
            required: ["channelId"],
        },
    },
    {
        name: "discord_get_pinned_messages",
        description: "Get pinned messages in a channel",
        inputSchema: {
            type: "object",
            properties: { channelId: { type: "string", description: "Channel ID" } },
            required: ["channelId"],
        },
    },
    {
        name: "discord_get_thread",
        description: "Get messages from a thread",
        inputSchema: {
            type: "object",
            properties: { threadId: { type: "string", description: "Thread ID" } },
            required: ["threadId"],
        },
    },
    // ─── State ───────────────────────────────────────────────────────────
    {
        name: "discord_get_presence",
        description: "Get user presence (status, activity). Omit userId for self.",
        inputSchema: {
            type: "object",
            properties: { userId: { type: "string", description: "User ID (optional)" } },
        },
    },
    {
        name: "discord_get_unread",
        description: "Get unread channels and mention counts. Optionally filter by guild.",
        inputSchema: {
            type: "object",
            properties: { guildId: { type: "string", description: "Guild ID (optional)" } },
        },
    },
    {
        name: "discord_get_selected",
        description: "Get the currently viewed guild and channel",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "discord_list_online",
        description: "List online members in a guild or channel",
        inputSchema: {
            type: "object",
            properties: {
                guildId: { type: "string", description: "Guild ID" },
            },
            required: ["guildId"],
        },
    },
    // ─── Actions ─────────────────────────────────────────────────────────
    {
        name: "discord_send_message",
        description: "Send a message to a channel. Requires user approval by default.",
        inputSchema: {
            type: "object",
            properties: {
                channelId: { type: "string", description: "Channel ID" },
                content: { type: "string", description: "Message content" },
            },
            required: ["channelId", "content"],
        },
    },
    {
        name: "discord_react",
        description: "Add a reaction to a message. Requires user approval by default.",
        inputSchema: {
            type: "object",
            properties: {
                channelId: { type: "string", description: "Channel ID" },
                messageId: { type: "string", description: "Message ID" },
                emoji: { type: "string", description: "Emoji (unicode or custom format)" },
            },
            required: ["channelId", "messageId", "emoji"],
        },
    },
    {
        name: "discord_edit_message",
        description: "Edit one of your own messages. Requires user approval by default.",
        inputSchema: {
            type: "object",
            properties: {
                channelId: { type: "string", description: "Channel ID" },
                messageId: { type: "string", description: "Message ID" },
                content: { type: "string", description: "New content" },
            },
            required: ["channelId", "messageId", "content"],
        },
    },
    {
        name: "discord_delete_message",
        description: "Delete one of your own messages. Requires user approval by default.",
        inputSchema: {
            type: "object",
            properties: {
                channelId: { type: "string", description: "Channel ID" },
                messageId: { type: "string", description: "Message ID" },
            },
            required: ["channelId", "messageId"],
        },
    },
    {
        name: "discord_set_presence",
        description: "Change your status or activity. Requires user approval by default.",
        inputSchema: {
            type: "object",
            properties: {
                status: { type: "string", enum: ["online", "idle", "dnd", "invisible"], description: "Status" },
                activity: { type: "string", description: "Custom status text" },
            },
        },
    },
    {
        name: "discord_join_voice",
        description: "Join a voice channel. Requires user approval by default.",
        inputSchema: {
            type: "object",
            properties: { channelId: { type: "string", description: "Voice channel ID" } },
            required: ["channelId"],
        },
    },
    {
        name: "discord_leave_voice",
        description: "Leave the current voice channel. Requires user approval by default.",
        inputSchema: { type: "object", properties: {} },
    },
    // ─── Events ──────────────────────────────────────────────────────────
    {
        name: "discord_subscribe",
        description: "Subscribe to real-time Discord events. Returns a subscription ID.",
        inputSchema: {
            type: "object",
            properties: {
                events: {
                    type: "array",
                    items: {
                        type: "string",
                        enum: ["message_create", "message_update", "message_delete", "typing_start", "presence_update", "voice_state_update", "guild_member_update"],
                    },
                    description: "Events to subscribe to",
                },
                filters: {
                    type: "object",
                    properties: {
                        guildId: { type: "string" },
                        channelId: { type: "string" },
                        userId: { type: "string" },
                    },
                    description: "Optional filters to narrow the event stream",
                },
            },
            required: ["events"],
        },
    },
    {
        name: "discord_unsubscribe",
        description: "Remove an event subscription",
        inputSchema: {
            type: "object",
            properties: { subscriptionId: { type: "string", description: "Subscription ID from discord_subscribe" } },
            required: ["subscriptionId"],
        },
    },
    // ─── DevTools ────────────────────────────────────────────────────────
    {
        name: "discord_eval",
        description: "Execute arbitrary JavaScript in Discord's renderer context. Code is wrapped in an async IIFE, so await works. Requires user approval by default.",
        inputSchema: {
            type: "object",
            properties: { code: { type: "string", description: "JavaScript code to execute" } },
            required: ["code"],
        },
    },
    {
        name: "discord_query_selector",
        description: "Query the Discord DOM for elements matching a CSS selector",
        inputSchema: {
            type: "object",
            properties: {
                selector: { type: "string", description: "CSS selector" },
                properties: {
                    type: "array",
                    items: { type: "string" },
                    description: "CSS properties to read from matched elements",
                },
            },
            required: ["selector"],
        },
    },
    {
        name: "discord_get_webpack_module",
        description: "Find a webpack module by search string and return its source code",
        inputSchema: {
            type: "object",
            properties: {
                find: { type: "string", description: "String to locate the module (same as Vencord patch find)" },
                method: { type: "string", description: "Specific method name to extract (optional)" },
            },
            required: ["find"],
        },
    },
    {
        name: "discord_get_store",
        description: "Query a Discord Flux store by name, optionally calling a method on it",
        inputSchema: {
            type: "object",
            properties: {
                store: { type: "string", description: "Store name (e.g. 'UserStore', 'GuildStore')" },
                method: { type: "string", description: "Method to call (optional)" },
                args: { type: "array", items: {}, description: "Arguments for the method (optional)" },
            },
            required: ["store"],
        },
    },
    {
        name: "discord_get_vencord_plugins",
        description: "List Vencord plugins and their state, or get details for a specific plugin",
        inputSchema: {
            type: "object",
            properties: { name: { type: "string", description: "Plugin name (optional, lists all if omitted)" } },
        },
    },

    // ─── Build ──────────────────────────────────────────────────────────
    {
        name: "discord_rebuild_plugins",
        description: "Rebuild and redeploy Vencord userplugins. Spawns link.sh which closes Discord, builds, deploys dist, and reopens Discord. Auto-denied when user is in a voice call (configurable).",
        inputSchema: { type: "object", properties: {}, required: [] },
    },
    // ─── Utility ─────────────────────────────────────────────────────────
    {
        name: "discord_test_prompt",
        description: "Test the permission prompt UI. Always triggers a prompt regardless of settings. Returns whether the user approved or denied.",
        inputSchema: { type: "object", properties: {} },
    },
];
