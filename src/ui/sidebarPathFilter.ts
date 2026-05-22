/**
 * Paths hidden from the Contorium sidebar (Git / working set / recent focus).
 * Plugin data dirs and common build noise — not “user engineering” files.
 */

function normalizeRel(rel: string): string {
  return rel.replace(/\\/g, '/');
}

/** Any segment on the path equals one of these → exclude from sidebar lists. */
const JUNK_PATH_SEGMENTS = new Set(
  [
    'node_modules',
    '.git',
    '.Contorium',
    '.context-recall',
    '.project-recall',
    'dist',
    'coverage',
    'build',
    'out',
    '.next',
    '.nuxt',
    '__pycache__',
    '.turbo',
    '.cache',
    '.venv',
    'venv',
    'target',
  ].map((s) => s.toLowerCase()),
);

export function relativePathIsSidebarNoise(rel: string): boolean {
  const parts = normalizeRel(rel)
    .toLowerCase()
    .split('/')
    .filter((s) => s.length > 0);
  return parts.some((seg) => JUNK_PATH_SEGMENTS.has(seg));
}

export function filterEngineeringPaths(paths: string[]): string[] {
  return paths.filter((p) => typeof p === 'string' && p.length > 0 && !relativePathIsSidebarNoise(p));
}
