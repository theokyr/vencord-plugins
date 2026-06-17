const MIGRATED_MARKER = "migratedFromChannelTabsV1";

type MigrationRule = {
    readonly sourceKey: string;
    readonly targetKey: string;
    readonly accepts: (value: unknown) => boolean;
};

function isBoolean(value: unknown): value is boolean {
    return typeof value === "boolean";
}

function isOneOf<const TValue extends string>(...values: readonly TValue[]) {
    return (value: unknown): value is TValue => typeof value === "string" && values.includes(value as TValue);
}

const MIGRATION_RULES: readonly MigrationRule[] = [
    { sourceKey: "enrichedHeader", targetKey: "headerEnabled", accepts: isBoolean },
    { sourceKey: "sidebarTogglePosition", targetKey: "sidebarTogglePosition", accepts: isOneOf("left", "right") },
    { sourceKey: "guildNameStyle", targetKey: "guildNameStyle", accepts: isOneOf("none", "breadcrumb") },
    { sourceKey: "navButtonsStyle", targetKey: "navButtonsStyle", accepts: isOneOf("show", "compact", "hidden") },
    { sourceKey: "hideGuildSidebar", targetKey: "hideGuildSidebar", accepts: isBoolean },
    { sourceKey: "hideChannelList", targetKey: "hideChannelList", accepts: isBoolean },
];

export function migrateChannelTabsSettings(target: Record<string, unknown>, source?: Record<string, unknown> | null): boolean {
    if (target[MIGRATED_MARKER] === true) return false;
    if (!source) return false;

    for (const { sourceKey, targetKey, accepts } of MIGRATION_RULES) {
        const value = source[sourceKey];
        if (accepts(value)) target[targetKey] = value;
    }

    target[MIGRATED_MARKER] = true;
    return true;
}
