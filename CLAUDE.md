# vencord-plugins

Custom Vencord userplugins, developed outside the Vencord source tree.

## Layout

```
plugins/
  _libAnimationKit/     # Shared animation CSS/utilities (build-time dependency)
  _libKeybindRegistry/  # Central keybind registry (build-time dependency)
  examplePlugin/
    index.ts          # Plugin entry point (definePlugin)
  myPlugin/
    index.tsx         # Use .tsx for plugins with React UI
    native.ts         # Optional: runs in Node.js (fs, child_process, etc.)
    style.css         # Optional: plugin styles
plugins.json          # venpm plugin index — all plugins + shared libs listed here
link.sh               # Install all plugins via venpm --local + rebuild + restart
unlink.sh             # Uninstall all local plugins via venpm + rebuild
```

Each subfolder of `plugins/` is one Vencord plugin. Folder names use **camelCase**. `_lib`-prefixed folders are shared build-time modules (no `definePlugin`) — they are listed in `plugins.json` as dependencies.

## Vencord Source

The Vencord source checkout lives at `~/src/extern/Vencord/` (not in this repo).

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
| **Agent** | `discord_rebuild_plugins` MCP tool | Preferred — the proxy waits for the bridge to reconnect and reports `verified: true` |
| **Agent (fallback)** | `venpm rebuild --restart --yes` | Verifies the restart itself; non-zero exit if Discord does not come back |
| **Human (terminal)** | `venpm rebuild` | Preferred — builds, deploys, restarts Discord |
| **Human (terminal)** | `./link.sh` | Alternative — installs local symlinks first, then delegates to `venpm rebuild` |
| **Never** | `pnpm build` directly | Does not deploy; leaves dist/ out of sync |
| **Never** | launching Discord from a shell yourself | `nohup discord &` / `setsid discord` — see below |

**Both paths are verified.** Neither reports success on a spawn alone:

- `venpm rebuild --restart` proves the *process* came back: it waits for a Discord process to appear and to still be alive after a settle window, and quotes `~/.local/state/venpm/discord-launch.log` when it isn't. A failed restart is `RESTART_FAILED` (exit 3), distinct from a build failure.
- `discord_rebuild_plugins` proves the *new bundle loaded*: the proxy waits for the plugin's WebSocket to drop and then re-handshake. Only the newly built plugin code can send that handshake. Returns `{verified: true, downtimeMs}`, or an explicit error naming the launch log.

**Never launch Discord from an agent shell.** Agent and CI shells inherit a broken display environment (`DISPLAY=""` plus a stale `WAYLAND_DISPLAY`), so a manual `nohup discord &` either dies instantly with "Missing X server or $DISPLAY" or, if forced onto the wrong backend, crash-loops the GPU process and hangs on "Starting...". It also leaves orphaned processes. `venpm` handles this by importing the desktop session's real environment from `systemctl --user show-environment`; run `venpm doctor` to see which display a restart will use.

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

## channelTabs Plugin

IDE-style tab bar for channels, DMs and virtual routes. It owns the virtual tab API documented above, so settingsHub and venpmGui depend on it being loaded.

### Architecture

- **Immutable tab state** — every mutation goes through `applyTabState`, and the group operations in `groupState.ts` are pure functions over the tab array. Nothing edits the live array in place.
- **Tab bar position** — top or bottom is CSS `order` on the `page_` flex container, not DOM reordering. The container's flex height is overridden via a WeakMap save/restore guarded by a `MutationObserver`, so Discord re-rendering the page does not undo it.
- **Native context menus** — a synthetic `MouseEvent` plus `addContextMenuPatch`, so tabs get Discord's real channel menu rather than a lookalike.
- **Keybinds** — 7 configurable bindings registered through `_libKeybindRegistry`, not a private listener.

### Drag & Drop

`DataTransfer.getData()` is deliberately unreadable during `dragover` — only `types` is exposed. Hover-time decisions ("is this a group being reordered, or a tab being absorbed into it?") therefore cannot come from the event, so `dragState.ts` mirrors the payload at `dragstart` and the bar reads it during `dragover`.

