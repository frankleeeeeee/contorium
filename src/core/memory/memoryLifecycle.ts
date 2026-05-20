import type { WorkspaceEvent } from '../models/events';
import { sliceEventsForIntentSession } from '../events/sessionEventWindow';
import type { WorkspaceIntentAi } from '../../ai/runtime/intent/intentTypes';

/** Lifecycle metadata for persisted workspace intent (memory lifecycle doc). */
export type MemoryStatus = 'active' | 'stale' | 'partial';

export type MemoryEvidenceType =
  | 'llm_intent'
  | 'repo_scan'
  | 'user_intent'
  | 'edit_pattern'
  | 'semantic_drift';

export interface MemoryEvidenceEntry {
  type: MemoryEvidenceType;
  at: number;
  files?: string[];
  detail?: string;
}

export interface MemoryEdge {
  from: string;
  to: string;
  relation: 'depends_on' | 'co_active';
  weight: number;
}

export interface MemoryLifecycleMeta {
  confidence: number;
  status: MemoryStatus;
  learnedAt: number;
  lastConfirmedAt: number;
  lastUpdatedAt: number;
  relatedFiles: string[];
  /** Path-derived symbol tokens (basename / camelCase); lightweight, no AST. */
  relatedSymbols: string[];
  /** Fingerprint of intent + paths at learn time (semantic drift, simplified). */
  semanticHash: string;
  /** Links between activeModules for partial invalidation propagation. */
  memoryEdges: MemoryEdge[];
  evidence: MemoryEvidenceEntry[];
  /** @deprecated Mirrored from evidence for backward compat reads. */
  evidenceSources: Array<'repo_scan' | 'user_intent' | 'llm_intent'>;
  staleAfterHours: number;
}

export interface PersistedIntentFile {
  intent: WorkspaceIntentAi;
  lifecycle: MemoryLifecycleMeta;
}

export interface IntentEvaluateContext {
  changedPaths: string[];
  currentTask?: string;
  recentEditPaths?: string[];
  activityProfileKeys?: string[];
}

const DEFAULT_STALE_HOURS = 72;
const TIME_DECAY_MS = 7 * 24 * 60 * 60 * 1000;
const TIME_DECAY_DELTA = 0.05;
const CHANGE_IMPACT_DELTA = 0.15;
const SEMANTIC_DRIFT_DELTA = 0.1;
const GRAPH_PROPAGATION_DELTA = 0.08;
const REINFORCE_DELTA = 0.04;
const MAX_CONFIDENCE = 0.95;
const MIN_USABLE_CONFIDENCE = 0.5;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function normPath(p: string): string {
  return p.replace(/\\/g, '/').trim().toLowerCase();
}

/** Small stable fingerprint (no crypto dep). */
export function fingerprintHash(payload: string): string {
  let h = 5381;
  for (let i = 0; i < payload.length; i++) {
    h = (h * 33) ^ payload.charCodeAt(i);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function slugModuleId(label: string): string {
  const s = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return s || 'module';
}

function splitCamelTokens(name: string): string[] {
  const base = name.replace(/\.[^.]+$/, '');
  const parts = base.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const subs = p.replace(/([a-z])([A-Z])/g, '$1 $2').split(/\s+/);
    for (const s of subs) {
      const t = s.trim();
      if (t.length >= 3) {
        out.push(t.toLowerCase());
      }
    }
  }
  return out;
}

export function deriveRelatedSymbols(intent: WorkspaceIntentAi, relatedFiles: string[]): string[] {
  const seen = new Set<string>();
  const push = (t: string): void => {
    const k = t.toLowerCase();
    if (k.length >= 3 && !seen.has(k)) {
      seen.add(k);
    }
  };
  for (const p of relatedFiles) {
    const base = p.split('/').pop() ?? p;
    for (const tok of splitCamelTokens(base)) {
      push(tok);
    }
  }
  for (const m of intent.activeModules) {
    for (const tok of splitCamelTokens(m)) {
      push(tok);
    }
    push(slugModuleId(m));
  }
  for (const tok of splitCamelTokens(intent.focus)) {
    push(tok);
  }
  return [...seen].slice(0, 32);
}

export function buildMemoryEdges(intent: WorkspaceIntentAi, relatedFiles: string[]): MemoryEdge[] {
  const modules = intent.activeModules.map((m) => slugModuleId(m)).filter(Boolean);
  const edges: MemoryEdge[] = [];
  const seen = new Set<string>();
  const add = (from: string, to: string, relation: MemoryEdge['relation'], weight: number): void => {
    const key = `${from}|${to}|${relation}`;
    if (from === to || seen.has(key)) {
      return;
    }
    seen.add(key);
    edges.push({ from, to, relation, weight });
  };
  for (let i = 0; i < modules.length - 1; i++) {
    add(modules[i]!, modules[i + 1]!, 'co_active', 0.72);
  }
  const dirOwners = new Map<string, string>();
  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i]!;
    for (const p of relatedFiles) {
      const parts = normPath(p).split('/');
      if (parts.length >= 2) {
        const dir = parts.slice(0, -1).join('/');
        const prev = dirOwners.get(dir);
        if (prev && prev !== mod) {
          add(prev, mod, 'depends_on', 0.78);
        } else {
          dirOwners.set(dir, mod);
        }
      }
    }
  }
  return edges.filter((e) => e.from !== e.to).slice(0, 24);
}

