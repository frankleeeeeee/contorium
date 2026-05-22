import type { ProPromptKind, ProPromptPair } from './promptTypes';
import {
  buildCompressionPromptPair as buildCompressionImpl,
  buildIntentPromptPair as buildIntentImpl,
  buildSemanticSummaryPromptPair as buildSemanticImpl,
} from './promptBuilders';
import { RANKING_FACTORS as RANKING_FACTORS_VALUES } from './rankingFactors';

const STATIC_HOOKS = {
  enrichPromptForProvider(kind: ProPromptKind, pair: ProPromptPair): ProPromptPair {
    void kind;
    return pair;
  },
  rankingScoreMultiplier(_path: string): number {
    return 1;
  },
  RANKING_FACTORS: RANKING_FACTORS_VALUES,
  buildIntentPromptPair: buildIntentImpl,
  buildSemanticSummaryPromptPair: buildSemanticImpl,
  buildCompressionPromptPair: buildCompressionImpl,
};

export type ContoriumHookModule = typeof STATIC_HOOKS;

/** Returns the active hook implementation (single bundled runtime). */
export function getContoriumHooks(): ContoriumHookModule {
  return STATIC_HOOKS;
}

export function enrichPromptForProvider(kind: ProPromptKind, pair: ProPromptPair): ProPromptPair {
  return STATIC_HOOKS.enrichPromptForProvider(kind, pair);
}

export function rankingScoreMultiplier(path: string): number {
  return STATIC_HOOKS.rankingScoreMultiplier(path);
}

export const RANKING_FACTORS = RANKING_FACTORS_VALUES;

export function buildIntentPromptPair(
  ...args: Parameters<typeof buildIntentImpl>
): ReturnType<typeof buildIntentImpl> {
  return buildIntentImpl(...args);
}

export function buildSemanticSummaryPromptPair(
  ...args: Parameters<typeof buildSemanticImpl>
): ReturnType<typeof buildSemanticImpl> {
  return buildSemanticImpl(...args);
}

export function buildCompressionPromptPair(trimmedText: string): ReturnType<typeof buildCompressionImpl> {
  return buildCompressionImpl(trimmedText);
}
