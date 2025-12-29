/**
 * Sanitizer Transform Stream
 *
 * Transform streams for real-time sanitization of LLM output.
 * Intercepts and filters tool call leakage from TTS streams.
 *
 * @module agents/shared/sanitizer/streams/transform-stream
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import type { SanitizerStreamOptions } from '../types.js';
import {
  detectsFunctionCallLeakage,
  getReplacementText,
  looksLikeJsonFunctionCall,
} from '../detectors/leakage-detector.js';
import { getSlowTools } from '../detectors/patterns-loader.js';
import {
  wasToolExecutedBySemanticRouter,
  markToolExecutedBySemanticRouter,
} from '../executors/deduplication.js';
import {
  stripGuidanceBlocks as rustStripGuidanceBlocks,
  containsGuidanceBlocks as rustContainsGuidanceBlocks,
  isGuidanceStrippingAvailable,
} from '../../../../memory/rust-accelerator.js';

const log = createLogger({ module: 'sanitizer-stream' });

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

// Using a generic transform stream type to avoid livekit dependency issues
export type AnyTransformStream = {
  readable: ReadableStream<string>;
  writable: WritableStream<string>;
};

// ============================================================================
// BASIC SANITIZER STREAM
// ============================================================================

/**
 * Creates a transform stream that filters tool call leakage from text.
 *
 * @returns Transform stream for sanitization
 */
export function createSanitizerTransformStream(): AnyTransformStream {
  let buffer = '';

  const transformer = new TransformStream<string, string>({
    transform(chunk, controller) {
      buffer += chunk;

      // Check for JSON function call (don't filter - let executor handle)
      if (looksLikeJsonFunctionCall(buffer)) {
        // Pass through JSON - executor will process
        controller.enqueue(chunk);
        return;
      }

      // Check for leakage patterns
      const detection = detectsFunctionCallLeakage(buffer);
      if (detection.detected) {
        const replacement = getReplacementText(detection);
        if (replacement) {
          controller.enqueue(replacement);
        }
        // Otherwise, silently filter
        buffer = '';
        return;
      }

      // Pass through clean text
      controller.enqueue(chunk);

      // Keep buffer reasonable size
      if (buffer.length > 500) {
        buffer = buffer.slice(-200);
      }
    },

    flush(controller) {
      // Clear buffer on stream end
      buffer = '';
    },
  });

  return transformer;
}

// ============================================================================
// SANITIZER WITH MUSIC FALLBACK
// ============================================================================

/**
 * Creates a transform stream with music tool fallback.
 * When Gemini narrates "Playing music..." instead of calling the tool,
 * this will execute the tool directly.
 *
 * @param options - Configuration options
 * @returns Transform stream with fallback behavior
 */
