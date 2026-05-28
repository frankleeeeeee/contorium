---
name: setup-mcp-claude-code
description: Build and register the Contorium MCP server for Claude Code or Cursor Agent.
---

# Setup Contorium MCP

1. From the repository root, run `npm run build:mcp` (installs MCP deps + compiles; or `npm run compile` for full build).
2. **Claude Code:** `claude mcp add contorium -- node ./bin/contorium-mcp-launch.cjs`
3. **Cursor:** enable MCP server `contorium` using root `mcp.json` (see `docs/MCP.md`).
4. Keep the **Contorium VS Code extension** installed for sidebar UI and `.contora/state.json` updates; MCP tools complement the extension.

Available tools: `store_memory`, `search_memory`, `get_memory`, `get_workspace_context`.
