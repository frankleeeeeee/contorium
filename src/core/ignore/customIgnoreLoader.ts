import * as fs from 'fs/promises';
import * as path from 'path';
import { CONTORA_IGNORE_FILE, CONTORA_LEGACY_IGNORE_FILE } from '../../constants';

function parseIgnoreLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

/**
 * Workspace-root ignore files: `.Contoriumignore` (primary) and legacy `.contextrecallignore`.
 * One path substring per line (same semantics as `extraIgnoreSubstrings`); `#` starts a comment.
 */
export async function loadCustomIgnorePatterns(workspaceRootFsPath: string): Promise<string[]> {
  const merged: string[] = [];
  for (const file of [CONTORA_IGNORE_FILE, CONTORA_LEGACY_IGNORE_FILE]) {
    const fp = path.join(workspaceRootFsPath, file);
    try {
      const raw = await fs.readFile(fp, 'utf8');
      merged.push(...parseIgnoreLines(raw));
    } catch {
      /* missing file */
    }
  }
  return merged;
}
