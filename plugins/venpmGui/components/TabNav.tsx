import type { TabId } from "../types";

const TABS: { id: TabId; label: string }[] = [
    { id: "installed", label: "Installed" },
    { id: "browse", label: "Browse" },
    { id: "advanced", label: "Advanced" },
];

export function TabNav({ activeTab, onTabChange }: { activeTab: TabId; onTabChange: (tab: TabId) => void }) {
    return (
        <div className="vc-venpmGui-tabs">
            {TABS.map(tab => (
                <div
                    key={tab.id}
                    className={`vc-venpmGui-tab ${activeTab === tab.id ? "vc-venpmGui-tab-active" : ""}`}
                    onClick={() => onTabChange(tab.id)}
                >
                    {tab.label}
                </div>
            ))}
        </div>
    );
}
