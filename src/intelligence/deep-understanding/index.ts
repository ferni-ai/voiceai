/**
 * Deep Understanding Module
 *
 * Superhuman understanding capabilities - reading between the lines,
 * understanding patterns, and providing insights no human friend could
 * consistently offer.
 *
 * @module intelligence/deep-understanding
 */

// Silence Intelligence
export {
  analyzeSilence,
  formatSilenceForPrompt,
  getSilencePattern,
  importSilencePattern,
  recordSilence,
  resetSilenceIntelligence,
  type SilenceAnalysis,
  type SilencePattern,
  type SilenceResponse,
  type SilenceType,
} from './silence.js';

// Life Rhythm Prediction
export {
  addAnniversary,
  formatPredictionForPrompt,
  getLifeRhythmProfile,
  importLifeRhythmProfile,
  predictUserState,
  recordConversationObservation,
  resetLifeRhythmPrediction,
  type AnniversaryDate,
  type LifeRhythmProfile,
  type MonthlyPattern,
  type RhythmPrediction,
  type SeasonalPattern,
  type WeeklyPattern,
} from './life-rhythm.js';

// Relational Network
export {
  analyzeSupportNetwork,
  detectUnspokenTension,
  extractPersonMentions,
  formatRelationalInsightsForPrompt,
  generateRelationalInsights,
  getRelationalNetwork,
  importRelationalNetwork,
  recordPersonMention,
  resetRelationalNetwork,
  type PersonInLife,
  type RelationalInsight,
  type RelationalNetwork,
  type RelationshipQuality,
  type RelationshipType,
  type SupportNetwork,
  type Triangulation,
  type UnspokenTension,
} from './relationships.js';

// Resistance Detection
export {
  analyzeResistance,
  formatResistanceForPrompt,
  getResistanceProfile,
  getResistanceSummary,
  identifyGrowthEdges,
  importResistanceProfile,
  resetResistanceDetection,
  type AvoidedTopic,
  type DefensePattern,
  type GrowthEdge,
  type ResistanceAnalysis,
  type ResistanceProfile,
  type SelfProtectiveProfile,
} from './resistance.js';

// Energy State
export {
  assessEnergyState,
  formatEnergyForPrompt,
  getEnergyPattern,
  importEnergyPattern,
  markTopicEnergy,
  resetEnergyStateInference,
  type EnergyAssessment,
  type EnergyPattern,
  type EnergyLevel,
  type MentalCapacity,
  type MentalEnergyState,
  type PhysicalEnergyState,
  type SleepQuality,
} from './energy.js';

// Subconscious Goals
export {
  analyzeSubconscious,
  formatSubconsciousForPrompt,
  getSubconsciousProfile,
  getSubconsciousSummary,
  importSubconsciousProfile,
  recordSurfaceReaction,
  resetSubconsciousGoals,
  type Contradiction,
  type EmergingDesire,
  type GoalCategory,
  type RecurringPattern,
  type SubconsciousAnalysis,
  type SubconsciousProfile,
} from './subconscious.js';

// Conversational Flow
export {
  analyzeFlow,
  formatFlowForPrompt,
  getFlowProfile,
  importFlowProfile,
  resetConversationalFlow,
  type ConversationDepth,
  type DepthIndicators,
  type FlowAnalysis,
  type FlowDirection,
  type FlowProfile,
  type FlowState,
  type FlowTransition,
  type UserSignal,
} from './flow.js';

// Repair Intelligence
export {
  detectMisunderstanding,
  formatRepairForPrompt,
  generateRepair,
  getRepairProfile,
  importRepairProfile,
  quickRepairCheck,
  recordAIResponse,
  recordRepairOutcome,
  resetRepairIntelligence,
  type MisunderstandingDetection,
  type MisunderstandingSeverity,
  type MisunderstandingType,
  type RepairApproach,
  type RepairAttempt,
  type RepairProfile,
  type RepairStrategy,
} from './repair.js';

// Hope Trajectory
export {
  analyzeHope,
  formatHopeForPrompt,
  getHopeProfile,
  importHopeProfile,
  resetHopeTrajectory,
  type HopeAnalysis,
  type HopeObservation,
  type HopeProfile,
  type HopeTrajectory,
  type TrajectoryDirection,
  type UrgencyLevel,
} from './hope.js';

// Life Chapter
export {
  analyzeChapter,
  formatChapterForPrompt,
  getChapterProfile,
  importChapterProfile,
  resetLifeChapterAwareness,
  type ChapterAnalysis,
  type ChapterEvidence,
  type ChapterProfile,
  type ChapterType,
  type LifeChapter,
  type TransitionPhase,
} from './life-chapter.js';

// Persistence
export {
  periodicSync as deepUnderstandingPeriodicSync,
  deleteDeepUnderstandingProfiles,
  exportDeepUnderstandingBundle,
  importDeepUnderstandingBundle,
  loadDeepUnderstandingProfiles,
  onSessionEnd as onDeepUnderstandingSessionEnd,
  onSessionStart as onDeepUnderstandingSessionStart,
  saveDeepUnderstandingProfiles,
  type DeepUnderstandingBundle,
} from './persistence.js';
