import { describe, it, expect, vi } from "vitest";
import { runVerifiedRebuild } from "../../proxy/src/rebuild";
import type { DiscordBridge } from "../../proxy/src/ws-server";
import type { ToolResultMessage } from "../../proxy/src/protocol";

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface BridgeStubOptions {
    launch?: Partial<ToolResultMessage> | Error;
    /** States the bridge will reach, in order, as they are awaited. */
    reaches?: ("disconnected" | "ready")[];
}

function makeBridge({ launch, reaches = ["disconnected", "ready"] }: BridgeStubOptions = {}): DiscordBridge {
    const pending = [...reaches];

    return {
        getState: () => "ready",
        getAvailableTools: () => ["discord_eval", "discord_rebuild_plugins"],
        setOnStateChange: vi.fn(),
        waitForState: vi.fn(async (state: string) => {
            if (pending[0] === state) {
                pending.shift();
                return;
            }
            throw new Error(`Timed out waiting for bridge state "${state}"`);
        }),
        onEvent: vi.fn(),
        callTool: vi.fn(async (id: string): Promise<ToolResultMessage> => {
            if (launch instanceof Error) throw launch;
            return {
                type: "tool_result",
                id,
                success: true,
                data: { success: true, message: "Rebuild launched." },
                ...launch,
            } as ToolResultMessage;
        }),
        sendSubscribe: vi.fn(),
        sendUnsubscribe: vi.fn(),
        close: vi.fn(),
    } as unknown as DiscordBridge;
}

function payload(response: { content: { text: string }[] }) {
    return JSON.parse(response.content[0].text);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("runVerifiedRebuild", () => {
    it("reports verified only after Discord drops and comes back ready", async () => {
        const bridge = makeBridge();

        const response = await runVerifiedRebuild(bridge, {});
        const data = payload(response);

        expect(response.isError).toBeFalsy();
        expect(data.verified).toBe(true);
        expect(data.downtimeMs).toBeGreaterThanOrEqual(0);
        expect(bridge.waitForState).toHaveBeenNthCalledWith(1, "disconnected", expect.any(Number));
        expect(bridge.waitForState).toHaveBeenNthCalledWith(2, "ready", expect.any(Number));
    });

    it("fails when Discord never shuts down", async () => {
        const bridge = makeBridge({ reaches: [] });

        const response = await runVerifiedRebuild(bridge, {});
        const data = payload(response);

        expect(response.isError).toBe(true);
        expect(data.verified).toBe(false);
        expect(data.error).toMatch(/never shut down/);
    });

    it("fails loudly when Discord goes down and does not come back", async () => {
        // The worst outcome: the old client is gone and nothing replaced it.
        const bridge = makeBridge({ reaches: ["disconnected"] });

        const response = await runVerifiedRebuild(bridge, {});
        const data = payload(response);

        expect(response.isError).toBe(true);
        expect(data.verified).toBe(false);
        expect(data.discordDown).toBe(true);
        expect(data.error).toMatch(/did not come back/);
        expect(data.error).toMatch(/venpm doctor/);
    });

    it("passes a plugin-side auto-deny straight back without waiting", async () => {
        // Voice-call auto-deny: a refusal, not a rebuild.
        const bridge = makeBridge({
            launch: { data: { success: false, error: "Auto-denied: user is in a voice call" } },
        });

        const response = await runVerifiedRebuild(bridge, {});
        const data = payload(response);

        expect(response.isError).toBe(true);
        expect(data.verified).toBe(false);
        expect(data.error).toMatch(/voice call/);
        expect(bridge.waitForState).not.toHaveBeenCalled();
    });

    it("reports an unsuccessful tool result as an error", async () => {
        const bridge = makeBridge({ launch: { success: false, error: "Native module not available" } });

        const response = await runVerifiedRebuild(bridge, {});
        const data = payload(response);

        expect(response.isError).toBe(true);
        expect(data.verified).toBe(false);
        expect(data.error).toBe("Native module not available");
        expect(bridge.waitForState).not.toHaveBeenCalled();
    });

    it("reports a bridge failure while launching", async () => {
        const bridge = makeBridge({ launch: new Error("Discord is not connected") });

        const response = await runVerifiedRebuild(bridge, {});
        const data = payload(response);

        expect(response.isError).toBe(true);
        expect(data.verified).toBe(false);
        expect(data.error).toMatch(/could not be started.*not connected/);
    });
});
