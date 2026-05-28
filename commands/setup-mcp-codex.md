---
name: setup-mcp-codex
description: Build Contorium and install the Codex plugin with bundled MCP memory tools.
---

# Setup Contorium for Codex

1. From the repository root: `npm run build:mcp` (or `npm run compile`).
2. **Plugin (recommended):** install this repo as a Codex plugin (manifest at `.codex-plugin/plugin.json`, MCP at `.mcp.json`).
3. **MCP only:** `codex mcp add contorium -- node ./bin/contorium-mcp-launch.cjs`
4. Keep the **Contorium VS Code/Cursor extension** for sidebar UI and `.contora/state.json`; Codex MCP tools complement the extension.

Tools: `store_memory`, `search_memory`, `get_memory`, `get_workspace_context`.

See [docs/MCP.md](../docs/MCP.md) and [OpenAI Codex plugins](https://developers.openai.com/codex/plugins/build).
