/**
 * Personality Bridge
 *
 * Unifies the RelationshipEngine and PersonalityService v2 systems
 * into a single recording path with frontend signal dispatch.
 *
 * Signal dispatchers use canonical functions from emotion-event-dispatcher.ts
 * to ensure correct signal types are sent to the frontend.
 *
 * @module personality/bridge
 */

// Main bridge functions
export {
  recordUnifiedMoment,
  recordBreakthrough,
  recordVulnerability,
  recordCelebration,
  recordCrisisSupport,
  recordLaughter,
  recordDeepConversation,
  type RecordUnifiedMomentInput,
  type RecordUnifiedMomentResult,
} from './personality-bridge.js';

// Signal dispatchers (wrappers around canonical emotion-event-dispatcher functions)
export {
  dispatchAnticipationSignal,
  dispatchAnticipationFromValueObject,
  dispatchVulnerabilitySignal,
  dispatchGrowthCelebrationSignal,
  dispatchPatternSurfacingSignal,
  dispatchEmotionalBondSignal,
  type SendDataMessageFn,
  type AnticipationData,
  type VulnerabilityData,
  type GrowthMilestoneData,
  type PatternData,
} from './signal-dispatchers.js';

// Re-export canonical dispatchers for direct use
export {
  dispatchVisibleVulnerability,
  dispatchSpontaneousDelight,
  dispatchSuperhumanObservation,
  dispatchEmotionalBondDeepen,
  dispatchAnticipatoryPresence,
} from './signal-dispatchers.js';
