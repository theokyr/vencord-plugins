# vencord-plugins

Custom Vencord userplugins, developed outside the Vencord source tree.

## Layout

```
plugins/
  examplePlugin/
    index.ts          # Plugin entry point (definePlugin)
  myPlugin/
    index.tsx         # Use .tsx for plugins with React UI
    native.ts         # Optional: runs in Node.js (fs, child_process, etc.)
    style.css         # Optional: plugin styles
plugins.json          # venpm plugin index — all user-facing plugins listed here
link.sh               # Install all plugins via venpm --local + rebuild + restart
unlink.sh             # Uninstall all local plugins via venpm + rebuild
```

Each subfolder of `plugins/` is one Vencord plugin. Folder names use **camelCase**.

## Vencord Source

The Vencord source checkout lives at `~/src/extern/Vencord/` (not in this repo).

- **GitHub origin:** `https://github.com/Vendicated/Vencord.git`
- **GitHub origin:** `https://github.com/Vendicated/Vencord.git`

A patch to `scripts/build/common.mjs` adds a `pathAliasPlugin` that resolves `@utils`, `@api`, `@webpack`, etc. for symlinked userplugins whose real paths are outside `src/`. This patch must be maintained when updating Vencord.

## Development Workflow

**venpm is the standard tool for plugin management.** Use it like npm — for installing, updating, listing, and managing plugins.

```bash
# First time: install venpm globally
cd ~/src/venpm && node scripts/setup.mjs

# Preferred: build + deploy + restart Discord (all-in-one)
venpm rebuild

# Alternative: install all plugins as local symlinks, then build + deploy + restart
./link.sh

# Add an individual plugin for development (symlink, no rebuild yet)
venpm install <name> --local plugins/<name> --no-build

# First time only: inject Vencord into Discord (interactive prompt)
cd ~/src/extern/Vencord && pnpm inject
```

**Important:** `pnpm build` writes to the repo's `dist/`, but Discord loads from `~/.config/Vencord/dist/`. `venpm rebuild` and `./link.sh` handle the copy automatically. If you build manually, you must also copy the renderer files to `~/.config/Vencord/dist/`.

For iterative development, use watch mode:
```bash
cd ~/src/extern/Vencord && pnpm build --watch
```

### venpm Quick Reference

```bash
venpm list                          # Show installed plugins
venpm install <plugin>              # Install from configured repos
venpm install <plugin> --local <p>  # Symlink local directory (dev workflow)
venpm uninstall <plugin>            # Remove a plugin
venpm update                        # Update all plugins
venpm search <query>                # Search across repos
venpm rebuild                       # Build Vencord + deploy + restart Discord
venpm doctor                        # Check environment health
```

## Writing a Plugin

Minimal plugin (`plugins/myPlugin/index.ts`):

```typescript
import definePlugin from "@utils/types";

export default definePlugin({
    name: "MyPlugin",
    description: "What it does",
    authors: [{ name: "kamaras", id: 0n }],

    start() {},
    stop() {},
});
```

### Available Imports

| Import | Use |
|--------|-----|
| `@utils/types` | `definePlugin` |
| `@utils/constants` | `Devs` enum |
| `@api/Settings` | `definePluginSettings`, `OptionType` |
| `@webpack/common` | Discord React components, React hooks |
| `@webpack` | `findByPropsLazy`, `findByCodeLazy` |

### Patches

Modify Discord's code before it loads:

```typescript
patches: [{
    find: "uniqueStringInModule",
    replacement: {
        match: /somePattern/,
        replace: "replacement",
    }
}]
```

### Settings

```typescript
import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

const settings = definePluginSettings({
    myOption: {
        type: OptionType.BOOLEAN,
        description: "Toggle something",
        default: false,
    }
});

// Access via settings.store.myOption
```

## discordMcp Plugin

MCP bridge that exposes Discord internals to AI agents via the Model Context Protocol. Two-component architecture:

### Architecture

```
Claude Code  <--stdio-->  proxy/  <--WebSocket-->  plugins/discordMcp/
  (MCP client)         (MCP server + WS server)     (Vencord plugin, WS client)
                        localhost:21420
```

- **Proxy** (`proxy/`): standalone Node.js MCP stdio server. Hosts a WebSocket server on port 21420. Absorbs "Discord offline" errors so MCP clients never see connection failures.
- **Plugin** (`plugins/discordMcp/`): WebSocket client in the renderer (DevCompanion pattern). Has a `native.ts` for Node.js operations (build/deploy).

### File Structure

```
proxy/
  src/index.ts           # MCP stdio server entry + WS lifecycle
  src/protocol.ts        # Shared message types and tool name constants
  src/ws-server.ts       # WebSocket server (ws library)
  src/tools.ts           # MCP tool definitions (JSON Schema for each tool)
  src/subscriptions.ts   # Event subscription forwarding

plugins/discordMcp/
  index.tsx              # Plugin entry, WS client, permission system, prompt UI
  native.ts              # Node.js module (Electron main): rebuildPlugins (build + deploy)
  shared.ts              # Shared state (toolHandlers, send, logger, activeSubscriptions)
  style.css              # Confirmation prompt styles
  tools/read.ts          # Read handlers (guilds, channels, messages, users, threads)
  tools/state.ts         # State handlers (presence, unread, selected, online)
  tools/actions.ts       # Action handlers (send, react, edit, delete, voice, presence, rebuild)
  tools/devtools.ts      # DevTools handlers (eval, querySelector, webpack, store, plugins)
  tools/events.ts        # Event subscription handlers (FluxDispatcher bridge)
```

