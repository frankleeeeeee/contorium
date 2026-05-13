import type { WorkspaceFolder } from 'vscode';
import {
  allocate,
  analyzeActivity,
  buildSemanticSummaryBlock,
  countDuplicatePaths,
  getModeStrategy,
  listIgnoredPathIssues,
  rankContextFilesWithDebug,
  analyzeContextQuality,
  estimateTokens,
} from '../core';
import type { AIMode } from '../core/context/modeEngine';
import { ModeEngine } from '../core/context/modeEngine';
import type { EventStore } from '../core/engine/eventStore';
import { MemoryBuilder } from '../core/engine/memoryBuilder';
import type { WorkspaceMemory } from '../core/models/workspaceMemory';
import type { StateManager } from '../state/stateManager';

export interface WorkspaceMemorySnapshot {
  memory: WorkspaceMemory;
  mode: AIMode;
  heuristicSemanticMarkdown: string;
  qualityScore: number;
  qualityWarnings: string[];
}

export interface BuildSnapshotOptions {
  folder: WorkspaceFolder;
  stateManager: StateManager;
  eventStore: EventStore;
  memoryBuilder: MemoryBuilder;
  modeEngine: ModeEngine;
  defaultModeRaw: string | undefined;
  eventsInPromptCount: number;
  exportTokenBudget: number;
  maxPriorityFilesCap: (strategyMax: number) => number;
  shouldIgnore: (path: string) => boolean;
}

/**
 * Shared path ranking + memory assembly for export / AI runtime (Phase 3).
 */
export async function buildWorkspaceMemorySnapshot(
  opts: BuildSnapshotOptions,
): Promise<WorkspaceMemorySnapshot | undefined> {
  const state = await opts.stateManager.load(opts.folder);
  const sessionId = state.sessionId ?? 'unknown';
  const mode = opts.modeEngine.normalizeMode(opts.defaultModeRaw);
  const evAll = opts.eventStore.getAll();
  const evRank = evAll.length > 500 ? evAll.slice(-500) : evAll;
  const strategy = getModeStrategy(mode);
  const ig = opts.shouldIgnore;
  const pipe = rankContextFilesWithDebug(state, evRank, strategy, ig, 3);
  let ranked = pipe.ranked;
  const analysis = analyzeActivity(evRank, state, ig);
  const sumBlock = buildSemanticSummaryBlock(analysis, state, 8, evRank, ig, {
    rankingDebug: pipe.debugExplanations,
  });
  const semanticMd = sumBlock.markdown;
  const budget = opts.exportTokenBudget;
  let rankedForTop = ranked;
  if (budget > 0) {
    rankedForTop = allocate(ranked, budget, { semanticMarkdown: semanticMd, graphMarkdown: '' }).priorityItems;
  }
  const take = opts.maxPriorityFilesCap(strategy.maxPriorityFiles);
  const priorityTop = rankedForTop.slice(0, take);
  const recent = opts.eventStore.getLast(opts.eventsInPromptCount);
  const memory = opts.memoryBuilder.build(state, recent, sessionId);
  memory.workingFiles = memory.workingFiles.filter((f) => !ig(f));
  memory.openFiles = memory.openFiles.filter((f) => !ig(f));
  memory.gitState.staged = memory.gitState.staged.filter((f) => !ig(f));
  memory.gitState.modified = memory.gitState.modified.filter((f) => !ig(f));
  memory.recentEvents = memory.recentEvents.filter((e) => {
    if (e.type === 'file_focus' || e.type === 'file_save' || e.type === 'file_create' || e.type === 'file_delete') {
      return !ig(e.file);
    }
    if (e.type === 'file_rename') {
      return !ig(e.oldFile) && !ig(e.newFile);
    }
    return true;
  });
  memory.priorityFiles = priorityTop;
  memory.semanticSummary = semanticMd;
  const baseQ = analyzeContextQuality({
    estimatedSemanticTokens: estimateTokens(semanticMd),
    exportTokenBudget: budget,
    priorityPathCount: priorityTop.length,
    duplicatePathCount: countDuplicatePaths([
      ...priorityTop.map((p) => p.path),
      ...state.openFiles,
      ...state.recentFiles.slice(0, 24),
    ]),
    eventCount: evRank.length,
    lowSignalRatio:
      evRank.length > 0
        ? 1 - Math.min(1, Object.keys(analysis.fileActivity).length / evRank.length)
        : 0,
  });
  const quality = {
    score: baseQ.score,
    warnings: [...baseQ.warnings, ...listIgnoredPathIssues(priorityTop.map((p) => p.path), ig)],
  };
  return {
    memory,
    mode,
    heuristicSemanticMarkdown: semanticMd,
    qualityScore: quality.score,
    qualityWarnings: quality.warnings,
  };
}
