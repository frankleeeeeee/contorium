import type { EventStore } from '../core/engine/eventStore';
import type { ProjectState } from '../types/state';
import type { ActivityAnalysis } from '../core/semantic/activityAnalyzer';
import { filterEngineeringPaths } from '../ui/sidebarPathFilter';
import { buildHeuristicOperationalIntentLines } from '../ui/heuristicOperationalIntent';
import { buildActivityStreamItems } from '../ui/sidebarViewModel';

/** Structured export for JSON format — no raw events / scores / session id (product doc). */
export interface AiReadyJsonExport {
  task: string;
  workspaceFocus: string[];
  activeFiles: string[];
  recentWork: string[];
  projectContext: string;
  notes: string;
  instruction: string;
}

function basenameOf(rel: string): string {
  const parts = rel.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1]! : rel;
}

/** Doc §7: drop junk / low-signal scratch files from AI-facing file list. */
function isLowValueBasename(rel: string): boolean {
  const base = basenameOf(rel);
  const nameNoExt = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base;
  if (/\.(tmp|log|cache)$/i.test(base)) {
    return true;
  }
  if (/^test/i.test(base) || /^temp/i.test(base)) {
    return true;
  }
  if (/^\d+$/.test(nameNoExt) || /^\d{4,}/.test(nameNoExt)) {
    return true;
  }
  return false;
}

function computePathScore(
  path: string,
  analysis: ActivityAnalysis,
  openSet: Set<string>,
  gitSet: Set<string>,
): number {
  const f = analysis.focusByFile[path] ?? 0;
  const s = analysis.saveByFile[path] ?? 0;
  const open = openSet.has(path) ? 1 : 0;
  const git = gitSet.has(path) ? 1 : 0;
  return f * 0.5 + s * 3 + open * 2 + git * 4;
}

/** Doc §8: top 3–5 meaningful paths; display basename only. */
function pickActiveFileBasenames(
  state: ProjectState,
  analysis: ActivityAnalysis,
  shouldIgnore: ((p: string) => boolean) | undefined,
  max: number,
): string[] {
  const openSet = new Set((state.openFiles ?? []).filter((p) => p && !shouldIgnore?.(p)));
  const gitSet = new Set(
    [...(state.gitStaged ?? []), ...(state.gitWorking ?? [])].filter((p) => p && !shouldIgnore?.(p)),
  );
  const paths = new Set<string>();
  for (const p of state.recentFiles ?? []) {
    if (p) paths.add(p.replace(/\\/g, '/'));
  }
  for (const p of state.openFiles ?? []) {
    if (p) paths.add(p.replace(/\\/g, '/'));
  }
  for (const k of Object.keys(analysis.fileActivity)) {
    paths.add(k.replace(/\\/g, '/'));
  }
  const filtered = filterEngineeringPaths([...paths]).filter((p) => !shouldIgnore?.(p));
  const rows = filtered
    .map((p) => {
      const rawAct = analysis.fileActivity[p] ?? 0;
      const score = computePathScore(p, analysis, openSet, gitSet);
      return { p, score, rawAct };
    })
    .filter((x) => !isLowValueBasename(x.p))
    .filter((x) => {
      if (openSet.has(x.p) || gitSet.has(x.p)) {
        return x.score >= 1;
      }
      return x.rawAct >= 3 || x.score >= 3;
    })
    .sort((a, b) => b.score - a.score || a.p.localeCompare(b.p));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const b = basenameOf(r.p);
    if (seen.has(b)) {
      continue;
    }
    seen.add(b);
    out.push(b);
    if (out.length >= max) {
      break;
    }
  }
  return out;
}

/** Doc §11: short human lines (aggregated stream), not raw JSON events. */
function pickRecentWorkLines(eventStore: EventStore | undefined, max: number): string[] {
  if (!eventStore) {
    return [];
  }
  const raw = buildActivityStreamItems(eventStore, Math.max(max * 2, 8));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of raw) {
    if (seen.has(line)) {
      continue;
    }
    seen.add(line);
    out.push(line);
    if (out.length >= max) {
      break;
    }
  }
  return out;
}

