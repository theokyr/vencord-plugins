import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { randomUUID } from "node:crypto";
import { createBridge, type DiscordBridge } from "./ws-server.js";
import { TOOLS } from "./tools.js";
import { SubscriptionManager } from "./subscriptions.js";
import { DEFAULT_PORT, TOOL_NAMES, type EventFilters } from "./protocol.js";

async function main() {
    const { bridge, mode } = await createBridge(DEFAULT_PORT);
    const subscriptions = new SubscriptionManager();

    process.stderr.write(`[discord-mcp-proxy] Starting in ${mode} mode on port ${DEFAULT_PORT}\n`);

    const mcpServer = new Server(
        { name: "discord-mcp", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    // ─── List tools ────────────────────────────────────────────────────

    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: TOOLS,
    }));

    // ─── Call tool ─────────────────────────────────────────────────────

    mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: params = {} } = request.params;

        // Handle subscription tools proxy-side (proxy owns subscription state)
        if (name === TOOL_NAMES.subscribe) {
            if (!Array.isArray(params.events)) {
                return {
                    content: [{ type: "text", text: JSON.stringify({ error: "events must be an array" }) }],
                    isError: true,
                };
            }
            const events = params.events as string[];
            const filters = params.filters as EventFilters | undefined;
            const subId = subscriptions.create(events, filters);
            bridge.sendSubscribe(subId, events, filters);
            return {
                content: [{ type: "text", text: JSON.stringify({ subscriptionId: subId }) }],
            };
        }

        if (name === TOOL_NAMES.unsubscribe) {
            const subId = params.subscriptionId as string;
            subscriptions.remove(subId);
            bridge.sendUnsubscribe(subId);
            return {
                content: [{ type: "text", text: JSON.stringify({ success: true }) }],
            };
        }

        // All other tools: forward to plugin via WS
        const callId = `call_${randomUUID()}`;

        try {
            const result = await bridge.callTool(callId, name, params as Record<string, unknown>);

            if (!result.success) {
                return {
                    content: [{ type: "text", text: JSON.stringify({ error: result.error, ...(typeof result.data === "object" && result.data !== null ? result.data : {}) }) }],
                    isError: true,
                };
            }

            return {
                content: [{ type: "text", text: JSON.stringify(result.data) }],
            };
        } catch (err) {
            return {
                content: [{ type: "text", text: JSON.stringify({ error: (err as Error).message }) }],
                isError: true,
            };
        }
    });

    // ─── Event forwarding ──────────────────────────────────────────────

    bridge.onEvent((event) => {
        const matchingSubs = subscriptions.match(event);
        if (matchingSubs.length > 0) {
            process.stderr.write(
                `[event] ${event.event} matched subscriptions: ${matchingSubs.join(", ")}\n`,
            );
        }
    });

    // ─── Re-subscribe on reconnect ─────────────────────────────────────

    bridge.setOnStateChange((state) => {
        process.stderr.write(`[ws] Connection state: ${state}\n`);
        if (state === "ready") {
            for (const sub of subscriptions.getAll()) {
                bridge.sendSubscribe(sub.id, sub.events, sub.filters);
            }
        }
    });

    // ─── Start MCP ─────────────────────────────────────────────────────

    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    process.stderr.write(`[discord-mcp-proxy] MCP server ready (${mode} mode)\n`);
}

main().catch((err) => {
    process.stderr.write(`[discord-mcp-proxy] Fatal: ${err}\n`);
    process.exit(1);
});
