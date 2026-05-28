# Contorium

![Contorium: restore workspace context automatically for AI coding](demo.gif)

Runtime memory infrastructure for AI coding agents.

AI coding tools lose runtime state constantly.

They forget:

* what you’re building
* what changed
* current architectural focus
* active debugging progress
* recent decisions
* workspace continuity

Contorium gives coding agents persistent runtime context across long development workflows.

Built for:

* Cursor
* VS Code
* Claude Code
* Codex
* MCP-based AI systems

⸻

⸻

The Problem

Modern AI coding assistants are stateless.

Every new session forces the model to reconstruct:

* project intent
* architecture decisions
* debugging progress
* active files
* current focus
* workspace history

Even with large context windows, AI agents still suffer from:

* context drift
* architectural forgetting
* repeated reasoning
* token inefficiency
* session fragmentation

Most “AI memory” systems only retrieve old text.

Contorium focuses on something different:

Runtime Continuity

Not just storing information.

Maintaining the active working state of an AI-assisted development session.

⸻

What Contorium Does

Contorium continuously tracks workspace runtime state:

* active files
* coding focus
* Git activity
* recent edits
* workspace structure
* architectural decisions
* debugging progress
* session continuity

So your AI can continue working instead of restarting context every session.

⸻

Core Features

Runtime Workspace Memory

Contorium maintains a persistent runtime layer for your workspace.

Instead of storing endless chat history, it tracks:

* current development focus
* active modules
* recent architectural changes
* ongoing debugging tasks
* workspace evolution over time

Stored locally inside:

.contora/

⸻

Session Continuity

Close Cursor.

Switch models.

Restart your IDE.

Come back tomorrow.

Your AI still understands:

* what changed
* what mattered
* what you were actively working on
* where the project currently stands

⸻

Git-aware Runtime Tracking

Automatically tracks:

* modified files
* staged changes
* recent commits
* working tree activity
* active development areas

This allows AI agents to understand project evolution instead of isolated snapshots.

⸻

Token-efficient Context Compression

Contorium reduces unnecessary context usage by:

* ranking important workspace activity
* compressing historical runtime state
* filtering noisy files
* prioritizing active development areas
* tracking focus over time

Especially useful for:

* monorepos
* long-running agent workflows
* frontier reasoning models
* multi-session AI development

⸻

Local-first Architecture

Your runtime memory stays local.

* no cloud sync
* no hidden telemetry
* no remote workspace scraping
* optional BYOK support

Contorium is designed for developer-controlled memory infrastructure.

⸻

Why Runtime Memory Matters

Most AI memory systems work like search engines.

They retrieve old information.

But software development is not retrieval.

It is an evolving runtime workflow.

AI agents need:

* continuity
* focus awareness
* workspace state
* architectural persistence
* lifecycle tracking

Contorium is built around runtime continuity instead of static memory retrieval.

⸻

Installation

Requirements

* Open a **folder workspace** (not a single file).
* Workspace data is stored under `.contora/` in the project root (local only; not committed).

VSIX (Cursor / VS Code)

Supported editors: Cursor, VS Code, Windsurf, VSCodium.

1. Build a package (from source): `npm run vsix` → produces `contorium-*.vsix` in the repo root.
2. Extensions → `...` → **Install from VSIX…** → select the `.vsix` file.
3. Reload the window.
4. Open the **Contorium** view from the activity bar.

Common commands (Command Palette):

| Command | Purpose |
|---------|---------|
| **Contorium: Copy AI-ready context (clipboard)** | Copy structured workspace memory for a new chat |
| **Contorium: Configure API key… (BYOK)** | Save provider key in SecretStorage (never in settings) |
| **Contorium: Start fresh AI context session** | Clear session events / intent pool; files and Git unchanged |
| **Contorium: Save session state now** | Persist `.contora/state.json` |
| **Contorium: Learn workspace intent (AI)** | BYOK workspace intent snapshot |
| **Contorium: Observe workspace (AI summary)** | BYOK semantic summary |
| **Contorium: Restore editors from saved state** | Reopen editors from last saved state |

Optional LLM (BYOK): set `contora.aiProvider` in Settings (default in extension: `deepseek`). Run **Configure API key…** for your vendor. Optional workspace template: copy [`.vscode/settings.example.json`](.vscode/settings.example.json) to `.vscode/settings.json` (do not commit API keys).

Cursor Marketplace: submit this Git repository; run `npm run validate:plugin` before publishing ([`.cursor-plugin/plugin.json`](.cursor-plugin/plugin.json)).

⸻

From Source (developers)

```bash
git clone https://github.com/ContoriumLabs/contorium.git
cd contorium
npm install
npm run compile    # version sync + runtime + MCP + extension
npm run vsix       # optional: build contorium-*.vsix
```

⸻

MCP + agent plugins (Codex / Claude Code / Cursor Agent)

Build MCP first: `npm run build:mcp` (also runs as part of `npm run compile`).

| Platform | Plugin manifest | MCP config |
|----------|-----------------|------------|
| Codex | `.codex-plugin/plugin.json` | `.mcp.json` |
| Claude Code | `.claude-plugin/plugin.json` | `.mcp.claude.json` |
| Cursor | `.cursor-plugin/plugin.json` | `mcp.json` |

Portable entry: `bin/contorium-mcp-launch.cjs`  
MCP tools: `store_memory`, `search_memory`, `get_memory`, `get_workspace_context` — see [docs/MCP.md](docs/MCP.md).

**Codex**

```bash
npm run build:mcp
codex mcp add contorium -- node ./bin/contorium-mcp-launch.cjs
```

Install as plugin: [Codex plugins](https://developers.openai.com/codex/plugins/build); local marketplace example: [`.agents/plugins/marketplace.example.json`](.agents/plugins/marketplace.example.json).

**Claude Code**

```bash
npm run build:mcp
claude --plugin-dir .
# MCP only:
claude mcp add --scope project contorium -- node ./bin/contorium-mcp-launch.cjs
```

**Cursor Agent (MCP)**

Point Cursor MCP to root `mcp.json` (uses `${workspaceFolder}/packages/mcp/dist/server.js`). Requires `npm run build:mcp` so `packages/mcp/dist/server.js` exists.

**Note:** MCP complements the VSIX extension. For sidebar UI and automatic `.contora/state.json` updates, install the extension; use MCP when the agent runs in Codex / Claude Code / Cursor Agent without the sidebar.

⸻

Vision

Contorium is not just a memory plugin.

It is an attempt to build persistent runtime continuity for AI-native software development.