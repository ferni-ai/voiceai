/**
 * Echo Prevention Handler
 *
 * Handles adaptive echo prevention to avoid responding to agent's own echo.
 * Uses content-aware detection to distinguish legitimate requests from echoes.
 *
 * Extracted from transcript-handler.ts to reduce file size.
 *
 * @module voice-agent/echo-prevention
 */

import { diag } from '../../services/diagnostic-logger.js';
import { getSessionFlags } from '../../config/voice-humanization-flags.js';
import { getResponseAnticipationService } from '../../speech/response-anticipation.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * ECHO PREVENTION COOLDOWN
 *
 * After the agent finishes speaking, there's a delay before the microphone
 * stops picking up echo and the speech-to-text finishes processing. During
 * this window, we should NOT use cached responses to prevent the agent from
 * responding to its own echo (e.g., Ferni says "how are you?" -> mic picks up
 * echo -> transcribes "how are you" -> matches cached response -> says "I'm doing
 * well, thanks for asking!").
 *
 * NEW: Uses adaptive echo window from SpeechCoordinator when available.
 * Falls back to 2000ms if coordination system unavailable.
 *
 * Legacy 2 seconds accounts for:
 * - Audio buffer flush (~200-500ms)
 * - Speech-to-text processing (~500-1000ms)
 * - Network latency buffer (~200ms)
 */
const ECHO_PREVENTION_COOLDOWN_MS_DEFAULT = 2000;

// ============================================================================
// TYPES
// ============================================================================

export interface EchoCheckContext {
  /** Time since agent stopped speaking (ms) */
  timeSinceAgentSpoke: number;
  /** Whether agent is currently speaking */
  isAgentCurrentlySpeaking: boolean;
  /** Duration of last agent utterance (ms) */
  lastUtteranceDurationMs?: number;
  /** The user transcript for content-aware detection */
  userTranscript?: string;
  /** Whether user was interrupted */
  wasInterrupted?: boolean;
}

export interface EchoCheckResult {
  /** Whether we should skip cache due to echo concerns */
  shouldSkipCache: boolean;
  /** Whether we're in the echo cooldown window */
  isInEchoCooldown: boolean;
  /** The adaptive cooldown duration used */
  adaptiveCooldownMs: number;
  /** Whether this looks like a phantom transcript */
  isLikelyPhantom: boolean;
}

export interface CachedResponse {
  response: string;
  ssml: string;
  intent: string;
}

// ============================================================================
// ADAPTIVE ECHO WINDOW
// ============================================================================

/**
 * Get adaptive echo prevention window.
 * Uses learned timing from SpeechCoordinator when available.
 *
 * CRITICAL FIX: Now content-aware! Pass userTranscript to enable
 * intelligent detection of legitimate requests vs echoes.
 *
 * @param lastUtteranceDurationMs - Duration of last agent utterance
 * @param userTranscript - The user's transcript for content-aware detection
 */
export function getEchoPreventioncooldownMs(
  lastUtteranceDurationMs?: number,
  userTranscript?: string
): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getAdaptiveEchoWindow } = require('../../speech/coordination/index.js') as {
      getAdaptiveEchoWindow: (duration?: number, transcript?: string) => number;
    };
    return getAdaptiveEchoWindow(lastUtteranceDurationMs, userTranscript);
  } catch {
    // Fall back to default if coordination module unavailable
    return ECHO_PREVENTION_COOLDOWN_MS_DEFAULT;
  }
}

/**
 * Record echo detection for adaptive learning.
 * Call this when we detect what appears to be agent echo being picked up.
 */
export function recordEchoDetectionForLearning(sessionId: string, delayMs: number): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { recordEchoDetected } = require('../../speech/coordination/index.js') as {
      recordEchoDetected: (sessionId: string, delayMs: number) => void;
    };
    recordEchoDetected(sessionId, delayMs);
  } catch {
    // Ignore if coordination module unavailable
  }
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Check if we should skip cache and process for echo/phantom transcript detection.
 *
 * @param ctx - Echo check context
 * @param sessionId - Session ID for logging
 * @returns Echo check result
 */