### Circular Dependency Pattern

Tool modules must NOT import from `index.tsx`. Shared state lives in `shared.ts`:

```typescript
// shared.ts exports: registerTool, send, setSendFn, toolHandlers, activeSubscriptions, logger
// Tool modules import from shared.ts
// index.tsx imports from shared.ts and sets the send function at runtime via setSendFn()
```

### Permission System

Per-tool deny/prompt/allow settings in Vencord UI. Read/state/event tools are grouped; action and devtools tools have individual permissions. Prompt UI is a DOM overlay with configurable position, opacity, and timeout.

CSS vars need hardcoded fallbacks (e.g., `var(--background-floating, #2b2d31)`) or the prompt is transparent — Discord's CSS vars are not available in all injection contexts.

### MCP Configuration

Project-scoped MCP config lives in `.mcp.json` at repo root (NOT `settings.local.json`):

```json
{
  "mcpServers": {
    "discord": {
      "command": "node",
      "args": ["./proxy/dist/index.js"]
    }
  }
}
```

### Building the Proxy

```bash
cd ~/src/vencord-plugins/proxy && npm install && npm run build
```

### Build & Deploy

| Context | Command | Notes |
|---------|---------|-------|
| **Agent** | `discord_rebuild_plugins` MCP tool | Only correct option from agent context |
| **Human (terminal)** | `venpm rebuild` | Preferred — builds, deploys, restarts Discord |
| **Human (terminal)** | `./link.sh` | Alternative — also installs local symlinks first |
| **Never** | `pnpm build` directly | Does not deploy; leaves dist/ out of sync |