function buildSemanticFingerprintPayload(
  intent: WorkspaceIntentAi,
  paths: string[],
  task: string,
  activityKeys: string[] = [],
): string {
  return [
    intent.mode,
    intent.focus.trim().toLowerCase(),
    intent.risk.trim().toLowerCase(),
    ...intent.activeModules.map((m) => m.trim().toLowerCase()).sort(),
    ...paths.map(normPath).sort().slice(0, 20),
    task.trim().toLowerCase(),
    ...activityKeys.slice().sort(),
  ].join('\n');
}

function buildInitialEvidence(relatedFiles: string[], now: number): MemoryEvidenceEntry[] {
  return [
    { type: 'llm_intent', at: now, detail: 'Learn workspace intent' },
    {
      type: 'repo_scan',
      at: now,
      files: relatedFiles.slice(0, 12),
      detail: 'Priority paths at learn time',
    },
  ];
}

function evidenceToSources(evidence: MemoryEvidenceEntry[]): MemoryLifecycleMeta['evidenceSources'] {
  const s = new Set<MemoryLifecycleMeta['evidenceSources'][number]>();
  for (const e of evidence) {
    if (e.type === 'llm_intent') {
      s.add('llm_intent');
    } else if (e.type === 'repo_scan') {
      s.add('repo_scan');
    } else if (e.type === 'user_intent' || e.type === 'edit_pattern') {
      s.add('user_intent');
    }
  }
  return s.size ? [...s] : ['llm_intent'];
}

export function appendEvidence(
  lc: MemoryLifecycleMeta,
  entry: MemoryEvidenceEntry,
  maxEntries = 12,
): MemoryLifecycleMeta {
  const evidence = [...lc.evidence, entry].slice(-maxEntries);
  return {
    ...lc,
    evidence,
    evidenceSources: evidenceToSources(evidence),
    lastUpdatedAt: Date.now(),
  };
}

/** Whether a changed path overlaps a related path entry (exact, prefix, or `dir/*`). */
export function pathTouchesRelated(changed: string, related: string): boolean {
  const c = normPath(changed);
  const r = normPath(related);
  if (!c || !r) {
    return false;
  }
  if (r.endsWith('/*')) {
    const prefix = r.slice(0, -2);
    return c === prefix || c.startsWith(`${prefix}/`);
  }
  return c === r || c.startsWith(`${r}/`) || r.startsWith(`${c}/`);
}

function pathTouchesSymbol(changed: string, symbol: string): boolean {
  const c = normPath(changed);
  const s = symbol.toLowerCase();
  if (!c || !s) {
    return false;
  }
  const base = c.split('/').pop() ?? c;
  return base.includes(s) || c.includes(s);
}

export function collectChangedPathsForInvalidation(state: {
  recentFiles?: string[];
  gitStaged?: string[];
  gitWorking?: string[];
  openFiles?: string[];
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [
    ...(state.gitWorking ?? []),
    ...(state.gitStaged ?? []),
    ...(state.recentFiles ?? []).slice(0, 24),
    ...(state.openFiles ?? []).slice(0, 12),
  ]) {
    const n = p.replace(/\\/g, '/').trim();
    if (!n || seen.has(n)) {
      continue;
    }
    seen.add(n);
    out.push(n);
  }
  return out;
}

