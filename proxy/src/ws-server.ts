import { WebSocketServer, WebSocket } from "ws";
import {
    type ProxyMessage,
    type PluginMessage,
    type ToolCallMessage,
    type ReadyMessage,
    type ToolResultMessage,
    type PromptPendingMessage,
    type EventMessage,
    PROTOCOL_VERSION,
    DEFAULT_PORT,
    TIMEOUTS,
} from "./protocol.js";

export type ConnectionState = "disconnected" | "connecting" | "ready";

interface PendingCall {
    resolve: (result: ToolResultMessage) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

type EventHandler = (event: EventMessage) => void;

// ─── Common interface for both primary and secondary modes ─────────────

export interface DiscordBridge {
    getState(): ConnectionState;
    getAvailableTools(): string[];
    setOnStateChange(handler: (state: ConnectionState) => void): void;
    onEvent(handler: EventHandler): void;
    callTool(id: string, tool: string, params: Record<string, unknown>): Promise<ToolResultMessage>;
    sendSubscribe(id: string, events: string[], filters?: Record<string, unknown>): void;
    sendUnsubscribe(subscriptionId: string): void;
    close(): Promise<void>;
}

// ─── Primary mode: WS server ───────────────────────────────────────────
// Accepts the plugin connection AND secondary proxy connections.
// Routes tool calls from secondary proxies through to the plugin.

export class DiscordWsServer implements DiscordBridge {
    private wss: WebSocketServer;
    private plugin: WebSocket | null = null;
    private secondaries = new Set<WebSocket>();
    private state: ConnectionState = "disconnected";
    private pendingCalls = new Map<string, PendingCall>();
    // Track which pending calls came from secondary proxies (need to route response back)
    private secondaryCallMap = new Map<string, WebSocket>();
    private onEventHandlers: EventHandler[] = [];
    private onStateChangeHandler: ((state: ConnectionState) => void) | null = null;
    private availableTools: string[] = [];

    constructor(port: number = DEFAULT_PORT) {
        this.wss = new WebSocketServer({ port, host: "127.0.0.1" });
        this.wss.on("connection", (ws) => this.handleConnection(ws));
    }

    getState(): ConnectionState {
        return this.state;
    }

    getAvailableTools(): string[] {
        return this.availableTools;
    }

    setOnStateChange(handler: (state: ConnectionState) => void) {
        this.onStateChangeHandler = handler;
    }

    onEvent(handler: EventHandler) {
        this.onEventHandlers.push(handler);
    }

    private setState(state: ConnectionState) {
        this.state = state;
        this.onStateChangeHandler?.(state);
        // Notify secondaries of state change
        for (const ws of this.secondaries) {
            if (ws.readyState === WebSocket.OPEN) {
                if (state === "ready") {
                    ws.send(JSON.stringify({ type: "ready", version: PROTOCOL_VERSION, tools: this.availableTools }));
                } else if (state === "disconnected") {
                    ws.send(JSON.stringify({ type: "bridge_disconnected" }));
                }
            }
        }
    }

    private handleConnection(ws: WebSocket) {
        // We don't know yet if this is the plugin or a secondary proxy.
        // Send hello — the plugin responds with "ready", a secondary responds with "secondary_hello".
        const jsonSend = (msg: ProxyMessage) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
        };
        jsonSend({ type: "hello", version: PROTOCOL_VERSION });

        let identified = false;

        const handshakeTimer = setTimeout(() => {
            if (!identified) ws.close(1000, "Handshake timeout");
        }, TIMEOUTS.handshake);

        ws.on("message", (data) => {
            let msg: any;
            try {
                msg = JSON.parse(data.toString());
            } catch {
                return;
            }

            if (!identified) {
                clearTimeout(handshakeTimer);
                if (msg.type === "ready") {
                    // This is the plugin
                    identified = true;
                    this.handlePluginIdentified(ws, msg as ReadyMessage);
                } else if (msg.type === "secondary_hello") {
                    // This is a secondary proxy
                    identified = true;
                    this.handleSecondaryIdentified(ws);
                } else {
                    ws.close(1000, "Unknown client type");
                }
                return;
            }

            // After identification, route messages based on client type
            if (this.plugin === ws) {
                this.handlePluginMessage(msg);
            } else if (this.secondaries.has(ws)) {
                this.handleSecondaryMessage(ws, msg);
            }
        });

