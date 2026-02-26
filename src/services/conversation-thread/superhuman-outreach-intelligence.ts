/**
 * Superhuman Outreach Intelligence
 *
 * This is the BRAIN that makes Ferni "better than human."
 *
 * No human friend can:
 * - Track 19 different signals about your life
 * - Detect when Sunday evening anxiety is hitting someone with low energy
 * - Notice you haven't mentioned your dream in 6 months
 * - Coordinate 6 specialists to reach out together
 *
 * This module connects the superhuman services to the group outreach system,
 * creating genuinely intelligent proactive care.
 *
 * Barrel re-export from split modules:
 * - outreach-signal-types: Type definitions (SuperhumanSignal, SignalType, OutreachRule, OutreachAction)
 * - outreach-rules: Static routing rules (OUTREACH_RULES)
 * - outreach-processor: Timing, processing, execution, accumulation, integration
 * - outreach-signal-generators: V0/V1 signal generators
 * - outreach-signal-generators-v2: V2/Domain/Semantic signal generators
 *
 * @module services/conversation-thread/superhuman-outreach-intelligence
 */

// Signal types & routing types
export * from './outreach-signal-types.js';

// Static outreach rules
export { OUTREACH_RULES } from './outreach-rules.js';

// Core processing, timing, execution, accumulation, integration
export {
  getOptimalOutreachTime,
  processSuperhumanSignals,
  accumulateSignal,
  getAccumulatedSignals,
  processAccumulatedSignals,
  integrateWithSemanticIntelligence,
} from './outreach-processor.js';

// V0/V1 Signal generators
export {
  signalFromCrisis,
  signalFromPrediction,
  signalFromCapacity,
  signalFromValuesConflict,
  signalFromOpenLoop,
  signalFromTemporalAnomaly,
  signalFromVoiceDistress,
  signalFromDreamReignition,
  signalFromMilestone,
  signalFromStreak,
  signalFromGoalAchieved,
  signalFromReconnection,
  signalFromLifeChapter,
  signalFromSeasonalDate,
  signalFromSeasonalPattern,
  signalFromSilence,
  signalFromContradiction,
  signalFromReceptivity,
  signalFromBlindSpot,
  signalFromFutureTrajectory,
} from './outreach-signal-generators.js';

// V2/Domain/Semantic Signal generators
export {
  signalFromVoiceBiomarkers,
  signalFromMoodPrediction,
  signalFromSocialBattery,
  signalFromConflict,
  signalFromCalendarPrep,
  signalFromEnergyWave,
  signalFromVagueEmotion,
  signalFromRecovery,
  signalFromInsideJoke,
  signalFromBoundary,
  signalFromHabit,
  signalFromTask,
  signalFromFinancial,
  signalFromSleep,
  signalFromCalendarDensity,
  signalFromCorrelation,
  signalFromEmotionalTrajectory,
  signalFromRelationalTension,
  signalFromCounterfactual,
  signalFromGrowth,
  signalFromCrossSessionThread,
} from './outreach-signal-generators-v2.js';
