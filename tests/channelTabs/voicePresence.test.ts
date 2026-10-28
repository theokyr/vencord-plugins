import { describe, expect, it } from "vitest";
import { getVoiceParticipantIds, getVoiceTabPresence } from "../../plugins/channelTabs/voicePresence";

describe("channelTabs voice presence", () => {
    it("normalizes and de-duplicates participant ids", () => {
        expect(getVoiceParticipantIds({
            "user-a": { userId: "user-a" },
            "user-b": { user_id: "user-b" },
            "user-c": {},
            duplicate: { userId: "user-a" },
        })).toEqual(["user-a", "user-b", "user-c"]);
    });

    it("recognizes the channel the current user joined", () => {
        expect(getVoiceTabPresence(["friend", "self"], "self", false)).toBe("connected");
    });

    it("marks a VC occupied when only other users are present", () => {
        expect(getVoiceTabPresence(["friend"], "self", false)).toBe("occupied");
    });

    it("keeps a voice-less active call distinct from occupancy", () => {
        expect(getVoiceTabPresence([], "self", true)).toBe("calling");
        expect(getVoiceTabPresence([], "self", false)).toBe("idle");
    });
});
