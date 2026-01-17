/**
 * Session Services
 *
 * Service layer for session state management.
 * These services are shared between agents and API routes.
 *
 * @module services/session
 */

// TTS Registry - Session TTS state and accent changes
export {
  // Types
  type SessionAccentState,

  // Session accent management
  getSessionAccent,
  setSessionAccent,
  clearSessionAccent,
  hasAccentChange,

  // TTS registry
  registerSessionTTS,
  unregisterSessionTTS,
  getSessionPersonaId,
  checkForAccentChange,
} from './tts-registry.js';
