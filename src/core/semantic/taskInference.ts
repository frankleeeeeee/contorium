import type { ProjectState } from '../../types/state';
import type { WorkspaceEvent } from '../models/events';
import type { ActivityAnalysis } from './activityAnalyzer';
import { detectDevelopmentPatternLabel } from './patternDetector';
import { collectBehavioralSignals } from './signalCollector';
import type { BehaviorIntelligence } from './intentEngine';

/** Coarse development pattern from events (no LLM). With `state` + `analysis`, uses multi-signal `patternDetector`. */
export function inferDevelopmentPattern(
  events: WorkspaceEvent[],
  state?: ProjectState,
  analysis?: ActivityAnalysis,
): string {
  if (state && analysis) {
    const signals = collectBehavioralSignals(events, state);
    return detectDevelopmentPatternLabel(signals, state, analysis);
  }
  let saves = 0;
  let focuses = 0;
  for (const e of events) {
    if (e.type === 'file_save' || e.type === 'file_delete') {
      saves++;
    }
    if (e.type === 'file_focus' || e.type === 'file_create') {
      focuses++;
    }
    if (e.type === 'file_rename') {
      saves++;
      focuses++;
    }
  }
  if (saves > focuses * 2 && saves >= 4) {
    return 'Save-heavy editing (likely iterative fixes or debugging)';
  }
  if (focuses > saves * 3 && focuses >= 8) {
    return 'Navigation-heavy exploration (many files opened / switched)';
  }
  if (saves === 0 && focuses === 0) {
    return 'Low local editor signal in the current event buffer';
  }
  return 'Mixed navigation and save activity';
}

/**
 * One-line “goal”: prefer user task text; else semantic intent + top file hints.
 */
export function inferLikelyGoalLine(
  task: string,
  topFiles: string[],
  intel?: Pick<BehaviorIntelligence, 'workspaceIntentLine'>,
): string {
  const t = task?.trim();
  if (t) {
    return t;
  }
  if (intel?.workspaceIntentLine) {
    return intel.workspaceIntentLine;
  }
  if (topFiles.length) {
    return `Unclear from task field; strongest file signals: ${topFiles.slice(0, 3).join(', ')}`;
  }
  return 'No explicit task and few file signals';
}