/** Recent session edit paths (reinforcement input). */
export function collectRecentEditPathsFromEvents(events: readonly WorkspaceEvent[], now = Date.now()): string[] {
  const window = sliceEventsForIntentSession(events, now);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ev of window) {
    let p: string | undefined;
    if (ev.type === 'file_focus' || ev.type === 'file_save' || ev.type === 'file_create' || ev.type === 'file_delete') {
      p = ev.file;
    } else if (ev.type === 'file_rename') {
      p = ev.newFile;
    }
    if (!p) {
      continue;
    }
    const n = p.replace(/\\/g, '/').trim();
    if (!n || seen.has(n)) {
      continue;
    }
    seen.add(n);
    out.push(n);
  }
  return out.slice(0, 40);
}

function moduleSlugsFromIntent(intent: WorkspaceIntentAi): string[] {
  return intent.activeModules.map((m) => slugModuleId(m));
}

function countRelatedImpactsForFile(
  file: PersistedIntentFile,
  paths: string[],
): { pathHits: number; symbolHits: number; hitModules: Set<string> } {
  const lc = file.lifecycle;
  const hitModules = new Set<string>();
  let pathHits = 0;
  let symbolHits = 0;
  const moduleSlugs = moduleSlugsFromIntent(file.intent);

  for (const ch of paths) {
    let hit = false;
    for (const rel of lc.relatedFiles) {
      if (pathTouchesRelated(ch, rel)) {
        pathHits++;
        hit = true;
        break;
      }
    }
    if (!hit) {
      for (const sym of lc.relatedSymbols) {
        if (pathTouchesSymbol(ch, sym)) {
          symbolHits++;
          hit = true;
          break;
        }
      }
    }
    if (hit) {
      for (const mod of moduleSlugs) {
        if (normPath(ch).includes(mod.replace(/_/g, ''))) {
          hitModules.add(mod);
        }
      }
    }
  }
  return { pathHits, symbolHits, hitModules };
}

export function buildPersistedIntentFile(
  intent: WorkspaceIntentAi,
  relatedFiles: string[],
): PersistedIntentFile {
  const now = Date.now();
  const paths = relatedFiles
    .map((p) => p.replace(/\\/g, '/').trim())
    .filter(Boolean)
    .slice(0, 24);
  const relatedSymbols = deriveRelatedSymbols(intent, paths);
  const memoryEdges = buildMemoryEdges(intent, paths);
  const semanticHash = fingerprintHash(buildSemanticFingerprintPayload(intent, paths, ''));
  const evidence = buildInitialEvidence(paths, now);
  return {
    intent,
    lifecycle: {
      confidence: 0.75,
      status: 'active',
      learnedAt: now,
      lastConfirmedAt: now,
      lastUpdatedAt: now,
      relatedFiles: paths,
      relatedSymbols,
      semanticHash,
      memoryEdges,
      evidence,
      evidenceSources: evidenceToSources(evidence),
      staleAfterHours: DEFAULT_STALE_HOURS,
    },
  };
}

function applyAgeDecay(lc: MemoryLifecycleMeta, now: number): MemoryLifecycleMeta {
  const hours = (now - lc.lastConfirmedAt) / (60 * 60 * 1000);
  let confidence = lc.confidence;
  let status = lc.status;
  if (hours >= lc.staleAfterHours) {
    confidence = clamp01(confidence - TIME_DECAY_DELTA);
    status = status === 'active' ? 'partial' : status;
  }
  if (now - lc.learnedAt >= TIME_DECAY_MS && status === 'active') {
    confidence = clamp01(confidence - TIME_DECAY_DELTA * 0.5);
  }
  return { ...lc, confidence, status, lastUpdatedAt: now };
}

function applyRelatedImpact(
  file: PersistedIntentFile,
  allPaths: string[],
): { lc: MemoryLifecycleMeta; pathHits: number } {
  const lc = file.lifecycle;
  if (!lc.relatedFiles.length && !lc.relatedSymbols.length) {
    return { lc, pathHits: 0 };
  }
  const { pathHits, symbolHits, hitModules } = countRelatedImpactsForFile(file, allPaths);
  const totalHits = pathHits + symbolHits * 0.5;
  if (totalHits === 0) {
    return { lc, pathHits: 0 };
  }
  const ratio = totalHits / Math.min(allPaths.length, 12);
  let confidence = clamp01(lc.confidence - CHANGE_IMPACT_DELTA * Math.min(1, ratio * 2));
  let status: MemoryStatus = lc.status;
  if (ratio >= 0.35 || pathHits >= 3) {
    status = 'stale';
    confidence = clamp01(confidence - CHANGE_IMPACT_DELTA);
  } else if (status === 'active') {
    status = 'partial';
  }
  let next = { ...lc, confidence, status, lastUpdatedAt: Date.now() };

  if (lc.memoryEdges.length && hitModules.size > 0) {
    const impacted = new Set(hitModules);
    for (const edge of lc.memoryEdges) {
      if (impacted.has(edge.from) && !impacted.has(edge.to)) {
        confidence = clamp01(confidence - GRAPH_PROPAGATION_DELTA * edge.weight);
        if (status !== 'stale') {
          status = 'partial';
        }
        impacted.add(edge.to);
      }
    }
    next = { ...next, confidence, status };
  }

  return { lc: next, pathHits };
}

