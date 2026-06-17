import { describe, expect, it } from "vitest";
import { DEFAULT_PLATFORMS } from "../../../plugins/embedFix/providerMap";
import {
    applyProviderOrder,
    getProviderOrder,
    setProviderOrder,
} from "../../../plugins/embedFix/providerPriority";

describe("embedFix/providerPriority", () => {
    it("reorders existing providers for a platform from persisted JSON", () => {
        const ordered = applyProviderOrder(
            DEFAULT_PLATFORMS,
            JSON.stringify({ twitter: ["xcancel.com", "vxtwitter.com", "fxtwitter.com"] }),
        );

        const twitter = ordered.find(platform => platform.id === "twitter")!;
        expect(twitter.providers.map(provider => provider.domain)).toEqual([
            "xcancel.com",
            "vxtwitter.com",
            "fxtwitter.com",
        ]);
    });

    it("keeps providers missing from the persisted order after ordered providers", () => {
        const ordered = applyProviderOrder(
            DEFAULT_PLATFORMS,
            JSON.stringify({ twitter: ["xcancel.com"] }),
        );

        const twitter = ordered.find(platform => platform.id === "twitter")!;
        expect(twitter.providers.map(provider => provider.domain)).toEqual([
            "xcancel.com",
            "vxtwitter.com",
            "fxtwitter.com",
        ]);
    });

    it("updates one platform order without losing other platform orders", () => {
        const current = JSON.stringify({
            twitter: ["xcancel.com", "vxtwitter.com"],
            reddit: ["rxddit.com", "vxreddit.com"],
        });

        const updated = setProviderOrder(current, "twitter", ["fxtwitter.com", "vxtwitter.com"]);

        expect(getProviderOrder(updated, "twitter")).toEqual(["fxtwitter.com", "vxtwitter.com"]);
        expect(getProviderOrder(updated, "reddit")).toEqual(["rxddit.com", "vxreddit.com"]);
    });

    it("falls back to platform provider order for invalid persisted JSON", () => {
        const twitter = DEFAULT_PLATFORMS.find(platform => platform.id === "twitter")!;

        expect(getProviderOrder("{ invalid", "twitter", twitter)).toEqual([
            "vxtwitter.com",
            "fxtwitter.com",
            "xcancel.com",
        ]);
    });
});
