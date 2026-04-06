/*
 * Action tool handlers — send messages, react, edit, delete, voice, presence.
 * All default to "prompt" permission.
 */

import { findByPropsLazy } from "@webpack";
import {
    ChannelStore,
    FluxDispatcher,
} from "@webpack/common";
import { registerTool } from "../shared";
import { TOOL_NAMES } from "../../../proxy/src/protocol";

const MessageActions = findByPropsLazy("sendMessage", "editMessage") as {
    sendMessage: (channelId: string, message: { content: string }) => Promise<any>;
    editMessage: (channelId: string, messageId: string, message: { content: string }) => Promise<any>;
    deleteMessage: (channelId: string, messageId: string) => Promise<any>;
};

const ReactionActions = findByPropsLazy("addReaction") as {
    addReaction: (channelId: string, messageId: string, emoji: { name: string; id?: string }) => Promise<any>;
};

const VoiceActions = findByPropsLazy("selectVoiceChannel") as {
    selectVoiceChannel: (channelId: string | null) => void;
};

registerTool(TOOL_NAMES.sendMessage, async (params) => {
    const channelId = params.channelId as string;
    const content = params.content as string;
    const ch = ChannelStore.getChannel(channelId);
    if (!ch) return { error: "Channel not found" };

    const result = await MessageActions.sendMessage(channelId, { content });
    return { success: true, messageId: result?.id };
});

registerTool(TOOL_NAMES.react, async (params) => {
    const channelId = params.channelId as string;
    const messageId = params.messageId as string;
    const emojiStr = params.emoji as string;

    const emoji: { name: string; id?: string } = emojiStr.includes(":")
        ? { name: emojiStr.split(":")[0], id: emojiStr.split(":")[1] }
        : { name: emojiStr };

    await ReactionActions.addReaction(channelId, messageId, emoji);
    return { success: true };
});

registerTool(TOOL_NAMES.editMessage, async (params) => {
    const channelId = params.channelId as string;
    const messageId = params.messageId as string;
    const content = params.content as string;

    await MessageActions.editMessage(channelId, messageId, { content });
    return { success: true };
});

registerTool(TOOL_NAMES.deleteMessage, async (params) => {
    const channelId = params.channelId as string;
    const messageId = params.messageId as string;

    await MessageActions.deleteMessage(channelId, messageId);
    return { success: true };
});

registerTool(TOOL_NAMES.setPresence, async (params) => {
    const status = params.status as string | undefined;
    const activity = params.activity as string | undefined;

    if (status) {
        const UserSettingsProtoStore = (window as any).Vencord?.Webpack?.findStore("UserSettingsProtoStore");
        if (UserSettingsProtoStore?.settings?.status?.status) {
            UserSettingsProtoStore.settings.status.status.value = status;
        }
    }

    if (activity) {
        FluxDispatcher.dispatch({
            type: "LOCAL_ACTIVITY_UPDATE",
            socketId: "discord-mcp",
            pid: 0,
            activity: {
                name: "Custom Status",
                type: 4,
                state: activity,
                emoji: null,
            },
        });
    }

    return { success: true, status, activity };
});

registerTool(TOOL_NAMES.joinVoice, async (params) => {
    const channelId = params.channelId as string;
    const ch = ChannelStore.getChannel(channelId);
    if (!ch) return { error: "Channel not found" };

    VoiceActions.selectVoiceChannel(channelId);
    return { success: true, channelId, channelName: ch.name };
});

registerTool(TOOL_NAMES.leaveVoice, async () => {
    VoiceActions.selectVoiceChannel(null);
    return { success: true };
});

registerTool(TOOL_NAMES.rebuildPlugins, async () => {
    const Native = (window as any).VencordNative?.pluginHelpers?.DiscordMCP;
    if (!Native?.rebuildPlugins) {
        return { error: "Native module not available. Is DiscordMCP's native.ts loaded?" };
    }
    return await Native.rebuildPlugins();
});
