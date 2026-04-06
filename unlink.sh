#!/usr/bin/env bash
# Uninstall all local-symlinked plugins via venpm,
# rebuild Vencord, and restart Discord if it was running.
set -euo pipefail

VENCORD_DIR="${VENCORD_DIR:-$HOME/src/extern/Vencord}"
USERPLUGINS_DIR="$VENCORD_DIR/src/userplugins"

discord_was_running=false
if pgrep -f '/usr/bin/discord' >/dev/null 2>&1; then
    discord_was_running=true
    echo "Closing Discord..."
    pkill -f '/usr/bin/discord'
    while pgrep -f '/usr/bin/discord' >/dev/null 2>&1; do sleep 0.2; done
fi

# Handle old-style whole-directory symlink
if [ -L "$USERPLUGINS_DIR" ]; then
    echo "Removing whole-directory symlink (legacy)..."
    rm "$USERPLUGINS_DIR"
    mkdir -p "$USERPLUGINS_DIR"
else
    # Remove per-plugin symlinks (the venpm way)
    if command -v venpm &>/dev/null; then
        echo "Uninstalling plugins via venpm..."
        installed=$(venpm list --json 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
for p in data.get('data', {}).get('plugins', []):
    if p.get('method') == 'local':
        print(p['name'])
" 2>/dev/null || true)

        for plugin in $installed; do
            venpm uninstall "$plugin" --no-build --yes 2>/dev/null && echo "  Uninstalled: $plugin" || true
        done
    else
        echo "venpm not found — removing symlinks manually..."
        for link in "$USERPLUGINS_DIR"/*/; do
            [ -L "${link%/}" ] && rm "${link%/}" && echo "  Removed: $(basename "${link%/}")"
        done
    fi
fi

echo "Building Vencord..."
(cd "$VENCORD_DIR" && pnpm build)

if [ "$discord_was_running" = true ]; then
    echo "Reopening Discord..."
    nohup /usr/bin/discord --enable-blink-features=MiddleClickAutoscroll >/dev/null 2>&1 &
    disown
fi

echo "Done."
