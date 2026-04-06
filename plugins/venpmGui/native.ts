// Runs in Electron main process — has access to Node.js APIs

import { execFile, spawn } from "child_process";
import { readFile, access } from "fs/promises";
import { join } from "path";
import { homedir, platform } from "os";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// ─── Platform Paths ──────────────────────────────────────────────────────────

function getConfigDir(): string {
    const plat = platform();
    if (plat === "win32") {
        return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "venpm");
    }
    if (plat === "darwin") {
        return join(homedir(), "Library", "Application Support", "venpm");
    }
    const xdg = process.env.XDG_CONFIG_HOME;
    return join(xdg ?? join(homedir(), ".config"), "venpm");
}

export async function getVenpmPaths(_event: unknown) {
    const configDir = getConfigDir();
    return {
        configDir,
        configPath: join(configDir, "config.json"),
        lockfilePath: join(configDir, "venpm-lock.json"),
        cachePath: join(configDir, "index-cache.json"),
    };
}

// ─── Environment Detection ───────────────────────────────────────────────────

export async function detectVenpm(_event: unknown) {
    try {
        const { stdout } = await execFileAsync("venpm", ["--version"]);
        return { found: true, version: stdout.trim() };
    } catch {
        // Try npx path
        try {
            const { stdout } = await execFileAsync("npx", ["venpm", "--version"]);
            return { found: true, version: stdout.trim(), path: "npx" };
        } catch {
            return { found: false };
        }
    }
}

export async function detectEnvironment(_event: unknown) {
    const results = {
        node: process.versions.node,
        npm: false,
        git: false,
        pnpm: false,
        vencordPath: null as string | null,
        discordBinary: null as string | null,
    };

    // npm
    try {
        await execFileAsync("npm", ["--version"]);
        results.npm = true;
    } catch {}

    // git
    try {
        await execFileAsync("git", ["--version"]);
        results.git = true;
    } catch {}

    // pnpm
    try {
        await execFileAsync("pnpm", ["--version"]);
        results.pnpm = true;
    } catch {}

    // Vencord path — check venpm config first, then probe common locations
    try {
        const paths = await getVenpmPaths(null);
        const raw = await readFile(paths.configPath, "utf-8");
        const config = JSON.parse(raw);
        if (config.vencord?.path) {
            results.vencordPath = config.vencord.path;
        }
        if (config.discord?.binary) {
            results.discordBinary = config.discord.binary;
        }
    } catch {}

    // Auto-detect Vencord path if not in config
    if (!results.vencordPath) {
        const candidates = [
            join(homedir(), "src", "extern", "Vencord"),
            join(homedir(), "Vencord"),
            join(homedir(), "src", "Vencord"),
        ];
        for (const p of candidates) {
            try {
                await access(join(p, "package.json"));
                results.vencordPath = p;
                break;
            } catch {}
        }
    }

    // Auto-detect Discord binary if not in config
    if (!results.discordBinary) {
        const plat = platform();
        const discordPaths = plat === "linux" ? [
            "/usr/bin/discord",
            "/usr/bin/Discord",
            join(homedir(), ".local", "bin", "discord"),
            "/opt/discord/Discord",
        ] : plat === "darwin" ? [
            "/Applications/Discord.app/Contents/MacOS/Discord",
        ] : plat === "win32" ? [
            join(process.env.LOCALAPPDATA ?? "", "Discord", "Update.exe"),
        ] : [];
        for (const p of discordPaths) {
            try {
                await access(p);
                results.discordBinary = p;
                break;
            } catch {}
        }
    }

    return results;
}

// ─── venpm Installation ──────────────────────────────────────────────────────

export async function installVenpm(_event: unknown) {
    try {
        await execFileAsync("npm", ["install", "-g", "venpm"], { timeout: 120000 });
        return { success: true };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
}

// ─── Direct File Reads ───────────────────────────────────────────────────────

async function readJsonFile(path: string): Promise<unknown | null> {
    try {
        await access(path);
        const raw = await readFile(path, "utf-8");
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export async function readConfig(_event: unknown) {
    const paths = await getVenpmPaths(null);
    return readJsonFile(paths.configPath);
}

export async function readLockfile(_event: unknown) {
    const paths = await getVenpmPaths(null);
    return readJsonFile(paths.lockfilePath);
}

export async function readCachedIndexes(_event: unknown) {
    const paths = await getVenpmPaths(null);
    return readJsonFile(paths.cachePath);
}

// ─── CLI Operations ──────────────────────────────────────────────────────────

export async function runVenpm(_event: unknown, args: string[]) {
    try {
        const { stdout, stderr } = await execFileAsync("venpm", [...args, "--json", "--yes"], {
            timeout: 300000, // 5 min for large installs
        });
        try {
            return JSON.parse(stdout);
        } catch {
            return { success: false, error: stderr || stdout || "Unknown error" };
        }
    } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        // venpm may write JSON to stdout even on non-zero exit
        if (e.stdout) {
            try { return JSON.parse(e.stdout); } catch {}
        }
        return { success: false, error: e.stderr || e.message || "venpm command failed" };
    }
}
