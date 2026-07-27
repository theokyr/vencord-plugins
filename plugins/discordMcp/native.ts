/*
 * Vencord userplugin — DiscordMCP native module
 * Runs in Electron main process (Node.js). Provides build+deploy for userplugins.
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { spawn } from "child_process";
import { dirname, join } from "path";
import { existsSync, lstatSync, mkdirSync, openSync, readdirSync, realpathSync } from "fs";

const HOME = process.env.HOME || "/home/user";
const VENCORD_DIR = join(HOME, "src/extern/Vencord");
const USERPLUGINS_DIR = join(VENCORD_DIR, "src/userplugins");

/**
 * Last-resort repo locations, tried in order when nothing under `src/userplugins`
 * links back to a checkout. Required on macOS: link.sh runs in copy mode there
 * (esbuild resolves directory symlinks to their real path, which moves them
 * outside `src/` and breaks Vencord's tsconfig aliases), so the installed
 * plugins are plain directory copies with no path back to their source.
 */
const DEFAULT_REPO_CANDIDATES = [
    process.env.VENCORD_PLUGINS_REPO,
    join(HOME, "src/vencord-plugins"),
].filter((p): p is string => Boolean(p));

/** A candidate repo root is only real if it owns the link.sh we intend to run. */
function hasLinkSh(repoRoot: string): boolean {
    return existsSync(join(repoRoot, "link.sh"));
}

/** Guard for the fallback probe: a bare link.sh could be any repo's. */
function looksLikePluginRepo(repoRoot: string): boolean {
    if (!hasLinkSh(repoRoot)) return false;
    try {
        return lstatSync(join(repoRoot, "plugins")).isDirectory();
    } catch {
        return false;
    }
}

/**
 * Find the vencord-plugins checkout backing `src/userplugins`.
 *
 * Three layouts are supported:
 *
 *   whole-dir   src/userplugins        -> <repo>/plugins        (legacy)
 *   per-plugin  src/userplugins/<name> -> <repo>/plugins/<name> (Linux, venpm --local)
 *   copy        src/userplugins/<name> is a plain copy          (macOS)
 *
 * The first two read the repo location straight off the filesystem and are
 * authoritative, so they are tried first. Copy mode leaves no backlink at all,
 * so it falls back to probing `candidates` for a checkout that looks like the
 * plugin repo. Returns null when every strategy comes up empty.
 */
export function resolveRepoRoot(
    userpluginsDir: string,
    candidates: string[] = DEFAULT_REPO_CANDIDATES,
): string | null {
    const fromLinks = resolveFromSymlinks(userpluginsDir);
    if (fromLinks) return fromLinks;

    for (const candidate of candidates) {
        if (looksLikePluginRepo(candidate)) return candidate;
    }

    return null;
}

/** Repo root read from an actual symlink under `src/userplugins`, or null. */
function resolveFromSymlinks(userpluginsDir: string): string | null {
    let stat: ReturnType<typeof lstatSync>;
    try {
        stat = lstatSync(userpluginsDir);
    } catch {
        return null;
    }

    // Whole-dir layout — realpathSync, not readlinkSync, since a symlink may
    // store a relative target that dirname() would resolve against the cwd.
    if (stat.isSymbolicLink()) {
        const repoRoot = dirname(realpathSync(userpluginsDir));
        return hasLinkSh(repoRoot) ? repoRoot : null;
    }

    if (!stat.isDirectory()) return null;

    // Per-plugin layout — <repo>/plugins/<name>, so the root is two levels up.
    let entries: string[];
    try {
        entries = readdirSync(userpluginsDir);
    } catch {
        return null;
    }

    for (const entry of entries) {
        const path = join(userpluginsDir, entry);
        try {
            if (!lstatSync(path).isSymbolicLink()) continue;
            const repoRoot = dirname(dirname(realpathSync(path)));
            if (hasLinkSh(repoRoot)) return repoRoot;
        } catch {
            // Broken link or a plugin outside any repo — keep looking.
        }
    }

    return null;
}

export async function rebuildPlugins(_event: unknown) {
    const repoRoot = resolveRepoRoot(USERPLUGINS_DIR);
    if (!repoRoot) {
        return {
            success: false,
            error: `Could not find a local plugin repo with link.sh under ${USERPLUGINS_DIR}. `
                + "Install at least one plugin with `venpm install <name> --local <path>`, or run link.sh manually.",
        };
    }

    const linkSh = join(repoRoot, "link.sh");

    // Spawn detached — link.sh kills Discord, builds, deploys, and relaunches.
    // 1s delay so the tool result can propagate back through WS -> proxy -> MCP.
    // Augment PATH: Electron's env is minimal and may lack user-installed tools (pnpm).
    const env = { ...process.env };
    const npmBin = join(HOME, ".npm/bin");
    if (!env.PATH?.includes(npmBin)) {
        env.PATH = `${npmBin}:${env.PATH || ""}`;
    }

    // Discord is about to be killed, so nothing here can observe the outcome —
    // the launch log is the only record if the relaunch fails. The proxy verifies
    // the redeploy end-to-end by waiting for the plugin to reconnect.
    const logFile = join(logDir(), "discord-mcp-rebuild.log");
    let stdio: "ignore" | ["ignore", number, number] = "ignore";
    try {
        mkdirSync(dirname(logFile), { recursive: true });
        const fd = openSync(logFile, "w");
        stdio = ["ignore", fd, fd];
    } catch {
        // Logging is best-effort — never block a rebuild on it.
    }

    const child = spawn("bash", ["-c", `sleep 1 && bash "${linkSh}"`], {
        detached: true,
        stdio,
        cwd: repoRoot,
        env,
    });
    child.unref();

    return {
        success: true,
        message: "Rebuild launched. Discord will close, rebuild, and reopen.",
        logFile,
    };
}

/** XDG state dir on Linux, ~/Library/Logs on macOS. */
function logDir(): string {
    if (process.platform === "darwin") return join(HOME, "Library", "Logs", "venpm");
    if (process.platform === "win32") {
        return join(process.env.LOCALAPPDATA || join(HOME, "AppData", "Local"), "venpm");
    }
    return join(process.env.XDG_STATE_HOME || join(HOME, ".local", "state"), "venpm");
}
