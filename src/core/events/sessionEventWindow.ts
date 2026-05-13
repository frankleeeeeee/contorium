import type { WorkspaceEvent } from '../models/events';

/** Intent heuristics: drop events older than this (freshness vs yesterday’s work). */
export const SESSION_INTENT_MS = 2 * 60 * 60 * 1000;

/** Cap tail size after time filter (bounded work + memory). */
export const SESSION_INTENT_MAX_EVENTS = 500;

/**
 * Events considered for operational-intent scoring: last 2h, at most 500 newest in that window.
 */
export function sliceEventsForIntentSession(
  all: readonly WorkspaceEvent[],
  now: number = Date.now(),
): WorkspaceEvent[] {
  const cutoff = now - SESSION_INTENT_MS;
  const inWindow = all.filter((e) => e.timestamp >= cutoff);
  return inWindow.length > SESSION_INTENT_MAX_EVENTS
    ? inWindow.slice(-SESSION_INTENT_MAX_EVENTS)
    : inWindow;
}
