Contorium

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

Quick Install

VS Code / Cursor

Install from VSIX

1. Download the latest .vsix
2. Open Extensions
3. Click:
    * ...
    * Install from VSIX
4. Select the downloaded file

⸻

From Source

git clone https://github.com/ContoriumLabs/contorium.git
cd contorium
npm install
npm run compile

⸻

Quick Usage

1. Set Current Focus

Define what you’re actively building.

Examples:

* Refactor authentication flow
* Fix websocket reconnect issue
* Improve MCP runtime synchronization

⸻

2. Work Normally

Contorium continuously tracks:

* active files
* git activity
* workspace state
* recent changes
* session activity

No manual memory management required.

⸻

3. Continue Across Sessions

Close Cursor.

Reopen tomorrow.

Your AI still understands:

* current focus
* active workspace state
* recent work
* project continuity

⸻

4. Use Across AI Coding Tools

Contorium maintains runtime continuity across:

* Cursor
* VS Code
* Claude Code
* Codex
* MCP-compatible agents

⸻

MCP Integration

Contorium exposes runtime state through MCP-compatible tools.

Compatible with:

* Claude Code
* Codex
* custom MCP runtimes
* agent-based workflows

Example MCP configuration:

{
  "mcpServers": {
    "contorium": {
      "command": "node",
      "args": ["path/to/contorium-mcp/dist/index.js"]
    }
  }
}

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