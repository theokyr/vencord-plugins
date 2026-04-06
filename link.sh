#!/usr/bin/env bash
# Install all plugins from this repo into Vencord via venpm (per-plugin local symlinks),
# rebuild Vencord, and restart Discord if it was running.
#
# For development: each plugin is symlinked individually, so other userplugins
# (installed via venpm from remote repos) coexist without conflict.
set -euo pipefail

# Ensure pnpm and venpm are in PATH
[[ ":$PATH:" != *":$HOME/.npm/bin:"* ]] && export PATH="$HOME/.npm/bin:$PATH"

VENCORD_DIR="${VENCORD_DIR:-$HOME/src/extern/Vencord}"
USERPLUGINS_DIR="$VENCORD_DIR/src/userplugins"
PLUGINS_DIR="$(cd "$(dirname "$0")/plugins" && pwd)"

# Check venpm is available
if ! command -v venpm &>/dev/null; then
    echo "ERROR: venpm not found. Install it first:"
    echo "  cd ~/src/venpm && node scripts/setup.mjs"
    echo "  OR: npm install -g venpm"
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

discord_was_running=false
if pgrep -f '/usr/bin/discord' >/dev/null 2>&1; then
    discord_was_running=true
    echo "Closing Discord..."
    pkill -f '/usr/bin/discord'
    while pgrep -f '/usr/bin/discord' >/dev/null 2>&1; do sleep 0.2; done
fi

# Install each plugin via venpm --local (per-plugin symlinks)
echo "Installing plugins via venpm..."
for plugin_dir in "$PLUGINS_DIR"/*/; do
    plugin_name="$(basename "$plugin_dir")"

    # Skip _animationKit — it's a build-time utility, not a standalone plugin
    [[ "$plugin_name" == _* ]] && continue

    dest="$USERPLUGINS_DIR/$plugin_name"

    # If already correctly symlinked, skip
    if [ -L "$dest" ] && [ "$(readlink "$dest")" = "$plugin_dir" -o "$(readlink "$dest")" = "${plugin_dir%/}" ]; then
        echo "  $plugin_name: already linked"
        continue
    fi

    # Remove stale link or directory
    [ -e "$dest" ] && rm -rf "$dest"

    venpm install "$plugin_name" --local "$plugin_dir" --no-build --yes 2>/dev/null || {
        # Fallback: direct symlink if venpm fails (e.g., no config yet)
        ln -s "${plugin_dir%/}" "$dest"
        echo "  $plugin_name: linked (direct)"
        continue
    }
    echo "  $plugin_name: installed via venpm"
done

# _animationKit needs to be in userplugins for the build (imported by other plugins)
anim_src="$PLUGINS_DIR/_animationKit"
anim_dest="$USERPLUGINS_DIR/_animationKit"
if [ -d "$anim_src" ]; then
    if [ -L "$anim_dest" ] && [ "$(readlink "$anim_dest")" = "$anim_src" ]; then
        echo "  _animationKit: already linked"
    else
        [ -e "$anim_dest" ] && rm -rf "$anim_dest"
        ln -s "$anim_src" "$anim_dest"
        echo "  _animationKit: linked (build utility)"
    fi
fi

echo "Building Vencord..."
(cd "$VENCORD_DIR" && pnpm build)

# Copy build output to deployed Vencord location
DEPLOYED_DIR="$HOME/.config/Vencord/dist"
if [ -d "$DEPLOYED_DIR" ]; then
    echo "Deploying to $DEPLOYED_DIR..."
    cp "$VENCORD_DIR/dist/renderer.js" "$DEPLOYED_DIR/renderer.js"
    cp "$VENCORD_DIR/dist/renderer.css" "$DEPLOYED_DIR/renderer.css"
    cp "$VENCORD_DIR/dist/renderer.js.map" "$DEPLOYED_DIR/renderer.js.map"
    cp "$VENCORD_DIR/dist/renderer.css.map" "$DEPLOYED_DIR/renderer.css.map"
    cp "$VENCORD_DIR/dist/patcher.js" "$DEPLOYED_DIR/patcher.js"
    cp "$VENCORD_DIR/dist/patcher.js.map" "$DEPLOYED_DIR/patcher.js.map"
fi

if [ "$discord_was_running" = true ]; then
    echo "Reopening Discord..."
    nohup /usr/bin/discord --enable-blink-features=MiddleClickAutoscroll >/dev/null 2>&1 &
    disown
fi

echo "Done."
