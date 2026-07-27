import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, relative } from "path";
import { resolveRepoRoot } from "../../plugins/discordMcp/native";

let root: string;
let repo: string;
let userplugins: string;

beforeEach(() => {
    // realpath: macOS hands out /var/... temp dirs that are themselves symlinks
    // to /private/var, which the resolver would (correctly) normalise away.
    root = realpathSync(mkdtempSync(join(tmpdir(), "vc-resolve-")));
    repo = join(root, "vencord-plugins");
    userplugins = join(root, "Vencord", "src", "userplugins");
    mkdirSync(join(repo, "plugins"), { recursive: true });
    mkdirSync(join(root, "Vencord", "src"), { recursive: true });
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

function addLinkSh(at = repo) {
    writeFileSync(join(at, "link.sh"), "#!/bin/bash\n");
}

function addPlugin(name: string) {
    const dir = join(repo, "plugins", name);
    mkdirSync(dir, { recursive: true });
    return dir;
}

describe("discordMcp/resolveRepoRoot", () => {
    describe("per-plugin layout (venpm install --local)", () => {
        it("resolves the repo from a plugin symlink inside a real directory", () => {
            addLinkSh();
            mkdirSync(userplugins, { recursive: true });
            symlinkSync(addPlugin("channelTabs"), join(userplugins, "channelTabs"));

            expect(resolveRepoRoot(userplugins, [])).toBe(repo);
        });

        it("skips non-symlink entries and broken links", () => {
            addLinkSh();
            mkdirSync(userplugins, { recursive: true });
            mkdirSync(join(userplugins, "vendoredPlugin"));
            symlinkSync(join(root, "gone"), join(userplugins, "brokenLink"));
            symlinkSync(addPlugin("channelTabs"), join(userplugins, "channelTabs"));

            expect(resolveRepoRoot(userplugins, [])).toBe(repo);
        });

        it("prefers the repo that actually owns a link.sh", () => {
            // A plugin symlinked from a repo without link.sh must not win.
            const other = join(root, "other-plugins");
            mkdirSync(join(other, "plugins", "strayPlugin"), { recursive: true });
            addLinkSh();
            mkdirSync(userplugins, { recursive: true });
            symlinkSync(join(other, "plugins", "strayPlugin"), join(userplugins, "aStrayPlugin"));
            symlinkSync(addPlugin("channelTabs"), join(userplugins, "zChannelTabs"));

            expect(resolveRepoRoot(userplugins, [])).toBe(repo);
        });

        it("returns null when no symlinked plugin belongs to a repo with link.sh", () => {
            mkdirSync(userplugins, { recursive: true });
            symlinkSync(addPlugin("channelTabs"), join(userplugins, "channelTabs"));

            expect(resolveRepoRoot(userplugins, [])).toBeNull();
        });

        it("returns null for an empty userplugins directory", () => {
            addLinkSh();
            mkdirSync(userplugins, { recursive: true });

            expect(resolveRepoRoot(userplugins, [])).toBeNull();
        });
    });

    describe("whole-dir layout", () => {
        it("resolves the repo when userplugins is itself a symlink", () => {
            addLinkSh();
            symlinkSync(join(repo, "plugins"), userplugins);

            expect(resolveRepoRoot(userplugins, [])).toBe(repo);
        });

        it("resolves a relative symlink against the link, not the cwd", () => {
            addLinkSh();
            const target = relative(join(root, "Vencord", "src"), join(repo, "plugins"));
            symlinkSync(target, userplugins);

            expect(resolveRepoRoot(userplugins, [])).toBe(repo);
        });

        it("returns null when the symlink target has no link.sh", () => {
            symlinkSync(join(repo, "plugins"), userplugins);

            expect(resolveRepoRoot(userplugins, [])).toBeNull();
        });
    });

    describe("copy layout (macOS — link.sh LINK_MODE=copy)", () => {
        it("falls back to a candidate repo when plugins are plain copies", () => {
            // cp -R leaves no backlink whatsoever, so the fs walk finds nothing.
            addLinkSh();
            addPlugin("channelTabs");
            mkdirSync(join(userplugins, "channelTabs"), { recursive: true });
            writeFileSync(join(userplugins, "channelTabs", "index.tsx"), "");

            expect(resolveRepoRoot(userplugins, [repo])).toBe(repo);
        });

        it("prefers a real symlink over the candidate list", () => {
            // The fs is authoritative: a stale candidate must never win over it.
            const stale = join(root, "stale-repo");
            mkdirSync(join(stale, "plugins"), { recursive: true });
            addLinkSh(stale);
            addLinkSh();
            mkdirSync(userplugins, { recursive: true });
            symlinkSync(addPlugin("channelTabs"), join(userplugins, "channelTabs"));

            expect(resolveRepoRoot(userplugins, [stale])).toBe(repo);
        });

        it("rejects a candidate with link.sh but no plugins directory", () => {
            addLinkSh();
            mkdirSync(userplugins, { recursive: true });
            const notAPluginRepo = join(root, "some-other-repo");
            mkdirSync(notAPluginRepo);
            addLinkSh(notAPluginRepo);

            expect(resolveRepoRoot(userplugins, [notAPluginRepo])).toBeNull();
        });

        it("rejects a candidate that does not exist", () => {
            mkdirSync(userplugins, { recursive: true });
            expect(resolveRepoRoot(userplugins, [join(root, "nowhere")])).toBeNull();
        });

        it("tries candidates in order", () => {
            const first = join(root, "first-repo");
            mkdirSync(join(first, "plugins"), { recursive: true });
            addLinkSh(first);
            addLinkSh();
            mkdirSync(userplugins, { recursive: true });

            expect(resolveRepoRoot(userplugins, [first, repo])).toBe(first);
        });
    });

    it("returns null when the directory does not exist", () => {
        expect(resolveRepoRoot(join(root, "nope"), [])).toBeNull();
    });

    it("returns null when the path is a file", () => {
        const file = join(root, "afile");
        writeFileSync(file, "");
        expect(resolveRepoRoot(file, [])).toBeNull();
    });
});
