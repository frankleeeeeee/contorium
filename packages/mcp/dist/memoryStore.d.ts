export type MemoryEntryType = 'note' | 'decision' | 'architecture';
export interface MemoryEntry {
    value: string;
    type: MemoryEntryType;
    timestamp: number;
}
export interface MemoryFile {
    version: 1;
    entries: Record<string, MemoryEntry>;
}
export declare function storeMemory(workspaceRoot: string, key: string, value: string, type?: MemoryEntryType): Promise<{
    success: true;
    key: string;
}>;
export declare function getMemory(workspaceRoot: string, key: string): Promise<MemoryEntry | null>;
export declare function searchMemory(workspaceRoot: string, query: string): Promise<Array<{
    key: string;
} & MemoryEntry>>;
