/**
 * Speech Coordinator - Session Integration
 *
 * Wires the SpeechCoordinator into the voice agent session lifecycle.
 * This is the bridge between our coordination system and the actual voice agent.
 *
 * USAGE:
 * 1. Call initializeSpeechCoordination() after session is created
 * 2. Call cleanupSpeechCoordination() on session cleanup
 * 3. Use routeSpeech() instead of direct session.say() calls
 *
 * @module speech/coordination/session-integration
 */

import type { voice } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';
import { getSpeechCoordinator, SpeechPriority, type SpeechRequest } from './speech-coordinator.js';
import { generateAcknowledgment, getToolCategory } from './persona-acknowledgments.js';
import { getEstimatedDuration, recordToolDuration } from './coordinated-tool-executor.js';

const log = createLogger({ module: 'speech-coordination-integration' });

// ============================================================================
// SSML STRIPPING (for fallback path)
// ============================================================================
// Cartesia's LiveKit plugin fragments SSML tags, causing them to be spoken literally.
// This helper strips SSML for the fallback session.say() path.

function stripSSMLForTTS(text: string): string {
  let result = text;
  
  // Convert <break time="Xms"/> to natural pauses
  result = result.replace(
    /<break\s+time=["']?(\d+)(?:ms)?["']?\s*\/?>/gi,
    (_, ms) => {
      const duration = parseInt(ms, 10);
      if (duration >= 300) return '. ';
      if (duration >= 100) return ', ';
      return ' ';
    }
  );
  
  // Strip emotion, speed, volume, prosody tags
  result = result.replace(/<\/?(?:speed|volume|emotion|prosody)[^>]*>/gi, '');
  
  // Strip any other XML-like tags
  result = result.replace(/<[^>]+>/g, '');
  
  // Clean up whitespace and punctuation
  result = result.replace(/\s+/g, ' ');
  result = result.replace(/\.\s*\./g, '.');
  result = result.replace(/,\s*,/g, ',');
  result = result.replace(/^\s*[.,]\s*/, '');
  
  return result.trim();
}

// ============================================================================
// TYPES
// ============================================================================

/** Integration context */
export interface SpeechCoordinationContext {
  session: voice.AgentSession;
  sessionId: string;
  personaId: string;
  userId?: string;
}

/** Speech request options (simplified for callers) */
export interface SpeakOptions {
  /** Priority override (defaults based on source) */
  priority?: SpeechPriority;
  /** Allow user to interrupt */
  allowInterruptions?: boolean;
  /** Source of the speech request */
  source?: SpeechRequest['source'];
  /** Tool ID if this is a tool result */
  toolId?: string;
  /** Callback when speech starts */
  onStart?: () => void;
  /** Callback when speech ends */
  onEnd?: (interrupted: boolean) => void;
}

// ============================================================================
// SESSION STATE
// ============================================================================

/** Per-session coordination state */
interface SessionState {
  sessionId: string;
  personaId: string;
  userId?: string;
  session: voice.AgentSession;
  isAttached: boolean;
}

const sessionStates = new Map<string, SessionState>();

// ============================================================================
// INITIALIZATION & CLEANUP
// ============================================================================

/**
 * Initialize speech coordination for a session.
 * MUST be called after session is created, before any speech.
 */
export function initializeSpeechCoordination(ctx: SpeechCoordinationContext): void {
  const { session, sessionId, personaId, userId } = ctx;
  const coordinator = getSpeechCoordinator();

  // Store session state
  sessionStates.set(sessionId, {
    sessionId,
    personaId,
    userId,
    session,
    isAttached: true,
  });

  // Attach coordinator to session with context for TTS Gateway
  // FIX (Jan 2026): Pass sessionId and personaId so the coordinator
  // can properly route speech through TTS Gateway with correct voice
  coordinator.attachSession(session, { sessionId, personaId });

  log.info({ sessionId, personaId }, 'Speech coordination initialized');
}

/**
 * Cleanup speech coordination for a session.
 * MUST be called on session cleanup to prevent memory leaks.
 */
export function cleanupSpeechCoordination(sessionId: string): void {
  const state = sessionStates.get(sessionId);
  if (!state) {
    log.debug({ sessionId }, 'No speech coordination state to cleanup');
    return;
  }

  const coordinator = getSpeechCoordinator();
  coordinator.detachSession();

  sessionStates.delete(sessionId);
  log.info({ sessionId }, 'Speech coordination cleaned up');
}

/**
 * Check if speech coordination is initialized for a session
 */
export function isCoordinationInitialized(sessionId: string): boolean {
  return sessionStates.has(sessionId);
}

// ============================================================================
// SPEECH ROUTING
// ============================================================================

/**
 * Route speech through the coordinator.
 * This is the main entry point for all speech output.
 *
 * Use this INSTEAD of direct session.say() calls.
 */
export async function routeSpeech(
  sessionId: string,
  text: string,
  options: SpeakOptions = {}
): Promise<{ accepted: boolean; id: string; reason?: string }> {
  const state = sessionStates.get(sessionId);

  if (!state || !state.isAttached) {
    log.warn({ sessionId }, 'Speech coordination not initialized - falling back to direct speech');
    // Fallback: speak directly if coordination not set up
    // 🔧 FIX: Strip SSML tags before sending to TTS
    const textToSpeak = stripSSMLForTTS(text);
    try {
      state?.session?.say(textToSpeak, { allowInterruptions: options.allowInterruptions ?? true });
      return { accepted: true, id: 'fallback-direct' };
    } catch (err) {
      return { accepted: false, id: 'fallback-failed', reason: String(err) };
    }
  }

  const coordinator = getSpeechCoordinator();
  const priority = options.priority ?? getPriorityForSource(options.source);

  return coordinator.requestSpeak({
    text,
    priority,
    source: options.source ?? 'direct',
    allowInterruptions: options.allowInterruptions ?? true,
    onStart: options.onStart,
    onEnd: options.onEnd,
  });
}

/**
 * Route a tool result through the coordinator with optional acknowledgment.
 */
export async function routeToolResult(
  sessionId: string,
  toolId: string,
  resultText: string,
  options: {
    /** Whether tool already took a long time (skip ack if so) */
    alreadyAcknowledged?: boolean;
    /** Speak the result directly without LLM processing */
    speakDirectly?: boolean;
    /** Actual execution time for learning */
    executionTimeMs?: number;
  } = {}
): Promise<{ accepted: boolean; id: string }> {
  const state = sessionStates.get(sessionId);
  if (!state) {
    return { accepted: false, id: 'no-session' };
  }

  // Record execution time for learning
  if (options.executionTimeMs) {
    recordToolDuration(toolId, options.executionTimeMs);
  }

  const coordinator = getSpeechCoordinator();

  if (options.speakDirectly) {
    return coordinator.speakToolResult(resultText, toolId);
  }

  // For LLM-processed results, use TOOL_RESULT priority
  return routeSpeech(sessionId, resultText, {
    priority: SpeechPriority.TOOL_RESULT,
    source: 'tool',
    toolId,
  });
}

/**
 * Speak an acknowledgment before a slow tool runs.
 * Uses persona-aware, learned acknowledgments.
 */
export async function speakToolAcknowledgment(
  sessionId: string,
  toolId: string
): Promise<{ accepted: boolean; id: string; skipped?: boolean }> {
  const state = sessionStates.get(sessionId);
  if (!state) {
    return { accepted: false, id: 'no-session' };
  }

  // Check if tool is expected to be slow enough to warrant acknowledgment
  const estimatedTime = getEstimatedDuration(toolId);
  if (estimatedTime < 1000) {
    return { accepted: true, id: 'skipped-fast-tool', skipped: true };
  }

  const coordinator = getSpeechCoordinator();
  const ackText = generateAcknowledgment({
    personaId: state.personaId,
    userId: state.userId,
    toolId,
    toolCategory: getToolCategory(toolId),
    estimatedWaitMs: estimatedTime,
  });

  return coordinator.speakAcknowledgment(ackText);
}

/**
 * Speak a backchannel (mm-hmm, yeah, etc.)
 * Low priority - can be dropped if higher priority speech pending.
 */
export async function speakBackchannel(
  sessionId: string,
  text: string
): Promise<{ accepted: boolean; id: string }> {
  const coordinator = getSpeechCoordinator();
  return coordinator.speakBackchannel(text);
}

// ============================================================================
// ECHO DETECTION
// ============================================================================

/**
 * Record an echo detection event for adaptive learning.
 * Call this when we detect agent audio being picked up as user speech.
 */
export function recordEchoDetected(sessionId: string, delayAfterSpeechMs: number): void {
  const coordinator = getSpeechCoordinator();
  coordinator.recordEchoDetection(delayAfterSpeechMs);
  log.debug({ sessionId, delayMs: delayAfterSpeechMs }, 'Echo detection recorded');
}

/**
 * Get the adaptive echo prevention window for the current session.
 *
 * CRITICAL FIX: Now accepts userTranscript for content-aware echo detection.
 * Pass the user's transcript to enable intelligent detection of legitimate
 * requests vs echoes (e.g., "Could you check the news?" should NOT be blocked).
 *
 * @param lastUtteranceDurationMs - Duration of last agent utterance in ms
 * @param userTranscript - Optional: the user's transcript for content-aware detection
 */
export function getAdaptiveEchoWindow(
  lastUtteranceDurationMs?: number,
  userTranscript?: string
): number {
  const coordinator = getSpeechCoordinator();
  return coordinator.getEchoWindow(lastUtteranceDurationMs, userTranscript);
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get default priority for a speech source
 */
function getPriorityForSource(source?: SpeechRequest['source']): SpeechPriority {
  switch (source) {
    case 'backchannel':
      return SpeechPriority.BACKCHANNEL;
    case 'acknowledgment':
      return SpeechPriority.ACKNOWLEDGMENT;
    case 'tool':
      return SpeechPriority.TOOL_RESULT;
    case 'llm':
    case 'direct':
    default:
      return SpeechPriority.RESPONSE;
  }
}

/**
 * Get coordinator stats for monitoring
 */
export function getCoordinatorStats() {
  const coordinator = getSpeechCoordinator();
  return {
    ...coordinator.getStats(),
    timing: coordinator.getAdaptiveTiming(),
  };
}

// ============================================================================
// DIRECT SESSION ACCESS (for migration)
// ============================================================================

/**
 * Get the session for a coordinated session.
 * Use this only for operations that can't go through the coordinator.
 * Prefer routeSpeech() for all speech output.
 */
export function getSessionForCoordination(sessionId: string): voice.AgentSession | null {
  const state = sessionStates.get(sessionId);
  return state?.session ?? null;
}

/**
 * Wrapper for session.say() that routes through coordinator.
 * Drop-in replacement for direct session.say() calls.
 *
 * @deprecated Prefer routeSpeech() for new code
 */
export function coordinatedSay(
  sessionId: string,
  text: string,
  options?: { allowInterruptions?: boolean }
): void {
  // Fire and forget - matches session.say() signature
  void routeSpeech(sessionId, text, {
    allowInterruptions: options?.allowInterruptions,
    source: 'direct',
  }).catch((err) => {
    log.warn({ sessionId, error: String(err) }, 'Coordinated say failed');
  });
}
