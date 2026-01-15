/**
 * TTS Registry - Session TTS State Management
 *
 * Manages TTS instance registration and accent changes for voice sessions.
 * This is a service layer module - both agents and API routes import from here.
 *
 * ARCHITECTURE:
 * 1. Voice agent registers TTS on session start
 * 2. API routes can queue accent changes
 * 3. Voice agent checks for pending changes before each utterance
 * 4. Voice agent unregisters TTS on session end
 *
 * @module services/session/tts-registry
 */

import type { EnglishAccent } from '../../config/voice-accents.js';
import type { PersonaAwareTTS } from '../../speech/tts/persona-aware.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger().child({ module: 'tts-registry' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Session accent state - tracks pending accent changes
 */
export interface SessionAccentState {
  accent: EnglishAccent;
  personaId: string;
  voiceId: string;
  updatedAt: Date;
}

/**
 * TTS registry entry - tracks active TTS instances
 */
interface TTSRegistryEntry {
  tts: PersonaAwareTTS;
  personaId: string;
  currentAccent: EnglishAccent;
}

// ============================================================================
// SESSION STATE STORES
// ============================================================================

/**
 * Store of active sessions and their current accent.
 * Key: sessionId
 * Value: { accent, personaId, voiceId }
 *
 * This is updated when accent changes mid-session.
 * The voice agent checks this on each utterance.
 */
const activeSessionAccents = new Map<string, SessionAccentState>();

/**
 * Registry of active TTS instances by session ID.
 * The voice agent registers its TTS here so we can apply accent changes.
 */
const activeTTSInstances = new Map<string, TTSRegistryEntry>();

// ============================================================================
// SESSION ACCENT MANAGEMENT
// ============================================================================

/**
 * Get the current accent for a session.
 */
export function getSessionAccent(sessionId: string): SessionAccentState | undefined {
  return activeSessionAccents.get(sessionId);
}

/**
 * Set accent for a session (called from API or voice agent).
 */
export function setSessionAccent(
  sessionId: string,
  accent: EnglishAccent,
  personaId: string,
  voiceId: string
): void {
  activeSessionAccents.set(sessionId, {
    accent,
    personaId,
    voiceId,
    updatedAt: new Date(),
  });
  log.info({ sessionId, accent, personaId }, '🌍 Session accent updated');
}

/**
 * Clear session accent (when session ends).
 */
export function clearSessionAccent(sessionId: string): void {
  activeSessionAccents.delete(sessionId);
}

/**
 * Check if a session has a pending accent change.
 */
export function hasAccentChange(sessionId: string): boolean {
  return activeSessionAccents.has(sessionId);
}

// =============================================================================
// TTS REGISTRY - For applying accent changes to active sessions
// =============================================================================

/**
 * Register a TTS instance for a session (called by voice agent).
 */
export function registerSessionTTS(
  sessionId: string,
  tts: PersonaAwareTTS,
  personaId: string,
  accent: EnglishAccent
): void {
  activeTTSInstances.set(sessionId, { tts, personaId, currentAccent: accent });
  log.debug({ sessionId, personaId, accent }, '📝 TTS registered for session');
}

/**
 * Unregister a TTS instance when session ends.
 */
export function unregisterSessionTTS(sessionId: string): void {
  activeTTSInstances.delete(sessionId);
  activeSessionAccents.delete(sessionId);
  log.debug({ sessionId }, '🗑️ TTS unregistered for session');
}

/**
 * Get the current persona ID for a session (from registered TTS).
 * Returns undefined if no TTS is registered.
 */
export function getSessionPersonaId(sessionId: string): string | undefined {
  return activeTTSInstances.get(sessionId)?.personaId;
}

/**
 * Check for and apply any pending accent changes for a session.
 * Called by voice agent before generating responses.
 *
 * @returns true if an accent change was applied
 */
export async function checkForAccentChange(sessionId: string): Promise<boolean> {
  const pendingChange = activeSessionAccents.get(sessionId);
  if (!pendingChange) {
    return false;
  }

  const ttsEntry = activeTTSInstances.get(sessionId);
  if (!ttsEntry) {
    log.warn({ sessionId }, 'Accent change pending but no TTS registered');
    return false;
  }

  // Check if accent actually changed
  if (ttsEntry.currentAccent === pendingChange.accent) {
    activeSessionAccents.delete(sessionId);
    return false;
  }

  // Save old accent BEFORE updating for correct logging
  const oldAccent = ttsEntry.currentAccent;

  try {
    // Apply the accent change
    const success = await ttsEntry.tts.switchToLocalizedAccent(
      pendingChange.accent,
      pendingChange.personaId
    );

    if (success) {
      // Update our tracking
      ttsEntry.currentAccent = pendingChange.accent;
      activeTTSInstances.set(sessionId, ttsEntry);

      log.info(
        { sessionId, from: oldAccent, to: pendingChange.accent },
        '✅ Applied mid-session accent change'
      );
    }

    // Clear the pending change
    activeSessionAccents.delete(sessionId);

    return success;
  } catch (error) {
    log.error({ sessionId, error: String(error) }, 'Failed to apply accent change');
    activeSessionAccents.delete(sessionId);
    return false;
  }
}