The hover math lives in `dragGeometry.ts`, kept dependency-free (DOM only, no webpack imports) so it is unit-testable outside the renderer. A group chip is zoned: the outer 30% of each side reorders, the middle absorbs. Reordering animates by measuring `offsetLeft` before and after (FLIP), and the insertion point is drawn as a keyed caret rather than by shifting siblings.

### File Structure

```
plugins/channelTabs/
  index.tsx              # Plugin entry, tab state, virtual route registry
  tabBar.tsx             # Bar rendering, drag handlers, overflow
  tabMeta.ts             # Channel/DM/route -> label, icon, unread
  types.ts               # Tab and group types
  dragState.ts           # Module-scope drag mirror (dragover can't read dataTransfer)
  dragGeometry.ts        # Pointer -> drop slot math, autoscroll (pure, DOM-only)
  groupState.ts          # Pure group operations over the tab array
  groupChip.tsx          # Collapsed group rendering
  groupDropdown.tsx      # Expanded group contents
  groupNamePrompt.tsx    # Rename dialog
  contextMenu.tsx        # Synthetic MouseEvent -> Discord's native menu
  contextMenuConfig.ts   # Menu item definitions
  eventFilters.ts        # Which Flux events should refresh a tab
  multiSelect.ts         # Shift/ctrl selection across tabs
  settingsSchema.tsx     # settingsHub schema
  style.css
```

## _keybindRegistry

Central keybind registry and dispatcher. Build-time shared module (like `_libAnimationKit`) — listed in `plugins.json` as a dependency for other plugins, but not independently useful to end users.

### Architecture

- `types.ts` — Core types: `RegisteredKeybind`, `LayerHandler`, `ChordHandler`, `ConflictResolution`
- `format.ts` — `e.code` <-> human label conversion, event normalization
- `registry.ts` — Registration, conflict detection, resolution storage, observer pattern
- `dispatcher.ts` — Single `keydown` listener, matching, layer/chord dispatch, text input guards
- `index.ts` — Public API, `window.__keybindRegistry` module-scope init

### Plugin Integration

Plugins declare keybinds as `keybind_*` settings in `definePluginSettings` for persistence, then register handlers via:

```typescript
window.__keybindRegistry?.register({
    plugin: "MyPlugin",
    keybinds: {
        myAction: {
            action: "Do something",
            defaultKeys: "ctrl+KeyA",
            handler: () => doSomething(),
        },
    },
});
```

settingsHub renders a global Keybinds page reading from `window.__keybindRegistry.getAll()`.

## embedFix Plugin

Rewrites social media URLs in both directions to produce richer embeds. Rewritten in v0.3.0 — provider support is resolved **per link**, never per platform. v0.5.0 added main-process media proxying for CSP-blocked provider CDNs.

### Architecture

- **Per-link resolution** (`providerResolver.ts`) — every URL is checked on its own, because a provider that renders video tweets may 404 on photo tweets. Results are cached by canonical URL (success TTL 24h, failure TTL 10m, LRU-bounded). Per-domain health tracking puts a repeatedly failing provider on exponential cooldown; concurrent lookups of the same link share one probe chain.
- **Outgoing** (`outgoing.ts`) — `onBeforeMessageSend`. Known link → rewritten inline. Unknown → sent clean and queued; once resolved, a single `MessageActions.editMessage` splices the rewrites back in, verifying the text still matches at each offset. A link already known to have no working provider is never re-queued.
- **Incoming** (`incomingPlan.ts` + `incomingController.ts`) — `MessageAccessories` renders a replacement embed and Discord's own embed is hidden **only once that replacement exists**. Pending and failed lookups leave Discord alone. There is no link-render patch: other users' link text is left as they typed it.
- **Suppression** (`embedSuppressor.ts`) — scoped to one message container, driven entirely by the plan, restores everything it hid on teardown. No global document sweep. Pairs by the links an embed renders, falling back to embed position: an image-only tweet card links the author and the picture but never the post URL.
- **Media presentation** (`mediaProbe.ts` + `mediaProxy.ts`) — Discord's CSP blocks `img-src`/`media-src` for provider CDNs. Each host is probed once **per kind** and, when blocked, the bytes are fetched in the Electron main process (no CSP) and presented from a `blob:` URL. Images/gifs proxy automatically under 8 MB; video is click-to-load under 50 MB.

