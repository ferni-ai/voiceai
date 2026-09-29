/**
 * SSML Processor Implementation
 *
 * Handles SSML parsing, buffering, and transformation.
 * This is the critical component that prevents SSML tag fragmentation.
 *
 * Design decisions:
 * 1. **Buffer complete tags** - Ensure SSML tags aren't split across chunks
 * 2. **Extract prosody** - Convert SSML tags to API parameters where possible
 * 3. **Convert breaks to punctuation** - Since Cartesia streaming can't handle breaks reliably
 * 4. **Preserve intent** - Even when stripping, maintain the speech intent
 *
 * @module speech/tts-gateway/ssml/processor
 */

import { TransformStream } from 'node:stream/web';
import type { ISSMLProcessor, SSMLParseResult, SSMLProsodyConfig } from '../types.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'SSMLProcessor' });

// ============================================================================
// CONSTANTS
// ============================================================================

/** Valid Cartesia Sonic-3 emotions (43+ supported) */
const VALID_EMOTIONS = [
  // Primary (best results)
  'neutral', 'angry', 'excited', 'content', 'sad', 'scared',
  // Positive high-energy
  'happy', 'enthusiastic', 'elated', 'euphoric', 'triumphant', 'amazed', 'surprised',
  // Positive social
  'flirtatious', 'joking/comedic', 'curious', 'grateful', 'affectionate', 'sympathetic', 'proud', 'confident',
  // Calm/content
  'peaceful', 'serene', 'calm',
  // Thoughtful
  'contemplative', 'nostalgic', 'wistful', 'mysterious', 'anticipation',
  // Negative
  'mad', 'outraged', 'frustrated', 'agitated', 'disgusted', 'contempt', 'envious', 'sarcastic', 'ironic',
  // Sad spectrum
  'dejected', 'melancholic', 'disappointed', 'hurt', 'guilty', 'rejected',
  // Low energy
  'bored', 'tired', 'resigned',
  // Uncertain/vulnerable
  'hesitant', 'insecure', 'confused', 'apologetic', 'anxious',
  // Fear spectrum
  'panicked', 'alarmed', 'threatened',
  // Neutral/professional
  'distant', 'skeptical', 'determined',
  // Legacy aliases (map to Cartesia equivalents)
  'happiness', 'sadness', 'anger', 'fear', 'surprise', 'disgust', 'curiosity', 'positivity', 'negativity',
] as const;

/** Maximum buffer size to prevent memory issues */
const MAX_BUFFER_SIZE = 4096;

/**
 * Bracket expressions that map to Cartesia's native [laughter] tag.
 * LLMs often output variations; we normalize them all.
 */
const LAUGHTER_BRACKET_REGEX =
  /\[(laughs?|chuckles?|chuckling|warm laugh|big laugh|laughing|laughter)\]/gi;

/**
 * Non-TTS bracket expressions that should be stripped entirely.
 * These are stage directions / emotes that can't be synthesized.
 */
const STRIP_BRACKET_REGEX =
  /\[(excited|leans in|leans forward|pauses?|sighs?|smiles?|nods?|grins?|winks?|thinks?|gestures?|whispers?|shrugs?|clears throat|beats?|softly|warmly|gently|laughs at self)[^\]]*\]/gi;

/**
 * The same stage directions in parentheses, e.g. "(pause)", "(laughs softly)".
 * Only direction words are matched, so "(or text me)" is still spoken.
 */
const STRIP_PAREN_DIRECTION_REGEX =
  /\s*\((?:pauses?|beat|sighs?|smiles?|nods?|grins?|winks?|laughs?|laughing|chuckles?|chuckling|whispers?|shrugs?|breathes|breath|clears throat|leans in|softly|warmly|gently)\b[^)]{0,30}\)/gi;

/** Speed range (Cartesia limits) */
const SPEED_MIN = 0.6;
const SPEED_MAX = 1.5;

/** Volume range (Cartesia limits) */
const VOLUME_MIN = 0.5;
const VOLUME_MAX = 2.0;

// ============================================================================
// REGEX PATTERNS
// ============================================================================

