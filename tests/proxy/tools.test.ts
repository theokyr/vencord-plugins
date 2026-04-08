import { describe, it, expect } from "vitest";
import { TOOLS } from "../../proxy/src/tools";
import { TOOL_NAMES } from "../../proxy/src/protocol";

describe("TOOLS schema definitions", () => {
    it("every tool has name, description, and inputSchema", () => {
        for (const tool of TOOLS) {
            expect(tool, `tool missing name`).toHaveProperty("name");
            expect(tool, `${tool.name} missing description`).toHaveProperty("description");
            expect(tool, `${tool.name} missing inputSchema`).toHaveProperty("inputSchema");
            expect(typeof tool.name).toBe("string");
            expect(typeof tool.description).toBe("string");
            expect(tool.name.length).toBeGreaterThan(0);
            expect(tool.description.length).toBeGreaterThan(0);
        }
    });

    it("every tool name matches a value in TOOL_NAMES", () => {
        const validNames = new Set(Object.values(TOOL_NAMES));
        for (const tool of TOOLS) {
            expect(validNames.has(tool.name as any), `${tool.name} not found in TOOL_NAMES`).toBe(true);
        }
    });

    it("every TOOL_NAMES value has a corresponding TOOLS entry", () => {
        const toolNameSet = new Set(TOOLS.map(t => t.name));
        for (const [key, value] of Object.entries(TOOL_NAMES)) {
            expect(toolNameSet.has(value), `TOOL_NAMES.${key} (${value}) has no TOOLS entry`).toBe(true);
        }
    });

    it("inputSchema always has type 'object'", () => {
        for (const tool of TOOLS) {
            expect((tool.inputSchema as any).type, `${tool.name} inputSchema.type`).toBe("object");
        }
    });

    it("tools with required fields have those fields in properties", () => {
        for (const tool of TOOLS) {
            const schema = tool.inputSchema as any;
            if (!schema.required || schema.required.length === 0) continue;

            const propertyKeys = Object.keys(schema.properties ?? {});
            for (const req of schema.required) {
                expect(
                    propertyKeys,
                    `${tool.name}: required field "${req}" not in properties`
                ).toContain(req);
            }
        }
    });

    it("no required field references a non-existent property", () => {
        for (const tool of TOOLS) {
            const schema = tool.inputSchema as any;
            const required: string[] = schema.required ?? [];
            const properties = schema.properties ?? {};

            for (const field of required) {
                expect(
                    field in properties,
                    `${tool.name}: required "${field}" is not a defined property`
                ).toBe(true);
            }
        }
    });
});

describe("action tools mention approval", () => {
    const actionToolNames = [
        "discord_send_message",
        "discord_react",
        "discord_edit_message",
        "discord_delete_message",
        "discord_set_presence",
        "discord_join_voice",
        "discord_leave_voice",
    ];

    for (const name of actionToolNames) {
        it(`${name} mentions "approval" in description`, () => {
            const tool = TOOLS.find(t => t.name === name);
            expect(tool, `${name} not found in TOOLS`).toBeDefined();
            expect(tool!.description.toLowerCase()).toContain("approval");
        });
    }
});

describe("specific tool requirements", () => {
    it("discord_eval requires 'code' parameter", () => {
        const tool = TOOLS.find(t => t.name === "discord_eval");
        expect(tool).toBeDefined();

        const schema = tool!.inputSchema as any;
        expect(schema.required).toContain("code");
        expect(schema.properties).toHaveProperty("code");
    });

    it("discord_list_channels requires 'guildId'", () => {
        const tool = TOOLS.find(t => t.name === "discord_list_channels");
        expect(tool).toBeDefined();

        const schema = tool!.inputSchema as any;
        expect(schema.required).toContain("guildId");
        expect(schema.properties).toHaveProperty("guildId");
    });

    it("discord_send_message requires 'channelId' and 'content'", () => {
        const tool = TOOLS.find(t => t.name === "discord_send_message");
        expect(tool).toBeDefined();

        const schema = tool!.inputSchema as any;
        expect(schema.required).toContain("channelId");
        expect(schema.required).toContain("content");
    });

    it("discord_subscribe requires 'events'", () => {
        const tool = TOOLS.find(t => t.name === "discord_subscribe");
        expect(tool).toBeDefined();

        const schema = tool!.inputSchema as any;
        expect(schema.required).toContain("events");
    });
});
