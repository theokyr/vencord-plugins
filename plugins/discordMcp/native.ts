/*
 * Vencord userplugin — DiscordMCP native module
 * Runs in Electron main process (Node.js). Provides build+deploy for userplugins.
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { spawn } from "child_process";
import { dirname, join } from "path";
import { existsSync, lstatSync, readlinkSync } from "fs";

const HOME = process.env.HOME || "/home/user";
const VENCORD_DIR = join(HOME, "src/extern/Vencord");
const PLUGINS_SYMLINK = join(VENCORD_DIR, "src/userplugins");

export async function rebuildPlugins(_event: unknown) {
    // Resolve link.sh from the symlink target (plugins/ -> repo root)
    let repoRoot: string;
    try {
        if (!lstatSync(PLUGINS_SYMLINK).isSymbolicLink()) {
            return { success: false, error: `${PLUGINS_SYMLINK} is not a symlink. Run link.sh manually first.` };
        }
        const target = readlinkSync(PLUGINS_SYMLINK); // .../vencord-plugins/plugins
        repoRoot = dirname(target);
    } catch {
        return { success: false, error: `Symlink missing: ${PLUGINS_SYMLINK}. Run link.sh manually first.` };
    }

    const linkSh = join(repoRoot, "link.sh");
    if (!existsSync(linkSh)) {
        return { success: false, error: `link.sh not found at ${linkSh}` };
    }

    // Spawn detached — link.sh kills Discord, builds, deploys, and relaunches.
    // 1s delay so the tool result can propagate back through WS -> proxy -> MCP.
    // Augment PATH: Electron's env is minimal and may lack user-installed tools (pnpm).
    const env = { ...process.env };
    const npmBin = join(HOME, ".npm/bin");
    if (!env.PATH?.includes(npmBin)) {
        env.PATH = `${npmBin}:${env.PATH || ""}`;
    }

    const child = spawn("bash", ["-c", `sleep 1 && bash "${linkSh}"`], {
        detached: true,
        stdio: "ignore",
        cwd: repoRoot,
        env,
    });
    child.unref();

    return { success: true, message: "Rebuild launched. Discord will close, rebuild, and reopen." };
}
