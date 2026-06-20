import { Button, React } from "@webpack/common";

import type { VipRule } from "../types";

interface RuleListProps {
    rules: VipRule[];
    selectedRuleId: string | null;
    mode: "full" | "compact";
    onCreateRule(): void;
    onSelectRule(ruleId: string): void;
    onToggleRule(ruleId: string, enabled: boolean): void;
    onDeleteRule(ruleId: string): void;
    onMoveRule(fromIndex: number, toIndex: number): void;
}

interface DragState {
    ruleId: string;
}

function conditionSummary(rule: VipRule): string {
    const conditions = rule.conditions ?? {};
    const groups = [
        conditions.authorUserIds?.length ? `authors ${conditions.authorUserIds.length}` : "",
        conditions.dmChannelIds?.length ? `DMs ${conditions.dmChannelIds.length}` : "",
        conditions.groupDmChannelIds?.length ? `group DMs ${conditions.groupDmChannelIds.length}` : "",
        conditions.guildChannelIds?.length ? `channels ${conditions.guildChannelIds.length}` : "",
        conditions.categoryIds?.length ? `categories ${conditions.categoryIds.length}` : "",
        conditions.guildIds?.length ? `guilds ${conditions.guildIds.length}` : "",
        conditions.mentionedRoleIds?.length ? `roles ${conditions.mentionedRoleIds.length}` : "",
        conditions.mentionTypes?.length ? `mentions ${conditions.mentionTypes.length}` : "",
        conditions.keywords?.length ? `keywords ${conditions.keywords.length}` : "",
    ].filter(Boolean);

    return groups.length ? groups.join(" / ") : "No conditions";
}

export function RuleList({
    rules,
    selectedRuleId,
    mode,
    onCreateRule,
    onSelectRule,
    onToggleRule,
    onDeleteRule,
    onMoveRule,
}: RuleListProps) {
    const [dragging, setDragging] = React.useState<DragState | null>(null);

    return (
        <section className={`vc-vipNotifications-section vc-vipNotifications-ruleList vc-vipNotifications-ruleList-${mode}`}>
            <div className="vc-vipNotifications-sectionHeader">
                <div>
                    <div className="vc-vipNotifications-sectionTitle">Rules</div>
                    <div className="vc-vipNotifications-sectionSubtitle">First matching enabled rule wins.</div>
                </div>
                <Button size={Button.Sizes.SMALL} onClick={onCreateRule}>
                    Add Rule
                </Button>
            </div>

            {rules.length === 0 ? (
                <div className="vc-vipNotifications-emptyState">No rules yet.</div>
            ) : (
                <div className="vc-vipNotifications-ruleItems" role="list" aria-label="VIP notification rules">
                    {rules.map((rule, index) => {
                        const selected = rule.id === selectedRuleId;
                        const isDragging = dragging?.ruleId === rule.id;

                        return (
                            <div
                                key={rule.id}
                                className={`vc-vipNotifications-ruleItem${selected ? " vc-vipNotifications-ruleItemSelected" : ""}${isDragging ? " vc-vipNotifications-ruleItemDragging" : ""}`}
                                draggable
                                onDragStart={(event: any) => {
                                    event.dataTransfer.setData("text/plain", rule.id);
                                    event.dataTransfer.effectAllowed = "move";
                                    setDragging({ ruleId: rule.id });
                                }}
                                onDragEnd={() => setDragging(null)}
                                onDragOver={(event: any) => {
                                    if (!dragging)
                                        return;

                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = "move";
                                }}
                                onDrop={(event: any) => {
                                    event.preventDefault();
                                    if (!dragging)
                                        return;

                                    const fromIndex = rules.findIndex(item => item.id === dragging.ruleId);
                                    setDragging(null);
                                    onMoveRule(fromIndex, index);
                                }}
                            >
                                <span className="vc-vipNotifications-dragHandle" aria-hidden="true">::</span>
                                <span className="vc-vipNotifications-ruleRank">{index + 1}</span>
                                <button
                                    type="button"
                                    className="vc-vipNotifications-ruleMain"
                                    onClick={() => onSelectRule(rule.id)}
                                >
                                    <span className="vc-vipNotifications-listItemTitle">{rule.name}</span>
                                    <span className="vc-vipNotifications-listItemMeta">
                                        {rule.enabled ? "Enabled" : "Disabled"} / {conditionSummary(rule)}
                                    </span>
                                </button>
                                <div className="vc-vipNotifications-ruleActions">
                                    <label className="vc-vipNotifications-miniToggle">
                                        <input
                                            type="checkbox"
                                            checked={rule.enabled}
                                            onChange={(event: any) => onToggleRule(rule.id, Boolean(event.currentTarget.checked))}
                                        />
                                        <span>On</span>
                                    </label>
                                    <button
                                        type="button"
                                        className="vc-vipNotifications-iconButton"
                                        disabled={index === 0}
                                        aria-label={`Move ${rule.name} up`}
                                        onClick={() => onMoveRule(index, index - 1)}
                                    >
                                        ^
                                    </button>
                                    <button
                                        type="button"
                                        className="vc-vipNotifications-iconButton"
                                        disabled={index === rules.length - 1}
                                        aria-label={`Move ${rule.name} down`}
                                        onClick={() => onMoveRule(index, index + 1)}
                                    >
                                        v
                                    </button>
                                    <button
                                        type="button"
                                        className="vc-vipNotifications-iconButton vc-vipNotifications-dangerButton"
                                        aria-label={`Delete ${rule.name}`}
                                        onClick={() => onDeleteRule(rule.id)}
                                    >
                                        x
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