### Scoring

`embedMeta.ts` rates every fetch 0–4 (NONE / TITLE_ONLY / IMAGE / RICH / MEDIA) and detects **soft errors**: a provider that answers 200 with an error page, a bare landing page, or a redirect back to the source domain. A soft error scores 0 for that link but does **not** count against the provider's health — the domain is alive, this one link is unsupported. A long streak of soft errors across *different* links does bench the domain, since a provider that says that about everything is dead or sniffing us. `GOOD_ENOUGH_SCORE` (IMAGE) is the early-accept bar; a title-only result keeps the search going and is used only as a last resort.

Scoring must reflect what can actually be *presented*, not what the metadata claims. Media the renderer cannot display is stripped before scoring, and click-to-load video never reaches the MEDIA tier — it must not outrank a native embed that simply plays.

A tie goes to the provider. Requiring a strict win meant the plugin silently did nothing for the common case, where Discord and the provider both manage title + image + description.

### Platforms

7 platforms: Twitter/X, Reddit, Instagram, TikTok, Pixiv, Bluesky, Threads.

### File Structure

```
plugins/embedFix/
  index.tsx              # Plugin entry, settings, Flux wiring, deferred edits
  native.ts              # Electron main: one fetch per provider URL, bounded concurrency
  embedMeta.ts           # Meta parsing, scoring, soft-error detection (pure, shared with native)
  providerResolver.ts    # Per-link resolution, caching, domain health (pure)
  incomingPlan.ts        # Message -> render/suppress plan (pure)
  incomingController.ts  # Shared renderer state, subscription fan-out
  embedSuppressor.ts     # Scoped DOM hiding + restore
  mediaProbe.ts          # Per-host, per-kind CSP capability probing (pure)
  mediaProxy.ts          # Main-process media fetch -> blob: URL, bounded + revoked
  outgoing.ts            # Send-time plan, offset-verified replacements (pure)
  urlRewriter.ts         # URL scanning, tracking-param stripping, canonical keys
  providerMap.ts         # Platform/provider definitions and matching
  providerPriority.ts    # User-ordered provider lists
  components/            # EmbedAccessory, EmbedCard, ProviderPriorityEditor
```

### Critical Gotchas

| Issue | Detail |
|-------|--------|
| Suppression invariant | Never hide a native embed unless a working replacement for that exact link exists. Hiding on "pending" is what made incoming rewriting appear broken — the message ended up with no embed at all. |
| `addMessageAccessory` needs factory fn | Expects `(props) => ReactNode`. `ErrorBoundary.wrap()` returns a component class — passing it directly silently produces nothing. |
| Embed DOM structure | Native embeds render as `<article class="embedFull__* embed__*">` inside `#message-accessories-{messageId}`. The `embedWrapper_` class does NOT exist in the accessories container. |
| Embed colour must be an int | Discord's Embed component wants a 24-bit number, not `#rrggbb`. See `parseThemeColor`. |
| Pair embeds by URL, then position | `message.embeds[i]` does not line up with the i-th `<article>` in the DOM. Match on the links inside the embed first; fall back to position among non-ours articles. |
| Bare domains | `https://x.com` has nothing to embed — `hasEmbeddablePath` keeps home pages out of both directions. |
| CSP blocks provider CDNs | `i.redd.it`, `preview.redd.it`, `phixiv.net` and provider video hosts are refused by `img-src`/`media-src`; `blob:` and `data:` pass. Confirm with a `securitypolicyviolation` listener — a CSP block and a 403 hotlink both look like `onerror`. |
| Accessory errors are silent | Vencord wraps accessories in `<ErrorBoundary noop>`, so a render throw yields nothing at all. `findComponentByCodeLazy` returns an always-truthy proxy that throws at render time, making `X ? <X/> : <Fallback/>` dead code — use a real `ErrorBoundary fallback`. |
| Providers sniff the User-Agent | vxtwitter emits OG tags only for exactly `TelegramBot (like TwitterBot)`. The native fetcher retries with a second identity when a page returns 200 with no metadata. |
| Discord rewrites embed hosts | An `x.com` link comes back as a `twitter.com` embed URL. Pair by path across the platform's hosts; the weak host-only fallback must never count as proof a link is still in the message, or a pending link gets its embed hidden with nothing in its place. |

