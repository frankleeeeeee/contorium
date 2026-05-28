---
name: contorium-workspace-memory
description: Use Contorium workspace memory layers (focus, session events, Git, export) when resuming AI work or avoiding repeated project explanation.
---

# Contorium workspace memory

## When to use

- Starting a new chat or switching models mid-task
- User asks to continue where they left off
- Exporting compact, AI-ready project context
- Detecting session pollution after a task change

## Memory layers

| Layer | Source | Lifetime |
|-------|--------|----------|
| Workspace | `.contora/state.json` (focus, files, Git, notes) | Long |
| Session | in-memory events + optional JSONL per `sessionId` | Short |
| Cognitive | `.contora/last-intent.json` (BYOK intent + lifecycle) | Medium |

## Instructions

1. Prefer **Current focus** (optional) for user intent; never block export if empty.
2. For clipboard handoff, use **Copy AI-ready context** — not raw event dumps.
3. If focus and active files diverge sharply, suggest **Start fresh AI context session**.
4. When AI intent is stale (low confidence), rely on heuristic operational intent from recent edits.
5. Respect ignore rules (`.contoraignore`, `contora.extraIgnoreSubstrings`) when reasoning about ranked files.

## MCP tools (Codex / Claude Code / Cursor Agent)

When the Contorium MCP server is connected (`npm run build:mcp`, see `docs/MCP.md`):

- `get_workspace_context` — read extension snapshot from `.contora/state.json`
- `store_memory` / `search_memory` / `get_memory` — agent-persisted notes under `.contora/mcp/memories.json`

Use MCP for agent-driven recall; use extension commands for sidebar UI and clipboard export.

- `contora.exportAIContext` — copy AI-ready context
- `contora.startFreshAiSession` — reset session activity + intent pool
- `contora.analyzeWorkspaceIntent` — BYOK intent snapshot
- `contora.saveStateNow` / `contora.restoreSession` — persist or restore editors
