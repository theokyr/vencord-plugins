import { randomUUID } from "node:crypto";
import type { DiscordBridge } from "./ws-server.js";
import { TIMEOUTS, TOOL_NAMES } from "./protocol.js";

interface McpToolResponse {
    [key: string]: unknown;
    content: { type: "text"; text: string }[];
    isError?: boolean;
}

export function jsonResponse(data: unknown, isError = false): McpToolResponse {
    return { content: [{ type: "text", text: JSON.stringify(data) }], isError };
}

/**
 * Run `discord_rebuild_plugins` and prove the client came back.
 *
 * Sequence: ask the plugin to launch the rebuild → wait for the WS connection to
 * drop (Discord exiting) → wait for a fresh `ready` handshake (Discord back up with
 * the new bundle loaded). Only the final handshake proves the redeploy landed —
 * it is sent by the newly built plugin code itself.
 *
 * Every failure mode is reported as such rather than as a success:
 * the launch being refused, Discord never going down, or never coming back.
 */
export async function runVerifiedRebuild(
    bridge: DiscordBridge,
    params: Record<string, unknown>,
): Promise<McpToolResponse> {
    const callId = `call_${randomUUID()}`;
    const startedAt = Date.now();

    let launch: Awaited<ReturnType<DiscordBridge["callTool"]>>;
    try {
        launch = await bridge.callTool(callId, TOOL_NAMES.rebuildPlugins, params);
    } catch (err) {
        return jsonResponse({ error: `Rebuild could not be started: ${(err as Error).message}`, verified: false }, true);
    }

    if (!launch.success) {
        const extra = typeof launch.data === "object" && launch.data !== null ? launch.data : {};
        return jsonResponse({ error: launch.error, verified: false, ...extra }, true);
    }

    // The plugin may also auto-deny (e.g. the user is in a voice call). That is a
    // refusal, not a rebuild — pass it straight back without waiting for anything.
    const launchData = (typeof launch.data === "object" && launch.data !== null ? launch.data : {}) as Record<string, unknown>;
    if (launchData.success === false) {
        return jsonResponse({ ...launchData, verified: false }, true);
    }

    try {
        await bridge.waitForState("disconnected", TIMEOUTS.rebuildDisconnect);
    } catch {
        return jsonResponse({
            ...launchData,
            verified: false,
            error: "Rebuild was launched but Discord never shut down. It is probably still running the old build — check the rebuild output.",
        }, true);
    }

    try {
        await bridge.waitForState("ready", TIMEOUTS.rebuild);
    } catch {
        return jsonResponse({
            ...launchData,
            verified: false,
            discordDown: true,
            error:
                "Discord shut down for the rebuild and did not come back within " +
                `${Math.round(TIMEOUTS.rebuild / 1000)}s. It is NOT running — the build may have failed, or the ` +
                "launch environment cannot start it. Check ~/.local/state/venpm/discord-launch.log and run `venpm doctor`.",
        }, true);
    }

    return jsonResponse({
        ...launchData,
        verified: true,
        downtimeMs: Date.now() - startedAt,
        tools: bridge.getAvailableTools().length,
        message: "Rebuild complete — Discord restarted and the plugin bridge reconnected.",
    });
}
