export type PrivacyMode = "streamerAware" | "full" | "senderOnly" | "generic";
export type CooldownKey = "profileChannel" | "profileRule" | "profileAuthor" | "profileOnly";
export type SoundKind = "disabled" | "builtIn" | "custom";
export type KeywordMode = "any" | "all";
export type VipMentionType = "user" | "role" | "everyone" | "here";
export type VipChannelType = "dm" | "groupDm" | "guild";

export interface VipProfile {
    id: string;
    name: string;
    enabled: boolean;
    soundKind: SoundKind;
    soundId: string;
    customSoundUrl: string;
    soundVolume: number;
    showDesktopNotification: boolean;
    showVencordNotification: boolean;
    privacyMode: PrivacyMode;
    allowDndOverride: boolean;
    allowStreamerModeOverride: boolean;
    allowStreamerContent: boolean;
    allowMuteOverride: boolean;
    cooldownMs: number;
    cooldownKey: CooldownKey;
}

export interface VipRuleConditions {
    authorUserIds?: string[];
    dmChannelIds?: string[];
    groupDmChannelIds?: string[];
    guildChannelIds?: string[];
    categoryIds?: string[];
    guildIds?: string[];
    mentionedRoleIds?: string[];
    mentionTypes?: VipMentionType[];
    keywords?: string[];
    keywordMode?: KeywordMode;
    keywordCaseSensitive?: boolean;
}

export interface VipRule {
    id: string;
    name: string;
    enabled: boolean;
    profileId: string;
    conditions: VipRuleConditions;
}

export interface VipConfig {
    version: 1;
    defaultProfileId: string;
    quickAddPlacement: "top" | "bottom";
    decisionTtlMs: number;
    profiles: VipProfile[];
    rules: VipRule[];
}

export interface MessageContext {
    messageId: string;
    channelId: string;
    guildId: string | null;
    categoryId: string | null;
    authorId: string;
    isCurrentUser: boolean;
    isOptimistic: boolean;
    isStreamerMode: boolean;
    isDnd: boolean;
    channelType: VipChannelType;
    mentionedUserIds: string[];
    mentionedRoleIds: string[];
    mentionTypes: VipMentionType[];
    content: string;
    authorName: string;
    channelName: string;
    guildName: string | null;
}

export interface Diagnostic {
    code: string;
    message: string;
    path?: string;
    severity?: "info" | "warning" | "error";
}

export interface VipDeliveryPlan {
    ruleId: string;
    profileId: string;
    profileName: string;
    soundKind: SoundKind;
    soundId: string;
    customSoundUrl: string;
    soundVolume: number;
    showDesktopNotification: boolean;
    showVencordNotification: boolean;
    privacyMode: PrivacyMode;
    allowDndOverride: boolean;
    allowStreamerModeOverride: boolean;
    allowStreamerContent: boolean;
    allowMuteOverride: boolean;
    cooldownMs: number;
    cooldownKey: CooldownKey;
}

export interface AlertText {
    title: string;
    body: string;
    isNativePrivacySafe: boolean;
}

export type NotificationOutcome = "sound" | "desktop" | "vencord";
export type NativeNotificationOutcome = Exclude<NotificationOutcome, "vencord">;
export type DeliveryState = "planned" | "nativeClaimed" | "pluginDelivered" | "failed";

export interface DeliveryDecision {
    messageId: string;
    ctx: MessageContext;
    plan: VipDeliveryPlan;
    nativeSuppressions?: {
        muted?: boolean;
    };
}

export interface PluginNotificationAdapter {
    sound(decision: DeliveryDecision, alertText: AlertText): void | Promise<void>;
    desktop(decision: DeliveryDecision, alertText: AlertText): void | Promise<void>;
    vencord(decision: DeliveryDecision, alertText: AlertText): void | Promise<void>;
}

export interface NativeNotificationAdapter {
    sound(decision: DeliveryDecision, alertText: AlertText): void | Promise<void>;
    desktop(decision: DeliveryDecision, alertText: AlertText): void | Promise<void>;
}

export interface NotificationServiceCapabilities {
    native: Record<NativeNotificationOutcome, boolean>;
}

export interface NotificationServiceAdapters {
    plugin: PluginNotificationAdapter;
    native?: NativeNotificationAdapter;
    capabilities?: NotificationServiceCapabilities;
}
