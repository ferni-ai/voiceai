/**
 * Session Accent Routes
 *
 * API endpoint for changing accent mid-session.
 * This allows users to switch accents without starting a new conversation.
 *
 * ARCHITECTURE:
 * 1. Frontend calls POST /api/session/accent with new accent
 * 2. We store the pending accent change in activeSessionAccents
 * 3. Voice agent checks this before each response via checkForAccentChange()
 * 4. When checked, we apply the accent change to the TTS
 *
 * Note: The actual TTS voice switch happens on the next utterance,
 * not immediately mid-speech.
 */

import type { IncomingMessage, ServerResponse } from 'http';

import { isValidAccent, type EnglishAccent } from '../config/voice-accents.js';
import { getLocalizedVoiceId } from '../services/cartesia-voice-localization.js';
import type { PersonaAwareTTS } from '../speech/tts/persona-aware.js';
import { getLogger } from '../utils/safe-logger.js';
import { requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, parseBody } from './helpers.js';

const log = getLogger().child({ module: 'session-accent-routes' });

// ============================================================================
// TYPES
// ============================================================================

interface AccentChangeRequest {
  accent: EnglishAccent;
  sessionId?: string;
  personaId?: string;
}

interface AccentChangeResponse {
  success: boolean;
  accent: EnglishAccent;
  voiceId: string;
  isLocalized: boolean;
  message: string;
}

// ============================================================================
// ACTIVE SESSIONS STORE
// ============================================================================

/**
 * Store of active sessions and their current accent.
 * Key: sessionId
 * Value: { accent, personaId, voiceId }
 *
 * This is updated when accent changes mid-session.
 * The voice agent checks this on each utterance.
 */
interface SessionAccentState {
  accent: EnglishAccent;
  personaId: string;
  voiceId: string;
  updatedAt: Date;
}

const activeSessionAccents = new Map<string, SessionAccentState>();

/**
 * Get the current accent for a session.
 */
export function getSessionAccent(sessionId: string): SessionAccentState | undefined {
  return activeSessionAccents.get(sessionId);
}

/**
 * Set accent for a session (called from this API or voice agent).
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
 * Registry of active TTS instances by session ID.
 * The voice agent registers its TTS here so we can apply accent changes.
 */
const activeTTSInstances = new Map<
  string,
  { tts: PersonaAwareTTS; personaId: string; currentAccent: EnglishAccent }
>();

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

// ============================================================================
// HELPERS
// ============================================================================

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle session accent routes.
 *
 * Routes:
 * - POST /api/session/accent - Change accent for current session
 * - GET /api/session/accent - Get current session accent
 */
export async function handleSessionAccentRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const method = req.method?.toUpperCase();

  // Only handle /api/session/accent routes
  if (!pathname.startsWith('/api/session/accent')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Require authentication
  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) {
    return true; // 401 already sent
  }

  // ============================================================================
  // POST /api/session/accent - Change accent mid-session
  // ============================================================================
  if (pathname === '/api/session/accent' && method === 'POST') {
    const body = await parseBody<AccentChangeRequest>(req);

    if (!body?.accent) {
      sendJson(res, 400, { success: false, error: 'accent is required' });
      return true;
    }

    if (!isValidAccent(body.accent)) {
      sendJson(res, 400, {
        success: false,
        error: 'Invalid accent. Must be: american, british, australian, or indian',
      });
      return true;
    }

    const sessionId = body.sessionId || auth.userId;
    // Use provided personaId, or fall back to registered session persona, or finally 'ferni'
    const personaId = body.personaId || getSessionPersonaId(sessionId) || 'ferni';

    try {
      // Get the localized voice ID for this persona + accent
      const localizationResult = await getLocalizedVoiceId(personaId, body.accent);

      // Store for the voice agent to pick up on next utterance
      setSessionAccent(sessionId, body.accent, personaId, localizationResult.voiceId);

      const response: AccentChangeResponse = {
        success: true,
        accent: body.accent,
        voiceId: localizationResult.voiceId,
        isLocalized: localizationResult.isLocalized,
        message: `Accent changed to ${body.accent}. Will take effect on next response.`,
      };

      log.info(
        {
          sessionId,
          accent: body.accent,
          personaId,
          voiceId: localizationResult.voiceId,
          isLocalized: localizationResult.isLocalized,
        },
        '🌍 Mid-session accent change requested'
      );

      sendJson(res, 200, response);
    } catch (error) {
      log.error({ error: String(error), sessionId, accent: body.accent }, 'Accent change failed');
      sendJson(res, 500, {
        success: false,
        error: 'Failed to change accent. Please try again.',
      });
    }

    return true;
  }

  // ============================================================================
  // GET /api/session/accent - Get current session accent
  // ============================================================================
  if (pathname === '/api/session/accent' && method === 'GET') {
    const sessionId = auth.userId;
    const sessionState = getSessionAccent(sessionId);

    if (sessionState) {
      sendJson(res, 200, {
        success: true,
        accent: sessionState.accent,
        personaId: sessionState.personaId,
        voiceId: sessionState.voiceId,
        updatedAt: sessionState.updatedAt.toISOString(),
      });
    } else {
      // No override set - return default
      sendJson(res, 200, {
        success: true,
        accent: 'american',
        personaId: null,
        voiceId: null,
        message: 'No mid-session accent override set',
      });
    }

    return true;
  }

  return false;
}

export default handleSessionAccentRoutes;
