export interface WorkspaceSnapshot {
    workspaceRoot: string;
    currentTask: string;
    notes: string;
    sessionId?: string;
    openFiles: string[];
    recentFiles: string[];
    gitStaged: string[];
    gitWorking: string[];
    lastUpdated: number;
}
export declare function loadWorkspaceSnapshot(workspaceRoot: string): Promise<WorkspaceSnapshot | null>;
