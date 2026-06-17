/*
 * Vencord userplugin - EmbedFix
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { PlatformEntry, ProviderDef } from "../providerMap";
import { applyProviderOrder, resetAllProviderOrders, resetProviderOrder, setProviderOrder } from "../providerPriority";

interface ProviderPriorityEditorProps {
    platforms: PlatformEntry[];
    value: string;
    onChange: (value: string) => void;
}

interface DragState {
    platformId: string;
    domain: string;
}

function moveProvider(providers: ProviderDef[], fromIndex: number, toIndex: number): ProviderDef[] {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return providers;
    if (fromIndex >= providers.length || toIndex >= providers.length) return providers;

    const next = [...providers];
    const [provider] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, provider);
    return next;
}

function providerDomains(providers: ProviderDef[]): string[] {
    return providers.map(provider => provider.domain);
}

export function ProviderPriorityEditor({ platforms, value, onChange }: ProviderPriorityEditorProps) {
    const { React, Button } = require("@webpack/common");
    const [orderJson, setOrderJson] = React.useState(value ?? "");
    const [dragging, setDragging] = React.useState<DragState | null>(null);

    React.useEffect(() => setOrderJson(value ?? ""), [value]);

    const orderedPlatforms = applyProviderOrder(platforms, orderJson);

    const commit = (next: string) => {
        setOrderJson(next);
        onChange(next);
    };

    const commitPlatformOrder = (platformId: string, providers: ProviderDef[]) => {
        commit(setProviderOrder(orderJson, platformId, providerDomains(providers)));
    };

    const hasCustomOrder = !!orderJson.trim();

    return (
        <div className="vc-embedFix-priorityEditor">
            <div className="vc-embedFix-priorityHeader">
                <span>Provider priority controls outgoing rewrites and incoming replacement embeds.</span>
                <Button
                    size={Button.Sizes.SMALL}
                    look={Button.Looks.OUTLINED}
                    disabled={!hasCustomOrder}
                    onClick={() => commit(resetAllProviderOrders())}
                >
                    Reset All
                </Button>
            </div>

            {orderedPlatforms.map(platform => (
                <div className="vc-embedFix-priorityPlatform" key={platform.id}>
                    <div className="vc-embedFix-priorityPlatformHeader">
                        <span>{platform.label}</span>
                        <Button
                            size={Button.Sizes.SMALL}
                            look={Button.Looks.BLANK}
                            onClick={() => commit(resetProviderOrder(orderJson, platform.id))}
                        >
                            Reset
                        </Button>
                    </div>

                    <div className="vc-embedFix-priorityList">
                        {platform.providers.map((provider, index) => (
                            <div
                                key={provider.domain}
                                className={`vc-embedFix-priorityItem${dragging?.platformId === platform.id && dragging.domain === provider.domain ? " vc-embedFix-priorityItemDragging" : ""}`}
                                draggable
                                onDragStart={(event: any) => {
                                    event.dataTransfer.setData("text/plain", provider.domain);
                                    event.dataTransfer.effectAllowed = "move";
                                    setDragging({ platformId: platform.id, domain: provider.domain });
                                }}
                                onDragEnd={() => setDragging(null)}
                                onDragOver={(event: any) => {
                                    if (dragging?.platformId !== platform.id) return;
                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = "move";
                                }}
                                onDrop={(event: any) => {
                                    event.preventDefault();
                                    if (dragging?.platformId !== platform.id) return;

                                    const fromIndex = platform.providers.findIndex(item => item.domain === dragging.domain);
                                    const next = moveProvider(platform.providers, fromIndex, index);
                                    setDragging(null);
                                    commitPlatformOrder(platform.id, next);
                                }}
                            >
                                <span className="vc-embedFix-priorityHandle" aria-hidden="true">::</span>
                                <span className="vc-embedFix-priorityRank">{index + 1}</span>
                                <span className="vc-embedFix-priorityText">
                                    <span className="vc-embedFix-priorityLabel">{provider.label}</span>
                                    <span className="vc-embedFix-priorityDomain">{provider.domain}</span>
                                </span>
                                <span className="vc-embedFix-priorityActions">
                                    <button
                                        type="button"
                                        className="vc-embedFix-priorityMove"
                                        disabled={index === 0}
                                        aria-label={`Move ${provider.label} up`}
                                        onClick={() => commitPlatformOrder(platform.id, moveProvider(platform.providers, index, index - 1))}
                                    >
                                        ^
                                    </button>
                                    <button
                                        type="button"
                                        className="vc-embedFix-priorityMove"
                                        disabled={index === platform.providers.length - 1}
                                        aria-label={`Move ${provider.label} down`}
                                        onClick={() => commitPlatformOrder(platform.id, moveProvider(platform.providers, index, index + 1))}
                                    >
                                        v
                                    </button>
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