function applySemanticDrift(
  file: PersistedIntentFile,
  pathHits: number,
  ctx: IntentEvaluateContext,
  now: number,
): MemoryLifecycleMeta {
  const lc = file.lifecycle;
  if (!lc.semanticHash || pathHits >= 2) {
    return lc;
  }
  const currentHash = fingerprintHash(
    buildSemanticFingerprintPayload(
      file.intent,
      [...ctx.changedPaths, ...(ctx.recentEditPaths ?? [])].slice(0, 24),
      ctx.currentTask ?? '',
      ctx.activityProfileKeys ?? [],
    ),
  );
  if (currentHash === lc.semanticHash) {
    return lc;
  }
  return appendEvidence(
    {
      ...lc,
      confidence: clamp01(lc.confidence - SEMANTIC_DRIFT_DELTA),
      status: lc.status === 'active' ? 'partial' : lc.status,
      lastUpdatedAt: now,
    },
    {
      type: 'semantic_drift',
      at: now,
      detail: `Fingerprint shifted (${lc.semanticHash.slice(0, 8)}→${currentHash.slice(0, 8)})`,
    },
  );
}

function applyActivityReinforcement(
  file: PersistedIntentFile,
  ctx: IntentEvaluateContext,
  now: number,
): MemoryLifecycleMeta {
  const lc = file.lifecycle;
  const allPaths = [...ctx.changedPaths, ...(ctx.recentEditPaths ?? [])];
  const { pathHits, symbolHits } = countRelatedImpactsForFile(file, allPaths);
  const activityKeys = ctx.activityProfileKeys ?? [];
  const moduleSlugs = new Set(moduleSlugsFromIntent(file.intent));
  let align = 0;
  for (const key of activityKeys) {
    if (moduleSlugs.has(key) || lc.relatedSymbols.some((s) => key.includes(s) || s.includes(key))) {
      align++;
    }
  }

  let confidence = lc.confidence;
  let next = lc;
  if (pathHits + symbolHits >= 4 && lc.status !== 'stale') {
    confidence = clamp01(confidence + REINFORCE_DELTA);
    next = appendEvidence(next, {
      type: 'edit_pattern',
      at: now,
      files: allPaths.slice(0, 8),
      detail: `Repeated edits aligned with intent (${pathHits + symbolHits} hits)`,
    });
  }
  if (align >= 2 && lc.status !== 'stale') {
    confidence = clamp01(confidence + REINFORCE_DELTA * 0.75);
    next = { ...next, confidence };
    next = appendEvidence(next, {
      type: 'edit_pattern',
      at: now,
      detail: `Activity profile matches modules (${align} keys)`,
    });
  }
  if (confidence > MAX_CONFIDENCE) {
    confidence = MAX_CONFIDENCE;
  }
  if (confidence > lc.confidence) {
    next = {
      ...next,
      confidence,
      lastConfirmedAt: now,
      status: next.status === 'partial' && confidence >= MIN_USABLE_CONFIDENCE + 0.08 ? 'active' : next.status,
    };
  }
  return next;
}

/** Re-evaluate confidence/status from time, paths/symbols, graph, drift, reinforcement. */
export function evaluateIntentLifecycle(
  file: PersistedIntentFile,
  ctx: IntentEvaluateContext,
  now: number = Date.now(),
): PersistedIntentFile {
  let lc = applyAgeDecay(file.lifecycle, now);
  const allPaths = [...ctx.changedPaths, ...(ctx.recentEditPaths ?? [])];
  const impact = applyRelatedImpact({ ...file, lifecycle: lc }, allPaths);
  lc = impact.lc;
  lc = applySemanticDrift({ ...file, lifecycle: lc }, impact.pathHits, ctx, now);
  lc = applyActivityReinforcement({ ...file, lifecycle: lc }, ctx, now);
  if (lc.confidence < MIN_USABLE_CONFIDENCE) {
    lc = { ...lc, status: 'stale' };
  }
  return { ...file, lifecycle: lc };
}

