import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const CONTORA_DATA_DIR = '.contora';
const LEGACY_DATA_DIR = '.context-recall';

/** Workspace root for MCP (Claude Code / Cursor spawn cwd or explicit env). */
export function resolveWorkspaceRoot(): string {
  const fromEnv =
    process.env.CONTORIUM_WORKSPACE?.trim() ||
    process.env.CODEX_PROJECT_DIR?.trim() ||
    process.env.CLAUDE_PROJECT_DIR?.trim() ||
    process.env.CLAUDE_PROJECT_ROOT?.trim() ||
    process.env.MCP_WORKSPACE_ROOT?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }
  return process.cwd();
}

export function contoraDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, CONTORA_DATA_DIR);
}

export function mcpMemoryFile(workspaceRoot: string): string {
  return path.join(contoraDir(workspaceRoot), 'mcp', 'memories.json');
}

export async function findWorkspaceRoot(startDir: string): Promise<string> {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 12; i++) {
    const primary = path.join(dir, CONTORA_DATA_DIR, 'state.json');
    const legacy = path.join(dir, LEGACY_DATA_DIR, 'state.json');
    try {
      await fs.access(primary);
      return dir;
    } catch {
      /* continue */
    }
    try {
      await fs.access(legacy);
      return dir;
    } catch {
      /* continue */
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return path.resolve(startDir);
}
