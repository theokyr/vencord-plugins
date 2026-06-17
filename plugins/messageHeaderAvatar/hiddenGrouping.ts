export type HiddenGroupingDecision = "default" | "forceHeader" | "collapseHeader";

export interface HiddenGroupingRow {
    authorId?: string | null;
    hidden: boolean;
    groupStart: boolean;
}

export function getHiddenGroupingDecisions(rows: HiddenGroupingRow[]): HiddenGroupingDecision[] {
    const decisions: HiddenGroupingDecision[] = rows.map(() => "default");
    let previousVisibleAuthorId: string | undefined;

    rows.forEach((row, index) => {
        const authorId = row.authorId ?? undefined;

        if (row.hidden) return;

        if (authorId && previousVisibleAuthorId) {
            if (authorId === previousVisibleAuthorId) {
                decisions[index] = "collapseHeader";
            } else if (!row.groupStart) {
                decisions[index] = "forceHeader";
            }
        }

        if (authorId) previousVisibleAuthorId = authorId;
    });

    return decisions;
}
