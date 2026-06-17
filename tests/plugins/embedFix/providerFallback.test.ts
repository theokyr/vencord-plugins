import { describe, expect, it, vi } from "vitest";
import { chooseWorkingProvider, getProviderProbePath } from "../../../plugins/embedFix/providerFallback";
import type { PlatformEntry } from "../../../plugins/embedFix/providerMap";

const TWITTER: PlatformEntry = {
    id: "twitter",
    label: "Twitter / X",
    domains: ["twitter.com", "x.com"],
    providers: [
        { domain: "vxtwitter.com", label: "VxTwitter" },
        { domain: "xcancel.com", label: "XCancel" },
        { domain: "fxtwitter.com", label: "FxTwitter" },
    ],
};

describe("embedFix/providerFallback", () => {
    it("tries providers in order until one has a usable probe result", async () => {
        const probeProvider = vi.fn(async (domain: string) => {
            if (domain === "vxtwitter.com") {
                return { domain, score: 0, hasVideo: false, hasAudio: false, hasImage: false, hasTitle: false, error: "HTTP 500" };
            }
            return { domain, score: 4, hasVideo: true, hasAudio: false, hasImage: true, hasTitle: true };
        });

        const result = await chooseWorkingProvider(
            TWITTER,
            "https://twitter.com/user/status/123?lang=en#frag",
            probeProvider,
        );

        expect(result?.provider.domain).toBe("xcancel.com");
        expect(probeProvider).toHaveBeenCalledTimes(2);
        expect(probeProvider).toHaveBeenNthCalledWith(1, "vxtwitter.com", "/user/status/123?lang=en#frag");
        expect(probeProvider).toHaveBeenNthCalledWith(2, "xcancel.com", "/user/status/123?lang=en#frag");
    });

    it("returns null when every provider fails", async () => {
        const probeProvider = vi.fn(async (domain: string) => ({
            domain,
            score: 0,
            hasVideo: false,
            hasAudio: false,
            hasImage: false,
            hasTitle: false,
            error: "HTTP 404",
        }));

        const result = await chooseWorkingProvider(
            TWITTER,
            "https://twitter.com/user/status/404",
            probeProvider,
        );

        expect(result).toBeNull();
        expect(probeProvider).toHaveBeenCalledTimes(3);
    });

    it("builds probe paths with query and fragment intact", () => {
        expect(getProviderProbePath("https://twitter.com/user/status/123?lang=en#frag")).toBe("/user/status/123?lang=en#frag");
    });
});
