import * as vscode from 'vscode';
import type { ProjectState } from '../../types/state';
import {
  buildPersistedIntentFile,
  evaluateIntentLifecycle,
  applyIntentTaskMismatch,
  isIntentLifecycleUsable,
  parsePersistedIntentFile,
  serializePersistedIntentFile,
  type PersistedIntentFile,
  collectChangedPathsForInvalidation,
  collectRecentEditPathsFromEvents,
} from './memoryLifecycle';
import type { WorkspaceIntentAi } from '../../ai/runtime/intent/intentTypes';
import { getLastIntentJson, setLastIntentJson } from '../../ai/runtime/intent/lastIntentStore';
import type { EventStore } from '../engine/eventStore';
import { topHeuristicActivityKeys } from '../../ui/heuristicOperationalIntent';

export function intentFileUri(folder: vscode.WorkspaceFolder): vscode.Uri {
  return vscode.Uri.joinPath(folder.uri, '.contora', 'last-intent.json');
}

export async function writePersistedIntent(
  folder: vscode.WorkspaceFolder,
  intent: WorkspaceIntentAi,
  relatedFiles: string[],
): Promise<void> {
  const file = buildPersistedIntentFile(intent, relatedFiles);
  const body = serializePersistedIntentFile(file);
  setLastIntentJson(file);
  const dirUri = vscode.Uri.joinPath(folder.uri, '.contora');
  await vscode.workspace.fs.createDirectory(dirUri);
  await vscode.workspace.fs.writeFile(intentFileUri(folder), Buffer.from(body, 'utf8'));
}

export async function readAndEvaluatePersistedIntent(
  folder: vscode.WorkspaceFolder,
  state: ProjectState,
  events?: EventStore,
): Promise<{ file: PersistedIntentFile; usable: boolean } | undefined> {
  let parsed: PersistedIntentFile | undefined;
  try {
    const bytes = await vscode.workspace.fs.readFile(intentFileUri(folder));
    parsed = parsePersistedIntentFile(JSON.parse(Buffer.from(bytes).toString('utf8')));
  } catch {
    const j = getLastIntentJson();
    if (j) {
      try {
        parsed = parsePersistedIntentFile(JSON.parse(j));
      } catch {
        return undefined;
      }
    }
  }
  if (!parsed) {
    return undefined;
  }
  const changed = collectChangedPathsForInvalidation(state);
  const recentEditPaths = events ? collectRecentEditPathsFromEvents(events.getAll()) : [];
  const activityProfileKeys = topHeuristicActivityKeys(state, events, 8);
  let evaluated = applyIntentTaskMismatch(
    evaluateIntentLifecycle(parsed, {
      changedPaths: changed,
      currentTask: state.currentTask ?? '',
      recentEditPaths,
      activityProfileKeys,
    }),
    state.currentTask ?? '',
  );
  const usable = isIntentLifecycleUsable(evaluated.lifecycle);
  const changedLifecycle =
    evaluated.lifecycle.confidence !== parsed.lifecycle.confidence ||
    evaluated.lifecycle.status !== parsed.lifecycle.status ||
    evaluated.lifecycle.semanticHash !== parsed.lifecycle.semanticHash ||
    evaluated.lifecycle.evidence.length !== parsed.lifecycle.evidence.length;
  if (changedLifecycle) {
    try {
      await vscode.workspace.fs.writeFile(
        intentFileUri(folder),
        Buffer.from(serializePersistedIntentFile(evaluated), 'utf8'),
      );
      setLastIntentJson(evaluated);
    } catch {
      /* best-effort persist stale/confidence */
    }
  }
  return { file: evaluated, usable };
}

/** Usable AI intent bullets for export (skipped when stale / low confidence). */
export async function loadUsableIntentFocusLines(
  folder: vscode.WorkspaceFolder,
  state: ProjectState,
  events?: EventStore,
): Promise<string[] | undefined> {
  const evaluated = await readAndEvaluatePersistedIntent(folder, state, events);
  if (!evaluated?.usable) {
    return undefined;
  }
  const goals = intentToGoals(evaluated.file.intent);
  return goals.length ? goals.slice(0, 3) : undefined;
}

export function intentToGoals(intent: WorkspaceIntentAi): string[] {
  const mods = intent.activeModules.filter((x) => x.trim().length > 0).map((s) => s.trim());
  if (mods.length > 0) {
    return mods.slice(0, 12);
  }
  const focus = intent.focus.trim();
  return focus ? [focus] : [];
}
