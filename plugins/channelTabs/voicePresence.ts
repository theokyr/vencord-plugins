export interface VoiceStateLike {
    userId?: unknown;
    user_id?: unknown;
}

export type VoiceStateCollection = Record<string, VoiceStateLike> | VoiceStateLike[] | null | undefined;

export type VoiceTabPresence = "idle" | "connected" | "occupied" | "calling";

/**
 * Normalize Discord's channel voice-state map into stable, de-duplicated user ids.
 * The object key is a useful fallback while stores are hydrating older state shapes.
 */
export function getVoiceParticipantIds(voiceStates: VoiceStateCollection): string[] {
    const entries: Array<[string | undefined, VoiceStateLike]> = Array.isArray(voiceStates)
        ? voiceStates.map(voiceState => [undefined, voiceState])
        : Object.entries(voiceStates ?? {});
    const userIds = new Set<string>();

    for (const [fallbackId, voiceState] of entries) {
        const userId = voiceState?.userId ?? voiceState?.user_id ?? fallbackId;
        if (typeof userId === "string" && userId) userIds.add(userId);
    }

    return [...userIds];
}

/**
 * Distinguish the call the current user joined from a voice channel merely occupied
 * by other people. CallStore remains a final fallback for ringing/starting DM calls
 * whose voice-state list has not populated yet.
 */
export function getVoiceTabPresence(
    participantUserIds: string[],
    currentUserId: string | null | undefined,
    isCallActive: boolean
): VoiceTabPresence {
    if (currentUserId && participantUserIds.includes(currentUserId)) return "connected";
    if (participantUserIds.length > 0) return "occupied";
    if (isCallActive) return "calling";
    return "idle";
}
