/**
 * TTS Chunk Sanitizer
 *
 * Cleans a streamed text chunk before synthesis: drops JSON function calls
 * the LLM emitted instead of speech, strips instruction and guidance blocks,
 * parses SSML into prosody, and fits the result to what the voice can render.
 *
 * @module speech/tts-gateway/chunk-sanitizer
 */

import {
  stripInstructionBlocks,
  containsInstructionBlocks,
  stripGuidanceBlocks,
  containsGuidanceBlocks,
} from '../../utils/text-sanitization.js';
import { fitToVoice } from '../expression/voice-fit.js';
import type { VoiceCapabilities } from '../expression/types.js';
import type { getSSMLProcessor } from './ssml/index.js';
import type { SSMLProsodyConfig } from './types.js';

// ============================================================================
// JSON FUNCTION CALL FILTERING
// ============================================================================

/**
 * Regex to detect the `{"fn":` function call prefix (optionally backtick-wrapped).
 * Prevents tool call leakage to TTS when LLM outputs a function call
 * instead of speaking naturally. Requires `{"fn":` specifically to avoid
 * false positives on legitimate text like "{That's interesting}".
 */
const JSON_FN_PREFIX = /^\s*`?\s*\{\s*"fn"\s*:/;

/**
 * Check if text is a JSON function call that should not be spoken.
 *
 * Requires the text to match the `{"fn": ...}` pattern specifically.
 * Partial JSON streaming fragments starting with `{"fn":` are also filtered.
 * Legitimate text like "{That's interesting}" will NOT be filtered.
 */
export function isJsonFunctionCall(text: string): boolean {
  const trimmed = text.trim();

  if (trimmed.length < 5) {
    return false;
  }

  // Must start with {"fn": (optionally wrapped in backticks)
  if (!JSON_FN_PREFIX.test(trimmed)) {
    return false;
  }

  // Strip surrounding backticks for JSON parsing
  const jsonCandidate = trimmed.replace(/^`\s*/, '').replace(/\s*`$/, '');

  try {
    const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>;
    return typeof parsed === 'object' && parsed !== null && typeof parsed.fn === 'string';
  } catch {
    // Partial JSON starting with {"fn": (streaming) — still filter
    return true;
  }
}

// ============================================================================
// CHUNK SANITIZING
// ============================================================================

/**
 * Sanitize one streamed chunk for synthesis: text to speak plus its prosody.
 */
export function sanitizeChunkForTTS(
  chunk: string,
  ssmlProcessor: ReturnType<typeof getSSMLProcessor>,
  voice: VoiceCapabilities
): { text: string; prosody: SSMLProsodyConfig } {
  if (isJsonFunctionCall(chunk)) return { text: '', prosody: {} };
  let text = chunk;
  if (containsInstructionBlocks(text)) text = stripInstructionBlocks(text);
  if (containsGuidanceBlocks(text)) text = stripGuidanceBlocks(text);
  const ssmlResult = ssmlProcessor.parse(text);
  return fitToVoice(
    { text: ssmlResult.cleanText.trim(), prosody: { ...ssmlResult.prosody } },
    voice
  );
}
