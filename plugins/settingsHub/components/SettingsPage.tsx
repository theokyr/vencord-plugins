/*
 * Vencord userplugin — settingsHub
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "@webpack/common";
import type { SettingsSchema } from "../schema";
import { buildSearchIndex } from "../search";
import { useScrollSpy, useThemeDetect } from "../hooks";
import { getSchemas, onSchemasChange } from "../registry";
import { SettingsSidebar } from "./SettingsSidebar";
import { SettingsContent } from "./SettingsContent";
import { GlobalKeybindsPage, KEYBINDS_PLUGIN_ID } from "./GlobalKeybindsPage";

const CloseIcon = () => (
    <svg viewBox="0 0 24 24">
        <path fill="currentColor" d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z" />
    </svg>
);

interface SettingsPageProps {
    initialPlugin?: string;
    onClose?: () => void;
}

export function SettingsPage({ initialPlugin, onClose }: SettingsPageProps) {
    // No enter animation in tabbed mode — page appears instantly

    const [schemas, setSchemas] = useState<readonly SettingsSchema[]>(getSchemas());
    const [activePlugin, setActivePlugin] = useState<string | null>(
        initialPlugin ?? getSchemas()[0]?.plugin ?? null
    );

    const contentRef = useRef<HTMLDivElement>(null);
    const activeAnchorId = useScrollSpy(contentRef);
    const isThemed = useThemeDetect();

    const activeSchema = useMemo(
        () => schemas.find(s => s.plugin === activePlugin) ?? null,
        [schemas, activePlugin]
    );

    const searchIndex = useMemo(() => buildSearchIndex(schemas), [schemas]);

    useEffect(() => onSchemasChange(() => setSchemas([...getSchemas()])), []);

    useEffect(() => {
        function onHashChange() {
            const hash = window.location.hash.slice(1);
            if (hash && schemas.find(s => s.plugin === hash)) {
                setActivePlugin(hash);
            }
        }
        window.addEventListener("hashchange", onHashChange);
        return () => window.removeEventListener("hashchange", onHashChange);
    }, [schemas]);

    const scrollTo = useCallback((anchorId: string) => {
        const el = document.getElementById(anchorId);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, []);

    const handlePluginSelect = useCallback((pluginName: string) => {
        setActivePlugin(pluginName);
        if (contentRef.current) contentRef.current.scrollTop = 0;
    }, []);

    const handleSearchResultClick = useCallback((pluginName: string, anchorId: string) => {
        setActivePlugin(pluginName);
        requestAnimationFrame(() => {
            const el = document.getElementById(anchorId);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }, []);

    return (
        <div className={`vc-settingsHub-page${isThemed ? " vc-settingsHub-themed" : ""}`}>
            <SettingsSidebar
                schemas={schemas}
                searchIndex={searchIndex}
                activePlugin={activePlugin}
                activeAnchorId={activeAnchorId}
                onPluginSelect={handlePluginSelect}
                onScrollTo={scrollTo}
                onSearchResultClick={handleSearchResultClick}
            />
            <div className="vc-settingsHub-content" ref={contentRef}>
                {onClose && (
                    <button className="vc-settingsHub-close-btn" onClick={onClose}>
                        <CloseIcon />
                    </button>
                )}
                {activePlugin === KEYBINDS_PLUGIN_ID ? (
                    <div className="vc-settingsHub-content-inner" key="__keybinds">
                        <GlobalKeybindsPage />
                    </div>
                ) : activeSchema ? (
                    <div className="vc-settingsHub-content-inner" key={activePlugin}>
                        <SettingsContent schema={activeSchema} />
                    </div>
                ) : (
                    <div className="vc-settingsHub-content-inner">
                        <p style={{ color: "var(--text-muted)", padding: 40 }}>
                            No plugins have registered settings.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