**Agent rules:** See the [Agent Rules](#agent-rules) section. Agents MUST use `discord_rebuild_plugins` and MUST NOT use shell commands for build+deploy.

**Voice call auto-deny:** If the user is in a voice channel or call, `discord_rebuild_plugins` returns an auto-deny error. Agents MUST respect this rejection. Do NOT attempt to bypass it via `discord_eval`, shell commands, or any other workaround. Inform the user and wait for them to leave the call.

The MCP tool spawns `link.sh` (which internally calls `venpm rebuild`) as a detached process, so Discord closes and reopens automatically.

### Using MCP Tools for Plugin Research

Instead of writing `/tmp/discord-research-*.js` scripts, use the MCP tools directly:

| Tool | Replaces |
|------|----------|
| `discord_eval` | DevTools console scripts |
| `discord_get_store` | `Vencord.Webpack.findStore()` |
| `discord_query_selector` | DOM inspection |
| `discord_get_webpack_module` | `Vencord.Webpack.findModuleFactory()` |
| `discord_get_vencord_plugins` | Manual plugin list checking |
| `discord_rebuild_plugins` | `venpm rebuild` / `./link.sh` / manual build + copy |

## settingsHub Plugin

Virtual tab overlay settings framework. Provides a unified settings UI for all custom plugins via the channelTabs virtual tabs API.

### Architecture

- **Virtual tab overlay** — registers `@@settingsHub` with channelTabs' `onActivate`/`onDeactivate` callbacks. No Discord route change, no empty state.
- **Module-scope API** — `window.__settingsHub` is set up at module evaluation time (before any `start()` runs), so consumer plugins can call `register()` in their `start()` regardless of alphabetical plugin order. Component exports are populated later in `start()` via `Object.assign`.
- **Flex overlay with CSS-only content hiding** — overlay is a `flex: 1` child of `page_` (order between tab bar top:-1 and bottom:9999). Discord's content hidden via `body.vc-settingsHub-open [class*="page_"] > :not(#vc-channelTabs-container):not(.vc-settingsHub-route-container) { display: none }`. No JS hide/show logic to race or break.
- **Enriched header integration** — injects gear icon + "Settings" label into title bar, hides stale channel chrome via body class CSS.
- **Control reactivity** — all control components use `const [, rerender] = useState(0)` and call `rerender(n => n + 1)` after mutating `settings.store[key]` for instant visual feedback.

### Key Design Decisions

| Decision | Why |
|----------|-----|
| No `StartAt.Init` | Unreliable for userplugins — `start()` silently never fires |
| Module-scope API | Runs during bundle evaluation, before any `start()` |
| `@@` prefix for virtual tab path | Distinguishes from real Discord routes |
| CSS `:not()` content hiding | No JS race conditions, no selector matching overlay itself |
| No enter/exit animations | Instant tab switching matches Discord's own pages |

### File Structure

```
plugins/settingsHub/
  index.tsx              # Plugin entry, virtual tab registration, module-scope API
  registry.ts            # Plugin schema registry (register/unregister/getAll)
  hooks.ts               # React hooks for settings state
  schema.ts              # Settings schema types and validation
  search.ts              # Fuzzy search over registered settings
  style.css              # Sidebar + content layout, overlay positioning, header cleanup
  components/            # Settings UI components (sidebar, content, search bar)
```

### Consumer Pattern

```typescript
// In consumer plugin start():
window.__settingsHub?.register({
    pluginName: "MyPlugin",
    sections: [{ ... }],
});

// In consumer plugin stop():
window.__settingsHub?.unregister("MyPlugin");
```

### channelTabs Virtual Tabs API

```typescript
// Register a virtual tab (no route navigation, calls your callbacks instead)
window.__channelTabs?.registerRoute("@@myPlugin", {
    label: "My Plugin",
    icon: svgDataUri,          // optional
    onActivate: () => { /* inject overlay UI */ },
    onDeactivate: () => { /* remove overlay UI */ },
});

// Open programmatically
window.__channelTabs?.openRoute("@@myPlugin");

// Clean up
window.__channelTabs?.unregisterRoute("@@myPlugin");
```

Currently 5 consumer plugins are migrated to the settingsHub API.

## venpm Integration

This repo publishes a venpm plugin index at `plugins.json` (root). The index lists all user-facing plugins with their metadata, dependencies, and source locations.

### Plugin Index (`plugins.json`)

Conforms to the venpm JSON Schema (`https://venpm.dev/schemas/v1/plugins.json`). Validate with:

```bash
venpm validate plugins.json
venpm validate plugins.json --strict   # also checks dep refs
```

Key conventions:
- `_animationKit` is excluded — it's a build-time utility bundled into each plugin, not user-installable
- All plugins use `optionalDependencies` for `settingsHub` (not hard `dependencies`) — every plugin works standalone
- `source.git` points to the GitHub URL; `source.path` specifies the monorepo subdirectory
- No version tags yet — plugins install from HEAD of master

### venpm CLI

The venpm tool lives at `~/src/venpm/`. See its `CLAUDE.md` for full architecture docs. Quick reference:

```bash
venpm search <query>             # Search across configured repos
venpm install <plugin>           # Install plugin + deps
venpm install <plugin> --local . # Symlink for dev workflow
venpm list                       # Show installed plugins
venpm validate plugins.json      # Validate this repo's index
```

### When Updating plugins.json

Update `plugins.json` when:
- Adding a new plugin
- Changing a plugin's dependencies or optionalDependencies
- Bumping version numbers (when we start tagging releases)

Do NOT list `_animationKit` — it has no `definePlugin` and is not independently installable.

## Agent Rules

1. **Use venpm for all plugin operations.** Install, uninstall, update, search, list — always through venpm, never manual file operations.
2. **Use `discord_rebuild_plugins` MCP tool for build+deploy.** Never run `./link.sh`, `venpm rebuild`, `pnpm build`, or any build command from agent context.
3. **Use MCP tools for investigation.** `discord_eval`, `discord_get_store`, `discord_query_selector` — not `/tmp` scripts.
4. **Respect voice call auto-deny.** If `discord_rebuild_plugins` returns auto-deny, do NOT attempt workarounds. Inform the user and wait.
5. **Update `plugins.json` when adding/modifying plugins.** Run `venpm validate plugins.json` after changes.

## Testing

Tests use **vitest** at the repo root. Run with:

```bash
cd ~/src/vencord-plugins && npm test
```

### Infrastructure

- Root `package.json` contains vitest as a dev dependency
- `vitest.config.ts` defines path aliases:
  - Proxy imports: `.js` extensions resolve to `.ts` source files (e.g., `../../proxy/src/subscriptions.js` -> `../../proxy/src/subscriptions.ts`)
  - Vencord stubs: `@utils/Logger`, `@utils/types`, `@api/Settings` resolve to `tests/__mocks__/vencord.ts`
- `tests/__mocks__/vencord.ts` provides minimal stubs for testing plugin pure-logic modules outside Discord

### What's Testable

| Module | Why |
|--------|-----|
| `proxy/src/*` | Pure Node.js — protocol, subscriptions, tools, ws-server |
| `plugins/settingsHub/registry.ts` | Pure registry logic, no Discord deps |
| `plugins/settingsHub/search.ts` | Pure fuzzy search, no Discord deps |
| `plugins/discordMcp/shared.ts` | Shared state and registration, no Discord deps |

Plugin UI code, patches, and DOM injection are **not** unit-testable (they require the Discord renderer).

### Current Coverage

78 tests across 6 test files, all passing.

## Git

- **Origin:** `https://github.com/theokyr/vencord-plugins.git`
- **Branch:** `master`

## Constraints

- Plugin folder names must be camelCase
- `index.ts` runs in browser — no Node.js APIs (use `native.ts` for that)
- Webpack finds (`findByPropsLazy` etc.) cannot run at top level — they must be lazy
- After updating Vencord upstream, re-apply the `pathAliasPlugin` patch if it was overwritten
