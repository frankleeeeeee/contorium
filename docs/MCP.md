# Contorium MCP (Claude Code + Cursor)

stdio MCP server exposing Contorium memory tools. Works alongside the **VS Code / Cursor extension** (sidebar + scanners); does not replace the extension UI.

## Tools

| Tool | Description |
|------|-------------|
| `store_memory` | Persist key/value memory under `.contora/mcp/memories.json` |
| `search_memory` | Keyword search over MCP memory entries |
| `get_memory` | Fetch one entry by key |
| `get_workspace_context` | Read `.contora/state.json` from the extension (focus, Git, files) |

## Build

```bash
npm run build:mcp
# or
npm run compile
```

Entry: `packages/mcp/dist/server.js`  
CLI bin (after `npm install` in `packages/mcp`): `contorium-mcp`

## Claude Code (plugin)

Official layout uses [`.claude-plugin/plugin.json`](https://code.claude.com/docs/en/plugins) and root [`.mcp.json`](https://code.claude.com/docs/en/mcp). This repo includes both for Claude Code plugin installs.

After `npm run build:mcp`, load locally:

```bash
claude --plugin-dir .
```

Or add MCP only (project scope):

```bash
claude mcp add --scope project contorium -- node ./packages/mcp/dist/server.js
```

Plugin MCP config uses `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PROJECT_DIR}` (see `.mcp.json`).

Environment variables:

- `CONTORIUM_WORKSPACE` — workspace root (default: cwd, or walk up to find `.contora/state.json`)
- `CLAUDE_PROJECT_DIR` — set by Claude Code when spawning MCP (preferred for plugin installs)
- `CLAUDE_PROJECT_ROOT` — alias accepted by some integrations

## Cursor IDE

This repo ships `mcp.json` at the root and references it from `.cursor-plugin/plugin.json` for Marketplace installs. For local development, point Cursor MCP settings to:

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

## VS Code extension

Unchanged: install the **Contorium** VSIX for sidebar, event tracking, and **Copy AI-ready context**. MCP adds agent-callable tools for Claude Code and Cursor Agent without duplicating the UI layer.
