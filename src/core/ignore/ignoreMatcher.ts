import { loadCustomIgnorePatterns } from './customIgnoreLoader';
import { DEFAULT_IGNORE_SUBSTRINGS } from './defaultIgnoreRules';

function normalizeRel(rel: string): string {
  return rel.replace(/\\/g, '/').trim();
}

export function matchesDefaultIgnore(rel: string): boolean {
  const p = normalizeRel(rel).toLowerCase();
  for (const sub of DEFAULT_IGNORE_SUBSTRINGS) {
    if (p.includes(sub.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/** User extra rules: substring match (no glob parsing; avoids micromatch dependency). */
export function matchesUserIgnoreSubstrings(rel: string, userPatterns: readonly string[]): boolean {
  const p = normalizeRel(rel).toLowerCase();
  for (const raw of userPatterns) {
    const t = raw.trim().toLowerCase();
    if (t.length === 0) {
      continue;
    }
    if (p.includes(t)) {
      return true;
    }
  }
  return false;
}

export function shouldIgnoreWorkspacePath(
  rel: string,
  useDefaultRules: boolean,
  userPatterns: readonly string[],
): boolean {
  if (useDefaultRules && matchesDefaultIgnore(rel)) {
    return true;
  }
  return matchesUserIgnoreSubstrings(rel, userPatterns);
}

/** Combines default rules, settings substrings, and `.Contoriumignore` (plus legacy `.contextrecallignore`). */
export class IgnoreMatcher {
  private filePatterns: string[] = [];

  private constructor(
    private useDefaultRules: boolean,
    private configExtra: readonly string[],
    filePatterns: readonly string[],
  ) {
    this.filePatterns = [...filePatterns];
  }

  static async forWorkspaceRoot(
    workspaceRootFsPath: string,
    useDefaultRules: boolean,
    configExtra: readonly string[],
  ): Promise<IgnoreMatcher> {
    const file = await loadCustomIgnorePatterns(workspaceRootFsPath);
    return new IgnoreMatcher(useDefaultRules, configExtra, file);
  }

  updateSettings(useDefaultRules: boolean, configExtra: readonly string[]): void {
    this.useDefaultRules = useDefaultRules;
    this.configExtra = configExtra;
  }

  async reloadWorkspaceFile(workspaceRootFsPath: string): Promise<void> {
    this.filePatterns = await loadCustomIgnorePatterns(workspaceRootFsPath);
  }

  shouldIgnore(rel: string): boolean {
    const user = [...this.configExtra, ...this.filePatterns];
    return shouldIgnoreWorkspacePath(rel, this.useDefaultRules, user);
  }

  asPredicate(): (rel: string) => boolean {
    return (rel: string) => this.shouldIgnore(rel);
  }
}
