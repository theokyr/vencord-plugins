# vencord-plugins

Custom [Vencord](https://vencord.dev/) userplugins by [kamaras](https://github.com/theokyr).

## Plugins

| Plugin | Description |
|--------|-------------|
| **channelTabs** | Quick-access tab bar for channels and DMs |
| **settingsHub** | Unified settings page for custom plugins |
| **bsNoMore** | Remove upsell clutter — DM nav, clan tags, quest popups, store UI |
| **hotkeyNav** | Keyboard-driven navigation with inline keycap hints |
| **minimalCallBar** | Compact 32px call overlay replacement |
| **discordMcp** | MCP bridge — expose Discord internals to AI agents |
| **messageHeaderAvatar** | Display avatars inline in message headers |
| **venpmGui** | Manage plugins from inside Discord — browse, install, update |

## Install with venpm

[venpm](https://venpm.dev) is a package manager for Vencord userplugins.

```bash
# Install venpm
npm install -g @kamaras/venpm

# Add this plugin repo
venpm repo add https://github.com/theokyr/vencord-plugins/releases/latest/download/plugins.json

# Install plugins
venpm install channelTabs
venpm install settingsHub hotkeyNav minimalCallBar

# Rebuild Vencord and restart Discord
venpm rebuild
```

See the [venpm docs](https://venpm.dev/guide/getting-started) for full setup instructions.

## Manual Install

For users who already have Vencord set up with userplugins:

```bash
# Clone this repo somewhere convenient
git clone https://github.com/theokyr/vencord-plugins.git
cd vencord-plugins

# Symlink the plugins you want into your Vencord userplugins directory
ln -s "$(pwd)/plugins/channelTabs" ~/src/Vencord/src/userplugins/channelTabs
ln -s "$(pwd)/plugins/settingsHub" ~/src/Vencord/src/userplugins/settingsHub

# Rebuild Vencord
cd ~/src/Vencord && pnpm build
```

Replace `~/src/Vencord` with your actual Vencord source path.

### New to Vencord userplugins?

1. Clone [Vencord](https://github.com/Vendicated/Vencord): `git clone https://github.com/Vendicated/Vencord.git`
2. Install dependencies: `cd Vencord && pnpm install`
3. Inject into Discord: `pnpm inject` (follow the prompts)
4. Create the userplugins directory: `mkdir -p src/userplugins`
5. Then follow the manual install steps above to symlink plugins
6. Build: `pnpm build`
7. Restart Discord

## For Developers

```
plugins/
  channelTabs/       # Each folder is one plugin
    index.tsx        # Plugin entry point (definePlugin)
    style.css        # Optional styles
  _animationKit/     # Build-time utility (not a standalone plugin)
proxy/               # MCP proxy server for discordMcp
tests/               # Vitest test suite
plugins.json         # venpm plugin index
```

Full documentation: [venpm.dev](https://venpm.dev)

## License

MIT
