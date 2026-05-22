import type { ContextPayloadV2 } from '../schema/contextPayloadV2';
import { estimateTokens } from './tokenEstimator';

/**
 * Trim long text to roughly `budget` tokens (drop lines from the end; keep leading structure).
 */
export function trimStringToTokenBudget(text: string, budget: number): string {
  if (budget <= 0 || estimateTokens(text) <= budget) {
    return text;
  }
  const lines = text.split('\n');
  let lo = 0;
  let hi = lines.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const candidate = lines.slice(0, mid).join('\n');
    if (estimateTokens(candidate) <= budget) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  if (lo <= 0) {
    return text.slice(0, Math.max(0, budget * 4 - 80)) + '\n…';
  }
  return (
    lines.slice(0, lo).join('\n') +
    `\n\n<!-- Contorium: trimmed to ~${budget} tokens (context budget) -->`
  );
}

/** JSON export: shrink recentEvents, priorityFiles, and summary when over budget. */
export function trimContextPayloadForBudget(payload: ContextPayloadV2, budget: number): ContextPayloadV2 {
  let p: ContextPayloadV2 = {
    ...payload,
    recentEvents: [...payload.recentEvents],
    priorityFiles: [...payload.priorityFiles],
    semanticContext: {
      topFolders: [...payload.semanticContext.topFolders],
      fileActivityTop: [...payload.semanticContext.fileActivityTop],
    },
  };
  let guard = 0;
  while (estimateTokens(JSON.stringify(p)) > budget && guard < 48) {
    guard++;
    if (p.recentEvents.length > 8) {
      p = { ...p, recentEvents: p.recentEvents.slice(Math.floor(p.recentEvents.length * 0.55)) };
      continue;
    }
    if (p.priorityFiles.length > 4) {
      p = { ...p, priorityFiles: p.priorityFiles.slice(0, Math.max(4, Math.floor(p.priorityFiles.length * 0.7))) };
      continue;
    }
    if (p.semanticContext.fileActivityTop.length > 6) {
      p = {
        ...p,
        semanticContext: {
          ...p.semanticContext,
          fileActivityTop: p.semanticContext.fileActivityTop.slice(0, 6),
        },
      };
      continue;
    }
    const sm = p.summary.semanticMarkdown;
    if (sm.length > 120) {
      p = { ...p, summary: { semanticMarkdown: sm.slice(0, Math.floor(sm.length * 0.75)) } };
      continue;
    }
    if (p.quality?.warnings?.length) {
      p = { ...p, quality: { ...p.quality, warnings: p.quality.warnings.slice(0, Math.max(0, p.quality.warnings.length - 3)) } };
      continue;
    }
    break;
  }
  return p;
}
