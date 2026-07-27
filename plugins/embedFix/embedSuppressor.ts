/*
 * embedFix — Hiding Discord's own embeds.
 *
 * Suppression is deliberately dumb: it hides exactly the embeds the planner
 * named, matched by the links inside them, and it restores everything it
 * touched on teardown. There is no global sweep and no heuristic guessing —
 * both of those existed before and fought each other, which is how messages
 * ended up with no embed at all.
 */

import type { SuppressTarget } from "./incomingPlan";
import { resourcePathKey } from "./urlRewriter";

export const HIDDEN_ATTR = "data-embedfix-hidden";
export const OURS_ATTR = "data-embedfix";

/** Native embed articles inside a message-accessories container. */
export const NATIVE_EMBED_SELECTOR = 'article[class*="embed"]';

/** Host+path keys for the URLs a suppression pass should hide. */
export function suppressionKeys(targets: SuppressTarget[]): Set<string> {
    const keys = new Set<string>();
    for (const target of targets) {
        const key = resourcePathKey(target.url);
        if (key) keys.add(key);
    }
    return keys;
}

/**
 * Does an embed element belong to one of the suppression targets?
 * Matching is on the links the embed renders, so it survives Discord
 * reordering embeds between renders.
 */
export function hrefsMatchTargets(hrefs: string[], targetKeys: Set<string>): boolean {
    for (const href of hrefs) {
        const key = resourcePathKey(href);
        if (key && targetKeys.has(key)) return true;
    }
    return false;
}

function hrefsOf(element: Element): string[] {
    return Array.from(element.querySelectorAll<HTMLAnchorElement>("a[href]"), anchor => anchor.href);
}

function hide(element: HTMLElement): void {
    if (element.getAttribute(HIDDEN_ATTR) === "true") return;
    element.setAttribute(HIDDEN_ATTR, "true");
    element.dataset.embedfixPrevDisplay = element.style.display;
    element.style.display = "none";
}

function unhide(element: HTMLElement): void {
    if (element.getAttribute(HIDDEN_ATTR) !== "true") return;
    element.removeAttribute(HIDDEN_ATTR);
    element.style.display = element.dataset.embedfixPrevDisplay ?? "";
    delete element.dataset.embedfixPrevDisplay;
}

/**
 * Apply one suppression pass to a container.
 * Embeds we previously hid that are no longer targeted are restored, so a
 * failed refresh brings Discord's embed straight back.
 */
export function syncSuppression(container: ParentNode, targets: SuppressTarget[]): number {
    // Discord's own embeds, in render order, excluding anything we made.
    const natives = Array.from(container.querySelectorAll<HTMLElement>(NATIVE_EMBED_SELECTOR))
        .filter(element => !element.hasAttribute(OURS_ATTR) && !element.closest(`[${OURS_ATTR}]`));

    const doomed = new Set<HTMLElement>();
    const matched = new Set<number>();

    // Preferred: pair by the links the embed renders. Survives reordering.
    targets.forEach((target, index) => {
        const key = resourcePathKey(target.url);
        if (!key) return;

        const element = natives.find(candidate => hrefsMatchTargets(hrefsOf(candidate), new Set([key])));
        if (element) {
            doomed.add(element);
            matched.add(index);
        }
    });

    // Fallback: position. An embed does not always render a link to its own
    // post — an image-only tweet card links the author and the picture but
    // never the status URL — so href matching alone silently missed it and the
    // message ended up showing both embeds. The planner already paired this
    // target against `message.embeds`, and Discord renders those in order.
    targets.forEach((target, index) => {
        if (matched.has(index)) return;

        const element = natives[target.index];
        if (element) doomed.add(element);
    });

    for (const element of natives) {
        if (doomed.has(element)) hide(element);
        else unhide(element);
    }

    return doomed.size;
}

/** Restore every embed this module hid inside `root`. */
export function restoreAll(root: ParentNode = document): void {
    for (const element of Array.from(root.querySelectorAll<HTMLElement>(`[${HIDDEN_ATTR}="true"]`))) {
        unhide(element);
    }
}

/**
 * Keep a container in sync with its suppression targets while it is mounted.
 * Discord renders embeds asynchronously after the accessory mounts, so a
 * one-shot pass is not enough — but the observer is scoped to this one
 * message, not the whole document.
 */
export function watchSuppression(
    container: HTMLElement,
    getTargets: () => SuppressTarget[],
): () => void {
    let scheduled = false;
    const run = () => {
        scheduled = false;
        syncSuppression(container, getTargets());
    };
    const kick = () => {
        if (scheduled) return;
        scheduled = true;
        // Coalesce the burst of mutations Discord emits per render.
        queueMicrotask(run);
    };

    run();

    const observer = new MutationObserver(kick);
    observer.observe(container, { childList: true, subtree: true });
    const timers = [
        setTimeout(run, 200),
        setTimeout(run, 1000),
    ];

    return () => {
        observer.disconnect();
        for (const timer of timers) clearTimeout(timer);
        restoreAll(container);
    };
}