export function isIntentLifecycleUsable(lc: MemoryLifecycleMeta): boolean {
  return lc.status !== 'stale' && lc.confidence >= MIN_USABLE_CONFIDENCE;
}

function parseEvidenceChain(raw: unknown, fallbackAt: number): MemoryEvidenceEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: MemoryEvidenceEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const e = item as Record<string, unknown>;
    const type = e.type;
    if (
      type !== 'llm_intent' &&
      type !== 'repo_scan' &&
      type !== 'user_intent' &&
      type !== 'edit_pattern' &&
      type !== 'semantic_drift'
    ) {
      continue;
    }
    const at =
      typeof e.at === 'number' ? e.at : typeof e.timestamp === 'number' ? e.timestamp : fallbackAt;
    out.push({
      type,
      at,
      files: Array.isArray(e.files) ? e.files.filter((x): x is string => typeof x === 'string') : undefined,
      detail: typeof e.detail === 'string' ? e.detail : undefined,
    });
  }
  return out;
}

/** Parse disk JSON: legacy flat intent or `{ intent, lifecycle }`. */
export function parsePersistedIntentFile(raw: unknown): PersistedIntentFile | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  if (o.intent && typeof o.intent === 'object' && o.lifecycle && typeof o.lifecycle === 'object') {
    const intent = parseIntentFields(o.intent as Record<string, unknown>);
    const lc = parseLifecycleFields(o.lifecycle as Record<string, unknown>, intent);
    if (!lc) {
      return undefined;
    }
    return { intent, lifecycle: lc };
  }
  const intent = parseIntentFields(o);
  const now = Date.now();
  const evidence = buildInitialEvidence([], now);
  return {
    intent,
    lifecycle: {
      confidence: 0.6,
      status: 'active',
      learnedAt: now,
      lastConfirmedAt: now,
      lastUpdatedAt: now,
      relatedFiles: [],
      relatedSymbols: deriveRelatedSymbols(intent, []),
      semanticHash: fingerprintHash(buildSemanticFingerprintPayload(intent, [], '')),
      memoryEdges: buildMemoryEdges(intent, []),
      evidence,
      evidenceSources: evidenceToSources(evidence),
      staleAfterHours: DEFAULT_STALE_HOURS,
    },
  };
}

function parseIntentFields(o: Record<string, unknown>): WorkspaceIntentAi {
  return {
    mode: typeof o.mode === 'string' ? o.mode : '',
    focus: typeof o.focus === 'string' ? o.focus : '',
    risk: typeof o.risk === 'string' ? o.risk : '',
    activeModules: Array.isArray(o.activeModules)
      ? o.activeModules.filter((x): x is string => typeof x === 'string')
      : [],
  };
}

