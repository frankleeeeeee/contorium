"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RANKING_FACTORS = void 0;
exports.getContoriumHooks = getContoriumHooks;
exports.enrichPromptForProvider = enrichPromptForProvider;
exports.rankingScoreMultiplier = rankingScoreMultiplier;
exports.buildIntentPromptPair = buildIntentPromptPair;
exports.buildSemanticSummaryPromptPair = buildSemanticSummaryPromptPair;
exports.buildCompressionPromptPair = buildCompressionPromptPair;
const promptBuilders_1 = require("./promptBuilders");
const rankingFactors_1 = require("./rankingFactors");
const STATIC_HOOKS = {
    enrichPromptForProvider(kind, pair) {
        void kind;
        return pair;
    },
    rankingScoreMultiplier(_path) {
        return 1;
    },
    RANKING_FACTORS: rankingFactors_1.RANKING_FACTORS,
    buildIntentPromptPair: promptBuilders_1.buildIntentPromptPair,
    buildSemanticSummaryPromptPair: promptBuilders_1.buildSemanticSummaryPromptPair,
    buildCompressionPromptPair: promptBuilders_1.buildCompressionPromptPair,
};
/** Returns the active hook implementation (single bundled runtime). */
function getContoriumHooks() {
    return STATIC_HOOKS;
}
function enrichPromptForProvider(kind, pair) {
    return STATIC_HOOKS.enrichPromptForProvider(kind, pair);
}
function rankingScoreMultiplier(path) {
    return STATIC_HOOKS.rankingScoreMultiplier(path);
}
exports.RANKING_FACTORS = rankingFactors_1.RANKING_FACTORS;
function buildIntentPromptPair(...args) {
    return (0, promptBuilders_1.buildIntentPromptPair)(...args);
}
function buildSemanticSummaryPromptPair(...args) {
    return (0, promptBuilders_1.buildSemanticSummaryPromptPair)(...args);
}
function buildCompressionPromptPair(trimmedText) {
    return (0, promptBuilders_1.buildCompressionPromptPair)(trimmedText);
}
