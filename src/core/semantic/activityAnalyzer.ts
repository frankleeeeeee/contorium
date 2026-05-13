import type { ProjectState } from '../../types/state';
import type { WorkspaceEvent } from '../models/events';

export interface ActivityAnalysis {
  /** file -> count of focus + save */
  fileActivity: Record<string, number>;
  focusByFile: Record<string, number>;
  saveByFile: Record<string, number>;
  /** folder prefix (first segment) -> hits */
  folderHits: Record<string, number>;
}

/**
 * Heuristic activity stats from events + paths (no LLM — local semantic layer per spec 2.2 / 2.3).
 */
export function analyzeActivity(
  events: WorkspaceEvent[],
  state: ProjectState,
  shouldIgnore?: (path: string) => boolean,
): ActivityAnalysis {
  const focusByFile: Record<string, number> = {};
  const saveByFile: Record<string, number> = {};
  const folderHits: Record<string, number> = {};

  const bumpFolder = (file: string) => {
    if (shouldIgnore?.(file)) {
      return;
    }
    const seg = file.split('/')[0];
    if (seg && !shouldIgnore?.(`${seg}/`)) {
      folderHits[seg] = (folderHits[seg] ?? 0) + 1;
    }
  };

  for (const ev of events) {
    if (ev.type === 'file_focus') {
      if (shouldIgnore?.(ev.file)) {
        continue;
      }
      focusByFile[ev.file] = (focusByFile[ev.file] ?? 0) + 1;
      bumpFolder(ev.file);
    } else if (ev.type === 'file_save') {
      if (shouldIgnore?.(ev.file)) {
        continue;
      }
      saveByFile[ev.file] = (saveByFile[ev.file] ?? 0) + 1;
      bumpFolder(ev.file);
    } else if (ev.type === 'file_create') {
      if (shouldIgnore?.(ev.file)) {
        continue;
      }
      focusByFile[ev.file] = (focusByFile[ev.file] ?? 0) + 1;
      bumpFolder(ev.file);
    } else if (ev.type === 'file_delete') {
      if (shouldIgnore?.(ev.file)) {
        continue;
      }
      saveByFile[ev.file] = (saveByFile[ev.file] ?? 0) + 1;
      bumpFolder(ev.file);
    } else if (ev.type === 'file_rename') {
      if (!shouldIgnore?.(ev.oldFile)) {
        saveByFile[ev.oldFile] = (saveByFile[ev.oldFile] ?? 0) + 1;
        bumpFolder(ev.oldFile);
      }
      if (!shouldIgnore?.(ev.newFile)) {
        focusByFile[ev.newFile] = (focusByFile[ev.newFile] ?? 0) + 1;
        bumpFolder(ev.newFile);
      }
    }
  }

  for (const f of state.recentFiles ?? []) {
    if (!shouldIgnore?.(f)) {
      bumpFolder(f);
    }
  }
  for (const f of state.openFiles ?? []) {
    if (!shouldIgnore?.(f)) {
      bumpFolder(f);
    }
  }

  const fileActivity: Record<string, number> = {};
  const keys = new Set([...Object.keys(focusByFile), ...Object.keys(saveByFile)]);
  for (const k of keys) {
    if (shouldIgnore?.(k)) {
      continue;
    }
    fileActivity[k] = (focusByFile[k] ?? 0) + (saveByFile[k] ?? 0);
  }

  return { fileActivity, focusByFile, saveByFile, folderHits };
}
