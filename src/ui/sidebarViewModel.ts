import type { EventStore } from '../core/engine/eventStore';
import type { WorkspaceEvent } from '../core/models/events';
import type { ProjectState } from '../types/state';
import { buildHeuristicOperationalIntentLines } from './heuristicOperationalIntent';
import { filterEngineeringPaths } from './sidebarPathFilter';

export interface SidebarSummary {
  activeFilesLine: string;
  gitLine: string;
  activityLine: string;
}

/** BYOK / Phase 3 — surfaced in sidebar (keys only as present/missing, never values). */
export interface SidebarByokPanelState {
  aiProvider: 'off' | 'openai' | 'anthropic' | 'google' | 'deepseek';
  keyOpenAI: boolean;
  keyAnthropic: boolean;
  keyGoogle: boolean;
  keyDeepseek: boolean;
  activeModelId: string;
  exportFormat: string;
  exportTokenBudget: number;
  appendAiOnExport: boolean;
  defaultAIMode: string;
  /** True when a provider is selected but its SecretStorage key is missing. */
  needsActiveProviderKey: boolean;
}

/** Last workspace intent (AI); merged into webview state in `ContoraSidebarProvider`. */
export interface SidebarAiIntentPanel {
  /** Bullet lines: `activeModules` from intent JSON, or `focus` when modules empty. */
  goals: string[];
  intentMode?: string;
  /** File mtime of `.contora/last-intent.json`, or `Date.now()` when read from memory only. */
  updatedAt?: number;
}

/** Shape sent to the sidebar webview (paths pre-filtered). Workspace fields only — BYOK is sent as sibling `byok` on the message. */
export interface SidebarWebviewState {
  currentTask: string;
  notes: string;
  recentFiles: string[];
  /** Same length as `recentFiles`: short phrase for last focus/save signal (e.g. `active now`). */
  recentFileActivitySuffixes: string[];
  gitStaged: string[];
  gitWorking: string[];
  summary: SidebarSummary;
  extensionVersion: string;
  /** Heuristic operational intent lines (score pool, no LLM); shown when `aiIntent.goals` is empty. */
  activityObservedGoals: string[];
  /** Newest-first human lines from the event store (Recent activity / event stream in product doc). */
  activityStreamItems: string[];
  /** Optional; populated by sidebar host when loading `.contora/last-intent.json`. */
  aiIntent?: SidebarAiIntentPanel;
}

function topActivityFolder(paths: string[]): string {
  if (paths.length === 0) {
    return '—';
  }
  const counts = new Map<string, number>();
  for (const p of paths) {
    const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
    if (parts.length === 0) {
      continue;
    }
    const key = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = '';
  let bestN = 0;
  for (const [k, v] of counts) {
    if (v > bestN) {
      best = k;
      bestN = v;
    }
  }
  return best || paths[0];
}

function basenameForSidebar(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1]! : filePath;
}

/** Collapse consecutive identical lines (newest-first scan yields repeated focus/save bursts). */
export function dedupeConsecutiveStrings(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (!line) {
      continue;
    }
    if (out.length > 0 && out[out.length - 1] === line) {
      continue;
    }
    out.push(line);
  }
  return out;
}

function dedupeConsecutivePathsWithSuffixes(
  paths: readonly string[],
  suffixes: readonly string[],
): { paths: string[]; suffixes: string[] } {
  const outP: string[] = [];
  const outS: string[] = [];
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i]!;
    if (outP.length > 0 && outP[outP.length - 1] === p) {
      continue;
    }
    outP.push(p);
    outS.push(suffixes[i] ?? '');
  }
  return { paths: outP, suffixes: outS };
}

/** One-line labels for the sidebar “Recent activity” feed (doc §4 event stream). */
export function formatActivityStreamLine(ev: WorkspaceEvent): string | null {
  switch (ev.type) {
    case 'file_save':
      return `Edited ${basenameForSidebar(ev.file)}`;
    case 'file_focus': {
      const name = basenameForSidebar(ev.file);
      return `Working in ${name}`;
    }
    case 'file_create':
      return `Created ${basenameForSidebar(ev.file)}`;
    case 'file_delete':
      return `Deleted ${basenameForSidebar(ev.file)}`;
    case 'file_rename':
      return `Renamed ${basenameForSidebar(ev.oldFile)} → ${basenameForSidebar(ev.newFile)}`;
    case 'git_change': {
      const n = (ev.modified?.length ?? 0) + (ev.staged?.length ?? 0);
      return `Git activity · ${n} path${n === 1 ? '' : 's'}`;
    }
    case 'task_update':
      return 'Task updated';
    case 'note_update':
      return 'Notes updated';
    default:
      return null;
  }
}

/**
 * Newest-first event stream lines for the sidebar (doc: recent activity, ~8 items).
 */
export function buildActivityStreamItems(events: EventStore | undefined, maxItems: number): string[] {
  const cap = Math.max(1, Math.min(12, maxItems));
  if (!events) {
    return [];
  }
  const all = events.getAll();
  if (all.length === 0) {
    return [];
  }
  const out: string[] = [];
  for (let i = all.length - 1; i >= 0 && out.length < cap; i--) {
    const line = formatActivityStreamLine(all[i]!);
    if (!line) {
      continue;
    }
    if (out.length > 0 && out[out.length - 1] === line) {
      continue;
    }
    out.push(line);
  }
  return out;
}

