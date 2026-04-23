import { describe, it, expect } from "vitest";
import type { ChannelTab, RouteTab, GroupTab } from "../../plugins/channelTabs/types";
import {
    findTabLocation,
    createGroup,
    addToGroup,
    removeFromGroup,
    dissolveGroup,
    closeGroup,
    moveToGroup,
    pinGroup,
    moveWithinGroup,
    pinChildInGroup,
    type TabState,
    type TabLocation,
} from "../../plugins/channelTabs/groupState";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeChannel(id: string, channelId: string, pinned = false): ChannelTab {
    return { type: "channel", id, channelId, guildId: "g1", pinned };
}

function makeRoute(id: string, path: string, pinned = false): RouteTab {
    return { type: "route", id, path, label: path, pinned };
}

function makeGroup(id: string, name: string, children: (ChannelTab | RouteTab)[], pinned = false): GroupTab {
    return { type: "group", id, name, color: null, pinned, collapsed: true, children };
}

function makeState(tabs: (ChannelTab | RouteTab | GroupTab)[], activeTabIndex = 0, activeChildIndex: number | null = null): TabState {
    return { tabs, activeTabIndex, activeChildIndex };
}

// ---------------------------------------------------------------------------
// findTabLocation
// ---------------------------------------------------------------------------

describe("findTabLocation", () => {
    it("finds a loose tab", () => {
        const a = makeChannel("a", "c1");
        const b = makeChannel("b", "c2");
        const tabs = [a, b];
        expect(findTabLocation(tabs, "a")).toEqual<TabLocation>({ tabIndex: 0, childIndex: null });
        expect(findTabLocation(tabs, "b")).toEqual<TabLocation>({ tabIndex: 1, childIndex: null });
    });

    it("finds a child inside a group", () => {
        const a = makeChannel("a", "c1");
        const b = makeChannel("b", "c2");
        const g = makeGroup("g1", "Work", [a, b]);
        const tabs = [g];
        expect(findTabLocation(tabs, "a")).toEqual<TabLocation>({ tabIndex: 0, childIndex: 0 });
        expect(findTabLocation(tabs, "b")).toEqual<TabLocation>({ tabIndex: 0, childIndex: 1 });
    });

    it("returns null for nonexistent tab", () => {
        const tabs = [makeChannel("a", "c1")];
        expect(findTabLocation(tabs, "nonexistent")).toBeNull();
    });

    it("does not find a group itself by child search", () => {
        const g = makeGroup("g1", "Work", []);
        const tabs = [g];
        // The group id should be found at tabIndex 0 as a top-level tab
        expect(findTabLocation(tabs, "g1")).toEqual<TabLocation>({ tabIndex: 0, childIndex: null });
    });
});

// ---------------------------------------------------------------------------
// createGroup
// ---------------------------------------------------------------------------

