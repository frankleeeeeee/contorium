import type { ProPromptKind, ProPromptPair } from './promptTypes';
import { buildCompressionPromptPair as buildCompressionImpl, buildIntentPromptPair as buildIntentImpl, buildSemanticSummaryPromptPair as buildSemanticImpl } from './promptBuilders';
declare const STATIC_HOOKS: {
    enrichPromptForProvider(kind: ProPromptKind, pair: ProPromptPair): ProPromptPair;
    rankingScoreMultiplier(_path: string): number;
    RANKING_FACTORS: {
        readonly gitStagedPresence: 10;
        readonly gitWorkingPresence: 8;
        readonly openTabPresence: 6;
        readonly workingSetRecencyMax: 20;
        readonly perFocusUnit: 4;
        readonly perSaveUnit: 5;
        readonly taskKeywordHit: 6;
    };
    buildIntentPromptPair: typeof buildIntentImpl;
    buildSemanticSummaryPromptPair: typeof buildSemanticImpl;
    buildCompressionPromptPair: typeof buildCompressionImpl;
};
export type ContoriumHookModule = typeof STATIC_HOOKS;
/** Returns the active hook implementation (single bundled runtime). */
export declare function getContoriumHooks(): ContoriumHookModule;
export declare function enrichPromptForProvider(kind: ProPromptKind, pair: ProPromptPair): ProPromptPair;
export declare function rankingScoreMultiplier(path: string): number;
export declare const RANKING_FACTORS: {
    readonly gitStagedPresence: 10;
    readonly gitWorkingPresence: 8;
    readonly openTabPresence: 6;
    readonly workingSetRecencyMax: 20;
    readonly perFocusUnit: 4;
    readonly perSaveUnit: 5;
    readonly taskKeywordHit: 6;
};
export declare function buildIntentPromptPair(...args: Parameters<typeof buildIntentImpl>): ReturnType<typeof buildIntentImpl>;
export declare function buildSemanticSummaryPromptPair(...args: Parameters<typeof buildSemanticImpl>): ReturnType<typeof buildSemanticImpl>;
export declare function buildCompressionPromptPair(trimmedText: string): ReturnType<typeof buildCompressionImpl>;
export {};
