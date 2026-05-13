import type { ProjectState } from '../../types/state';
import type { WorkspaceEvent } from '../models/events';

/** Behavioral signals (no LLM; aggregated from multiple sources). */
export interface BehavioralSignals {
  focusCount: Record<string, number>;
  saveCount: Record<string, number>;
  /** First two path segments as hotspot key, e.g. src/auth */
  directoryWeights: Record<string, number>;
  totalFocus: number;
  totalSave: number;
  /** Count of distinct directory keys with at least one focus/save signal */
  uniqueTouchedDirs: number;
  /** Max save count on a single file */
  maxSaveSingleFile: number;
  /** Per-path hit counts rolled up from git_change events */
  gitChangePathHits: Record<string, number>;
}

function topTwoSegments(rel: string): string {
  const p = rel.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = p.split('/').filter(Boolean);
  if (parts.length <= 1) {
    return parts[0] ?? p;
  }
  return `${parts[0]}/${parts[1]}`;
}

function bumpDir(map: Record<string, number>, file: string, delta: number, shouldIgnore?: (p: string) => boolean): void {
  if (shouldIgnore?.(file)) {
    return;
  }
  const k = topTwoSegments(file);
  if (shouldIgnore?.(`${k}/`)) {
    return;
  }
  map[k] = (map[k] ?? 0) + delta;
}

/**
 * Collect inference signals from the event stream plus current `ProjectState` (spec 2.4 addenda).
 */
export function collectBehavioralSignals(
  events: WorkspaceEvent[],
  state: ProjectState,
  shouldIgnore?: (p: string) => boolean,
): BehavioralSignals {
  const focusCount: Record<string, number> = {};
  const saveCount: Record<string, number> = {};
  const directoryWeights: Record<string, number> = {};
  const gitChangePathHits: Record<string, number> = {};

  for (const ev of events) {
    if (ev.type === 'file_focus') {
      if (shouldIgnore?.(ev.file)) {
        continue;
      }
      focusCount[ev.file] = (focusCount[ev.file] ?? 0) + 1;
      bumpDir(directoryWeights, ev.file, 1, shouldIgnore);
    } else if (ev.type === 'file_save') {
      if (shouldIgnore?.(ev.file)) {
        continue;
      }
      saveCount[ev.file] = (saveCount[ev.file] ?? 0) + 1;
      bumpDir(directoryWeights, ev.file, 2, shouldIgnore);
    } else if (ev.type === 'file_create') {
      if (shouldIgnore?.(ev.file)) {
        continue;
      }
      focusCount[ev.file] = (focusCount[ev.file] ?? 0) + 1;
      bumpDir(directoryWeights, ev.file, 1, shouldIgnore);
    } else if (ev.type === 'file_delete') {
      if (shouldIgnore?.(ev.file)) {
        continue;
      }
      saveCount[ev.file] = (saveCount[ev.file] ?? 0) + 1;
      bumpDir(directoryWeights, ev.file, 1, shouldIgnore);
    } else if (ev.type === 'file_rename') {
      if (!shouldIgnore?.(ev.oldFile)) {
        saveCount[ev.oldFile] = (saveCount[ev.oldFile] ?? 0) + 1;
        bumpDir(directoryWeights, ev.oldFile, 1, shouldIgnore);
      }
      if (!shouldIgnore?.(ev.newFile)) {
        focusCount[ev.newFile] = (focusCount[ev.newFile] ?? 0) + 1;
        bumpDir(directoryWeights, ev.newFile, 1, shouldIgnore);
      }
    } else if (ev.type === 'git_change') {
      for (const f of ev.modified ?? []) {
        if (shouldIgnore?.(f)) {
          continue;
        }
        gitChangePathHits[f] = (gitChangePathHits[f] ?? 0) + 1;
        bumpDir(directoryWeights, f, 1, shouldIgnore);
      }
      for (const f of ev.staged ?? []) {
        if (shouldIgnore?.(f)) {
          continue;
        }
        gitChangePathHits[f] = (gitChangePathHits[f] ?? 0) + 1;
        bumpDir(directoryWeights, f, 1, shouldIgnore);
      }
    }
  }

  for (const f of state.openFiles ?? []) {
    bumpDir(directoryWeights, f, 1, shouldIgnore);
  }
  for (const f of state.recentFiles ?? []) {
    bumpDir(directoryWeights, f, 1, shouldIgnore);
  }
  for (const f of state.gitStaged ?? []) {
    bumpDir(directoryWeights, f, 2, shouldIgnore);
  }
  for (const f of state.gitWorking ?? []) {
    bumpDir(directoryWeights, f, 1, shouldIgnore);
  }

  let totalFocus = 0;
  let totalSave = 0;
  let maxSaveSingleFile = 0;
  for (const v of Object.values(focusCount)) {
    totalFocus += v;
  }
  for (const v of Object.values(saveCount)) {
    totalSave += v;
    maxSaveSingleFile = Math.max(maxSaveSingleFile, v);
  }

  const uniqueTouchedDirs = Object.keys(directoryWeights).filter((k) => (directoryWeights[k] ?? 0) > 0).length;

  return {
    focusCount,
    saveCount,
    directoryWeights,
    totalFocus,
    totalSave,
    uniqueTouchedDirs,
    maxSaveSingleFile,
    gitChangePathHits,
  };
}