function buildProjectContextSentence(
  state: ProjectState,
  focusBullets: string[],
  activeBasenames: string[],
): string {
  const task = (state.currentTask ?? '').trim();
  const primary = activeBasenames[0];
  const topIntent = focusBullets.find((l) => !l.startsWith('Stated focus:'));
  if (task && topIntent) {
    return `This workspace is currently focused on: ${task}. Signals suggest ${topIntent.replace(/\.$/, '')}.`;
  }
  if (task) {
    return `This workspace is currently focused on: ${task}.`;
  }
  if (topIntent && primary) {
    return `Activity centers on ${primary} with emphasis on ${topIntent.replace(/\.$/, '')}.`;
  }
  if (topIntent) {
    return `Current work direction: ${topIntent.replace(/\.$/, '')}.`;
  }
  if (primary) {
    return `Most active file recently: ${primary}.`;
  }
  return 'Workspace activity is light — open or edit files to build richer context.';
}

function workspaceFocusBullets(
  state: ProjectState,
  eventStore: EventStore | undefined,
  confirmedAiGoals?: string[],
): string[] {
  const lines = buildHeuristicOperationalIntentLines(state, eventStore, 8);
  const task = (state.currentTask ?? '').trim();
  const withoutStated = task ? lines.filter((l) => !l.startsWith('Stated focus:')) : lines;
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const g of confirmedAiGoals ?? []) {
    const t = g.trim();
    if (!t || seen.has(t)) {
      continue;
    }
    seen.add(t);
    merged.push(t);
  }
  for (const l of withoutStated) {
    if (seen.has(l)) {
      continue;
    }
    seen.add(l);
    merged.push(l);
  }
  /** Doc §10: top 3 intents for “Workspace focus” in export. */
  return merged.slice(0, 3);
}

export function buildAiReadyJsonExport(args: {
  state: ProjectState;
  eventStore: EventStore | undefined;
  analysis: ActivityAnalysis;
  instruction: string;
  shouldIgnore?: (p: string) => boolean;
  /** High-confidence persisted intent lines; omitted when lifecycle marked stale. */
  confirmedAiIntentGoals?: string[];
}): AiReadyJsonExport {
  const { state, eventStore, analysis, instruction, shouldIgnore, confirmedAiIntentGoals } = args;
  const focus = workspaceFocusBullets(state, eventStore, confirmedAiIntentGoals);
  const active = pickActiveFileBasenames(state, analysis, shouldIgnore, 5);
  const recent = pickRecentWorkLines(eventStore, 5);
  const notes = (state.notes ?? '').trim();
  return {
    task: (state.currentTask ?? '').trim() || '(not set)',
    workspaceFocus: focus.length ? focus : ['(no strong intent signal yet)'],
    activeFiles: active.length ? active : ['(none above threshold)'],
    recentWork: recent.length ? recent : ['(no recent edits in buffer)'],
    projectContext: buildProjectContextSentence(state, focus, active),
    notes: notes || '(none)',
    instruction: instruction.trim() || '(none)',
  };
}

/**
 * Compressed, AI-facing markdown (doc: TASK / WORKSPACE FOCUS / ACTIVE FILES / RECENT WORK / PROJECT CONTEXT / INSTRUCTION).
 * No session id, raw events, ranking scores, or JSON git blobs.
 */
export function buildAiReadyMarkdownExport(args: {
  state: ProjectState;
  eventStore: EventStore | undefined;
  analysis: ActivityAnalysis;
  instruction: string;
  shouldIgnore?: (p: string) => boolean;
  confirmedAiIntentGoals?: string[];
}): string {
  const j = buildAiReadyJsonExport(args);
  const lines: string[] = [];
  lines.push('# TASK');
  lines.push(j.task);
  lines.push('');
  lines.push('# WORKSPACE FOCUS');
  lines.push(j.workspaceFocus.map((s) => `- ${s}`).join('\n'));
  lines.push('');
  lines.push('# ACTIVE FILES');
  lines.push(j.activeFiles.map((s) => `- ${s}`).join('\n'));
  lines.push('');
  lines.push('# RECENT WORK');
  lines.push(j.recentWork.map((s) => `- ${s}`).join('\n'));
  lines.push('');
  lines.push('# PROJECT CONTEXT');
  lines.push(j.projectContext);
  lines.push('');
  if (j.notes !== '(none)') {
    lines.push('# NOTES');
    lines.push(j.notes);
    lines.push('');
  }
  lines.push('# INSTRUCTION');
  lines.push(j.instruction);
  lines.push('');
  return lines.join('\n');
}
