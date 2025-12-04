/**
 * Voice Agent Handlers
 *
 * Barrel export for all event and lifecycle handlers.
 */

// NOTE: Handoff handling is now in ../shared/handoff-handler.ts
// The duplicate handlers/handoff-handler.ts was removed as dead code.

// Silence handling
export {
  shouldRespondToSilence,
  generateSilenceResponse,
  createSilenceContext,
  updateSilenceContext,
  resetSilenceState,
  recordSilenceResponse,
  type SilenceState,
} from './silence-handler.js';

// User identification
export {
  identifyUser,
  isRealName,
  parseRoomMetadata,
  isReturningUser,
  type RoomMetadata,
  type UserIdentificationResult,
} from './user-identification.js';