        ws.on("close", () => {
            if (this.plugin === ws) {
                this.plugin = null;
                this.availableTools = [];
                this.setState("disconnected");
                this.rejectAllPending("Discord disconnected");
            } else {
                this.secondaries.delete(ws);
                // Reject any pending calls from this secondary
                for (const [id, secWs] of this.secondaryCallMap) {
                    if (secWs === ws) {
                        this.secondaryCallMap.delete(id);
                        const pending = this.pendingCalls.get(id);
                        if (pending) {
                            clearTimeout(pending.timer);
                            this.pendingCalls.delete(id);
                        }
                    }
                }
            }
        });

        ws.on("error", () => ws.close());
    }

    private handlePluginIdentified(ws: WebSocket, ready: ReadyMessage) {
        // Replace existing plugin connection
        if (this.plugin) {
            this.plugin.close(1000, "New plugin connected");
            this.rejectAllPending("Connection replaced");
        }
        this.plugin = ws;
        this.availableTools = ready.tools;
        this.setState("ready");
    }

    private handleSecondaryIdentified(ws: WebSocket) {
        this.secondaries.add(ws);
        // Tell the secondary the current state
        if (this.state === "ready") {
            ws.send(JSON.stringify({ type: "ready", version: PROTOCOL_VERSION, tools: this.availableTools }));
        } else {
            ws.send(JSON.stringify({ type: "bridge_disconnected" }));
        }
    }

    private handlePluginMessage(msg: PluginMessage) {
        switch (msg.type) {
            case "tool_result": {
                const result = msg as ToolResultMessage;
                // Check if this result is for a secondary proxy's call
                const secWs = this.secondaryCallMap.get(result.id);
                if (secWs) {
                    // Route back to the secondary
                    this.secondaryCallMap.delete(result.id);
                    if (secWs.readyState === WebSocket.OPEN) {
                        secWs.send(JSON.stringify(result));
                    }
                    return;
                }
                // Otherwise it's our own call
                const pending = this.pendingCalls.get(result.id);
                if (pending) {
                    clearTimeout(pending.timer);
                    this.pendingCalls.delete(result.id);
                    pending.resolve(result);
                }
                break;
            }
            case "prompt_pending": {
                const prompt = msg as PromptPendingMessage;
                // Check if for a secondary
                const secWs = this.secondaryCallMap.get(prompt.id);
                if (secWs) {
                    if (secWs.readyState === WebSocket.OPEN) {
                        secWs.send(JSON.stringify(prompt));
                    }
                    return;
                }
                // Our own call
                const pending = this.pendingCalls.get(prompt.id);
                if (pending) {
                    clearTimeout(pending.timer);
                    const timeoutMs = prompt.timeoutMs;
                    if (timeoutMs === 0) {
                        pending.timer = undefined as any;
                    } else {
                        const ms = timeoutMs ?? TIMEOUTS.prompt;
                        pending.timer = setTimeout(() => {
                            this.pendingCalls.delete(prompt.id);
                            pending.reject(new Error(`Permission prompt timed out (${ms / 1000}s)`));
                        }, ms);
                    }
                }
                break;
            }
            case "event": {
                const event = msg as EventMessage;
                // Forward to local handlers
                for (const handler of this.onEventHandlers) {
                    handler(event);
                }
                // Forward to all secondaries
                const eventStr = JSON.stringify(event);
                for (const ws of this.secondaries) {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(eventStr);
                    }
                }
                break;
            }
        }
    }

    private handleSecondaryMessage(ws: WebSocket, msg: any) {
        // Secondary proxies send tool_call, subscribe, unsubscribe — relay to plugin
        if (msg.type === "tool_call" || msg.type === "subscribe" || msg.type === "unsubscribe") {
            if (this.state !== "ready" || !this.plugin) {
                // Immediately respond with disconnected
                if (msg.type === "tool_call") {
                    ws.send(JSON.stringify({
                        type: "tool_result",
                        id: msg.id,
                        success: false,
                        error: "Discord is not connected",
                        data: { connected: false },
                    }));
                }
                return;
            }
            // Track the call so we can route the response back
            if (msg.type === "tool_call") {
                this.secondaryCallMap.set(msg.id, ws);
            }
            this.plugin.send(JSON.stringify(msg));
        }
    }

    async callTool(id: string, tool: string, params: Record<string, unknown>): Promise<ToolResultMessage> {
        if (this.state !== "ready" || !this.plugin) {
            return {
                type: "tool_result",
                id,
                success: false,
                error: "Discord is not connected",
                data: { connected: false },
            };
        }

        const timeout = tool === "discord_eval" ? TIMEOUTS.eval : TIMEOUTS.toolCall;

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingCalls.delete(id);
                reject(new Error(`Tool call timed out after ${timeout}ms`));
            }, timeout);

            this.pendingCalls.set(id, { resolve, reject, timer });
            this.plugin!.send(JSON.stringify({ type: "tool_call", id, tool, params }));
        });
    }

    sendSubscribe(id: string, events: string[], filters?: Record<string, unknown>) {
        if (this.state === "ready" && this.plugin) {
            this.plugin.send(JSON.stringify({ type: "subscribe", id, events, filters }));
        }
    }

    sendUnsubscribe(subscriptionId: string) {
        if (this.state === "ready" && this.plugin) {
            this.plugin.send(JSON.stringify({ type: "unsubscribe", subscriptionId }));
        }
    }

    private rejectAllPending(reason: string) {
        for (const [, pending] of this.pendingCalls) {
            clearTimeout(pending.timer);
            pending.reject(new Error(reason));
        }
        this.pendingCalls.clear();
        this.secondaryCallMap.clear();
    }

    async close() {
        this.rejectAllPending("Server shutting down");
        this.plugin?.close(1000, "Server shutting down");
        for (const ws of this.secondaries) ws.close(1000, "Server shutting down");
        this.wss.close();
    }
}

