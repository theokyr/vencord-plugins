#!/usr/bin/env bash
# Install all plugins from this repo into Vencord, rebuild Vencord, and restart
# Discord if it was running.
#
# By default, Linux uses per-plugin local symlinks via venpm. macOS copies
# plugins because esbuild resolves directory symlinks to their real path, which
# breaks Vencord's tsconfig path aliases during build.
set -euo pipefail

# Ensure pnpm and venpm are in PATH
[[ ":$PATH:" != *":$HOME/.npm/bin:"* ]] && export PATH="$HOME/.npm/bin:$PATH"

# mise-managed toolchains only activate in interactive shells, so a non-interactive
# invocation (e.g. `ssh host ./link.sh`) would otherwise fail with "venpm not found".
for mise_bin in "$HOME/.local/share/mise/shims" "$HOME/.local/share/mise/installs/node/lts/bin"; do
    if [ -d "$mise_bin" ] && [[ ":$PATH:" != *":$mise_bin:"* ]]; then
        export PATH="$mise_bin:$PATH"
    fi
done

VENCORD_DIR="${VENCORD_DIR:-$HOME/src/extern/Vencord}"
USERPLUGINS_DIR="$VENCORD_DIR/src/userplugins"
PLUGINS_DIR="$(cd "$(dirname "$0")/plugins" && pwd)"
LINK_MODE="${LINK_MODE:-auto}"

if [ "$LINK_MODE" = "auto" ] && [ "$(uname -s)" = "Darwin" ]; then
    LINK_MODE="copy"
elif [ "$LINK_MODE" = "auto" ]; then
    LINK_MODE="symlink"
fi

# Check venpm is available
if ! command -v venpm &>/dev/null; then
    echo "ERROR: venpm not found. Install it first:"
    echo "  cd ~/src/venpm && node scripts/setup.mjs"
    echo "  OR: npm install -g @kamaras/venpm"
    exit 1
fi

# If userplugins is an old-style whole-directory symlink, migrate it
if [ -L "$USERPLUGINS_DIR" ]; then
    echo "Migrating from whole-directory symlink to per-plugin symlinks..."
    rm "$USERPLUGINS_DIR"
    mkdir -p "$USERPLUGINS_DIR"
fi

# Ensure userplugins dir exists
mkdir -p "$USERPLUGINS_DIR"

# Match on process NAME, not the launcher path. Discord's self-updater re-execs
# from ~/.config/discord/Discord (Linux) or inside the .app bundle (macOS), so
# `pgrep -f /usr/bin/discord` matches nothing once Discord has updated itself —
# the rebuild then deploys without ever restarting, and Discord keeps running
# the old bundle. `pgrep -x Discord` works on both platforms and also catches
# the helper processes.
#
# Killing and relaunching is left to `venpm rebuild` below: it verifies the
# process actually came back instead of assuming a spawn succeeded, and it knows
# how to launch under Wayland/X11/macOS. Only whether to restart is decided here.
discord_was_running=false
if pgrep -x Discord >/dev/null 2>&1; then
    discord_was_running=true
fi

# Install each plugin via venpm --local (per-plugin symlinks)
echo "Installing plugins via venpm..."
for plugin_dir in "$PLUGINS_DIR"/*/; do
    plugin_name="$(basename "$plugin_dir")"

    dest="$USERPLUGINS_DIR/$plugin_name"

    # macOS/esbuild resolves directory symlinks to their real path, which moves
    # userplugins outside Vencord and breaks Vencord's tsconfig path aliases.
    if [ "$LINK_MODE" = "copy" ]; then
        [ -e "$dest" ] && rm -rf "$dest"
        cp -R "${plugin_dir%/}" "$dest"
        echo "  $plugin_name: copied"
        continue
    fi

    # If already correctly symlinked, skip
    if [ -L "$dest" ] && [ "$(readlink "$dest")" = "$plugin_dir" -o "$(readlink "$dest")" = "${plugin_dir%/}" ]; then
        echo "  $plugin_name: already linked"
        continue
    fi

    # Remove stale link or directory
    if [ -e "$dest" ] || [ -L "$dest" ]; then
        rm -rf "$dest"
    fi

    venpm install "$plugin_name" --local "$plugin_dir" --no-build --yes 2>/dev/null || {
        # Fallback: direct symlink if venpm fails (e.g., no config yet)
        ln -s "${plugin_dir%/}" "$dest"
        echo "  $plugin_name: linked (direct)"
        continue
    }
    echo "  $plugin_name: installed via venpm"
done

# Build, deploy, and (if Discord was up) restart — all through venpm, which
# verifies the restart instead of assuming it. A failed restart exits non-zero.
if [ "$discord_was_running" = true ]; then
    echo "Building, deploying, and restarting Discord..."
    venpm rebuild --restart --yes
else
    echo "Building and deploying (Discord was not running)..."
    venpm rebuild --no-restart --yes
fi

echo "Done."
