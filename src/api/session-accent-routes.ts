/**
 * Session Accent Routes
 *
 * API endpoint for changing accent mid-session.
 * This allows users to switch accents without starting a new conversation.
 *
 * ARCHITECTURE:
 * 1. Frontend calls POST /api/session/accent with new accent
 * 2. We store the pending accent change via services/session/tts-registry
 * 3. Voice agent checks this before each response via checkForAccentChange()
 * 4. When checked, we apply the accent change to the TTS
 *
 * NOTE: Session state management logic is in services/session/tts-registry.ts
 * This file only contains the HTTP route handlers.
 */

import type { IncomingMessage, ServerResponse } from 'http';

import { isValidAccent, type EnglishAccent } from '../config/voice-accents.js';
import { getLocalizedVoiceId } from '../services/cartesia-voice-localization.js';
import { getLogger } from '../utils/safe-logger.js';
import { requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, parseBody } from './helpers.js';

// Import session state management from service layer (clean architecture)
import {
  getSessionAccent,
  setSessionAccent,
  getSessionPersonaId,
} from '../services/session/index.js';

// Re-export for backward compatibility (some callers may still import from here)
export {
  getSessionAccent,
  setSessionAccent,
  clearSessionAccent,
  hasAccentChange,
  registerSessionTTS,
  unregisterSessionTTS,
  getSessionPersonaId,
  checkForAccentChange,
  type SessionAccentState,
} from '../services/session/index.js';

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
