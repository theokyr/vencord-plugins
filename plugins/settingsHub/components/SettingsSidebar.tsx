/*
 * Vencord userplugin — settingsHub
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useCallback, useRef, useState } from "@webpack/common";
import type { SettingsSchema } from "../schema";
import type { SearchEntry } from "../search";
import { fuzzySearch } from "../search";
import { KEYBINDS_PLUGIN_ID } from "./GlobalKeybindsPage";

const SearchIcon = () => (
    <svg viewBox="0 0 24 24">
        <path d="M21.71 20.29L18 16.61A9 9 0 1 0 16.61 18l3.68 3.68a1 1 0 0 0 1.42-1.42ZM11 18a7 7 0 1 1 7-7 7 7 0 0 1-7 7Z" />
    </svg>
);

interface SettingsSidebarProps {
    schemas: readonly SettingsSchema[];
    searchIndex: SearchEntry[];
    activePlugin: string | null;
    activeAnchorId: string | null;
    onPluginSelect: (pluginName: string) => void;
    onScrollTo: (anchorId: string) => void;
    onSearchResultClick: (pluginName: string, anchorId: string) => void;
}

export function SettingsSidebar({
    schemas, searchIndex, activePlugin, activeAnchorId,
    onPluginSelect, onScrollTo, onSearchResultClick,
}: SettingsSidebarProps) {
    const [query, setQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const searchResults = query.trim() ? fuzzySearch(searchIndex, query) : null;

    const handleResultClick = useCallback((entry: SearchEntry) => {
        setQuery("");
        onSearchResultClick(entry.pluginName, entry.anchorId);
        requestAnimationFrame(() => {
            const el = document.getElementById(entry.anchorId);
            if (el) {
                el.classList.add("vc-settingsHub-highlight");
                setTimeout(() => el.classList.remove("vc-settingsHub-highlight"), 1500);
            }
        });
    }, [onSearchResultClick]);

    return (
        <nav className="vc-settingsHub-sidebar" role="navigation" aria-label="Plugin settings">
            <div className="vc-settingsHub-search" onClick={() => inputRef.current?.focus()}>
                <SearchIcon />
                <input
                    ref={inputRef}
                    placeholder="Search settings..."
                    value={query}
                    onChange={e => setQuery(e.currentTarget.value)}
                />
            </div>

            {searchResults ? (
                <>
                    {searchResults.slice(0, 20).map((entry, i) => (
                        <div
                            key={`${entry.pluginName}-${entry.settingKey}`}
                            className="vc-settingsHub-search-result"
                            style={{ animationDelay: `${i * 30}ms` }}
                            onClick={() => handleResultClick(entry)}
                        >
                            <span className="vc-settingsHub-search-result-label">{entry.label}</span>
                            <span className="vc-settingsHub-search-result-plugin">{entry.pluginName}</span>
                        </div>
                    ))}
                    {searchResults.length > 20 && (
                        <div className="vc-settingsHub-search-result-plugin" style={{ padding: "6px 10px" }}>
                            Showing 20 of {searchResults.length} results
                        </div>
                    )}
                </>
            ) : (
                <>
                    <div
                        className={`vc-settingsHub-nav-item ${activePlugin === KEYBINDS_PLUGIN_ID ? "vc-settingsHub-active" : ""}`}
                        onClick={() => onPluginSelect(KEYBINDS_PLUGIN_ID)}
                        tabIndex={0}
                        role="button"
                        aria-label="Keybinds"
                        onKeyDown={e => { if (e.code === "Enter" || e.code === "Space") onPluginSelect(KEYBINDS_PLUGIN_ID); }}
                    >
                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                            <path d="M20 5H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"/>
                        </svg>
                        Keybinds
                    </div>
                    <div className="vc-settingsHub-sidebar-divider" />
                    <div className="vc-settingsHub-cat-label">Plugins</div>
                    {schemas.map(schema => {
                        const isActive = schema.plugin === activePlugin;
                        return (
                            <div key={schema.plugin}>
                                <div
                                    className={`vc-settingsHub-nav-item ${isActive ? "vc-settingsHub-active" : ""}`}
                                    onClick={() => onPluginSelect(schema.plugin)}
                                    tabIndex={0}
                                    role="button"
                                    aria-label={`${schema.plugin} settings`}
                                    onKeyDown={e => { if (e.code === "Enter" || e.code === "Space") onPluginSelect(schema.plugin); }}
                                >
                                    <schema.icon />
                                    {schema.plugin}
                                </div>
                                {isActive && schema.sections.map(section => {
                                    const sectionAnchor = `settings-${schema.plugin}-${section.id}`;
                                    return (
                                        <div
                                            key={section.id}
                                            className={`vc-settingsHub-nav-sub ${activeAnchorId === sectionAnchor ? "vc-settingsHub-active" : ""}`}
                                            onClick={() => onScrollTo(sectionAnchor)}
                                            tabIndex={0}
                                            role="button"
                                            onKeyDown={e => { if (e.code === "Enter" || e.code === "Space") onScrollTo(sectionAnchor); }}
                                        >
                                            {section.label}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </>
            )}

            <div className="vc-settingsHub-sidebar-divider" />
            <div className="vc-settingsHub-sidebar-footer">Settings v2.0 &middot; kamaras</div>
        </nav>
    );
}