export function checkForEcho(ctx: EchoCheckContext, sessionId: string): EchoCheckResult {
  const {
    timeSinceAgentSpoke,
    isAgentCurrentlySpeaking,
    lastUtteranceDurationMs,
    userTranscript,
    wasInterrupted,
  } = ctx;

  // Get adaptive echo cooldown window
  const adaptiveEchoCooldown = getEchoPreventioncooldownMs(lastUtteranceDurationMs, userTranscript);
  const isInEchoCooldown = timeSinceAgentSpoke < adaptiveEchoCooldown;

  // Skip cache if currently speaking OR within cooldown window
  const shouldSkipCache = isAgentCurrentlySpeaking || isInEchoCooldown;

  // Check for phantom transcript after interruption
  let isLikelyPhantom = false;

  if (
    isInEchoCooldown &&
    !isAgentCurrentlySpeaking &&
    wasInterrupted &&
    timeSinceAgentSpoke < 1500 &&
    userTranscript
  ) {
    const cleanedTranscript = userTranscript.trim();
    const words = cleanedTranscript.split(/\s+/).filter((w) => w.length > 0);
    const isShort = cleanedTranscript.length < 25 || words.length <= 4;

    // Check if it looks like a real interruption vs phantom transcript
    const interruptionSignals =
      /\b(wait|stop|hold|actually|but|no|sorry|excuse|hey|question|what|why|how|when|can you|could you)\b/i;
    const looksLikeRealInterruption = interruptionSignals.test(cleanedTranscript);

    // Generic acknowledgments that are unlikely to be real interruptions
    const genericAcknowledgments =
      /^(that'?s?\s+(so\s+)?(cool|great|nice|good|awesome|interesting|amazing)|yeah|yep|okay|ok|sure|right|got it|i see|mm+|uh huh|alright)\.?$/i;
    const isGenericAck = genericAcknowledgments.test(cleanedTranscript.trim());

    if (isShort && !looksLikeRealInterruption && (isGenericAck || words.length <= 3)) {
      isLikelyPhantom = true;
      diag.state('[ECHO] Detected likely phantom transcript after interruption', {
        transcript: cleanedTranscript,
        timeSinceAgentSpokeMs: timeSinceAgentSpoke,
        isShort,
        isGenericAck,
        wordCount: words.length,
      });
    }
  }

  // Log if we're in echo cooldown
  if (isInEchoCooldown && !isAgentCurrentlySpeaking && !isLikelyPhantom) {
    recordEchoDetectionForLearning(sessionId, timeSinceAgentSpoke);

    diag.state('CACHE BYPASS SKIPPED - Adaptive echo prevention', {
      timeSinceAgentSpokeMs: timeSinceAgentSpoke,
      adaptiveCooldownMs: adaptiveEchoCooldown,
      lastUtteranceDurationMs,
      transcript: userTranscript?.slice(0, 30),
    });
  }

  return {
    shouldSkipCache,
    isInEchoCooldown,
    adaptiveCooldownMs: adaptiveEchoCooldown,
    isLikelyPhantom,
  };
}

/**
 * Check if we have a cached response to bypass LLM
 * Returns the cached response + SSML if available
 */
export function getCachedResponseIfAvailable(sessionId: string): CachedResponse | null {
  const antFlags = getSessionFlags(sessionId);
  if (!antFlags.useCachedResponses) {
    return null;
  }

  try {
    const anticipator = getResponseAnticipationService(sessionId);
    if (!anticipator.hasCacheHit()) {
      return null;
    }

    const cached = anticipator.getCompleteResponse();
    if (!cached) {
      return null;
    }

    // Clear the cache hit flag after using
    const intent = anticipator.consumeCacheHit();
    return {
      response: cached.response,
      ssml: cached.ssml,
      intent: intent || 'unknown',
    };
  } catch {
    return null;
  }
}

export default {
  getEchoPreventioncooldownMs,
  recordEchoDetectionForLearning,
  checkForEcho,
  getCachedResponseIfAvailable,
};
