import * as vscode from 'vscode';
import { DEFAULT_EXPORT_TOKEN_BUDGET, MAX_EXPORT_TOKEN_BUDGET } from '../constants';

/**
 * Resolved export token budget: unset/invalid → default 800; `0` → unlimited; else 1..200k (no minimum clamp).
 */
export function readResolvedExportTokenBudget(cfg: vscode.WorkspaceConfiguration): number {
  const v = cfg.get<number>('exportTokenBudget');
  if (typeof v !== 'number' || v < 0) {
    return DEFAULT_EXPORT_TOKEN_BUDGET;
  }
  if (v === 0) {
    return 0;
  }
  return Math.min(MAX_EXPORT_TOKEN_BUDGET, Math.max(1, v));
}

export function readExportLlmFallbackEnabled(cfg: vscode.WorkspaceConfiguration): boolean {
  return cfg.get<boolean>('exportLlmFallbackWhenOverBudget') !== false;
}