export function createSanitizerWithMusicFallback(
  options: SanitizerStreamOptions = {}
): AnyTransformStream {
  const { toolContext, session, sessionId } = options;

  let buffer = '';
  let musicFallbackTriggered = false;

  const transformer = new TransformStream<string, string>({
    async transform(chunk, controller) {
      buffer += chunk;

      // Check for music narration pattern
      if (!musicFallbackTriggered && shouldTriggerMusicFallback(buffer)) {
        musicFallbackTriggered = true;

        const query = extractMusicQuery(buffer);
        if (query && session && toolContext) {
          log.info('Music fallback triggered:', { query });

          // Create tool ID for dedup
          const toolId = `playMusic:${query}`;

          // Check if already executed by semantic router
          if (sessionId && wasToolExecutedBySemanticRouter(sessionId, toolId)) {
            log.debug('Music tool already executed by semantic router, skipping');
          } else {
            // Mark as executed
            if (sessionId) {
              markToolExecutedBySemanticRouter(sessionId, toolId);
            }

            // Execute music tool
            try {
              await executeMusicFallback(query, toolContext, session);
            } catch (error) {
              log.error('Music fallback execution failed:', error);
            }
          }
        }

        // Filter out the narration
        buffer = '';
        return;
      }

      // Standard leakage detection
      const detection = detectsFunctionCallLeakage(buffer);
      if (detection.detected) {
        const replacement = getReplacementText(detection);
        if (replacement) {
          controller.enqueue(replacement);
        }
        buffer = '';
        return;
      }

      // Pass through clean text
      controller.enqueue(chunk);

      // Keep buffer reasonable
      if (buffer.length > 500) {
        buffer = buffer.slice(-200);
      }
    },

    flush() {
      buffer = '';
      musicFallbackTriggered = false;
    },
  });

  return transformer;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Music narration patterns that indicate LLM talked instead of called
 */
const MUSIC_NARRATION_PATTERNS = [
  /playing\s+(some\s+)?(\w+)\s+(music|songs?|tracks?)/i,
  /let me play\s+(some\s+)?(\w+)/i,
  /i(?:'ll| will) play\s+(some\s+)?(\w+)/i,
  /searching for\s+(\w+)\s+(music|songs?)/i,
];

/**
 * Check if buffer contains music narration that needs fallback
 */
function shouldTriggerMusicFallback(text: string): boolean {
  return MUSIC_NARRATION_PATTERNS.some((p) => p.test(text));
}

/**
 * Extract music query from narration text
 */
function extractMusicQuery(text: string): string | null {
  for (const pattern of MUSIC_NARRATION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // Return captured group (usually genre/artist)
      return match[2] || match[1]?.replace(/^some\s+/, '') || null;
    }
  }
  return null;
}

/**
 * Execute music tool as fallback
 */
async function executeMusicFallback(
  query: string,
  toolContext: Record<string, unknown>,
  session: SanitizerStreamOptions['session']
): Promise<void> {
  try {
    // Use the JSON function executor to handle the music request
    const { executeJsonFunction } = await import('../../json-function-executor.js');

    const result = await executeJsonFunction(
      {
        fn: 'playMusic',
        args: { query },
        raw: JSON.stringify({ fn: 'playMusic', args: { query } }),
      },
      toolContext
    );

    if (result.success) {
      // Acknowledge to user
      const acknowledgment = `Sure, playing ${query}`;
      session?.say?.(acknowledgment, { allowInterruptions: true });
    } else {
      log.warn({ error: result.error }, 'Music fallback failed');
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Music fallback execution error');
  }
}

// ============================================================================
// GUIDANCE STRIP STREAM
// ============================================================================

/**
 * Patterns for internal guidance blocks to strip (JS fallback)
 */
const GUIDANCE_BLOCK_PATTERNS = [
  /<guidance>[\s\S]*?<\/guidance>/gi,
  /<internal>[\s\S]*?<\/internal>/gi,
  /<system>[\s\S]*?<\/system>/gi,
  /\[guidance\][\s\S]*?\[\/guidance\]/gi,
  /\[internal\][\s\S]*?\[\/internal\]/gi,
  /\[system\][\s\S]*?\[\/system\]/gi,
  /---\s*guidance\s*---[\s\S]*?---\s*end\s*guidance\s*---/gi,
];

/** Check if native Rust acceleration is available */
const useNativeStripping = isGuidanceStrippingAvailable();

if (useNativeStripping) {
  log.debug('🦀 Using Rust-accelerated guidance block stripping (Aho-Corasick O(n))');
}

/**
 * Strip guidance blocks from text (JS fallback implementation)
 */
function stripGuidanceBlocksJS(text: string): string {
  let result = text;
  for (const pattern of GUIDANCE_BLOCK_PATTERNS) {
    result = result.replace(pattern, '');
  }
  return result.trim();
}

/**
 * Strip guidance blocks from text
 * Uses Rust Aho-Corasick for O(n) multi-pattern matching when available.
 *
 * **Behavior Note (Rust vs JS):**
 * - Unclosed blocks: Rust strips everything after open tag, JS keeps unclosed content
 * - This is intentional: in streaming TTS, unclosed blocks should be hidden
 * - Markdown patterns use literal matching (most common spacing variations supported)
 *
 * @param text - Text to strip guidance from
 * @returns Text with guidance blocks removed
 */
export function stripGuidanceBlocks(text: string): string {
  if (useNativeStripping) {
    try {
      return rustStripGuidanceBlocks(text);
    } catch {
      // Fall back to JS on any error
      return stripGuidanceBlocksJS(text);
    }
  }
  return stripGuidanceBlocksJS(text);
}

/**
 * Fast check if text contains guidance blocks (no stripping)
 * Uses Rust Aho-Corasick for O(n) detection when available.
 */
export function containsGuidanceBlocks(text: string): boolean {
  if (useNativeStripping) {
    try {
      return rustContainsGuidanceBlocks(text);
    } catch {
      // Fall back to JS pattern check
      return GUIDANCE_BLOCK_PATTERNS.some((p) => p.test(text));
    }
  }
  return GUIDANCE_BLOCK_PATTERNS.some((p) => p.test(text));
}

/**
 * Create a stream that strips guidance blocks
 */
export function createGuidanceStripStream(): AnyTransformStream {
  let buffer = '';

  return new TransformStream<string, string>({
    transform(chunk, controller) {
      buffer += chunk;

      // Look for complete guidance blocks
      const stripped = stripGuidanceBlocks(buffer);

      // If we stripped something, output the cleaned version
      if (stripped !== buffer) {
        controller.enqueue(stripped);
        buffer = '';
      } else if (!buffer.includes('<') && !buffer.includes('[')) {
        // No potential blocks, pass through
        controller.enqueue(chunk);
        buffer = buffer.slice(-50); // Keep small buffer for potential tags
      }
      // Otherwise, buffer and wait for more
    },

    flush(controller) {
      // Output any remaining clean content
      const stripped = stripGuidanceBlocks(buffer);
      if (stripped) {
        controller.enqueue(stripped);
      }
      buffer = '';
    },
  });
}
