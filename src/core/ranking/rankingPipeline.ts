import type { ProjectState } from '../../types/state';
import type { WorkspaceEvent } from '../models/events';
import type { ModeStrategy } from '../modes/modeStrategy';
import type { RankedPath } from './contextRanker';
import { combinedNormalizedScore, maxScoreBreakdown } from './scoreNormalizer';
import { getPathScoreRaw } from './scoreCalculator';
import { buildTopRankingDebugLines } from './rankingDebugger';

function collectCandidates(
  state: ProjectState,
  events: WorkspaceEvent[],
  shouldIgnore?: (path: string) => boolean,
): string[] {
  const set = new Set<string>();
  const add = (p: string) => {
    if (!shouldIgnore?.(p)) {
      set.add(p);
    }
  };
  for (const p of state.recentFiles ?? []) {
    add(p);
  }
  for (const p of state.openFiles ?? []) {
    add(p);
  }
  for (const p of state.gitStaged ?? []) {
    add(p);
  }
  for (const p of state.gitWorking ?? []) {
    add(p);
  }
  for (const e of events) {
    if (e.type === 'file_focus' || e.type === 'file_save' || e.type === 'file_create' || e.type === 'file_delete') {
      add(e.file);
    } else if (e.type === 'file_rename') {
      add(e.oldFile);
      add(e.newFile);
    }
  }
  return [...set];
}

export interface RankingPipelineResult {
  ranked: RankedPath[];
  /** Human-readable debug lines for top N paths */
  debugExplanations: string[];
}

/**
 * Stable pipeline: candidates → raw per-dimension scores → global max normalization → mode-weighted blend → sort (spec 2.4 addendum).
 */
export function runRankingPipeline(
  state: ProjectState,
  events: WorkspaceEvent[],
  strategy: ModeStrategy,
  shouldIgnore?: (path: string) => boolean,
  debugTop = 4,
): RankingPipelineResult {
  const candidates = collectCandidates(state, events, shouldIgnore);
  const raws = candidates.map((path) => getPathScoreRaw(path, state, events));
  const maxes = maxScoreBreakdown(raws);
  const ranked: RankedPath[] = raws
    .map((raw) => ({
      path: raw.path,
      score: combinedNormalizedScore(raw, maxes, strategy),
    }))
    .sort((a, b) => b.score - a.score);
  return {
    ranked,
    debugExplanations: buildTopRankingDebugLines(raws, strategy, debugTop),
  };
}
