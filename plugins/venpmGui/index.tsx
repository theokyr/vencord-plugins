import "./style.css";
import definePlugin from "@utils/types";
import { showToast, Toasts } from "@webpack/common";
import { settings } from "./settings";
import { venpmGuiSchema } from "./settingsSchema";
import { Native } from "./nativeApi";

async function checkForUpdates() {
    if (!settings.store.checkUpdatesOnLaunch) return;
    if (!Native) return;

    const lockfile = await Native.readLockfile();
    if (!lockfile) return;

    const cache = await Native.readCachedIndexes();
    if (!cache) return;

    const installed = Object.entries(lockfile.installed ?? {});
    if (installed.length === 0) return;

    // Count updates by comparing installed versions to cached index versions
    let updateCount = 0;
    const cacheEntries = (cache as { entries?: Record<string, { body?: string }> }).entries ?? {};
    for (const entry of Object.values(cacheEntries)) {
        if (!entry.body) continue;
        try {
            const index = JSON.parse(entry.body);
            for (const [name, info] of installed) {
                const { version, method } = info as { version: string; method?: string };
                if (method === "local") continue; // local dev plugins don't get update badges
                const remote = index.plugins?.[name];
                if (remote && remote.version !== version) {
                    updateCount++;
                }
            }
        } catch {}
    }

    if (updateCount > 0 && settings.store.showUpdateToast) {
        showToast(
            `${updateCount} plugin update${updateCount > 1 ? "s" : ""} available`,
            Toasts.Type.MESSAGE
        );
    }
}

export default definePlugin({
    name: "VenpmGui",
    description: "Manage Vencord plugins from inside Discord — browse, install, update, and configure without the terminal",
    authors: [{ name: "kamaras", id: 132106519264100352n }],
    settings,
    settingsAboutComponent() {
        const { Button } = require("@webpack/common");
        return (
            <Button onClick={() => (window as any).__settingsHub?.open("VenpmGui")}>
                Open Full Settings
            </Button>
        );
    },

    async start() {
        // Register with settingsHub
        (window as any).__settingsHub?.register(venpmGuiSchema);

        // Check if venpm is installed
        if (!Native) return;
        const detection = await Native.detectVenpm();

        if (!detection.found && !settings.store.setupComplete) {
            showToast(
                "venpm needs setup to manage your plugins. Open VenpmGui settings to get started.",
                Toasts.Type.MESSAGE
            );
        }

        // Check for updates on launch
        if (settings.store.setupComplete && detection.found) {
            checkForUpdates();
        }
    },

    stop() {
        (window as any).__settingsHub?.unregister("VenpmGui");
    },
});
