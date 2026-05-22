import * as fs from 'fs/promises';
import * as path from 'path';
import { CONTORA_DATA_DIR } from '../constants';

const MEM = 'memory';

/**
 * Write `.Contorium/memory/latest-memory.json` (Contorium on-disk layout).
 */
export async function writeLatestMemoryJson(workspaceRootFsPath: string, payload: unknown): Promise<string> {
  const dir = path.join(workspaceRootFsPath, CONTORA_DATA_DIR, MEM);
  await fs.mkdir(dir, { recursive: true });
  const fp = path.join(dir, 'latest-memory.json');
  await fs.writeFile(fp, JSON.stringify(payload, null, 2), 'utf8');
  return fp;
}
