![Contorium demo](./demo.gif)

Contorium

**Website:** [contorium.dev](https://www.contorium.dev/)

Runtime continuity layer for AI coding agents.

AI coding tools reset context constantly.

Contorium maintains continuous workspace state across sessions, tools, and models.

It keeps AI coding agents aligned with:

* current focus
* workspace state
* active files
* git activity
* session continuity

across:

* Cursor
* VS Code
* Claude Code
* Codex
* MCP-compatible agents

⸻

What is Contorium?

Contorium defines the runtime continuity layer for AI coding agents.

Not a memory tool.
Not a context retrieval system.

A persistent runtime state layer between AI agents and your workspace.

⸻

Why?

AI coding tools lose workspace state between sessions.

Every restart forces developers to:

* re-explain project goals
* rebuild architectural context
* recover debugging progress
* restore active workspace state

Contorium prevents that.

⸻

Core Runtime Capabilities

Current Focus

Continuously maintains what you’re actively building.

AI agents stay aligned with your current intent across sessions and tools.

⸻

Workspace State

Tracks the real-time state of your workspace:

* active files
* git changes
* recent activity
* working set evolution

⸻

Session Continuity

Maintains workspace continuity across:

* IDE restarts
* model switches
* long coding sessions
* multi-agent workflows

No context reset. No repeated explanations.

⸻

Install

**IDE extension (VS Code / Cursor)**

1. Download the latest `.vsix` from [GitHub Releases](https://github.com/ContoriumLabs/contorium/releases) (or build with `npm run vsix`).
2. Open **Extensions** → `…` → **Install from VSIX…** → select the file.
3. Reload the window. Open the **Contorium** sidebar from the activity bar.

**From source**

```bash
git clone https://github.com/ContoriumLabs/contorium.git
cd contorium
npm install
npm run compile
```

Press **F5** in VS Code/Cursor to run the Extension Development Host, or package with `npm run vsix`.

**MCP server (for Claude Code, Cursor Agent, Gemini CLI, Codex)**

Build once from the repo root:

```bash
npm run build:mcp
```

Entry: `packages/mcp/dist/server.js` · portable launcher: `bin/contorium-mcp-launch.cjs`

Full tool list and env vars: [docs/MCP.md](docs/MCP.md).

⸻

MCP config (Claude Code)

After `npm run build:mcp`:

**Plugin (recommended)** — uses [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json) and [`.mcp.claude.json`](.mcp.claude.json):

```bash
claude --plugin-dir /path/to/contorium
```

**MCP only (project scope)**

```bash
cd /path/to/your/workspace
claude mcp add --scope project contorium -- node /path/to/contorium/bin/contorium-mcp-launch.cjs
```

Bundled plugin MCP (`.mcp.claude.json`):

```json
{
  "contorium": {
    "command": "node",
    "args": ["./bin/contorium-mcp-launch.cjs"],
    "cwd": "${CLAUDE_PLUGIN_ROOT}",
    "env": {
      "CONTORIUM_WORKSPACE": "${CLAUDE_PROJECT_DIR}"
    }
  }
}
```

Keep the **Contorium VS Code extension** (or another editor with scanners) running in the workspace so `.contora/state.json` stays updated; MCP reads that state.

⸻

MCP config (Cursor / Gemini CLI)

**Cursor** — root [`mcp.json`](mcp.json) (also referenced from [`.cursor-plugin/plugin.json`](.cursor-plugin/plugin.json)):

```json
{
  "mcpServers": {
    "contorium": {
      "command": "node",
      "args": ["${workspaceFolder}/packages/mcp/dist/server.js"],
      "env": {
        "CONTORIUM_WORKSPACE": "${workspaceFolder}"
      }
    }
  }
}
```

In Cursor: **Settings → MCP** → add/import the server above (or enable the plugin’s bundled `contorium` server after installing from the marketplace). Run `npm run build:mcp` in the cloned repo first.

**Gemini CLI** — add to project `.gemini/settings.json` or user `~/.gemini/settings.json` (use **absolute paths** to your clone):

```json
{
  "mcpServers": {
    "contorium": {
      "command": "node",
      "args": ["/absolute/path/to/contorium/packages/mcp/dist/server.js"],
      "env": {
        "CONTORIUM_WORKSPACE": "/absolute/path/to/your/workspace"
      }
    }
  }
}
```

Alternatively set `args` to `["/absolute/path/to/contorium/bin/contorium-mcp-launch.cjs"]` and `cwd` to the repo root. Restart the Gemini CLI session after editing settings.

**Codex** (optional): `codex mcp add contorium -- node ./bin/contorium-mcp-launch.cjs` — see [docs/MCP.md](docs/MCP.md).

⸻

Example usage

**1. Set Current focus** — In the Contorium sidebar, describe what you are building (e.g. *Fix websocket reconnect issue*).

**2. Work normally** — The extension tracks open files, saves, Git, and recent activity into `.contora/` (local only).

**3. Restore context for AI** — Command Palette → **Contorium: Copy AI-ready context (clipboard)** → paste into Cursor chat, Claude, or Gemini. Export includes TASK, workspace focus, active files, and recent work.

**4. Agent via MCP** — In Claude Code / Cursor Agent / Gemini CLI, ask the agent to call `get_workspace_context` or `store_memory` (e.g. *“Read Contorium workspace context and continue the auth refactor”*).

**5. Next day** — Reopen the IDE; focus and workspace state persist. Use **Contorium: Start fresh AI context session** when you switch to an unrelated task.

Optional: **Contorium: Configure API key…** for BYOK summaries/intent (OpenAI, Anthropic, Gemini, DeepSeek).

⸻

Uninstall

**VS Code / Cursor extension**

1. Extensions → find **Contorium** → **Uninstall**.
2. Reload the window.

**MCP registrations**

| Host | Remove |
|------|--------|
| Claude Code | `claude mcp remove contorium` (or disable/remove the plugin install) |
| Cursor | Settings → MCP → delete the `contorium` server |
| Gemini CLI | Remove `contorium` from `.gemini/settings.json` or `~/.gemini/settings.json` |
| Codex | `codex mcp remove contorium` |

**Local data (optional)**

Uninstalling does **not** delete workspace data. To remove runtime files:

```bash
rm -rf .contora
# legacy layout (if present):
rm -rf .context-recall
```

Also remove BYOK keys if stored: Command Palette → **Contorium: Configure API key…** → clear keys, or delete the extension’s Secret Storage entries when uninstalling from the IDE.

⸻

Local-first

* no cloud sync
* no hidden telemetry
* optional BYOK
* workspace data stays local

⸻

Architecture

Contorium combines:

* IDE-native runtime tracking
* workspace state persistence
* MCP-compatible runtime access
* local-first storage

to create a continuous runtime layer for AI coding systems.

Additional docs:

* RUNTIME.md
* MCP.md
* ARCHITECTURE.md

⸻

Vision

AI coding systems need more than memory.

They need runtime continuity.

Contorium is building that layer.

**Website:** [contorium.dev](https://www.contorium.dev/)