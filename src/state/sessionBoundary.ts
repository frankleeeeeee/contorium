import type { ProjectState } from '../types/state';

const MIN_FOCUS_LEN = 6;
const MIN_PATHS_FOR_SHIFT = 2;
/** Below this Jaccard similarity on top paths, treat active file set as “significantly changed”. */
const JACCARD_SHIFT_THRESHOLD = 0.35;
const TOP_PATH_CAP = 12;

export function topWorkspacePathsFromState(state: ProjectState, cap = TOP_PATH_CAP): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [...(state.openFiles ?? []), ...(state.recentFiles ?? [])]) {
    const n = p.replace(/\\/g, '/').trim();
    if (!n || seen.has(n)) {
      continue;
    }
    seen.add(n);
    out.push(n);
    if (out.length >= cap) {
      break;
    }
  }
  return out;
}

function normalizeFocus(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function jaccardSimilarity(a: readonly string[], b: readonly string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) {
    return 1;
  }
  let inter = 0;
  for (const x of A) {
    if (B.has(x)) {
      inter++;
    }
  }
  const uni = A.size + B.size - inter;
  return uni === 0 ? 1 : inter / uni;
}

/**
 * Session shift heuristic (product doc): meaningful Current focus change **and** low overlap of top open/recent paths.
 * Not based on free-text semantics alone; no LLM.
 */
export function detectWorkspaceSessionShift(
  previousFocus: string,
  nextFocus: string,
  previousPaths: readonly string[],
  nextPaths: readonly string[],
): boolean {
  const pf = normalizeFocus(previousFocus);
  const nf = normalizeFocus(nextFocus);
  if (pf.length < MIN_FOCUS_LEN || nf.length < MIN_FOCUS_LEN || pf === nf) {
    return false;
  }
  if (previousPaths.length < MIN_PATHS_FOR_SHIFT || nextPaths.length < MIN_PATHS_FOR_SHIFT) {
    return false;
  }
  const sim = jaccardSimilarity(previousPaths, nextPaths);
  return sim < JACCARD_SHIFT_THRESHOLD;
}
