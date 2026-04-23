<p align="center">
  <img src="https://venpm.dev/logo.svg" alt="venpm" width="80" />
</p>

<h1 align="center">vencord-plugins</h1>

<p align="center">
  <strong>Custom Vencord userplugins by <a href="https://github.com/theokyr">kamaras</a>.</strong><br/>
  UI enhancements, keyboard navigation, and developer tools for Discord.
</p>

<p align="center">
  <a href="https://venpm.dev/plugins/kamaras"><img src="https://img.shields.io/badge/showcase-venpm.dev-f97316" alt="showcase" /></a>
  <a href="https://github.com/theokyr/vencord-plugins/blob/main/LICENSE"><img src="https://img.shields.io/github/license/theokyr/vencord-plugins?color=94a3b8" alt="license" /></a>
  <a href="https://vencord.dev"><img src="https://img.shields.io/badge/requires-Vencord-bd5dfc" alt="requires Vencord" /></a>
</p>

---

## Plugins

| Plugin | Description |
|--------|-------------|
| **channelTabs** | Quick-access tab bar for channels and DMs |
| **settingsHub** | Unified settings page for custom plugins |
| **bsNoMore** | Remove upsell clutter — DM nav, clan tags, quest popups, store UI |
| **hotkeyNav** | Keyboard-driven navigation with inline keycap hints |
| **minimalCallBar** | Compact 32px call overlay replacement |
| **embedFix** | Replaces social media URLs with embed-friendly alternatives |
| **discordMcp** | MCP bridge — expose Discord to AI agents via the Model Context Protocol |
| **messageHeaderAvatar** | Displays user avatars inline in message headers next to the username |
| **venpmGui** | Manage Vencord plugins from inside Discord — browse, install, update, and configure |

See the **[plugin showcase](https://venpm.dev/plugins/kamaras)** for interactive demos and screenshots.

## Install with venpm

[venpm](https://venpm.dev) is a package manager for Vencord userplugins.

```bash
# Install venpm
npm install -g @kamaras/venpm

# Add this plugin repo
venpm repo add https://raw.githubusercontent.com/theokyr/vencord-plugins/main/plugins.json

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
ln -s "$(pwd)/plugins/channelTabs" ~/path/to/Vencord/src/userplugins/channelTabs
ln -s "$(pwd)/plugins/settingsHub" ~/path/to/Vencord/src/userplugins/settingsHub

# Rebuild Vencord
cd ~/path/to/Vencord && pnpm build
```

Replace `~/path/to/Vencord` with your actual Vencord source path.

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
  _libAnimationKit/  # Shared animation presets (build-time dependency)
  _libKeybindRegistry/ # Shared keybind registry (build-time dependency)
proxy/               # MCP proxy server for discordMcp
tests/               # Vitest test suite (186 tests)
plugins.json         # venpm plugin index
```

Full documentation: [venpm.dev](https://venpm.dev)

## Disclaimer

These plugins are not affiliated with, endorsed by, or sponsored by Discord Inc. or the Vencord project. "Discord" is a trademark of Discord Inc., mentioned solely for descriptive purposes.

Client modifications — including Vencord and any userplugins — are against [Discord's Terms of Service](https://discord.com/terms). While no widespread bans for client mod usage are known, Discord may take action against accounts at any time. **You use client modifications entirely at your own risk.**

These plugins are provided "as is", without warranty of any kind. The author is not responsible for any damage to your Discord account, computer, or data.

## License

[MIT](LICENSE)
