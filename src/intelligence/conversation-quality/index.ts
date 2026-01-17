/**
 * Conversation Quality Module
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Implements sophisticated conversation tracking and enhancement:
 * - Farewell summary generation
 * - Session recovery
 * - Graceful error handling
 * - Small detail memory
 * - Physical/emotional state awareness
 * - Follow-up scheduling
 * - Conversation pacing score
 *
 * Every conversation should feel complete - even when interrupted.
 *
 * @module conversation-quality
 */

// Export types
export type {
  FarewellSummary,
  SmallDetail,
  FollowUpItem,
  PersonaPhysicalState,
  ConversationPacingScore,
  SessionRecoveryState,
  GracefulError,
} from './types.js';

// Export farewell functions
export { generateFarewellSummary } from './farewell.js';

// Export small details functions
export { extractSmallDetails, getDetailCallback } from './small-details.js';

// Export follow-up functions
export { extractFollowUps, getFollowUpSuggestion } from './follow-ups.js';

// Export physical state functions
export { getPersonaPhysicalState, getPhysicalStateInterjection } from './physical-state.js';

// Export pacing functions
export { calculatePacingScore } from './pacing.js';

// Export recovery functions
export { createSessionRecoveryState, shouldAttemptRecovery } from './recovery.js';

// Export error response functions
export { getGracefulErrorResponse } from './error-responses.js';

// ============================================================================
// COMBINED EXPORT OBJECT (for backward compatibility)
// ============================================================================

import { generateFarewellSummary } from './farewell.js';
import { extractSmallDetails, getDetailCallback } from './small-details.js';
import { extractFollowUps, getFollowUpSuggestion } from './follow-ups.js';
import { getPersonaPhysicalState, getPhysicalStateInterjection } from './physical-state.js';
import { calculatePacingScore } from './pacing.js';
import { createSessionRecoveryState, shouldAttemptRecovery } from './recovery.js';
import { getGracefulErrorResponse } from './error-responses.js';

export const ConversationQuality = {
  generateFarewellSummary,
  extractSmallDetails,
  getDetailCallback,
  extractFollowUps,
  getFollowUpSuggestion,
  getPersonaPhysicalState,
  getPhysicalStateInterjection,
  calculatePacingScore,
  createSessionRecoveryState,
  shouldAttemptRecovery,
  getGracefulErrorResponse,
};

export default ConversationQuality;
