import { normalizeExportMarkdown } from './markdownAdapter';

const LEGACY_BEGIN = '<<<CONTEXTRECALL>>>';
const LEGACY_END = '<<<END_CONTEXTRECALL>>>';
const ALT_BEGIN = '<<<CONTORIUM_BLOCK_V2>>>';
const ALT_END = '<<<END_CONTORIUM_BLOCK_V2>>>';

/**
 * Claude-friendly framing: clear delimiter + same body as markdown export.
 * Uses alternate fences if the body already contains the legacy markers (substring-safe).
 */
export function adaptClaude(promptText: string): string {
  const body = normalizeExportMarkdown(promptText).trim();
  const fenceCollision =
    body.includes(LEGACY_END) ||
    body.includes(LEGACY_BEGIN) ||
    body.includes(ALT_END) ||
    body.includes(ALT_BEGIN);
  const [begin, end] = fenceCollision ? [ALT_BEGIN, ALT_END] : [LEGACY_BEGIN, LEGACY_END];
  return [
    'The following is structured workspace context from Contorium (VS Code extension).',
    'Use it as ground truth for paths and recent activity; verify code in the repo before claiming behavior.',
    '',
    begin,
    body,
    end,
  ].join('\n');
}
