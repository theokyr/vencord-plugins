/*
 * Vencord userplugin — settingsHub
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DefinedSettings } from "@api/Settings";
import { useEffect, useRef, useState } from "@webpack/common";

const subscriberMap = new WeakMap<Record<string, any>, Set<() => void>>();

export function useSettingsReactive(settings: DefinedSettings): number {
    const [tick, setTick] = useState(0);
    useEffect(() => {
        if (!settings?.def) return;
        const def = settings.def as Record<string, any>;
        const bump = () => setTick(n => n + 1);
        let subs = subscriberMap.get(def);
        if (!subs) {
            subs = new Set<() => void>();
            subscriberMap.set(def, subs);
            const WRAPPED = Symbol.for("settingsHub-wrapped");
            for (const [key, opt] of Object.entries(def)) {
                if (!opt || opt.type === 6 || opt.type === 7) continue;
                if (!(opt as any)[WRAPPED]) {
                    const original = opt.onChange;
                    opt.onChange = (val: any) => {
                        original?.(val);
                        subs!.forEach(fn => fn());
                    };
                    (opt as any)[WRAPPED] = true;
                }
            }
        }
        subs.add(bump);
        return () => { subs!.delete(bump); };
    }, [settings]);
    return tick;
}

export function useScrollSpy(containerRef: React.RefObject<HTMLElement | null>): string | null {
    const [activeId, setActiveId] = useState<string | null>(null);
    const observerRef = useRef<IntersectionObserver | null>(null);
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const visible = new Map<string, IntersectionObserverEntry>();
        observerRef.current = new IntersectionObserver(
            entries => {
                for (const entry of entries) {
                    const id = (entry.target as HTMLElement).dataset.settingsAnchor;
                    if (!id) continue;
                    if (entry.isIntersecting) visible.set(id, entry);
                    else visible.delete(id);
                }
                let best: string | null = null;
                let bestTop = Infinity;
                for (const [id, entry] of visible) {
                    if (entry.boundingClientRect.top < bestTop) {
                        bestTop = entry.boundingClientRect.top;
                        best = id;
                    }
                }
                if (best) setActiveId(best);
            },
            { root: container, rootMargin: "-10% 0px -80% 0px", threshold: 0 }
        );
        const anchors = container.querySelectorAll("[data-settings-anchor]");
        anchors.forEach(el => observerRef.current!.observe(el));
        const mutationObs = new MutationObserver(() => {
            observerRef.current?.disconnect();
            const newAnchors = container.querySelectorAll("[data-settings-anchor]");
            newAnchors.forEach(el => observerRef.current!.observe(el));
        });
        mutationObs.observe(container, { childList: true, subtree: true });
        return () => {
            observerRef.current?.disconnect();
            mutationObs.disconnect();
        };
    }, [containerRef]);
    return activeId;
}

export function useThemeDetect(): boolean {
    const [themed, setThemed] = useState(false);
    useEffect(() => {
        function check() {
            const appMount = document.getElementById("app-mount");
            if (!appMount) return;
            const bg = appMount.querySelector('[class*="bg_"]');
            setThemed(!!bg);
        }
        check();
        const observer = new MutationObserver(check);
        const appMount = document.getElementById("app-mount");
        if (appMount) {
            observer.observe(appMount, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
        }
        return () => observer.disconnect();
    }, []);
    return themed;
}
