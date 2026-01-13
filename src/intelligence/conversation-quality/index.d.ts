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
export type { FarewellSummary, SmallDetail, FollowUpItem, PersonaPhysicalState, ConversationPacingScore, SessionRecoveryState, GracefulError, } from './types.js';
export { generateFarewellSummary } from './farewell.js';
export { extractSmallDetails, getDetailCallback } from './small-details.js';
export { extractFollowUps, getFollowUpSuggestion } from './follow-ups.js';
export { getPersonaPhysicalState, getPhysicalStateInterjection } from './physical-state.js';
export { calculatePacingScore } from './pacing.js';
export { createSessionRecoveryState, shouldAttemptRecovery } from './recovery.js';
export { getGracefulErrorResponse } from './error-responses.js';
import { generateFarewellSummary } from './farewell.js';
import { extractSmallDetails, getDetailCallback } from './small-details.js';
import { extractFollowUps, getFollowUpSuggestion } from './follow-ups.js';
import { getPersonaPhysicalState, getPhysicalStateInterjection } from './physical-state.js';
import { calculatePacingScore } from './pacing.js';
import { createSessionRecoveryState, shouldAttemptRecovery } from './recovery.js';
import { getGracefulErrorResponse } from './error-responses.js';
export declare const ConversationQuality: {
    generateFarewellSummary: typeof generateFarewellSummary;
    extractSmallDetails: typeof extractSmallDetails;
    getDetailCallback: typeof getDetailCallback;
    extractFollowUps: typeof extractFollowUps;
    getFollowUpSuggestion: typeof getFollowUpSuggestion;
    getPersonaPhysicalState: typeof getPersonaPhysicalState;
    getPhysicalStateInterjection: typeof getPhysicalStateInterjection;
    calculatePacingScore: typeof calculatePacingScore;
    createSessionRecoveryState: typeof createSessionRecoveryState;
    shouldAttemptRecovery: typeof shouldAttemptRecovery;
    getGracefulErrorResponse: typeof getGracefulErrorResponse;
};
export default ConversationQuality;
//# sourceMappingURL=index.d.ts.map