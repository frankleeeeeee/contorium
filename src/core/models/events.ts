/** Immutable workspace events (Context Engine 2.x event stream). */

export type WorkspaceEvent =
  | { type: 'file_focus'; file: string; timestamp: number }
  | { type: 'file_save'; file: string; timestamp: number }
  | { type: 'file_create'; file: string; timestamp: number }
  | { type: 'file_delete'; file: string; timestamp: number }
  | { type: 'file_rename'; oldFile: string; newFile: string; timestamp: number }
  | {
      type: 'git_change';
      modified: string[];
      staged: string[];
      timestamp: number;
    }
  | { type: 'task_update'; task: string; timestamp: number }
  | { type: 'note_update'; note: string; timestamp: number };
