import { normalizeExportMarkdown } from './markdownAdapter';

const LEGACY_START = '// CONTEXTRECALL CONTEXT START';
const LEGACY_END = '// CONTEXTRECALL CONTEXT END';
const ALT_START = '// CONTORIUM_CTX_BLOCK_BEGIN';
const ALT_END = '// CONTORIUM_CTX_BLOCK_END';

/**
 * Wrap prompt in line-based fences. If the body contains the same fence lines as its own line
 * (e.g. copied export sample), use alternate markers so naive "find first END line" parsers stay valid.
 */
export function adaptCursorWrapped(promptText: string): string {
  const body = normalizeExportMarkdown(promptText);
  const lines = body.split('\n');
  const fenceCollision = lines.some(
    (l) => l === LEGACY_END || l === LEGACY_START || l === ALT_END || l === ALT_START,
  );
  const [start, end] = fenceCollision ? [ALT_START, ALT_END] : [LEGACY_START, LEGACY_END];
  return `${start}\n${body}\n${end}`;
}
