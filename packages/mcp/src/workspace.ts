import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const CONTORA_DATA_DIR = '.contora';
const LEGACY_DATA_DIR = '.context-recall';

export interface WorkspaceSnapshot {
  workspaceRoot: string;
  currentTask: string;
  notes: string;
  sessionId?: string;
  openFiles: string[];
  recentFiles: string[];
  gitStaged: string[];
  gitWorking: string[];
  lastUpdated: number;
}

async function readStateFile(dir: string, relData: string): Promise<WorkspaceSnapshot | undefined> {
  const fp = path.join(dir, relData, 'state.json');
  try {
    const text = await fs.readFile(fp, 'utf8');
    const o = JSON.parse(text) as Record<string, unknown>;
    if (!o || typeof o !== 'object') {
      return undefined;
    }
    return {
      workspaceRoot: dir,
      sessionId: typeof o.sessionId === 'string' ? o.sessionId : undefined,
      currentTask: typeof o.currentTask === 'string' ? o.currentTask : '',
      notes: typeof o.notes === 'string' ? o.notes : '',
      openFiles: Array.isArray(o.openFiles) ? o.openFiles.filter((x): x is string => typeof x === 'string') : [],
      recentFiles: Array.isArray(o.recentFiles)
        ? o.recentFiles.filter((x): x is string => typeof x === 'string')
        : [],
      gitStaged: Array.isArray(o.gitStaged) ? o.gitStaged.filter((x): x is string => typeof x === 'string') : [],
      gitWorking: Array.isArray(o.gitWorking)
        ? o.gitWorking.filter((x): x is string => typeof x === 'string')
        : [],
      lastUpdated: typeof o.lastUpdated === 'number' ? o.lastUpdated : 0,
    };
  } catch {
    return undefined;
  }
}

export async function loadWorkspaceSnapshot(workspaceRoot: string): Promise<WorkspaceSnapshot | null> {
  const primary = await readStateFile(workspaceRoot, CONTORA_DATA_DIR);
  if (primary) {
    return primary;
  }
  const legacy = await readStateFile(workspaceRoot, LEGACY_DATA_DIR);
  return legacy ?? null;
}