describe("createGroup", () => {
    it("creates a group from loose tab indices", () => {
        const a = makeChannel("a", "c1");
        const b = makeChannel("b", "c2");
        const c = makeChannel("c", "c3");
        const state = makeState([a, b, c], 0);
        const result = createGroup(state, [0, 2], "grp1", "MyGroup");
        // Group should be at position 0 (first selected index), c and a are children
        const group = result.tabs.find(t => t.type === "group") as GroupTab;
        expect(group).toBeDefined();
        expect(group.name).toBe("MyGroup");
        expect(group.children.map(ch => ch.id)).toContain("a");
        expect(group.children.map(ch => ch.id)).toContain("c");
        // b remains in tabs
        expect(result.tabs.map(t => t.id)).toContain("b");
        // total tabs: group + b = 2
        expect(result.tabs.length).toBe(2);
    });

    it("sets color when provided", () => {
        const a = makeChannel("a", "c1");
        const state = makeState([a], 0);
        const result = createGroup(state, [0], "grp1", "G", "#ff0000");
        const group = result.tabs[0] as GroupTab;
        expect(group.color).toBe("#ff0000");
    });

    it("defaults color to null", () => {
        const a = makeChannel("a", "c1");
        const state = makeState([a], 0);
        const result = createGroup(state, [0], "grp1", "G");
        const group = result.tabs[0] as GroupTab;
        expect(group.color).toBeNull();
    });

    it("preserves active tracking when active tab is grouped", () => {
        const a = makeChannel("a", "c1");
        const b = makeChannel("b", "c2");
        const state = makeState([a, b], 1); // active = b
        const result = createGroup(state, [1], "grp1", "G");
        // b is now inside the group; activeTabIndex should point to the group
        const groupIdx = result.tabs.findIndex(t => t.type === "group");
        expect(result.activeTabIndex).toBe(groupIdx);
        expect(result.activeChildIndex).toBe(0); // b is child[0]
    });

    it("preserves active tracking when active tab is not grouped", () => {
        const a = makeChannel("a", "c1");
        const b = makeChannel("b", "c2");
        const c = makeChannel("c", "c3");
        const state = makeState([a, b, c], 0); // active = a
        const result = createGroup(state, [1, 2], "grp1", "G");
        // a stays loose; active should still point to a
        const aIdx = result.tabs.findIndex(t => t.id === "a");
        expect(result.activeTabIndex).toBe(aIdx);
        expect(result.activeChildIndex).toBeNull();
    });

    it("ignores indices pointing to groups (no nesting)", () => {
        const a = makeChannel("a", "c1");
        const g = makeGroup("g1", "Existing", [makeChannel("x", "cx")]);
        const state = makeState([a, g], 0);
        // Try to create a group including the existing group (index 1)
        const result = createGroup(state, [0, 1], "grp2", "Outer");
        const outerGroup = result.tabs.find(t => t.id === "grp2") as GroupTab;
        // The existing group should not become a child
        expect(outerGroup.children.every(ch => ch.type !== "group")).toBe(true);
        // g1 should still be a top-level tab
        expect(result.tabs.some(t => t.id === "g1")).toBe(true);
    });

    it("is a no-op when indices array is empty", () => {
        const a = makeChannel("a", "c1");
        const state = makeState([a], 0);
        const result = createGroup(state, [], "grp1", "G");
        // Nothing to group; state should be unchanged (or group with empty children)
        // We expect the result to not break — either unchanged or an empty group is created
        // but no tabs should disappear
        expect(result.tabs.some(t => t.id === "a")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// addToGroup
// ---------------------------------------------------------------------------

describe("addToGroup", () => {
    it("moves a loose tab into a group", () => {
        const a = makeChannel("a", "c1");
        const b = makeChannel("b", "c2");
        const g = makeGroup("g1", "Work", []);
        const state = makeState([a, g, b], 0);
        const result = addToGroup(state, "b", "g1");
        const group = result.tabs.find(t => t.id === "g1") as GroupTab;
        expect(group.children.map(ch => ch.id)).toContain("b");
        // b no longer at top level
        expect(result.tabs.some(t => t.id === "b")).toBe(false);
        // group still in tabs
        expect(result.tabs.some(t => t.id === "g1")).toBe(true);
    });

    it("updates activeTabIndex and activeChildIndex when active tab moves into group", () => {
        const a = makeChannel("a", "c1");
        const g = makeGroup("g1", "Work", [makeChannel("x", "cx")]);
        const state = makeState([a, g], 0); // active = a
        const result = addToGroup(state, "a", "g1");
        const groupIdx = result.tabs.findIndex(t => t.id === "g1");
        expect(result.activeTabIndex).toBe(groupIdx);
        // a is appended after x, so childIndex = 1
        expect(result.activeChildIndex).toBe(1);
    });

    it("is a no-op if tab is already in the group", () => {
        const a = makeChannel("a", "c1");
        const g = makeGroup("g1", "Work", [a]);
        const state = makeState([g], 0, 0);
        const result = addToGroup(state, "a", "g1");
        const group = result.tabs[0] as GroupTab;
        // Should not duplicate
        expect(group.children.filter(ch => ch.id === "a").length).toBe(1);
    });

    it("is a no-op if target group does not exist", () => {
        const a = makeChannel("a", "c1");
        const state = makeState([a], 0);
        const result = addToGroup(state, "a", "nonexistent");
        expect(result.tabs.map(t => t.id)).toContain("a");
    });
});

// ---------------------------------------------------------------------------
// removeFromGroup
// ---------------------------------------------------------------------------

describe("removeFromGroup", () => {
    it("moves a child to top-level tabs[] after its group position", () => {
        const a = makeChannel("a", "c1");
        const b = makeChannel("b", "c2");
        const g = makeGroup("g1", "Work", [a, b]);
        const state = makeState([g], 0, 0);
        const result = removeFromGroup(state, "a");
        expect(result.tabs.some(t => t.id === "a")).toBe(true);
        const group = result.tabs.find(t => t.id === "g1") as GroupTab;
        expect(group.children.some(ch => ch.id === "a")).toBe(false);
        expect(group.children.some(ch => ch.id === "b")).toBe(true);
    });

    it("dissolves group on empty when emptyBehavior is 'dissolve' (default)", () => {
        const a = makeChannel("a", "c1");
        const g = makeGroup("g1", "Work", [a]);
        const state = makeState([g], 0, 0);
        const result = removeFromGroup(state, "a");
        // Group removed since it's now empty
        expect(result.tabs.some(t => t.id === "g1")).toBe(false);
        expect(result.tabs.some(t => t.id === "a")).toBe(true);
    });

    it("keeps empty group when emptyBehavior is 'keep'", () => {
        const a = makeChannel("a", "c1");
        const g = makeGroup("g1", "Work", [a]);
        const state = makeState([g], 0, 0);
        const result = removeFromGroup(state, "a", "keep");
        expect(result.tabs.some(t => t.id === "g1")).toBe(true);
        const group = result.tabs.find(t => t.id === "g1") as GroupTab;
        expect(group.children.length).toBe(0);
        expect(result.tabs.some(t => t.id === "a")).toBe(true);
    });

    it("updates activeTabIndex when active child is removed", () => {
        const a = makeChannel("a", "c1");
        const b = makeChannel("b", "c2");
        const g = makeGroup("g1", "Work", [a, b]);
        const state = makeState([g], 0, 0); // active = a (child 0)
        const result = removeFromGroup(state, "a");
        // a becomes a loose tab; activeTabIndex should point to a
        const aIdx = result.tabs.findIndex(t => t.id === "a");
        expect(result.activeTabIndex).toBe(aIdx);
        expect(result.activeChildIndex).toBeNull();
    });

    it("keeps activeChildIndex consistent when a sibling is removed", () => {
        const a = makeChannel("a", "c1");
        const b = makeChannel("b", "c2");
        const c = makeChannel("c", "c3");
        const g = makeGroup("g1", "Work", [a, b, c]);
        const state = makeState([g], 0, 2); // active = c (child 2)
        const result = removeFromGroup(state, "a"); // remove a (child 0)
        // b is now child 0, c is child 1; active should follow c
        const group = result.tabs.find(t => t.id === "g1") as GroupTab;
        expect(group.children[1].id).toBe("c");
        expect(result.activeChildIndex).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// dissolveGroup
// ---------------------------------------------------------------------------

describe("dissolveGroup", () => {
    it("spills all children at the group's position", () => {
        const pre = makeChannel("pre", "c0");
        const a = makeChannel("a", "c1");
        const b = makeChannel("b", "c2");
        const g = makeGroup("g1", "Work", [a, b]);
        const post = makeChannel("post", "c3");
        const state = makeState([pre, g, post], 0);
        const result = dissolveGroup(state, "g1");
        expect(result.tabs.map(t => t.id)).toEqual(["pre", "a", "b", "post"]);
    });

    it("preserves active child (active child becomes a loose active tab)", () => {
        const a = makeChannel("a", "c1");
        const b = makeChannel("b", "c2");
        const g = makeGroup("g1", "Work", [a, b]);
        const state = makeState([g], 0, 1); // active = b (child 1)
        const result = dissolveGroup(state, "g1");
        const bIdx = result.tabs.findIndex(t => t.id === "b");
        expect(result.activeTabIndex).toBe(bIdx);
        expect(result.activeChildIndex).toBeNull();
    });

    it("falls back active to first child when no active child", () => {
        const a = makeChannel("a", "c1");
        const b = makeChannel("b", "c2");
        const g = makeGroup("g1", "Work", [a, b]);
        const state = makeState([g], 0, null); // group is active but no child selected
        const result = dissolveGroup(state, "g1");
        // Active should point to where group was (first child)
        const aIdx = result.tabs.findIndex(t => t.id === "a");
        expect(result.activeTabIndex).toBe(aIdx);
        expect(result.activeChildIndex).toBeNull();
    });

    it("is a no-op for nonexistent group", () => {
        const a = makeChannel("a", "c1");
        const state = makeState([a], 0);
        const result = dissolveGroup(state, "nonexistent");
        expect(result.tabs.map(t => t.id)).toEqual(["a"]);
    });
});

// ---------------------------------------------------------------------------
// closeGroup
// ---------------------------------------------------------------------------

describe("closeGroup", () => {
    it("removes the group and all its children from tabs", () => {
        const a = makeChannel("a", "c1");
        const b = makeChannel("b", "c2");
        const g = makeGroup("g1", "Work", [a, b]);
        const other = makeChannel("other", "c3");
        const state = makeState([g, other], 1); // active = other
        const result = closeGroup(state, "g1");
        expect(result.tabs.map(t => t.id)).toEqual(["other"]);
    });

    it("adjusts active index when group before active is closed", () => {
        const g = makeGroup("g1", "Work", [makeChannel("a", "c1")]);
        const other = makeChannel("other", "c2");
        const state = makeState([g, other], 1); // active = other at index 1
        const result = closeGroup(state, "g1");
        // other should now be at index 0
        expect(result.activeTabIndex).toBe(0);
        expect(result.activeChildIndex).toBeNull();
    });

    it("clamps active index to last tab when active group is closed", () => {
        const g = makeGroup("g1", "Work", [makeChannel("a", "c1")]);
        const other = makeChannel("other", "c2");
        const state = makeState([other, g], 1, 0); // active = g
        const result = closeGroup(state, "g1");
        // other is now the only tab at index 0
        expect(result.activeTabIndex).toBe(0);
        expect(result.activeChildIndex).toBeNull();
    });

    it("is a no-op for nonexistent group", () => {
        const a = makeChannel("a", "c1");
        const state = makeState([a], 0);
        const result = closeGroup(state, "nonexistent");
        expect(result.tabs.map(t => t.id)).toEqual(["a"]);
    });
});

// ---------------------------------------------------------------------------
// moveToGroup
// ---------------------------------------------------------------------------

describe("moveToGroup", () => {
    it("moves a child from one group to another", () => {
        const a = makeChannel("a", "c1");
        const b = makeChannel("b", "c2");
        const src = makeGroup("src", "Source", [a, b]);
        const dst = makeGroup("dst", "Dest", []);
        const state = makeState([src, dst], 0, 0);
        const result = moveToGroup(state, "a", "dst");
        const srcGroup = result.tabs.find(t => t.id === "src") as GroupTab;
        const dstGroup = result.tabs.find(t => t.id === "dst") as GroupTab;
        expect(srcGroup.children.map(ch => ch.id)).not.toContain("a");
        expect(dstGroup.children.map(ch => ch.id)).toContain("a");
    });

    it("moves a loose tab into a target group", () => {
        const a = makeChannel("a", "c1");
        const g = makeGroup("g1", "Work", []);
        const state = makeState([a, g], 0);
        const result = moveToGroup(state, "a", "g1");
        const group = result.tabs.find(t => t.id === "g1") as GroupTab;
        expect(group.children.map(ch => ch.id)).toContain("a");
        expect(result.tabs.some(t => t.id === "a")).toBe(false);
    });

    it("dissolves source group when empty after move (default)", () => {
        const a = makeChannel("a", "c1");
        const src = makeGroup("src", "Source", [a]);
        const dst = makeGroup("dst", "Dest", []);
        const state = makeState([src, dst], 0, 0);
        const result = moveToGroup(state, "a", "dst", "dissolve");
        expect(result.tabs.some(t => t.id === "src")).toBe(false);
    });

    it("keeps source group when empty and emptyBehavior is 'keep'", () => {
        const a = makeChannel("a", "c1");
        const src = makeGroup("src", "Source", [a]);
        const dst = makeGroup("dst", "Dest", []);
        const state = makeState([src, dst], 0, 0);
        const result = moveToGroup(state, "a", "dst", "keep");
        expect(result.tabs.some(t => t.id === "src")).toBe(true);
        const srcGroup = result.tabs.find(t => t.id === "src") as GroupTab;
        expect(srcGroup.children.length).toBe(0);
    });

    it("updates active tracking when active child moves between groups", () => {
        const a = makeChannel("a", "c1");
        const src = makeGroup("src", "Source", [a]);
        const dst = makeGroup("dst", "Dest", [makeChannel("x", "cx")]);
        const state = makeState([src, dst], 0, 0); // active = a in src
        const result = moveToGroup(state, "a", "dst");
        const dstIdx = result.tabs.findIndex(t => t.id === "dst");
        const dstGroup = result.tabs[dstIdx] as GroupTab;
        const aChildIdx = dstGroup.children.findIndex(ch => ch.id === "a");
        expect(result.activeTabIndex).toBe(dstIdx);
        expect(result.activeChildIndex).toBe(aChildIdx);
    });
});

// ---------------------------------------------------------------------------
// pinGroup
// ---------------------------------------------------------------------------

describe("pinGroup", () => {
    it("pins an unpinned group", () => {
        const g = makeGroup("g1", "Work", [], false);
        const state = makeState([g], 0);
        const result = pinGroup(state, "g1");
        const group = result.tabs.find(t => t.id === "g1") as GroupTab;
        expect(group.pinned).toBe(true);
    });

    it("unpins a pinned group", () => {
        const g = makeGroup("g1", "Work", [], true);
        const other = makeChannel("a", "c1", false);
        const state = makeState([g, other], 0);
        const result = pinGroup(state, "g1");
        const group = result.tabs.find(t => t.id === "g1") as GroupTab;
        expect(group.pinned).toBe(false);
    });

    it("enforces pinned-first ordering after pinning", () => {
        const a = makeChannel("a", "c1", true); // pinned
        const g = makeGroup("g1", "Work", [], false); // unpinned — at index 1
        const b = makeChannel("b", "c2", false);
        const state = makeState([a, g, b], 0);
        const result = pinGroup(state, "g1");
        // All pinned tabs should precede unpinned tabs
        let seenUnpinned = false;
        for (const tab of result.tabs) {
            if ((tab as any).pinned) {
                expect(seenUnpinned).toBe(false); // pinned tabs must come first
            } else {
                seenUnpinned = true;
            }
        }
    });

    it("is a no-op for nonexistent group", () => {
        const a = makeChannel("a", "c1");
        const state = makeState([a], 0);
        const result = pinGroup(state, "nonexistent");
        expect(result.tabs.map(t => t.id)).toEqual(["a"]);
    });
});

// ---------------------------------------------------------------------------
// moveWithinGroup
// ---------------------------------------------------------------------------

describe("moveWithinGroup", () => {
    it("reorders children within a group", () => {
        const a = makeChannel("a", "c1");
        const b = makeChannel("b", "c2");
        const c = makeChannel("c", "c3");
        const g = makeGroup("g1", "Work", [a, b, c]);
        const state = makeState([g], 0, 0);
        const result = moveWithinGroup(state, "g1", 0, 2); // move a from 0 to 2
        const group = result.tabs[0] as GroupTab;
        expect(group.children.map(ch => ch.id)).toEqual(["b", "c", "a"]);
    });

    it("updates activeChildIndex when active child is moved", () => {
        const a = makeChannel("a", "c1");
        const b = makeChannel("b", "c2");
        const c = makeChannel("c", "c3");
        const g = makeGroup("g1", "Work", [a, b, c]);
        const state = makeState([g], 0, 0); // active = a at child 0
        const result = moveWithinGroup(state, "g1", 0, 2);
        // a is now at child index 2
        expect(result.activeChildIndex).toBe(2);
    });

    it("updates activeChildIndex when another child moves past active", () => {
        const a = makeChannel("a", "c1");
        const b = makeChannel("b", "c2");
        const c = makeChannel("c", "c3");
        const g = makeGroup("g1", "Work", [a, b, c]);
        const state = makeState([g], 0, 2); // active = c at child 2
        const result = moveWithinGroup(state, "g1", 0, 2); // move a to end
        // After move: [b, c, a]. c was at index 2, a moved to 2, so c should be at 1
        const group = result.tabs[0] as GroupTab;
        const cIdx = group.children.findIndex(ch => ch.id === "c");
        expect(result.activeChildIndex).toBe(cIdx);
    });

    it("is a no-op for out-of-range indices", () => {
        const a = makeChannel("a", "c1");
        const g = makeGroup("g1", "Work", [a]);
        const state = makeState([g], 0, 0);
        const result = moveWithinGroup(state, "g1", 0, 5);
        const group = result.tabs[0] as GroupTab;
        expect(group.children.map(ch => ch.id)).toEqual(["a"]);
    });

    it("is a no-op for same from/to", () => {
        const a = makeChannel("a", "c1");
        const b = makeChannel("b", "c2");
        const g = makeGroup("g1", "Work", [a, b]);
        const state = makeState([g], 0, 0);
        const result = moveWithinGroup(state, "g1", 1, 1);
        const group = result.tabs[0] as GroupTab;
        expect(group.children.map(ch => ch.id)).toEqual(["a", "b"]);
    });
});

// ---------------------------------------------------------------------------
// pinChildInGroup
// ---------------------------------------------------------------------------

describe("pinChildInGroup", () => {
    it("pins an unpinned child", () => {
        const a = makeChannel("a", "c1", false);
        const g = makeGroup("g1", "Work", [a]);
        const state = makeState([g], 0, 0);
        const result = pinChildInGroup(state, "g1", "a");
        const group = result.tabs[0] as GroupTab;
        expect(group.children[0].pinned).toBe(true);
    });

    it("unpins a pinned child", () => {
        const a = makeChannel("a", "c1", true);
        const b = makeChannel("b", "c2", false);
        const g = makeGroup("g1", "Work", [a, b]);
        const state = makeState([g], 0, 0);
        const result = pinChildInGroup(state, "g1", "a");
        const group = result.tabs[0] as GroupTab;
        const child = group.children.find(ch => ch.id === "a")!;
        expect(child.pinned).toBe(false);
    });

    it("enforces pinned-first ordering within group", () => {
        const a = makeChannel("a", "c1", false);
        const b = makeChannel("b", "c2", true);
        const c = makeChannel("c", "c3", false);
        const g = makeGroup("g1", "Work", [b, a, c]);
        const state = makeState([g], 0, 1); // active = a (index 1)
        const result = pinChildInGroup(state, "g1", "c"); // pin c
        const group = result.tabs[0] as GroupTab;
        // Pinned children (b, c) should precede unpinned (a)
        let seenUnpinned = false;
        for (const child of group.children) {
            if (child.pinned) {
                expect(seenUnpinned).toBe(false);
            } else {
                seenUnpinned = true;
            }
        }
    });

    it("updates activeChildIndex after reorder", () => {
        const a = makeChannel("a", "c1", false);
        const b = makeChannel("b", "c2", false);
        const g = makeGroup("g1", "Work", [a, b]);
        const state = makeState([g], 0, 0); // active = a (index 0)
        const result = pinChildInGroup(state, "g1", "b"); // pin b — b moves to index 0
        const group = result.tabs[0] as GroupTab;
        const aIdx = group.children.findIndex(ch => ch.id === "a");
        expect(result.activeChildIndex).toBe(aIdx);
    });

    it("is a no-op for nonexistent group", () => {
        const a = makeChannel("a", "c1");
        const state = makeState([a], 0);
        const result = pinChildInGroup(state, "nonexistent", "a");
        expect(result.tabs.map(t => t.id)).toEqual(["a"]);
    });
});

// ---------------------------------------------------------------------------
// Invariant tests
// ---------------------------------------------------------------------------

describe("invariants", () => {
    it("no orphan children after createGroup + removeFromGroup cycle", () => {
        const a = makeChannel("a", "c1");
        const b = makeChannel("b", "c2");
        const state = makeState([a, b], 0);
        const s1 = createGroup(state, [0, 1], "g1", "G");
        const s2 = removeFromGroup(s1, "a");
        // a is at top level, b is still in group or also at top level
        const allIds = s2.tabs.flatMap(t =>
            t.type === "group" ? t.children.map(ch => ch.id) : [t.id]
        );
        expect(allIds).toContain("a");
        expect(allIds).toContain("b");
    });

    it("pinned ordering invariant: pinned always precede unpinned at top level", () => {
        const a = makeChannel("a", "c1", false);
        const b = makeChannel("b", "c2", false);
        const g = makeGroup("g1", "Work", [], false);
        const state = makeState([a, g, b], 0);
        const result = pinGroup(state, "g1");
        let seenUnpinned = false;
        for (const tab of result.tabs) {
            const pinned = (tab as any).pinned as boolean;
            if (pinned) {
                expect(seenUnpinned).toBe(false);
            } else {
                seenUnpinned = true;
            }
        }
    });

    it("activeChildIndex is null for non-group active tabs", () => {
        const a = makeChannel("a", "c1");
        const g = makeGroup("g1", "Work", [makeChannel("x", "cx")]);
        const state = makeState([g, a], 0, 0); // active = g child 0
        const result = dissolveGroup(state, "g1");
        // After dissolve, active is a leaf tab — activeChildIndex must be null
        expect(result.activeChildIndex).toBeNull();
    });

    it("activeTabIndex stays in bounds after closeGroup", () => {
        const g1 = makeGroup("g1", "Work", [makeChannel("a", "c1")]);
        const g2 = makeGroup("g2", "Home", [makeChannel("b", "c2")]);
        const state = makeState([g1, g2], 1, 0); // active = g2
        const result = closeGroup(state, "g2");
        expect(result.activeTabIndex).toBeGreaterThanOrEqual(0);
        expect(result.activeTabIndex).toBeLessThan(result.tabs.length);
    });
});
