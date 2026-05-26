import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { mcpMemoryFile } from './paths.js';
function emptyFile() {
    return { version: 1, entries: {} };
}
async function loadFile(workspaceRoot) {
    const fp = mcpMemoryFile(workspaceRoot);
    try {
        const raw = await fs.readFile(fp, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !parsed.entries || typeof parsed.entries !== 'object') {
            return emptyFile();
        }
        return { version: 1, entries: parsed.entries };
    }
    catch {
        return emptyFile();
    }
}
async function saveFile(workspaceRoot, data) {
    const fp = mcpMemoryFile(workspaceRoot);
    await fs.mkdir(path.dirname(fp), { recursive: true });
    await fs.writeFile(fp, JSON.stringify(data, null, 2), 'utf8');
}
export async function storeMemory(workspaceRoot, key, value, type = 'note') {
    const k = key.trim();
    if (!k) {
        throw new Error('key is required');
    }
    const file = await loadFile(workspaceRoot);
    file.entries[k] = {
        value,
        type,
        timestamp: Date.now(),
    };
    await saveFile(workspaceRoot, file);
    return { success: true, key: k };
}
export async function getMemory(workspaceRoot, key) {
    const file = await loadFile(workspaceRoot);
    return file.entries[key.trim()] ?? null;
}
export async function searchMemory(workspaceRoot, query) {
    const q = query.trim().toLowerCase();
    if (!q) {
        return [];
    }
    const file = await loadFile(workspaceRoot);
    const results = [];
    for (const [key, entry] of Object.entries(file.entries)) {
        if (key.toLowerCase().includes(q) || entry.value.toLowerCase().includes(q)) {
            results.push({ key, ...entry });
        }
    }
    return results.sort((a, b) => b.timestamp - a.timestamp).slice(0, 32);
}