// ─── Secondary mode: WS client ────────────────────────────────────────
// Connects to an existing primary proxy's WS server.
// Sends tool calls through the primary, which relays to the plugin.

export class DiscordWsClient implements DiscordBridge {
    private ws: WebSocket | null = null;
    private state: ConnectionState = "disconnected";
    private pendingCalls = new Map<string, PendingCall>();
    private onEventHandlers: EventHandler[] = [];
    private onStateChangeHandler: ((state: ConnectionState) => void) | null = null;
    private availableTools: string[] = [];
    private port: number;
    private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    private alive = true;

    constructor(port: number = DEFAULT_PORT) {
        this.port = port;
        this.connect();
    }

    private connect() {
        if (!this.alive) return;

        try {
            this.ws = new WebSocket(`ws://127.0.0.1:${this.port}`);
        } catch {
            this.scheduleReconnect();
            return;
        }

        this.ws.on("open", () => {
            // Wait for hello from primary, then identify ourselves
        });

        this.ws.on("message", (data) => {
            let msg: any;
            try {
                msg = JSON.parse(data.toString());
            } catch {
                return;
            }
            this.handleMessage(msg);
        });

        this.ws.on("close", () => {
            this.ws = null;
            if (this.state === "ready") {
                this.setState("disconnected");
                this.rejectAllPending("Primary proxy disconnected");
            }
            this.scheduleReconnect();
        });

        this.ws.on("error", () => {
            // close handler does cleanup
        });
    }

    private scheduleReconnect() {
        if (!this.alive) return;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    }