function parseLifecycleFields(o: Record<string, unknown>, intent?: WorkspaceIntentAi): MemoryLifecycleMeta | undefined {
  const learnedAt = typeof o.learnedAt === 'number' ? o.learnedAt : typeof o.learned_at === 'number' ? o.learned_at : undefined;
  if (learnedAt === undefined) {
    return undefined;
  }
  const lastConfirmedAt =
    typeof o.lastConfirmedAt === 'number'
      ? o.lastConfirmedAt
      : typeof o.last_confirmed_at === 'number'
        ? o.last_confirmed_at
        : learnedAt;
  const statusRaw = typeof o.status === 'string' ? o.status : 'active';
  const status: MemoryStatus =
    statusRaw === 'stale' || statusRaw === 'partial' ? statusRaw : o.stale === true ? 'stale' : 'active';
  const relatedFiles = Array.isArray(o.relatedFiles)
    ? o.relatedFiles.filter((x): x is string => typeof x === 'string')
    : Array.isArray(o.related_files)
      ? o.related_files.filter((x): x is string => typeof x === 'string')
      : [];
  const intentStub: WorkspaceIntentAi =
    intent ??
    ({
      mode: '',
      focus: '',
      risk: '',
      activeModules: [],
    } as WorkspaceIntentAi);
  let evidence = parseEvidenceChain(o.evidence, learnedAt);
  if (!evidence.length) {
    evidence = buildInitialEvidence(relatedFiles, learnedAt);
    const sources = parseEvidenceSources(o.evidenceSources ?? o.evidence_sources ?? o.derived_from);
    for (const s of sources) {
      if (s === 'llm_intent') {
        evidence.unshift({ type: 'llm_intent', at: learnedAt });
      } else if (s === 'repo_scan') {
        evidence.push({ type: 'repo_scan', at: learnedAt, files: relatedFiles.slice(0, 12) });
      } else if (s === 'user_intent') {
        evidence.push({ type: 'user_intent', at: learnedAt });
      }
    }
  }
  const relatedSymbols = Array.isArray(o.relatedSymbols)
    ? o.relatedSymbols.filter((x): x is string => typeof x === 'string')
    : Array.isArray(o.related_symbols)
      ? o.related_symbols.filter((x): x is string => typeof x === 'string')
      : deriveRelatedSymbols(intentStub, relatedFiles);
  const memoryEdges = parseMemoryEdges(o.memoryEdges ?? o.edges);
  const semanticHash =
    typeof o.semanticHash === 'string'
      ? o.semanticHash
      : typeof o.semantic_hash === 'string'
        ? o.semantic_hash
        : fingerprintHash(buildSemanticFingerprintPayload(intentStub, relatedFiles, ''));

  return {
    confidence: clamp01(typeof o.confidence === 'number' ? o.confidence : 0.6),
    status,
    learnedAt,
    lastConfirmedAt,
    lastUpdatedAt:
      typeof o.lastUpdatedAt === 'number'
        ? o.lastUpdatedAt
        : typeof o.last_updated_at === 'number'
          ? o.last_updated_at
          : learnedAt,
    relatedFiles,
    relatedSymbols,
    semanticHash,
    memoryEdges,
    evidence,
    evidenceSources: evidenceToSources(evidence),
    staleAfterHours:
      typeof o.staleAfterHours === 'number'
        ? o.staleAfterHours
        : typeof o.stale_after_hours === 'number'
          ? o.stale_after_hours
          : DEFAULT_STALE_HOURS,
  };
}

function parseMemoryEdges(raw: unknown): MemoryEdge[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: MemoryEdge[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const e = item as Record<string, unknown>;
    const from = typeof e.from === 'string' ? e.from : '';
    const to = typeof e.to === 'string' ? e.to : '';
    if (!from || !to) {
      continue;
    }
    const relation = e.relation === 'depends_on' || e.relation === 'co_active' ? e.relation : 'co_active';
    const weight = typeof e.weight === 'number' ? clamp01(e.weight) : 0.7;
    out.push({ from, to, relation, weight });
  }
  return out.slice(0, 24);
}

function parseEvidenceSources(raw: unknown): MemoryLifecycleMeta['evidenceSources'] {
  if (!Array.isArray(raw)) {
    return ['llm_intent'];
  }
  const out: MemoryLifecycleMeta['evidenceSources'] = [];
  for (const x of raw) {
    if (x === 'repo_scan' || x === 'user_intent' || x === 'llm_intent') {
      out.push(x);
    }
  }
  return out.length ? out : ['llm_intent'];
}

export function serializePersistedIntentFile(file: PersistedIntentFile): string {
  return JSON.stringify(file, null, 2);
}

/** Lower confidence when stated Current focus diverges from learned intent focus. */
export function applyIntentTaskMismatch(
  file: PersistedIntentFile,
  currentTask: string,
): PersistedIntentFile {
  const task = currentTask.trim().toLowerCase();
  const focus = file.intent.focus.trim().toLowerCase();
  if (task.length < 6 || focus.length < 6) {
    return file;
  }
  const overlap =
    task.includes(focus.slice(0, Math.min(24, focus.length))) ||
    focus.includes(task.slice(0, Math.min(24, task.length)));
  if (overlap) {
    return file;
  }
  const lc = file.lifecycle;
  return {
    ...file,
    lifecycle: appendEvidence(
      {
        ...lc,
        confidence: clamp01(lc.confidence - 0.12),
        status: lc.status === 'active' ? 'partial' : lc.status,
        lastUpdatedAt: Date.now(),
      },
      { type: 'user_intent', at: Date.now(), detail: 'Current focus diverged from learned intent' },
    ),
  };
}

export function touchIntentConfirmation(file: PersistedIntentFile, now: number = Date.now()): PersistedIntentFile {
  return {
    ...file,
    lifecycle: {
      ...file.lifecycle,
      lastConfirmedAt: now,
      lastUpdatedAt: now,
      confidence: clamp01(file.lifecycle.confidence + 0.05),
      status: file.lifecycle.status === 'stale' ? 'partial' : file.lifecycle.status,
    },
  };
}
