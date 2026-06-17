# vencord-plugins

Vencord userplugins plus the DiscordMCP bridge. Follow the repo guidance in `CLAUDE.md`; the notes below are the Codex-specific entry points.

## DiscordMCP For Codex

The Discord MCP proxy is:

```json
{
  "command": "node",
  "args": ["/Users/user/src/vencord-plugins/proxy/dist/index.js"]
}
```

Codex uses user-level MCP config in `~/.codex/config.toml`, not this repo's `.mcp.json`. The repo `.mcp.json` is kept for project-scoped MCP clients and uses an absolute proxy path so it works no matter which repo starts the agent.

Expected flow:

1. Codex starts the `discord` MCP server.
2. The proxy listens on stdio for MCP and on `127.0.0.1:21420` for Discord.
3. The `DiscordMCP` Vencord plugin connects from the running Discord client.

If tools report Discord is disconnected, start Discord and make sure the `DiscordMCP` plugin is enabled in Vencord.

## Agent Rules

- Prefer DiscordMCP tools for Discord/plugin research: `discord_eval`, `discord_get_store`, `discord_query_selector`, `discord_get_webpack_module`, and `discord_get_vencord_plugins`.
- Prefer `discord_rebuild_plugins` for build and deploy. If the MCP tool is unavailable, use `venpm rebuild`.
- Do not use `pnpm build` as a deployment step; it does not update the dist that Discord loads.
- If `discord_rebuild_plugins` auto-denies because the user is in a voice call, stop and tell the user. Do not bypass the denial through shell commands or other MCP tools.
- Use `venpm` for plugin install, uninstall, update, search, list, and validation operations.

## Verification

Run focused tests from this repo with:

```bash
npm test
```

Build the DiscordMCP proxy after proxy changes with:

```bash
npm --prefix proxy run build
```