## venpm Integration

This repo publishes a venpm plugin index at `plugins.json` (root). The index lists all user-facing plugins with their metadata, dependencies, and source locations.

### Plugin Index (`plugins.json`)

Conforms to the venpm JSON Schema (`https://venpm.dev/schemas/v1/plugins.json`). Validate with:

```bash
venpm validate plugins.json
venpm validate plugins.json --strict   # also checks dep refs
```

Key conventions:
- `_lib`-prefixed entries (`_libAnimationKit`, `_libKeybindRegistry`) are shared build-time modules — they are listed in `plugins.json` because other plugins declare them as `dependencies`, but they have no `definePlugin` and are not independently useful to end users
- All plugins use `optionalDependencies` for `settingsHub` (not hard `dependencies`) — every plugin works standalone
- `source.git` points to the GitHub URL; `source.path` specifies the monorepo subdirectory
- No version tags yet — plugins install from HEAD of main

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

Always list `_lib`-prefixed shared modules — other plugins depend on them. They must stay in `plugins.json` for dependency resolution even though they have no `definePlugin`.

## Agent Rules

1. **Use venpm for all plugin operations.** Install, uninstall, update, search, list — always through venpm, never manual file operations.
2. **Use `discord_rebuild_plugins` MCP tool for build+deploy when available.** Falls back to `venpm rebuild` if the MCP tool is unavailable or returns a symlink error. Never run `pnpm build` directly — it does not deploy.
3. **Never start Discord yourself.** No `nohup discord &`, `setsid discord`, or hand-built display flags — an agent shell's display environment is wrong and produces dead or crash-looping clients plus orphaned processes. Only `discord_rebuild_plugins` or `venpm rebuild --restart` may launch it.
4. **Trust the verification, not the exit of a spawn.** Both supported paths report whether Discord actually came back; if one says it did not, read `~/.local/state/venpm/discord-launch.log` and run `venpm doctor` instead of retrying blindly.
5. **Use MCP tools for investigation.** `discord_eval`, `discord_get_store`, `discord_query_selector` — not `/tmp` scripts.
6. **Respect voice call auto-deny.** If `discord_rebuild_plugins` returns auto-deny, do NOT attempt workarounds. Inform the user and wait.
7. **Update `plugins.json` when adding/modifying plugins.** Run `venpm validate plugins.json` after changes.

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
| `plugins/_libKeybindRegistry/*` | Pure logic — format, registry, dispatcher |
| `plugins/embedFix/embedMeta.ts` | Pure meta parsing, scoring, soft-error detection |
| `plugins/embedFix/providerResolver.ts` | Pure per-link resolution — probe fn and clock are injected |
| `plugins/embedFix/incomingPlan.ts` | Pure message -> render/suppress planning |
| `plugins/embedFix/incomingController.ts` | Depends only on the resolver, no React |
| `plugins/embedFix/outgoing.ts` | Pure send-time planning and offset-verified splicing |
| `plugins/embedFix/urlRewriter.ts` | Pure URL rewrite rules and canonical keys |
| `plugins/embedFix/embedSuppressor.ts` | Matching is pure; DOM helpers run under happy-dom |
| `plugins/embedFix/mediaProbe.ts` | Loaders are injected — no DOM needed |
| `plugins/embedFix/mediaProxy.ts` | Fetcher and object-URL factory are injected |

Plugin UI code, patches, and DOM injection are **not** unit-testable (they require the Discord renderer).

### Current Coverage

759 tests across 62 test files. DOM-dependent tests (dispatcher, embedSuppressor, enrichedHeader) use `happy-dom` via a `// @vitest-environment happy-dom` pragma.

## Git

- **Origin:** `https://github.com/theokyr/vencord-plugins.git`
- **Branch:** `main`

## Constraints

- Plugin folder names must be camelCase
- `index.ts` runs in browser — no Node.js APIs (use `native.ts` for that)
- Webpack finds (`findByPropsLazy` etc.) cannot run at top level — they must be lazy
- After updating Vencord upstream, re-apply the `pathAliasPlugin` patch if it was overwritten
