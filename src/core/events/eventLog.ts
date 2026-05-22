import * as fs from 'fs/promises';
import * as path from 'path';
import { CONTORA_DATA_DIR, CONTORA_LEGACY_DATA_DIR } from '../../constants';
import type { WorkspaceEvent } from '../models/events';
import { parseEventLine, serializeEventLine } from './eventSerializer';

const EVENTS_DIR = 'events';

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function safeSessionFileName(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'session';
}

export function eventLogPathForSession(workspaceRootFsPath: string, sessionId: string): string {
  const safe = safeSessionFileName(sessionId);
  return path.join(workspaceRootFsPath, CONTORA_DATA_DIR, EVENTS_DIR, `${safe}.jsonl`);
}

function parseEventsFromRaw(raw: string): WorkspaceEvent[] {
  const out: WorkspaceEvent[] = [];
  for (const line of raw.split('\n')) {
    const ev = parseEventLine(line);
    if (ev) {
      out.push(ev);
    }
  }
  return out;
}

export async function appendEventJsonl(
  workspaceRootFsPath: string,
  sessionId: string,
  event: WorkspaceEvent,
): Promise<void> {
  const dir = path.join(workspaceRootFsPath, CONTORA_DATA_DIR, EVENTS_DIR);
  await ensureDir(dir);
  const file = path.join(dir, `${safeSessionFileName(sessionId)}.jsonl`);
  await fs.appendFile(file, serializeEventLine(event), 'utf8');
}

/**
 * Event log API: read session, tail stream, replay from JSONL on disk (Contorium; legacy path fallback).
 */
export class EventLog {
  static async readSessionEvents(workspaceRootFsPath: string, sessionId: string): Promise<WorkspaceEvent[]> {
    const safe = safeSessionFileName(sessionId);
    const primary = path.join(workspaceRootFsPath, CONTORA_DATA_DIR, EVENTS_DIR, `${safe}.jsonl`);
    try {
      const raw = await fs.readFile(primary, 'utf8');
      return parseEventsFromRaw(raw);
    } catch {
      /* primary missing */
    }
    const legacy = path.join(workspaceRootFsPath, CONTORA_LEGACY_DATA_DIR, EVENTS_DIR, `${safe}.jsonl`);
    try {
      const raw = await fs.readFile(legacy, 'utf8');
      return parseEventsFromRaw(raw);
    } catch {
      return [];
    }
  }

  static async streamRecent(
    workspaceRootFsPath: string,
    sessionId: string,
    limit: number,
  ): Promise<WorkspaceEvent[]> {
    const all = await EventLog.readSessionEvents(workspaceRootFsPath, sessionId);
    if (limit <= 0) {
      return [];
    }
    return all.slice(-limit);
  }

  static replay(workspaceRootFsPath: string, sessionId: string): Promise<WorkspaceEvent[]> {
    return EventLog.readSessionEvents(workspaceRootFsPath, sessionId);
  }
}
