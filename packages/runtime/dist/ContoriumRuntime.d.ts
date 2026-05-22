import type { ContextItem, IntentResult, PromptInput, RuntimeInput, RuntimeProvider } from './core/interfaces';
/**
 * Default {@link RuntimeProvider} for Contorium: intent stub, score-based ordering, bounded compression.
 */
export declare class ContoriumRuntime implements RuntimeProvider {
    buildIntent(_input: RuntimeInput): IntentResult;
    rankContext(context: ContextItem[]): ContextItem[];
    compressContext(context: ContextItem[]): ContextItem[];
    buildPrompt(data: PromptInput): string;
}