function lastEventLabel(ev: WorkspaceEvent | undefined): string {
  if (!ev) {
    return '';
  }
  if (ev.type === 'file_focus') {
    return `Working in ${ev.file}`;
  }
  if (ev.type === 'file_save') {
    return `Saved · ${ev.file}`;
  }
  if (ev.type === 'file_create') {
    return `Created · ${ev.file}`;
  }
  if (ev.type === 'file_delete') {
    return `Deleted · ${ev.file}`;
  }
  if (ev.type === 'file_rename') {
    return `Renamed · ${ev.oldFile} → ${ev.newFile}`;
  }
  if (ev.type === 'git_change') {
    const n = (ev.modified?.length ?? 0) + (ev.staged?.length ?? 0);
    return `Git activity · ${n} paths`;
  }
  if (ev.type === 'task_update') {
    return 'Task updated';
  }
  if (ev.type === 'note_update') {
    return 'Notes updated';
  }
  return 'Workspace signal';
}

/** Latest focus/save timestamp per path (scan oldest → newest). */
function buildLastFileActivityMap(events: readonly WorkspaceEvent[]): Map<string, number> {
  const lastBy = new Map<string, number>();
  for (const ev of events) {
    if (ev.type === 'file_focus' || ev.type === 'file_save' || ev.type === 'file_create') {
      const t = lastBy.get(ev.file);
      if (t === undefined || ev.timestamp >= t) {
        lastBy.set(ev.file, ev.timestamp);
      }
    } else if (ev.type === 'file_rename') {
      for (const p of [ev.newFile, ev.oldFile]) {
        const t = lastBy.get(p);
        if (t === undefined || ev.timestamp >= t) {
          lastBy.set(p, ev.timestamp);
        }
      }
    }
  }
  return lastBy;
}

/** One short suffix per path for the recent-files list (same order as `paths`). */
export function buildRecentFileActivitySuffixes(
  paths: readonly string[],
  events: EventStore | undefined,
): string[] {
  const all = events?.getAll() ?? [];
  const lastBy = buildLastFileActivityMap(all);
  const now = Date.now();
  return paths.map((p) => {
    const ts = lastBy.get(p);
    if (ts === undefined) {
      return 'observing';
    }
    const secs = Math.max(0, (now - ts) / 1000);
    if (secs < 45) {
      return 'active now';
    }
    if (secs < 3600) {
      return `edited ${Math.floor(secs / 60)}m ago`;
    }
    if (secs < 86_400) {
      return `edited ${Math.floor(secs / 3600)}h ago`;
    }
    return `edited ${Math.floor(secs / 86_400)}d ago`;
  });
}

function buildSummary(
  recent: string[],
  staged: string[],
  working: string[],
  events: EventStore | undefined,
  activityStreamShown: boolean,
): SidebarSummary {
  const uniq = new Set<string>([...recent, ...staged, ...working]);
  const n = uniq.size;
  const top = topActivityFolder([...uniq]);
  const activeFilesLine =
    n === 0
      ? 'Tracking 0 paths in the working set — open or save files to populate'
      : `Tracking ${n} paths · hotspot ${top}`;

  const st = staged.length;
  const wk = working.length;
  const total = st + wk;
  const gitLine =
    st === 0 && wk === 0
      ? 'Git activity synced · no modified files in the working tree'
      : `Git activity synced · ${total} modified file${total === 1 ? '' : 's'} (${st} staged · ${wk} unstaged)`;

  let activityLine = 'Activity stream not loaded yet';
  if (events) {
    const ev = events.getAll();
    const nEv = ev.length;
    if (nEv === 0) {
      activityLine = 'Recent activity · waiting for edit, save, or Git signals';
    } else if (activityStreamShown) {
      activityLine = `Recent activity · ${nEv} event${nEv === 1 ? '' : 's'} · list below`;
    } else {
      const lastEv = ev[nEv - 1] as WorkspaceEvent | undefined;
      const last = lastEv?.timestamp ?? Date.now();
      const mins = Math.max(0, Math.round((Date.now() - last) / 60_000));
      const tail = lastEventLabel(lastEv);
      const tailPart = tail ? ` · ${tail}` : '';
      activityLine =
        mins === 0
          ? `Recent activity · ${nEv} events buffered${tailPart}`
          : `Recent activity · last signal ~${mins} min ago · ${nEv} events buffered${tailPart}`;
    }
  }

  return { activeFilesLine, gitLine, activityLine };
}

export function buildSidebarWebviewState(
  state: ProjectState,
  events: EventStore | undefined,
  extensionVersion: string,
): SidebarWebviewState {
  let recentFiles = filterEngineeringPaths(state.recentFiles ?? []);
  let recentFileActivitySuffixes = buildRecentFileActivitySuffixes(recentFiles, events);
  const zRecent = dedupeConsecutivePathsWithSuffixes(recentFiles, recentFileActivitySuffixes);
  recentFiles = zRecent.paths;
  recentFileActivitySuffixes = zRecent.suffixes;
  const gitStaged = dedupeConsecutiveStrings(filterEngineeringPaths(state.gitStaged ?? []));
  const gitWorking = dedupeConsecutiveStrings(filterEngineeringPaths(state.gitWorking ?? []));
  const activityObservedGoals = dedupeConsecutiveStrings(buildHeuristicOperationalIntentLines(state, events, 20));
  const activityStreamItems = buildActivityStreamItems(events, 8);
  const activityStreamShown = activityStreamItems.length > 0;
  return {
    currentTask: state.currentTask ?? '',
    notes: state.notes ?? '',
    recentFiles,
    recentFileActivitySuffixes,
    gitStaged,
    gitWorking,
    summary: buildSummary(recentFiles, gitStaged, gitWorking, events, activityStreamShown),
    extensionVersion,
    activityObservedGoals,
    activityStreamItems,
  };
}
