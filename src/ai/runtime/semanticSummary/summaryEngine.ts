import { buildSemanticSummaryPromptPair, enrichPromptForProvider } from '../../../runtime';
import type { WorkspaceEvent } from '../../../core/models/events';
import type { WorkspaceMemory } from '../../../core/models/workspaceMemory';
import { ProviderManager } from '../../providers/providerManager';
import { getCachedSemanticSummary, setCachedSemanticSummary } from './summaryCache';

function recentActivityLines(events: WorkspaceEvent[]): string[] {
  return events.slice(-40).map((e) => {
    if (e.type === 'file_focus') {
      return `focus ${e.file}`;
    }
    if (e.type === 'file_save') {
      return `save ${e.file}`;
    }
    if (e.type === 'file_create') {
      return `create ${e.file}`;
    }
    if (e.type === 'file_delete') {
      return `delete ${e.file}`;
    }
    if (e.type === 'file_rename') {
      return `rename ${e.oldFile} -> ${e.newFile}`;
    }
    if (e.type === 'git_change') {
      return `git staged:${e.staged.length} modified:${e.modified.length}`;
    }
    if (e.type === 'task_update') {
      return `task: ${e.task.slice(0, 120)}`;
    }
    if (e.type === 'note_update') {
      return `note: ${e.note.slice(0, 120)}`;
    }
    return 'event';
  });
}

function cacheKey(memory: WorkspaceMemory, heuristic: string): string {
  const tail = `${memory.sessionId}|${memory.task.length}|${heuristic.length}|${(memory.priorityFiles ?? []).map((p) => p.path).join(',')}`;
  return tail.slice(0, 512);
}

/**
 * Phase 3: optional cloud LLM semantic summary on top of local heuristics.
 * Triggered manually via command (not on every event) to control cost.
 */
export async function runCloudSemanticSummary(
  memory: WorkspaceMemory,
  heuristicMarkdown: string,
  providers: ProviderManager,
): Promise<string> {
  const key = cacheKey(memory, heuristicMarkdown);
  const hit = getCachedSemanticSummary(key);
  if (hit) {
    return hit;
  }
  const priorityLines = (memory.priorityFiles ?? [])
    .slice(0, 24)
    .map((p) => `${p.path} (score ${p.score.toFixed(1)})`);
  const pair = buildSemanticSummaryPromptPair({
    task: memory.task ?? '',
    notes: memory.notes ?? '',
    priorityLines,
    gitStaged: memory.gitState.staged,
    gitModified: memory.gitState.modified,
    heuristicBlock: heuristicMarkdown,
    recentActivityLines: recentActivityLines(memory.recentEvents),
  });
  const enriched = enrichPromptForProvider('semantic', pair);
  const text = await providers.completeChat([
    { role: 'system', content: enriched.system },
    { role: 'user', content: enriched.user },
  ]);
  setCachedSemanticSummary(key, text);
  return text;
}
