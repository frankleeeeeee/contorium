import type { WorkspaceEvent } from '../models/events';

/** Ring buffer for session-scoped events (2.1 EventStore.getLast). */
export class EventStore {
  private events: WorkspaceEvent[] = [];

  constructor(
    private readonly maxEvents: number,
    private readonly onAppend?: (event: WorkspaceEvent) => void,
  ) {}

  add(event: WorkspaceEvent): void {
    this.events.push(event);
    const overflow = this.events.length - this.maxEvents;
    if (overflow > 0) {
      this.events.splice(0, overflow);
    }
    this.onAppend?.(event);
  }

  getAll(): WorkspaceEvent[] {
    return [...this.events];
  }

  getLast(n: number): WorkspaceEvent[] {
    if (n <= 0) {
      return [];
    }
    return this.events.slice(-n);
  }

  mergeFromDisk(events: WorkspaceEvent[]): void {
    const key = (e: WorkspaceEvent): string => {
      switch (e.type) {
        case 'file_focus':
        case 'file_save':
        case 'file_create':
        case 'file_delete':
          return `${e.type}|${e.timestamp}|${e.file}`;
        case 'file_rename':
          return `${e.type}|${e.timestamp}|${e.oldFile}|${e.newFile}`;
        case 'git_change':
          return `${e.type}|${e.timestamp}|${e.staged.join(',')}|${e.modified.join(',')}`;
        case 'task_update':
          return `${e.type}|${e.timestamp}|${e.task}`;
        case 'note_update':
          return `${e.type}|${e.timestamp}|${e.note}`;
      }
    };
    const map = new Map<string, WorkspaceEvent>();
    for (const e of events) {
      map.set(key(e), e);
    }
    for (const e of this.events) {
      map.set(key(e), e);
    }
    const merged = [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
    const overflow = merged.length - this.maxEvents;
    this.events = overflow > 0 ? merged.slice(overflow) : merged;
  }

  clear(): void {
    this.events = [];
  }
}
