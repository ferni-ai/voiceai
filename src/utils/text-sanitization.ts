/**
 * Text Sanitization (Level 10 - Utils)
 *
 * Strip instruction and guidance blocks from text before TTS.
 * Use from speech layer (e.g. gateway-tts-node) without depending on agents/.
 *
 * Canonical patterns are kept in sync with agents/shared/sanitizer for
 * instruction blocks and guidance blocks.
 *
 * @module utils/text-sanitization
 */

// ============================================================================
// INSTRUCTION BLOCK PATTERNS
// ============================================================================

const INSTRUCTION_BLOCK_STRIP_PATTERNS: RegExp[] = [
  /\[[A-Z][A-Z_\- ]+:\s*[^\]]*\]/g,
  /\[music playing\]/gi,
  /\[playing music\]/gi,
  /\[now playing\]/gi,
  /\[searching\]/gi,
  /\[thinking\]/gi,
  /\[pausing\]/gi,
  /\[loading\]/gi,
  /\[waiting\]/gi,
  /\[TOOL RESULT:[^\]]*\]/gi,
  /\[DATA:[^\]]*\]/gi,
  /\[DO:[^\]]*\]/gi,
  /→\s*\[[^\]]*\]/g,
  /\([^)]*internal[^)]*\)/gi,
  /\([^)]*do not[^)]*\)/gi,
  /\n\[[A-Z][A-Z_\- ]+:[^\n]*/g,
  /Status:\s*(SUCCESS|FAILED)\s*Result:\s*/gi,
  /Status:\s*(SUCCESS|FAILED)\s*Error:\s*/gi,
  /\[TOOL_RESULT:[^\]]*\]\s*Status:\s*(SUCCESS|FAILED)[^\n]*/gi,
  /<system>[\s\S]*?<\/system>/gi,
  /<guidance>[\s\S]*?<\/guidance>/gi,
  /<internal>[\s\S]*?<\/internal>/gi,
  /CONTEXT\s*\(read but do NOT include[\s\S]*?Just speak naturally\.?/gi,
  /YOUR TASK:[\s\S]*?Just speak naturally\.?/gi,
  /CRITICAL:\s*Output ONLY your spoken response[\s\S]*?Just speak naturally\.?/gi,
  /CONTEXT\s*\(read but do NOT include in your response\):[^\n]*/gi,
  /YOUR TASK:\s*[^\n]*/gi,
  /CRITICAL:\s*Output ONLY[^\n]*/gi,
  /No meta-commentary[^\n]*/gi,
  /Just speak naturally\.?\s*/gi,
  /Be curious,? not concerned\.?\s*/gi,
  /Check in gently\s*\([^)]+\)\.?\s*/gi,
  /It's been \d+ seconds? of silence\.?\s*/gi,
  /Respond with ONLY your spoken words[^.]*\.?\s*/gi,
  /No formatting,? no labels,? no quotes\.?\s*/gi,
  /Say something warm[^.]*\.?\s*/gi,
  /Speaking to them now:\s*/gi,
];

// ============================================================================
// GUIDANCE BLOCK PATTERNS
// ============================================================================

const GUIDANCE_BLOCK_PATTERNS: RegExp[] = [
  /<guidance>[\s\S]*?<\/guidance>/gi,
  /<internal>[\s\S]*?<\/internal>/gi,
  /<system>[\s\S]*?<\/system>/gi,
  /\[guidance\][\s\S]*?\[\/guidance\]/gi,
  /\[internal\][\s\S]*?\[\/internal\]/gi,
  /\[system\][\s\S]*?\[\/system\]/gi,
  /---\s*guidance\s*---[\s\S]*?---\s*end\s*guidance\s*---/gi,
  /CONTEXT\s*\(read but do NOT include[\s\S]*?Just speak naturally\.?/gi,
  /YOUR TASK:[\s\S]*?Just speak naturally\.?/gi,
  /CRITICAL:\s*Output ONLY your spoken response[\s\S]*?Just speak naturally\.?/gi,
  /CONTEXT\s*\(read but do NOT include in your response\):[^\n]*/gi,
  /YOUR TASK:\s*[^\n]*/gi,
  /CRITICAL:\s*Output ONLY[^\n]*/gi,
  /No meta-commentary[^\n]*/gi,
  /Just speak naturally\.?\s*/gi,
  /Be curious,? not concerned\.?\s*/gi,
  /Check in gently\s*\([^)]+\)\.?\s*/gi,
  /Speaking to them now:\s*/gi,
];

// ============================================================================
// INSTRUCTION BLOCK API
// ============================================================================

/**
 * Strip instruction blocks from text.
 * Use as a final safety net before TTS.
 */
export function stripInstructionBlocks(text: string): string {
  if (!text) return text;
  let result = text;
  for (const pattern of INSTRUCTION_BLOCK_STRIP_PATTERNS) {
    result = result.replace(pattern, '');
  }
  result = result
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\s+\n/g, '\n');
  return result;
}

/**
 * Check if text contains instruction blocks that should be stripped.
 */
export function containsInstructionBlocks(text: string): boolean {
  if (!text) return false;
  return INSTRUCTION_BLOCK_STRIP_PATTERNS.some((pattern) => pattern.test(text));
}

// ============================================================================
// GUIDANCE BLOCK API (JS-only; agents sanitizer may use Rust when available)
// ============================================================================

/**
 * Strip guidance blocks from text (pure JS implementation).
 */
export function stripGuidanceBlocks(text: string): string {
  if (!text) return text;
  let result = text;
  for (const pattern of GUIDANCE_BLOCK_PATTERNS) {
    result = result.replace(pattern, '');
  }
  return result.trim();
}

/**
 * Check if text contains guidance blocks.
 */
export function containsGuidanceBlocks(text: string): boolean {
  if (!text) return false;
  return GUIDANCE_BLOCK_PATTERNS.some((p) => p.test(text));
}
