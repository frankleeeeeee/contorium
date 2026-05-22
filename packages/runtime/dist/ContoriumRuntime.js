"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContoriumRuntime = void 0;
/**
 * Default {@link RuntimeProvider} for Contorium: intent stub, score-based ordering, bounded compression.
 */
class ContoriumRuntime {
    buildIntent(_input) {
        return { type: 'contorium-general', confidence: 0.62 };
    }
    rankContext(context) {
        return [...context].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }
    compressContext(context) {
        return context.slice(0, 8);
    }
    buildPrompt(data) {
        const body = data.context.map((c) => c.content).join('\n');
        return [`[Contorium] intent=${data.intent.type}`, `mode=${data.mode}`, body].join('\n\n');
    }
}
exports.ContoriumRuntime = ContoriumRuntime;
