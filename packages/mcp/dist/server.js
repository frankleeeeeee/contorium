#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import path from 'node:path';
import { z } from 'zod';
import { getMemory, searchMemory, storeMemory } from './memoryStore.js';
import { findWorkspaceRoot, resolveWorkspaceRoot } from './paths.js';
import { loadWorkspaceSnapshot } from './workspace.js';
async function workspaceRootForTools() {
    const hint = resolveWorkspaceRoot();
    return findWorkspaceRoot(hint);
}
function textResult(data) {
    return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
}
const server = new McpServer({
    name: 'contorium',
    version: '0.5.4',
});
server.registerTool('store_memory', {
    description: 'Store important coding context into Contorium memory (persisted under .contora/mcp/).',
    inputSchema: z.object({
        key: z.string().min(1).describe('Unique memory key'),
        value: z.string().describe('Memory content'),
        type: z.enum(['note', 'decision', 'architecture']).optional().describe('Memory category'),
    }),
}, async ({ key, value, type }) => {
    const root = await workspaceRootForTools();
    const result = await storeMemory(root, key, value, type ?? 'note');
    return textResult({ ...result, workspaceRoot: root });
});
server.registerTool('search_memory', {
    description: 'Search Contorium MCP memory entries by keyword.',
    inputSchema: z.object({
        query: z.string().min(1).describe('Search text matched against keys and values'),
    }),
}, async ({ query }) => {
    const root = await workspaceRootForTools();
    const results = await searchMemory(root, query);
    return textResult({ workspaceRoot: root, results });
});
server.registerTool('get_memory', {
    description: 'Get a Contorium MCP memory entry by exact key.',
    inputSchema: z.object({
        key: z.string().min(1).describe('Memory key'),
    }),
}, async ({ key }) => {
    const root = await workspaceRootForTools();
    const entry = await getMemory(root, key);
    return textResult({ workspaceRoot: root, key, entry });
});
server.registerTool('get_workspace_context', {
    description: 'Read Contorium workspace snapshot from .contora/state.json (current focus, notes, files, Git) written by the VS Code/Cursor extension.',
    inputSchema: z.object({
        workspaceRoot: z.string().optional().describe('Override workspace root; default auto-detect'),
    }),
}, async ({ workspaceRoot: override }) => {
    const root = override ? path.resolve(override) : await workspaceRootForTools();
    const snapshot = await loadWorkspaceSnapshot(root);
    if (!snapshot) {
        return textResult({
            workspaceRoot: root,
            found: false,
            hint: 'Open the project in VS Code/Cursor with Contorium extension, or create .contora/state.json.',
        });
    }
    return textResult({ workspaceRoot: root, found: true, snapshot });
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[contorium-mcp] ready on stdio');
}
main().catch((err) => {
    console.error('[contorium-mcp] fatal:', err);
    process.exit(1);
});