/** Match <speed ratio="X"/> tags */
const SPEED_TAG_REGEX = /<speed\s+ratio=["']?([0-9.]+)["']?\s*\/?>/gi;

/** Match <volume ratio="X"/> tags */
const VOLUME_TAG_REGEX = /<volume\s+ratio=["']?([0-9.]+)["']?\s*\/?>/gi;

/** Match <emotion value="X"/> or <emotion value="X" intensity="Y"/> tags */
const EMOTION_TAG_REGEX =
  /<emotion\s+(?:value=["']?([^"'>\s]+)["']?)(?:\s+intensity=["']?([0-9.]+)["']?)?\s*\/?>/gi;

/** Match <break time="Xms"/> or <break time="Xs"/> tags */
const BREAK_TAG_REGEX = /<break\s+time=["']?(\d+)(ms|s)?["']?\s*\/?>/gi;

/** A kept break, between the break conversion and the catch-all tag strip. */
const BREAK_HOLD = '\u2983BREAK';
const BREAK_HOLD_END = '\u2984';
const BREAK_HOLD_REGEX = /\u2983BREAK(\d+)\u2984/g;

/** Text as spoken: without the native break tags Sonic consumes. */
export function speakableText(text: string): string {
  return text.replace(/<break time="\d+ms"\/>/g, '');
}

/** Match closing prosody tags */
const PROSODY_CLOSE_REGEX = /<\/(?:speed|volume|emotion|prosody)>/gi;

/** Match any XML-like tag (no 'g' flag — safe for .test() which is stateful with /g) */
const ANY_TAG_REGEX = /<[^>]+>/;

/**
 * Match JSON function call blocks that LLM might output alongside speech text
 * Pattern: ```json\n{"fn":...}``` or just {"fn":...}
 *
 * CRITICAL: This prevents JSON tool calls from being spoken aloud!
 * The LLM sometimes outputs JSON even when asked to respond naturally.
 *
 * FIX (Jan 2026): Updated to handle nested braces in "args":{}
 * The [^`]* pattern allows any non-backtick char inside the code fence,
 * which properly handles nested JSON like {"fn":"x","args":{"key":"value"}}
 */
const JSON_FUNCTION_CALL_REGEX = /```(?:json)?\s*\{[^`]*"fn"\s*:\s*"[^"]+"\s*[^`]*\}\s*```/gi;

/**
 * Match inline JSON function calls without code fences
 * FIX (Jan 2026): Use pattern that handles nested args braces
 * Pattern handles: {"fn":"x","args":{}} and {"fn":"x","args":{"k":"v"}}
 */
const INLINE_JSON_FN_REGEX = /\{"fn"\s*:\s*"[^"]+"\s*,\s*"args"\s*:\s*\{[^{}]*\}\s*\}/g;

/**
 * Match partial/truncated JSON blocks (can happen with streaming)
 * Catches: ```json {"fn  or ```json\n{
 * FIX (Jan 2026): Also catches truncated JSON ending with backticks
 */
const PARTIAL_JSON_BLOCK_REGEX = /```(?:json|js)?\s*\{[^`]*$/gi;

/**
 * Match any code fence containing "fn" keyword (catches malformed JSON too)
 * This is a safety net for edge cases the other patterns miss
 */
const ANY_CODE_FENCE_WITH_FN = /```[^`]*"fn"\s*:[^`]*```/gi;

/**
 * Match truncated JSON that ends mid-string (very aggressive)
 * Catches: ```json\n{"fn":"``` (truncated mid-JSON)
 * This pattern looks for code fence start + "fn" anywhere, ending with backticks
 */
const TRUNCATED_JSON_WITH_FN = /```(?:json|js)?[^`]*"fn"[^`]*```/gi;

/**
 * Match any remaining ```json or ```js blocks (nuclear option)
 * If we see triple backticks with json/js, it's probably tool output that shouldn't be spoken
 */
const ANY_JSON_CODE_BLOCK = /```(?:json|js)[^`]*```/gi;

// ============================================================================
// SSML PROCESSOR CLASS
// ============================================================================

/**
 * SSML Processor implementation
 *
 * Provides SSML parsing, buffering, and transformation capabilities.
 */
export class SSMLProcessor implements ISSMLProcessor {
  /**
   * Parse SSML from text
   *
   * Extracts prosody configuration and cleans the text.
   * Break tags are converted to punctuation since they can't be reliably
   * passed through streaming TTS.
   *
   * @param text - Text potentially containing SSML tags
   * @returns Parse result with clean text and extracted config
   */
  parse(text: string): SSMLParseResult {
    const warnings: string[] = [];
    const originalTags: string[] = [];
    const prosody: SSMLProsodyConfig = {};
    let cleanText = text;
    let hadSSML = false;

    // Extract speed tags
    cleanText = cleanText.replace(SPEED_TAG_REGEX, (match, ratio: string) => {
      hadSSML = true;
      originalTags.push(match);

      const speed = parseFloat(ratio);
      if (isNaN(speed)) {
        warnings.push(`Invalid speed ratio: ${ratio}`);
        return '';
      }

      if (speed < SPEED_MIN || speed > SPEED_MAX) {
        warnings.push(`Speed ${speed} outside valid range [${SPEED_MIN}, ${SPEED_MAX}]`);
        prosody.speed = Math.max(SPEED_MIN, Math.min(SPEED_MAX, speed));
      } else {
        prosody.speed = speed;
      }

      return '';
    });

    // Extract volume tags
    cleanText = cleanText.replace(VOLUME_TAG_REGEX, (match, ratio: string) => {
      hadSSML = true;
      originalTags.push(match);

      const volume = parseFloat(ratio);
      if (isNaN(volume)) {
        warnings.push(`Invalid volume ratio: ${ratio}`);
        return '';
      }

      if (volume < VOLUME_MIN || volume > VOLUME_MAX) {
        warnings.push(`Volume ${volume} outside valid range [${VOLUME_MIN}, ${VOLUME_MAX}]`);
        prosody.volume = Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, volume));
      } else {
        prosody.volume = volume;
      }

      return '';
    });

    // Extract emotion tags
    cleanText = cleanText.replace(
      EMOTION_TAG_REGEX,
      (match, emotion: string, intensity: string) => {
        hadSSML = true;
        originalTags.push(match);

        if (!emotion) {
          warnings.push('Empty emotion value');
          return '';
        }

        const normalizedEmotion = emotion.toLowerCase();
        if (!VALID_EMOTIONS.includes(normalizedEmotion as (typeof VALID_EMOTIONS)[number])) {
          warnings.push(`Unknown emotion: ${emotion}`);
          return '';
        }

        prosody.emotion = normalizedEmotion;

        if (intensity) {
          const intensityVal = parseFloat(intensity);
          if (!isNaN(intensityVal) && intensityVal >= 0 && intensityVal <= 1) {
            prosody.emotionIntensity = intensityVal;
          } else {
            warnings.push(`Invalid emotion intensity: ${intensity}`);
          }
        }

        return '';
      }
    );

    // Convert break tags to punctuation
    // This preserves the intent (pause) while being streaming-safe
    cleanText = cleanText.replace(BREAK_TAG_REGEX, (match, time: string, unit: string) => {
      hadSSML = true;
      originalTags.push(match);

      let durationMs = parseInt(time, 10);
      if (unit === 's') {
        durationMs *= 1000;
      }

      // A deliberate pause stays a native Sonic break: as punctuation a 1 s
      // break became ". ", a 270 ms gap, against 1.3 s for the tag (measured
      // on Ferni's voice, sonic-3.6, 2026-09-29). Cartesia notes a break
      // splits the generation, so only real pauses keep it.
      if (durationMs >= 400) {
        // Held as a placeholder past the catch-all tag strip below.
        return `${BREAK_HOLD}${Math.min(durationMs, 3000)}${BREAK_HOLD_END}`;
      } else if (durationMs >= 200) {
        return ', ';
      } else if (durationMs >= 50) {
        return ' ';
      }
      return '';
    });

    // Remove any closing tags
    cleanText = cleanText.replace(PROSODY_CLOSE_REGEX, () => {
      hadSSML = true;
      return '';
    });

    // =========================================================================
    // BRACKET EXPRESSION HANDLING
    // Convert laughter variants to Cartesia-native [laughter] tag.
    // Strip non-TTS stage directions like [excited], [leans in], etc.
    // =========================================================================

    // Convert laughter bracket expressions → Cartesia-native [laughter]
    cleanText = cleanText.replace(LAUGHTER_BRACKET_REGEX, '[laughter]');

    // Strip non-synthesizable bracket expressions entirely
    cleanText = cleanText.replace(STRIP_BRACKET_REGEX, '');
    cleanText = cleanText.replace(STRIP_PAREN_DIRECTION_REGEX, '');

    // =========================================================================
    // CRITICAL: Strip JSON function call blocks
    // The LLM sometimes outputs JSON tool calls alongside natural speech text.
    // These MUST be stripped to prevent speaking "json fn play music" etc.
    // =========================================================================

    // Strip complete JSON blocks with code fences: ```json\n{"fn":"x"...}```
    const jsonBlocksFound = cleanText.match(JSON_FUNCTION_CALL_REGEX);
    if (jsonBlocksFound) {
      log.warn(
        { jsonBlocks: jsonBlocksFound.map((b) => b.slice(0, 50)), textLength: cleanText.length },
        '🚨 [SSMLProcessor] Stripping JSON function call blocks from TTS text'
      );
      cleanText = cleanText.replace(JSON_FUNCTION_CALL_REGEX, '');
    }

    // Strip inline JSON function calls without code fences: {"fn":"x"...}
    const inlineJsonFound = cleanText.match(INLINE_JSON_FN_REGEX);
    if (inlineJsonFound) {
      log.warn(
        { inlineJson: inlineJsonFound.map((j) => j.slice(0, 50)), textLength: cleanText.length },
        '🚨 [SSMLProcessor] Stripping inline JSON function calls from TTS text'
      );
      cleanText = cleanText.replace(INLINE_JSON_FN_REGEX, '');
    }

    // Strip partial/truncated JSON blocks (can happen with streaming)
    // Pattern: ```json {"fn (incomplete)
    const partialJsonFound = cleanText.match(PARTIAL_JSON_BLOCK_REGEX);
    if (partialJsonFound) {
      log.warn(
        { partialJson: partialJsonFound.map((p) => p.slice(0, 30)), textLength: cleanText.length },
        '🚨 [SSMLProcessor] Stripping partial JSON block from TTS text'
      );
      cleanText = cleanText.replace(PARTIAL_JSON_BLOCK_REGEX, '');
    }

    // Safety net: Strip any code fence that contains "fn" (catches edge cases)
    const codeFenceWithFn = cleanText.match(ANY_CODE_FENCE_WITH_FN);
    if (codeFenceWithFn) {
      log.warn(
        { codeFences: codeFenceWithFn.map((f) => f.slice(0, 50)), textLength: cleanText.length },
        '🚨 [SSMLProcessor] Stripping code fence containing "fn" (safety net)'
      );
      cleanText = cleanText.replace(ANY_CODE_FENCE_WITH_FN, '');
    }

    // FIX (Jan 2026): Strip truncated JSON with "fn" keyword
    const truncatedJson = cleanText.match(TRUNCATED_JSON_WITH_FN);
    if (truncatedJson) {
      log.warn(
        { truncatedJson: truncatedJson.map((t) => t.slice(0, 50)), textLength: cleanText.length },
        '🚨 [SSMLProcessor] Stripping truncated JSON with "fn" keyword'
      );
      cleanText = cleanText.replace(TRUNCATED_JSON_WITH_FN, '');
    }

    // Nuclear option: Strip ANY ```json or ```js code blocks
    // If we see a code fence with json/js, it's tool output that shouldn't be spoken
    const anyJsonBlock = cleanText.match(ANY_JSON_CODE_BLOCK);
    if (anyJsonBlock) {
      log.warn(
        { anyJsonBlock: anyJsonBlock.map((b) => b.slice(0, 50)), textLength: cleanText.length },
        '🚨 [SSMLProcessor] Stripping json/js code block (nuclear option)'
      );
      cleanText = cleanText.replace(ANY_JSON_CODE_BLOCK, '');
    }

    // Remove any remaining XML-like tags we might have missed
    // Use inline regex with 'g' flag for matching/replacing all occurrences
    const remainingTags = cleanText.match(/<[^>]+>/g);
    if (remainingTags) {
      hadSSML = true;
      for (const tag of remainingTags) {
        originalTags.push(tag);
      }
      cleanText = cleanText.replace(/<[^>]+>/g, '');
    }

    // Clean up whitespace and punctuation artifacts
    cleanText = this.cleanupText(cleanText);
    cleanText = cleanText.replace(BREAK_HOLD_REGEX, (_m, ms: string) => `<break time="${ms}ms"/>`);
    // Only pauses and punctuation left: nothing to say.
    if (!speakableText(cleanText).replace(/[\s.,!?…-]/g, '')) cleanText = '';

    return {
      cleanText,
      prosody,
      hadSSML,
      originalTags,
      warnings,
    };
  }

  /**
   * Create a transform stream that buffers complete SSML tags
   *
   * This is critical for preventing SSML tag fragmentation when streaming
   * text to TTS. The transform ensures that tags like `<break time="280ms"/>`
   * arrive as complete chunks rather than being split.
   *
   * @returns TransformStream that buffers until SSML tags are complete
   */
  createBufferTransform(): TransformStream<string, string> {
    let buffer = '';
    let totalBuffered = 0;

    return new TransformStream<string, string>({
      transform: (chunk, controller) => {
        buffer += chunk;
        totalBuffered += chunk.length;

        // Safety: prevent unbounded buffering
        if (totalBuffered > MAX_BUFFER_SIZE) {
          log.warn(
            { bufferSize: totalBuffered },
            'SSML buffer exceeded max size, flushing incomplete'
          );
          // Parse and emit what we have
          const result = this.parse(buffer);
          if (result.cleanText.trim()) {
            controller.enqueue(result.cleanText);
          }
          buffer = '';
          totalBuffered = 0;
          return;
        }

        // Check if we have incomplete SSML tags
        const lastOpenBracket = buffer.lastIndexOf('<');
        const lastCloseBracket = buffer.lastIndexOf('>');

        if (lastOpenBracket > lastCloseBracket) {
          // Incomplete tag - wait for more data
          return;
        }

        // All tags complete - parse and emit
        const result = this.parse(buffer);
        if (result.cleanText.trim()) {
          controller.enqueue(result.cleanText);
        }
        buffer = '';
        totalBuffered = 0;
      },

      flush: (controller) => {
        // Emit any remaining buffered content
        if (buffer.trim()) {
          const result = this.parse(buffer);
          if (result.cleanText.trim()) {
            controller.enqueue(result.cleanText);
          }
        }
        buffer = '';
        totalBuffered = 0;
      },
    });
  }

  /**
   * Normalize text for cache key generation
   *
   * Creates a consistent key by:
   * 1. Stripping all SSML tags
   * 2. Lowercasing
   * 3. Collapsing whitespace
   * 4. Trimming
   *
   * @param text - Text to normalize
   * @returns Normalized cache key string
   */
  normalizeForCache(text: string): string {
    const result = this.parse(text);
    return result.cleanText.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /**
   * Clean up text after SSML removal
   *
   * Fixes common artifacts like:
   * - Multiple spaces
   * - Multiple punctuation
   * - Leading/trailing punctuation
   */
  private cleanupText(text: string): string {
    return (
      text
        // Collapse multiple spaces
        .replace(/\s+/g, ' ')
        // Runs of periods: keep a spoken ellipsis ("..."), collapse the rest.
        // Collapsing "..." to "." turned a trailing-off pause into a full stop.
        .replace(/\.{4,}/g, '...')
        .replace(/(^|[^.])\.\.(?!\.)/g, '$1.')
        // Fix multiple commas
        .replace(/,+/g, ',')
        // A comma stuck to sentence punctuation ("Talk to me., Mm.,") comes
        // from a pause tag turned into a comma; the sentence end already pauses
        .replace(/([.!?])\s*,/g, '$1')
        // ...or a period stuck to a question or exclamation mark ("happening?.")
        .replace(/([!?])\s*\.(?!\.)/g, '$1')
        // Fix space before punctuation
        .replace(/\s+([.,!?;:])/g, '$1')
        // Sentences joined without a space ("background.I'm"), but not
        // initialisms (U.S.), decimals (3.5) or domains (ferni.ai)
        .replace(/([a-z][.!?])([A-Z])/g, '$1 $2')
        // Commas and colons without a following space
        .replace(/([,;:])([a-zA-Z])/g, '$1 $2')
        // Remove leading punctuation
        .replace(/^[.,!?;:\s]+/, '')
        // Trim
        .trim()
    );
  }
}

// ============================================================================
// FACTORY & SINGLETON
// ============================================================================

let processorInstance: SSMLProcessor | null = null;

/**
 * Get the singleton SSML processor instance
 */
export function getSSMLProcessor(): ISSMLProcessor {
  if (!processorInstance) {
    processorInstance = new SSMLProcessor();
  }
  return processorInstance;
}

/**
 * Create a new SSML processor instance (for testing)
 */
export function createSSMLProcessor(): ISSMLProcessor {
  return new SSMLProcessor();
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Parse SSML from text (convenience function)
 */
export function parseSSML(text: string): SSMLParseResult {
  return getSSMLProcessor().parse(text);
}

/**
 * Strip SSML from text (convenience function)
 */
export function stripSSML(text: string): string {
  return speakableText(getSSMLProcessor().parse(text).cleanText).replace(/\s{2,}/g, ' ');
}

/**
 * Normalize text for cache key (convenience function)
 */
export function normalizeForCache(text: string): string {
  return getSSMLProcessor().normalizeForCache(text);
}

/**
 * Check if text contains SSML tags
 */
export function containsSSML(text: string): boolean {
  return ANY_TAG_REGEX.test(text);
}

/**
 * Check if text has incomplete SSML tags
 */
export function hasIncompleteSSML(text: string): boolean {
  const lastOpen = text.lastIndexOf('<');
  const lastClose = text.lastIndexOf('>');
  return lastOpen > lastClose;
}
