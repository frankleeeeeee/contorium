import type { EventStore } from '../core/engine/eventStore';
import { sliceEventsForIntentSession } from '../core/events/sessionEventWindow';
import type { ProjectState } from '../types/state';
import { filterEngineeringPaths } from './sidebarPathFilter';

/** Doc §九: intent contribution decays ~×0.92 per 5 minutes of age. */
const DECAY_PER_5_MIN = 0.92;

/** Minimum pool score to appear as a bullet (avoid noise). */
const SCORE_FLOOR = 0.35;

const INTENT_LABEL: Record<string, string> = {
  frontend: 'Frontend implementation',
  docs: 'Documentation updates',
  deployment: 'Deployment preparation',
  auth: 'Authentication system',
  backend: 'Backend / API development',
  ai: 'AI integration work',
  config: 'Project configuration',
  refactor: 'Large workspace refactor',
  newFeature: 'New feature / file work',
  versionControl: 'Git & workspace sync',
  tests: 'Tests & quality',
  data: 'Data layer & persistence',
  delivery: 'Delivery, CI & infrastructure',
  general: 'General file editing',
};

function basename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1]! : p;
}

function fileExt(path: string): string {
  const m = path.match(/(\.[a-z0-9]+)$/i);
  return m ? m[1]!.toLowerCase() : '';
}

function decayFactor(ts: number, now: number): number {
  const ageMin = Math.max(0, (now - ts) / 60_000);
  return Math.pow(DECAY_PER_5_MIN, ageMin / 5);
}

function add(pool: Map<string, number>, key: string, delta: number): void {
  if (delta <= 0) {
    return;
  }
  pool.set(key, (pool.get(key) ?? 0) + delta);
}

/**
 * Score pool from path + doc §六 / §七 + doc §十七 directory hints (`/docs/`, `/pages/`, …).
 */
function accumulatePathIntents(rel: string, pool: Map<string, number>, weight: number): void {
  const p = rel.replace(/\\/g, '/');
  const lower = p.toLowerCase();
  const base = basename(lower);

  if (/(^|\/)docs\//.test(lower) || /(^|\/)documentation\//.test(lower)) {
    add(pool, 'docs', 4 * weight);
  }
  if (/(^|\/)pages\//.test(lower) || /(^|\/)components\//.test(lower) || /(^|\/)views?\//.test(lower)) {
    add(pool, 'frontend', 3 * weight);
  }
  if (/(^|\/)api\//.test(lower) || /(^|\/)server\//.test(lower)) {
    add(pool, 'backend', 3 * weight);
  }

  if (/(hero|landing|pricing|ui|button|layout)/i.test(lower)) {
    add(pool, 'frontend', 3 * weight);
  }
  if (lower.includes('readme') || /\.md$/i.test(lower)) {
    add(pool, 'docs', 4 * weight);
  }
  if (/(vercel|deploy|docker|kubernetes|k8s|helm)/i.test(lower)) {
    add(pool, 'deployment', 5 * weight);
  }
  if (/(auth|login|session|token|oauth|jwt)/i.test(lower)) {
    add(pool, 'auth', 4 * weight);
  }
  if (/(api|server|route|controller|graphql|grpc|endpoint)/i.test(lower)) {
    add(pool, 'backend', 4 * weight);
  }
  if (/(prompt|llm|openai|gemini|claude|anthropic|deepseek)/i.test(lower)) {
    add(pool, 'ai', 5 * weight);
  }
  if (/(test|spec|e2e|pytest|jest|vitest|cypress)/i.test(lower)) {
    add(pool, 'tests', 3 * weight);
  }
  if (/(migration|schema|prisma|sequelize|database|\.sql$)/i.test(lower)) {
    add(pool, 'data', 3 * weight);
  }
  if (/(^|\/)ci\/|\.github|workflow|dockerfile|jenkins/i.test(lower)) {
    add(pool, 'delivery', 3 * weight);
  }

  const ext = fileExt(lower);
  if (['.tsx', '.jsx', '.css', '.scss', '.vue', '.svelte'].includes(ext)) {
    add(pool, 'frontend', 1 * weight);
  }
  if (base === 'package.json' || base === 'tsconfig.json' || base === 'vite.config.ts' || base === 'next.config.js') {
    add(pool, 'config', 2 * weight);
  }
}

