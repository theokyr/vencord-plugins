import { describe, expect, it } from "vitest";
import { createEmbedFixSchema } from "../../../plugins/embedFix/settingsSchema";

const mockSettings = {
    store: {},
    def: {
        rewriteOutgoing: { type: 3 },
        rewriteIncoming: { type: 3 },
        cacheTTLHours: { type: 1 },
        enableTwitter: { type: 3 },
        enableReddit: { type: 3 },
        enableInstagram: { type: 3 },
        enableTiktok: { type: 3 },
        enablePixiv: { type: 3 },
        enableBluesky: { type: 3 },
        enableThreads: { type: 3 },
        providerPriorities: { type: 6 },
        customProviders: { type: 0 },
        recheckProviders: { type: 6 },
    },
} as any;

describe("createEmbedFixSchema", () => {
    it("exposes provider priorities in the Providers section", () => {
        const schema = createEmbedFixSchema(mockSettings);
        const providers = schema.sections.find(section => section.id === "providers")!;
        const keys = providers.groups!.flatMap(group => group.settings.map(setting => setting.key));

        expect(keys).toContain("providerPriorities");
    });
});
