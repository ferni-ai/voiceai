import { getAdaptiveEchoWindow, recordEchoDetected } from '../../speech/coordination/index.js';

/**
 * ECHO PREVENTION COOLDOWN
 *
 * After the agent finishes speaking, there's a delay before the microphone
 * stops picking up echo and the speech-to-text finishes processing. During
 * this window, we should NOT use cached responses to prevent the agent from
 * responding to its own echo (e.g., Ferni says "how are you?" → mic picks up
 * echo → transcribes "how are you" → matches cached response → says "I'm doing
 * well, thanks for asking!").
 *
 * With REQUIRE_FIX_VOICE=true, uses the adaptive echo window from
 * SpeechCoordinator; otherwise the fixed 2000ms below.
 *
 * Legacy 2 seconds accounts for:
 * - Audio buffer flush (~200-500ms)
 * - Speech-to-text processing (~500-1000ms)
 * - Network latency buffer (~200ms)
 */
const ECHO_PREVENTION_COOLDOWN_MS_DEFAULT = 2000;

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
export function getEchoPreventionCooldownMs(
  lastUtteranceDurationMs?: number,
  userTranscript?: string
): number {
  // The adaptive window used to be loaded with a bare require(), which throws
  // under ESM, so every call has run on the fixed 2000ms default. Turning the
  // adaptive window on changes call timing, so it waits behind its own flag.
  if (!isAdaptiveEchoWindowEnabled()) return ECHO_PREVENTION_COOLDOWN_MS_DEFAULT;
  try {
    return getAdaptiveEchoWindow(lastUtteranceDurationMs, userTranscript);
  } catch {
    return ECHO_PREVENTION_COOLDOWN_MS_DEFAULT;
  }
}

function isAdaptiveEchoWindowEnabled(): boolean {
  return process.env.REQUIRE_FIX_VOICE === 'true';
}

/**
 * Record echo detection for adaptive learning.
 * Call this when we detect what appears to be agent echo being picked up.
 */
export function recordEchoDetectionForLearning(sessionId: string, delayMs: number): void {
  if (!isAdaptiveEchoWindowEnabled()) return;
  try {
    recordEchoDetected(sessionId, delayMs);
  } catch {
    // Learning is best-effort
  }
}
