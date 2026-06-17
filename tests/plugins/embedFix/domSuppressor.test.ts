import { describe, expect, it } from "vitest";
import { shouldSuppressNativeEmbed } from "../../../plugins/embedFix/domSuppressor";
import { DEFAULT_PLATFORMS } from "../../../plugins/embedFix/providerMap";

describe("embedFix/domSuppressor", () => {
    it("suppresses stale source-domain embeds when the displayed link is rewritten to a provider", () => {
        expect(shouldSuppressNativeEmbed(
            ["https://vxtwitter.com/tomwarren/status/2060491337581965623"],
            ["https://twitter.com/tomwarren", "https://pbs.twimg.com/media/example.png"],
            "Tom Warren (@tomwarren)yupX",
            DEFAULT_PLATFORMS,
        )).toBe(true);
    });

    it("keeps provider embeds that still include source-domain author links", () => {
        expect(shouldSuppressNativeEmbed(
            ["https://vxtwitter.com/megagoose11/status/2060271641456791823"],
            [
                "https://x.com/megagoose11/status/2060271641456791823",
                "https://vxtwitter.com/rendercombined.jpg?imgs=https://pbs.twimg.com/media/example.jpg",
            ],
            "Goose (@megagoose11)vxTwitter / fixvx",
            DEFAULT_PLATFORMS,
        )).toBe(false);
    });
});
