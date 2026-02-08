/**
 * Text Humanizer for Qwen3-Omni
 *
 * Adapter that calls into the existing HumanizationOrchestrator
 * to add disfluencies, self-corrections, and natural speech patterns,
 * then strips SSML and translates pause hints to text for Qwen3-TTS.
 *
 * The existing humanization pipeline produces SSML-annotated text
 * (designed for Cartesia). This adapter:
 * 1. Calls humanizeResponse() to get disfluencies, self-corrections, etc.
 * 2. Translates <break> tags to text pauses ("...", paragraph breaks)
 * 3. Strips all remaining SSML tags
 * 4. Returns clean text ready for Qwen3-TTS synthesis
 *
 * The instruct-builder.ts handles the voice/emotion side (replaces SSML emotion tags).
 * This file handles the text-modification side (replaces SSML text manipulation).
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { translateBreaksToText, stripSsmlTags } from './instruct-builder.js';

const log = createLogger({ module: 'Qwen3TextHumanizer' });

// =============================================================================
// TYPES
// =============================================================================

/** Context for humanizing a response */
export interface HumanizationContext {
  /** Session ID */
  sessionId: string;
  /** The user's message that triggered this response */
  userMessage: string;
  /** Detected user emotion */
  userEmotion?: string;
  /** User energy level */
  userEnergy?: 'high' | 'medium' | 'low';
  /** Whether the content is emotionally heavy */
  isEmotionalContent?: boolean;
}

/** Result of text humanization */
export interface TextHumanizationResult {
  /** Humanized plain text (no SSML, ready for Qwen3-TTS) */
  text: string;
  /** What humanizations were applied */
  appliedHumanizations: readonly string[];
  /** Whether the text was modified at all */
  wasModified: boolean;
}

// =============================================================================
// LAZY IMPORT (avoids circular dependency with conversation module)
// =============================================================================

let _humanizeResponse:
  | ((
      sessionId: string,
      response: string,
      context: {
        userMessage: string;
        userEmotion?: string;
        userEnergy?: 'high' | 'medium' | 'low';
        isEmotionalContent?: boolean;
      }
    ) => {
      original: string;
      text: string;
      ssml: string;
      appliedHumanizations: Array<{ type: string }>;
    })
  | null = null;

async function getHumanizeResponse(): Promise<typeof _humanizeResponse> {
  if (_humanizeResponse) return _humanizeResponse;

  try {
    const mod = await import(
      '../../../conversation/humanization/voice-agent-integration/index.js'
    );
    _humanizeResponse = mod.humanizeResponse;
    return _humanizeResponse;
  } catch (error) {
    log.error(
      { error: String(error) },
      'Failed to import humanizeResponse (check path/circular deps), text humanization disabled'
    );
    return null;
  }
}

// =============================================================================
// MAIN API
// =============================================================================

/**
 * Humanize a response text for Qwen3-TTS.
 *
 * Applies the full humanization pipeline (disfluencies, self-corrections,
 * vocal fatigue, etc.) then cleans the output for Qwen3-TTS.
 *
 * @param response - Raw LLM response text
 * @param context - Session and conversation context
 * @returns Humanized text ready for Qwen3-TTS
 */
export async function humanizeForQwen3(
  response: string,
  context: HumanizationContext
): Promise<TextHumanizationResult> {
  const humanize = await getHumanizeResponse();

  if (!humanize) {
    log.debug('Humanization not available, returning raw text');
    return {
      text: response,
      appliedHumanizations: [],
      wasModified: false,
    };
  }

  try {
    // Step 1: Run the existing humanization pipeline
    const result = humanize(context.sessionId, response, {
      userMessage: context.userMessage,
      userEmotion: context.userEmotion,
      userEnergy: context.userEnergy,
      isEmotionalContent: context.isEmotionalContent,
    });

    // Step 2: Start with the SSML output (which has the richest annotations)
    let humanizedText = result.ssml;

    // Step 3: Translate <break> tags to text pauses
    humanizedText = translateBreaksToText(humanizedText);

    // Step 4: Strip all remaining SSML tags
    humanizedText = stripSsmlTags(humanizedText);

    // Step 5: Clean up any double spaces or artifacts
    humanizedText = cleanupText(humanizedText);

    const applied = result.appliedHumanizations.map((h) => h.type);

    log.debug(
      {
        sessionId: context.sessionId,
        appliedCount: applied.length,
        applied,
        originalLength: response.length,
        humanizedLength: humanizedText.length,
      },
      'Text humanized for Qwen3-TTS'
    );

    return {
      text: humanizedText,
      appliedHumanizations: applied,
      wasModified: humanizedText !== response,
    };
  } catch (error) {
    log.warn(
      { error: String(error), sessionId: context.sessionId },
      'Humanization failed, returning raw text'
    );
    return {
      text: response,
      appliedHumanizations: [],
      wasModified: false,
    };
  }
}

/**
 * Lightweight humanization for short responses (toasts, cameos, etc.)
 * that don't need the full orchestrator pipeline.
 *
 * Just adds optional thinking sounds and cleans SSML.
 *
 * @param text - Short response text
 * @param personaId - Persona for thinking sound selection
 * @returns Clean text
 */
export function lightHumanize(text: string, personaId?: string): string {
  let result = text;

  // Translate any SSML breaks
  result = translateBreaksToText(result);

  // Strip SSML
  result = stripSsmlTags(result);

  // Clean up
  result = cleanupText(result);

  return result;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Clean up text artifacts from SSML stripping.
 */
function cleanupText(text: string): string {
  let result = text;

  // Collapse multiple spaces
  result = result.replace(/\s{2,}/g, ' ');

  // Collapse multiple ellipses
  result = result.replace(/\.{4,}/g, '...');

  // Remove leading/trailing whitespace per line
  result = result
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');

  // Ensure no empty start/end
  result = result.trim();

  return result;
}