    private handleMessage(msg: any) {
        switch (msg.type) {
            case "hello": {
                // Primary sent hello — identify as secondary
                this.send({ type: "secondary_hello", version: PROTOCOL_VERSION });
                break;
            }
            case "ready": {
                this.availableTools = msg.tools ?? [];
                this.setState("ready");
                break;
            }
            case "bridge_disconnected": {
                this.setState("disconnected");
                this.rejectAllPending("Discord disconnected");
                break;
            }
            case "tool_result": {
                const result = msg as ToolResultMessage;
                const pending = this.pendingCalls.get(result.id);
                if (pending) {
                    clearTimeout(pending.timer);
                    this.pendingCalls.delete(result.id);
                    pending.resolve(result);
                }
                break;
            }
            case "prompt_pending": {
                const prompt = msg as PromptPendingMessage;
                const pending = this.pendingCalls.get(prompt.id);
                if (pending) {
                    clearTimeout(pending.timer);
                    const timeoutMs = prompt.timeoutMs;
                    if (timeoutMs === 0) {
                        pending.timer = undefined as any;
                    } else {
                        const ms = timeoutMs ?? TIMEOUTS.prompt;
                        pending.timer = setTimeout(() => {
                            this.pendingCalls.delete(prompt.id);
                            pending.reject(new Error(`Permission prompt timed out (${ms / 1000}s)`));
                        }, ms);
                    }
                }
                break;
            }
            case "event": {
                const event = msg as EventMessage;
                for (const handler of this.onEventHandlers) {
                    handler(event);
                }
                break;
            }
        }
    }

    private send(msg: any) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    private setState(state: ConnectionState) {
        this.state = state;
        this.onStateChangeHandler?.(state);
    }

    getState(): ConnectionState { return this.state; }
    getAvailableTools(): string[] { return this.availableTools; }
    setOnStateChange(handler: (state: ConnectionState) => void) { this.onStateChangeHandler = handler; }
    onEvent(handler: EventHandler) { this.onEventHandlers.push(handler); }

    async callTool(id: string, tool: string, params: Record<string, unknown>): Promise<ToolResultMessage> {
        if (this.state !== "ready" || !this.ws) {
            return {
                type: "tool_result",
                id,
                success: false,
                error: "Discord is not connected",
                data: { connected: false },
            };
        }

        const timeout = tool === "discord_eval" ? TIMEOUTS.eval : TIMEOUTS.toolCall;

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingCalls.delete(id);
                reject(new Error(`Tool call timed out after ${timeout}ms`));
            }, timeout);

            this.pendingCalls.set(id, { resolve, reject, timer });
            this.send({ type: "tool_call", id, tool, params });
        });
    }

    sendSubscribe(id: string, events: string[], filters?: Record<string, unknown>) {
        if (this.state === "ready") {
            this.send({ type: "subscribe", id, events, filters });
        }
    }

    sendUnsubscribe(subscriptionId: string) {
        if (this.state === "ready") {
            this.send({ type: "unsubscribe", subscriptionId });
        }
    }

    private rejectAllPending(reason: string) {
        for (const [, pending] of this.pendingCalls) {
            clearTimeout(pending.timer);
            pending.reject(new Error(reason));
        }
        this.pendingCalls.clear();
    }

    async close() {
        this.alive = false;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.rejectAllPending("Client shutting down");
        this.ws?.close(1000, "Client shutting down");
    }
}

// ─── Factory: try server, fall back to client ──────────────────────────

export function createBridge(port: number = DEFAULT_PORT): Promise<{ bridge: DiscordBridge; mode: "primary" | "secondary" }> {
    return new Promise((resolve) => {
        const wss = new WebSocketServer({ port, host: "127.0.0.1" });

        wss.on("listening", () => {
            // We got the port — close this test server and create the real one
            wss.close(() => {
                const bridge = new DiscordWsServer(port);
                resolve({ bridge, mode: "primary" });
            });
        });

        wss.on("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "EADDRINUSE") {
                // Port taken — become a secondary client
                const bridge = new DiscordWsClient(port);
                resolve({ bridge, mode: "secondary" });
            } else {
                // Some other error — still try client mode
                const bridge = new DiscordWsClient(port);
                resolve({ bridge, mode: "secondary" });
            }
        });
    });
}
