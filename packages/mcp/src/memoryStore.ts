import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { mcpMemoryFile } from './paths.js';

export type MemoryEntryType = 'note' | 'decision' | 'architecture';

export interface MemoryEntry {
  value: string;
  type: MemoryEntryType;
  timestamp: number;
}

export interface MemoryFile {
  version: 1;
  entries: Record<string, MemoryEntry>;
}

function emptyFile(): MemoryFile {
  return { version: 1, entries: {} };
}

async function loadFile(workspaceRoot: string): Promise<MemoryFile> {
  const fp = mcpMemoryFile(workspaceRoot);
  try {
    const raw = await fs.readFile(fp, 'utf8');
    const parsed = JSON.parse(raw) as Partial<MemoryFile>;
    if (!parsed || typeof parsed !== 'object' || !parsed.entries || typeof parsed.entries !== 'object') {
      return emptyFile();
    }
    return { version: 1, entries: parsed.entries as Record<string, MemoryEntry> };
  } catch {
    return emptyFile();
  }
}

async function saveFile(workspaceRoot: string, data: MemoryFile): Promise<void> {
  const fp = mcpMemoryFile(workspaceRoot);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(data, null, 2), 'utf8');
}

export async function storeMemory(
  workspaceRoot: string,
  key: string,
  value: string,
  type: MemoryEntryType = 'note',
): Promise<{ success: true; key: string }> {
  const k = key.trim();
  if (!k) {
    throw new Error('key is required');
  }
  const file = await loadFile(workspaceRoot);
  file.entries[k] = {
    value,
    type,
    timestamp: Date.now(),
  };
  await saveFile(workspaceRoot, file);
  return { success: true, key: k };
}

export async function getMemory(workspaceRoot: string, key: string): Promise<MemoryEntry | null> {
  const file = await loadFile(workspaceRoot);
  return file.entries[key.trim()] ?? null;
}

export async function searchMemory(
  workspaceRoot: string,
  query: string,
): Promise<Array<{ key: string } & MemoryEntry>> {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [];
  }
  const file = await loadFile(workspaceRoot);
  const results: Array<{ key: string } & MemoryEntry> = [];
  for (const [key, entry] of Object.entries(file.entries)) {
    if (key.toLowerCase().includes(q) || entry.value.toLowerCase().includes(q)) {
      results.push({ key, ...entry });
    }
  }
  return results.sort((a, b) => b.timestamp - a.timestamp).slice(0, 32);
}