function applyGitRules(
  staged: readonly string[],
  working: readonly string[],
  pool: Map<string, number>,
  weight: number,
): void {
  const changed = [...staged, ...working];
  if (changed.length === 0) {
    return;
  }
  if (changed.length > 10) {
    add(pool, 'refactor', 3 * weight);
  }
  const md = changed.filter((f) => /\.md$/i.test(f) || f.toLowerCase().includes('readme'));
  if (md.length / changed.length > 0.5) {
    add(pool, 'docs', 4 * weight);
  }
  const cap = Math.min(24, changed.length);
  for (let i = 0; i < cap; i++) {
    accumulatePathIntents(changed[i]!, pool, 0.55 * weight);
  }
}

/**
 * Heuristic operational intent bullets (doc: score pool, §九 decay, §十七 edit/save weights).
 * Shown when persisted LLM intent (`aiIntent.goals`) is empty.
 */
export function buildHeuristicOperationalIntentLines(
  state: ProjectState,
  events: EventStore | undefined,
  maxItems: number,
): string[] {
  const max = Math.max(1, Math.min(24, maxItems));
  const out: string[] = [];
  const task = (state.currentTask ?? '').trim();
  if (task) {
    out.push('Stated focus: ' + (task.length > 52 ? task.slice(0, 49) + '…' : task));
  }

  const pool = new Map<string, number>();
  const now = Date.now();
  const gitStaged = filterEngineeringPaths(state.gitStaged ?? []);
  const gitWorking = filterEngineeringPaths(state.gitWorking ?? []);
  applyGitRules(gitStaged, gitWorking, pool, 1);

  const recentFiles = filterEngineeringPaths(state.recentFiles ?? []);
  for (const r of recentFiles.slice(0, 14)) {
    accumulatePathIntents(r, pool, 0.35);
  }

  if (events) {
    const all = events.getAll();
    const window = sliceEventsForIntentSession(all, now);
    let prevPath: string | undefined;

    for (const ev of window) {
      if (ev.type === 'file_create') {
        const rel = filterEngineeringPaths([ev.file])[0];
        if (!rel) {
          continue;
        }
        const dec = decayFactor(ev.timestamp, now);
        add(pool, 'newFeature', 6 * dec);
        accumulatePathIntents(rel, pool, dec * 0.5);
        continue;
      }
      if (ev.type === 'file_delete') {
        const rel = filterEngineeringPaths([ev.file])[0];
        if (!rel) {
          continue;
        }
        const dec = decayFactor(ev.timestamp, now);
        add(pool, 'refactor', 5 * dec);
        accumulatePathIntents(rel, pool, dec * 0.4);
        continue;
      }
      if (ev.type === 'file_rename') {
        const oldRel = filterEngineeringPaths([ev.oldFile])[0];
        const newRel = filterEngineeringPaths([ev.newFile])[0];
        const dec = decayFactor(ev.timestamp, now);
        add(pool, 'refactor', 4 * dec);
        if (oldRel) {
          accumulatePathIntents(oldRel, pool, dec * 0.35);
        }
        if (newRel) {
          accumulatePathIntents(newRel, pool, dec * 0.35);
        }
        continue;
      }
      if (ev.type === 'git_change') {
        const n = (ev.staged?.length ?? 0) + (ev.modified?.length ?? 0);
        const w = decayFactor(ev.timestamp, now) * (n > 0 ? 5 : 2);
        add(pool, 'versionControl', w);
        applyGitRules(
          filterEngineeringPaths(ev.staged ?? []),
          filterEngineeringPaths(ev.modified ?? []),
          pool,
          decayFactor(ev.timestamp, now) * 0.4,
        );
        if (n > 10) {
          add(pool, 'refactor', 3 * decayFactor(ev.timestamp, now));
        }
        continue;
      }
      if (ev.type !== 'file_focus' && ev.type !== 'file_save') {
        continue;
      }
      const rel = filterEngineeringPaths([ev.file])[0];
      if (!rel) {
        continue;
      }
      const dec = decayFactor(ev.timestamp, now);
      /** Doc §十七: edit +3, save +1; `file_focus` ≈ edit signal. */
      const eventMult = ev.type === 'file_save' ? 1 : 3;
      const streakMult = prevPath === rel ? 0.5 : 1;
      const w = dec * eventMult * streakMult;
      accumulatePathIntents(rel, pool, w);
      add(pool, 'general', 0.45 * w);
      prevPath = rel;
    }
  }

  const ranked = [...pool.entries()]
    .filter(([, s]) => s >= SCORE_FLOOR)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k]) => INTENT_LABEL[k] ?? k);

  const seen = new Set<string>();
  for (const line of ranked) {
    if (out.length >= max) {
      break;
    }
    if (seen.has(line)) {
      continue;
    }
    seen.add(line);
    out.push(line);
  }

  return out.slice(0, max);
}
