/**
 * Superhuman Services - Better Than Human Capabilities
 *
 * These services implement capabilities that make Ferni genuinely
 * better than human support - not through artificial intelligence,
 * but through perfect memory, constant presence, and pattern recognition
 * that humans simply cannot match.
 *
 * @module services/superhuman
 */

// ============================================================================
// ORCHESTRATION (context builder + formatter)
// ============================================================================

export * from './superhuman-service.js';

// ============================================================================
// VALIDATION (benchmark tests + runner)
// ============================================================================

export * from './validation/index.js';

// ============================================================================
// RE-EXPORTS
// ============================================================================

// Commitment Keeper
export {
  buildCommitmentContext,
  commitmentKeeper,
  detectCommitment,
  getFollowUpsForUser,
  loadUserCommitments,
  saveCommitment,
  updateCommitmentStatus,
  type Commitment,
  type CommitmentFollowUp,
  type CommitmentStatus,
  type CommitmentType,
} from './commitment-keeper.js';

// Superhuman Observations - "Only I Would Notice" pattern detection
export {
  clearSuperhumanObservations,
  getSuperhumanObservations,
  SuperhumanObservationsEngine,
  type ObservationResult,
  type ObservationType,
  type SuperhumanObservation,
} from './observations.js';

// Predictive Coaching
export {
  buildPredictiveContextString,
  generatePredictions,
  getDayPatterns,
  loadUserPatterns,
  predictiveCoaching,
  recordObservation,
  type DayPattern,
  type PatternObservation,
  type Prediction,
} from './predictive-coaching.js';

// Life Narrative
export {
  buildNarrativeContextString,
  createOrUpdateChapter,
  detectChapterMoment,
  identifyNarrativeArc,
  lifeNarrative,
  loadIdentity,
  loadUserChapters,
  recordIdentityShift,
  type ChapterType,
  type IdentityEvolution,
  type LifeChapter,
  type NarrativeArc,
} from './life-narrative.js';

// Values Alignment
export {
  buildValuesContext,
  detectConflict,
  detectValue,
  loadUserValues,
  recordConflict,
  recordValueMention,
  valuesAlignment,
  type UserValue,
  type ValueCategory,
  type ValueConflict,
} from './values-alignment.js';

// Emotional First Aid
export {
  buildFirstAidContext,
  detectCrisis,
  detectCrisisFromVoice,
  emotionalFirstAid,
  getFirstAidResponse,
  getVoiceInstructions,
  type CrisisLevel,
  type CrisisSignal,
  type FirstAidResponse,
  type GroundingTechnique,
} from './emotional-first-aid.js';

// Relationship Network
export {
  analyzeSentiment,
  buildNetworkContext,
  extractPerson,
  findConnectionOpportunities,
  loadNetwork,
  recordMention,
  relationshipNetwork,
  type ConnectionOpportunity,
  type RelationshipPerson,
  type RelationshipSentiment,
  type RelationshipType,
} from './relationship-network.js';

// Capacity Guardian
export {
  assessBurnoutRisk,
  buildCapacityContext,
  capacityGuardian,
  detectEnergyLevel,
  detectOvercommitment,
  loadEnergyHistory,
  recordEnergyReading,
  type BurnoutAssessment,
  type BurnoutRisk,
  type EnergyLevel,
  type EnergyReading,
} from './capacity-guardian.js';

// Dream Keeper
export {
  buildDreamContext,
  detectDream,
  dreamKeeper,
  findDormantDreams,
  loadUserDreams,
  recordDreamMention,
  type Dream,
  type DreamReminder,
  type DreamStatus,
  type DreamType,
} from './dream-keeper.js';

// Relationship Milestones
export {
  acknowledgeMilestone,
  buildMilestoneContext,
  buildRelationshipSummary,
  checkAndRecordMilestones,
  recordSpecialMilestone,
  relationshipMilestones,
  type MilestoneType,
  type RelationshipMilestone,
  type RelationshipSummary,
} from './relationship-milestones.js';

// Seasonal Awareness
export {
  buildSeasonalContext,
  detectSeasonalPattern,
  findUpcomingDates,
  getCurrentSeason,
  getDaysUntilSeasonChange,
  loadPersonalDates,
  loadSeasonalObservations,
  recordPersonalDate,
  recordSeasonalObservation,
  seasonalAwareness,
  type PersonalDate,
  type Season,
  type SeasonalObservation,
  type SeasonalPattern,
} from './seasonal-awareness.js';

// Milestone-Calendar Coordinator (Cross-Domain)
export {
  detectMilestoneConflicts,
  findOptimalMilestoneWindows,
  getCapacityForNewMilestone,
  getCoordinationContext,
  suggestTimeBlocks,
  type CapacityAssessment,
  type MilestoneConflict,
  type MilestoneTimeBlock,
  type SimpleMilestone,
  type TimeWindow,
} from './milestone-calendar-coordinator.js';


// ============================================================================
// "BETTER THAN HUMAN" CAPABILITIES (New - Dec 2025)
// ============================================================================

// Silence Interpreter - Understand different types of silence
export {
  analyzeSilence,
  buildSilenceContext,
  buildSilenceGuidance,
  getResponsePhrase,
  loadSilenceProfile,
  recordSilenceOutcome,
  shouldAnalyzeSilence,
  silenceInterpreter,
  updateBaselineTolerance,
  type SilenceAnalysis,
  type SilenceHistoryEntry,
  type SilenceProfile,
  type SilenceResponse,
  type SilenceType,
} from './silence-interpreter.js';

// Contradiction Comfort - Hold space for opposing emotions
export {
  areCommonlyCoexisting,
  buildContradictionAwarenessContext,
  buildContradictionContext,
  contradictionComfort,
  detectContradiction,
  getValidationPhrase,
  loadContradictionProfile,
  recordContradiction,
  type ContradictionDetection,
  type ContradictionHistory,
  type ContradictionPattern,
  type ContradictionProfile,
} from './contradiction-comfort.js';

// Perfect Timing Intelligence - Know when to surface topics
export {
  buildTimingContext,
  detectReceptivity,
  getTimingProfile,
  getTopicsForNow,
  isGoodTimeFor,
  loadTimingProfile,
  markTopicSurfaced,
  perfectTiming,
  queueTopicForRightMoment,
  recordTimingLearning,
  type CalendarPressure,
  type ConversationType,
  type GreetingTone,
  type QueuedTopic,
  type ReceptivityScore,
  type TimingIntelligence,
  type TimeWindow as TimingWindow,
} from './perfect-timing.js';

// Pattern Mirror - Surface patterns users can't see
export {
  buildPatternMirrorContext,
  getPatternProfile,
  getPatternToSurface,
  loadPatternProfile,
  markInsightSurfaced as markPatternInsightSurfaced,
  patternMirror,
  recordCyclicalPattern,
  recordTopicEnergy,
  recordWordVoiceMismatch,
  savePatternProfile,
  type CyclicalPattern,
  type FadingTopic,
  type PatternInsight,
  type PatternMirrorProfile,
  type TopicEnergy,
  type WordVoiceMismatch,
} from './pattern-mirror.js';

// Future Self Letters - Project trajectory
export {
  buildFutureSelfContext,
  futureSelf,
  generateFutureSelfLetter,
  getRecentLetter,
  type ConcerningPattern,
  type FutureSelfContext,
  type FutureSelfLetter,
  type LetterTimeframe,
  type PositivePattern,
} from './future-self.js';

// ============================================================================
// "BETTER THAN HUMAN" CAPABILITIES V2 (New - Dec 2025)
// ============================================================================

// Voice Biomarkers - Wellness detection from voice patterns
export {
  analyzeVoiceBiomarkers,
  buildVoiceBiomarkersContext,
  calculateStressTrajectory,
  getBiomarkerTrends,
  loadBiomarkerReadings,
  storeBiomarkerReading,
  voiceBiomarkers,
  type VoiceAnalysisInput,
  type VoiceBiomarkers,
} from './voice-biomarkers.js';

// Mood Calendar - Predict emotional patterns
export {
  buildMoodCalendarContext,
  detectMoodPatterns,
  getMoodCalendarSummary,
  loadMoodEntries,
  moodCalendar,
  predictMood,
  recordMoodEntry,
  type MoodCalendarSummary,
  type MoodEntry,
  type MoodPattern,
  type MoodPrediction,
  type MoodType,
} from './mood-calendar.js';

// Social Battery - Know when they're "peopled out"
export {
  buildSocialBatteryContext,
  calculateBatteryLevel,
  getSocialBatteryProfile,
  getSocialBatteryState,
  loadSocialEvents,
  recordSocialEvent,
  socialBattery,
  type SocialBatteryProfile,
  type SocialBatteryState,
  type SocialEvent,
  type SocialEventType,
} from './social-battery.js';

// Conflict Resolution Memory - What works in conflicts
export {
  analyzeConflictPattern,
  buildConflictResolutionContext,
  conflictResolution,
  getAllConflictPatterns,
  getConflictRecommendations,
  loadConflictHistory,
  recordConflict as recordConflictHistory,
  updateConflictResolution,
  type ConflictOutcome,
  type ConflictPattern,
  type ConflictRecord,
  type ConflictType,
  type ResolutionApproach,
} from './conflict-resolution-memory.js';

// Protective Silence - Topics to avoid
export {
  buildProtectiveSilenceContext,
  checkBoundaries,
  checkResponseSafety,
  inferBoundaryFromReaction,
  loadBoundaries,
  protectiveSilence,
  recordBoundary,
  removeBoundary,
  updateBoundary,
  type BoundaryCategory,
  type BoundaryCheckResult,
  type BoundarySeverity,
  type ProtectiveBoundary,
} from './protective-silence.js';

// Calendar Prep Coaching - Proactive event prep
export {
  buildCalendarPrepContext,
  calendarPrepCoaching,
  classifyEvent,
  getPrepRecommendations,
  loadEventHistory,
  recordEventOutcome,
  type CalendarEvent,
  type EventType as CalendarEventType,
  type EventDifficulty,
  type EventHistory,
  type PrepCoachingSession,
  type PrepRecommendation,
} from './calendar-prep-coaching.js';

// Energy Wave Mapping - Optimal conversation times
export {
  analyzeEnergyPatterns,
  buildEnergyWaveContext,
  energyWaveMapping,
  getTimingRecommendation,
  loadInteractions as loadEnergyInteractions,
  recordInteraction as recordEnergyInteraction,
  type ConversationInteraction,
  type ConversationType as EnergyConversationType,
  type EnergyLevel as EnergyWaveLevel,
  type EnergyWaveProfile,
  type TimingRecommendation,
} from './energy-wave-mapping.js';

// Emotional Vocabulary Expansion - Name feelings precisely
export {
  analyzeVocabularyProfile,
  buildVagueEmotionContext,
  buildVocabularyContext,
  detectVagueEmotions,
  emotionalVocabulary,
  loadEmotionHistory,
  recordEmotionUsage,
  suggestPreciseEmotions,
  type EmotionalVocabularyProfile,
  type EmotionCategory,
  type EmotionUsageRecord,
  type EmotionWord,
  type VagueEmotionMapping,
} from './emotional-vocabulary.js';

// Recovery Time Tracking - Post-event recovery needs
export {
  buildRecoveryContext,
  buildRecoveryProfile,
  getActiveRecoveryEvents,
  getCheckInRecommendation,
  loadRecoveryHistory,
  markRecovered,
  recoveryTracking,
  startRecoveryTracking,
  type RecoveryCheckIn,
  type RecoveryEvent,
  type RecoveryEventType,
  type RecoveryProfile,
} from './recovery-tracking.js';

// Inside Joke Memory - Shared history callbacks
export {
  buildInsideJokeContext,
  detectPotentialMoment,
  findCallbackOpportunities,
  identifyRunningGags,
  insideJokeMemory,
  loadSharedMoments,
  recordMomentReference,
  recordSharedMoment,
  suggestCallback,
  type CallbackOpportunity,
  type SharedMoment,
  type SharedMomentType,
} from './inside-joke-memory.js';

// ============================================================================
// "BETTER THAN HUMAN" V3 - SEMANTIC INTELLIGENCE (Dec 2025)
// ============================================================================

// Semantic Intelligence - 6 New Capabilities
export {
  buildSemanticIntelligenceContext,
  clearSemanticIntelligenceCache,
  // Individual services
  correlationMining,
  counterfactualMemory,
  crossSessionThreading,
  emotionalTrajectories,
  formatSemanticIntelligenceContext,
  getSemanticIntelligenceSummary,
  growthFingerprint,
  recordSemanticData,
  relationalSemantics,
  // Main entry points
  semanticIntelligence,
  type DecisionPoint,
  type EmotionalArc,
  type RelationalNode,
  type SemanticCorrelation,
  type GrowthFingerprint as SemanticGrowthFingerprint,
  // Types
  type SemanticIntelligenceContext,
  type SemanticThread,
} from './semantic-intelligence/index.js';

// ============================================================================
// V4 JORDAN'S SUPERHUMAN PLANNING (January 2026)
// ============================================================================

// Event Pattern Memory - Perfect recall across all events
export {
  buildEventPatternContext,
  eventPatternMemory,
  getEventPatternInsights,
  recordEventOutcome as recordEventPatternOutcome,
  recordGuestConflict,
  recordRegrettedOmission,
  recordVendorExperience,
  type BudgetPattern,
  type EmotionalPattern,
  type EventOutcome,
  type EventPatternProfile,
  type GuestDynamics,
  type VendorPreference,
} from './event-pattern-memory.js';

// Guest Intelligence - Permanent guest profiles
export {
  buildGuestIntelligenceContext,
  getGuestListDietary,
  getGuestListSummary,
  getGuestProfile,
  getSeatingRecommendations,
  guestIntelligence,
  predictAttendance,
  recordGuestAccessibility,
  recordGuestDietary,
  recordGuestRelationship,
  upsertGuestGroup,
  upsertGuestProfile,
  type GuestGroup,
  type GuestIntelligenceProfile,
  type GuestProfile,
  type GuestRelationship,
  type SeatingRecommendation,
} from './guest-intelligence.js';

// Proactive Milestone Detector - Detect celebrations humans forget
export {
  acknowledgeMilestone as acknowledgeDetectedMilestone,
  buildMilestoneDetectorContext,
  detectUpcomingMilestones,
  getLifeStageInsights,
  getMilestonesToCelebrate,
  proactiveMilestoneDetector,
  recordLifeStageSignal,
  resetQuietWin,
  trackDate,
  trackQuietWin,
  type DetectedMilestone,
  type MilestoneType as DetectorMilestoneType,
  type LifeStageSignal,
  type MilestoneDetectorProfile,
  type MilestoneSignificance,
  type TrackedDate,
} from './proactive-milestone-detector.js';

// Event Story Capture - Remember what events MEANT
export {
  addGratitudeNote,
  addMeaningfulMoment,
  buildEventStoryContext,
  eventStoryCapture,
  findEventStory,
  getAllEventStories,
  getEventStory,
  getStoriesWithUpcomingAnniversaries,
  getStoryCapturePrompts,
  recallEventMeaning,
  startStoryCapture,
  updateEventStory,
  type EventStory,
  type EventStoryProfile,
  type StoryCapturePrompts,
} from './event-story-capture.js';

// Anticipatory Planning - See life transitions coming
export {
  anticipatoryPlanning,
  buildAnticipatoryPlanningContext,
  detectTransitionSignals,
  getAnticipatedTransitions,
  markTransitionSurfaced,
  recordTransitionSignal,
  updateDemographics,
  type AnticipatedMilestone,
  type AnticipatoryPlanningProfile,
  type LifeTransition,
  type TransitionPrediction,
  type TransitionSignal,
} from './anticipatory-planning.js';

// Celebration Balance - Track joy objectively
export {
  buildCelebrationBalanceContext,
  celebrationBalance,
  getCelebrationBalance,
  getCelebrationSuggestions,
  recordCelebration as recordCelebrationEvent,
  shouldPromptForCelebration,
  type CelebrationBalance,
  type CelebrationBalanceProfile,
  type CelebrationSize,
  type CelebrationType,
  type RecordedCelebration,
} from './celebration-balance.js';

// Planning Coordination - Cross-domain readiness checks
export {
  buildPlanningCoordinationContext,
  checkGoalAlignment,
  checkPlanningReadiness,
  planningCoordination,
  quickReadinessCheck,
  type CalendarCapacity,
  type EnergyAlignment,
  type FinancialReadiness,
  type LifeStageContext,
  type PlanningCoordinationProfile,
  type PlanningReadinessAssessment,
} from './planning-coordination.js';

// Seasonal Planning Intelligence - Cultural dates and optimal timing
export {
  buildSeasonalPlanningContext,
  checkDateConflicts,
  getRelevantCulturalDates,
  getSeasonalPatterns as getSeasonalPlanningPatterns,
  recordEventOutcome as recordSeasonalEventOutcome,
  seasonalPlanningIntelligence,
  suggestOptimalTiming,
  updateCulturalBackgrounds,
  updatePersonalPatterns,
  type CulturalDate,
  type PersonalSeasonalPattern,
  type SeasonalPattern as SeasonalPlanningPattern,
  type SeasonalPlanningProfile,
  type TimingRecommendation as SeasonalTimingRecommendation,
} from './seasonal-planning-intelligence.js';

// Post-Event Learning - Follow up and learn
export {
  buildPostEventLearningContext,
  getApplicableLearnings,
  getDueFollowUps,
  getLearningSummary,
  postEventLearning,
  recordLearning,
  scheduleEventFollowUps,
  type AppliedWisdom,
  type EventLearning,
  type FollowUpPrompt,
  type PostEventLearningProfile,
} from './post-event-learning.js';

// ============================================================================
// PHASE 15: RELATIONSHIP HEALTH DASHBOARD
// ============================================================================

// Relationship Health - Track relationship health and drift
export {
  calculateAllRelationshipHealth,
  calculateRelationshipHealth,
  getDriftAlerts,
  getRelationshipHealthConfig,
  getRelationshipHealthStats,
  getRelationshipsByHealthPriority,
  setRelationshipHealthConfig,
  type DriftAlert,
  type DriftRisk, // Renamed to avoid potential conflicts
  type HealthFactors, // Renamed to avoid duplicate
  type HealthTrend,
  type RelationshipHealth,
  type RelationshipHealthConfig,
  type RelationshipType as RelationshipHealthType,
  type RelationshipInteraction,
  type SuggestedAction as RelationshipSuggestedAction,
  type SentimentTrend,
} from './relationship-health.js';

// ============================================================================
// PHASE 13: COMMITMENT KEEPER E2E
// ============================================================================

// Commitment Keeper E2E - End-to-end commitment tracking
export {
  checkProgressE2E,
  detectCommitmentE2E,
  getCommitmentE2EConfig,
  getCommitmentsDueForFollowUp,
  getCommitmentStats,
  setCommitmentE2EConfig,
  type CelebrationContext,
  type CommitmentE2EConfig,
  type CommitmentE2EInput,
  type CommitmentE2EResult,
  type ProgressUpdateInput,
  type ProgressUpdateResult,
} from './commitment-keeper-e2e.js';

// ============================================================================
// UNIFIED USER KNOWLEDGE (Better Than Human: Complete Knowledge)
// ============================================================================

// Unified User Knowledge - Aggregates ALL memory sources into one picture
export {
  buildUnifiedUserKnowledge,
  getUnifiedKnowledgeInjection,
  type UnifiedUserKnowledge,
} from './unified-user-knowledge.js';

// ============================================================================
// V5 SUPERHUMAN PERSONA INTELLIGENCE (January 2026)
// ============================================================================

// Habit Optimization Engine - Computational Behavior Science for Maya
export {
  analyzeHabitCascade,
  buildHabitOptimizationContext,
  calculateFoggScore,
  calculateOptimalWindows,
  classifyMotivationType,
  detectChronotype,
  generateImplementationIntention,
  habitOptimizationEngine,
  identifyKeystoneHabits,
  loadHabitProfile,
  loadImplementationIntentions,
  recordIntentionExecution,
  saveHabitProfile,
  saveImplementationIntention,
  type CascadeStrength,
  type ChronotypeProfile,
  type FoggBehaviorScore,
  type HabitCascade,
  type HabitDifficulty,
  type HabitOptimizationContext,
  type ImplementationIntention,
  type MotivationType,
  type OptimalHabitWindow,
  type UserHabit,
  type UserHabitProfile,
} from './habit-optimization-engine.js';

// Habit Economics - Behavioral Economics for Habits
export {
  assessLossAversion,
  buildHabitEconomicsContext,
  calculateHabitROI,
  calculateOptimalStake,
  designDiscountingIntervention,
  habitEconomics,
  loadHabitEconomicsProfile,
  measurePresentBias,
  recommendCommitmentDevice,
  recordCommitmentOutcome,
  saveCommitmentDevice,
  saveHabitEconomicsProfile,
  suggestTemptationBundles,
  type CommitmentDevice,
  type CommitmentDeviceType,
  type DiscountingProfile,
  type HabitEconomicsProfile,
  type HabitROI,
  type LossAversionProfile,
  type TemptationBundle,
} from './habit-economics.js';

// Causal Inference Engine - Beyond Correlation for Peter
export {
  analyzeCausalRelationship,
  buildCausalGraph,
  buildCausalInferenceContext,
  causalInferenceEngine,
  generateCounterfactual,
  generateInterventionRecommendations,
  loadCausalProfile,
  loadTimeSeries,
  recordTimeSeriesData,
  saveCausalProfile,
  testGrangerCausality,
  type CausalConfidence,
  type CausalDirection,
  type CausalGraph,
  type CausalInferenceProfile,
  type CausalRelationship,
  type CounterfactualAnalysis,
  type EvidenceType,
  type InterventionRecommendation,
  type TimeSeriesDataPoint,
} from './causal-inference-engine.js';

// Communication Intelligence Engine - Computational Linguistics for Alex
export {
  analyzeAssertiveness,
  analyzeMessage,
  analyzeWarmthCompetence,
  assessFaceThreat,
  buildCommunicationIntelligenceContext,
  communicationIntelligenceEngine,
  detectGottmanPatterns,
  loadCommunicationProfile,
  predictResponse,
  recordCommunicationOutcome,
  saveCommunicationProfile,
  translateToNVC,
  type AssertivenessLevel,
  type CommunicationIntelligenceProfile,
  type CommunicationStyle,
  type FaceType,
  type GottmanHorseman,
  type MessageAnalysis,
  type NVCComponent,
  type RelationshipCommunicationProfile,
} from './communication-intelligence-engine.js';

// Contemplative Intelligence - Wisdom Development for Nayan
export {
  assessMindfulness,
  assessPsychologicalFlexibility,
  assessSelfCompassion,
  assessWisdom,
  buildContemplativeContext,
  contemplativeIntelligence,
  getDefusionTechnique,
  getSelfCompassionPhrases,
  loadContemplativeProfile,
  recommendMindfulnessPractices,
  recordPractice,
  saveContemplativeProfile,
  type ACTProcess,
  type ContemplativeAssessment,
  type ContemplativeProfile,
  type GrowthTrajectory,
  type MindfulnessAssessment,
  type MindfulnessFacet,
  type PsychologicalFlexibilityProfile,
  type SelfCompassionAssessment,
  type SelfCompassionDimension,
  type WisdomAssessment,
  type WisdomDimension,
} from './contemplative-intelligence.js';

// Life Trajectory Simulator - Decision Science for Jordan
export {
  analyzeRegretMinimization,
  buildLifeTrajectoryContext,
  calculateOptimalStopPoint,
  detectLifeChapterTransition,
  identifyFreshStarts,
  lifeTrajectorySimulator,
  loadTrajectoryProfile,
  optimizeForPeakEnd,
  runMonteCarloSimulation,
  saveSimulation,
  saveTrajectoryProfile,
  type FreshStartEffect,
  type LifeDecisionCategory,
  type LifeScenario,
  type LifeTrajectoryProfile,
  type PeakEndOptimization,
  type RegretMinimizationAnalysis,
  type ScenarioOutcome,
  type SimulationResult,
  type TemporalLandmark,
  type TemporalLandmarkType,
} from './life-trajectory-simulator.js';

// Orchestration Intelligence - Team Coordination for Ferni
export {
  analyzeConversationArc,
  assessMIFidelity,
  assessRogerianConditions,
  assessSessionQuality,
  assessTherapeuticAlliance,
  buildOrchestrationContext,
  generateAllianceRepair,
  loadOrchestrationProfile,
  orchestrationIntelligence,
  recordSessionQuality,
  routeToPersona,
  saveOrchestrationProfile,
  shouldHandoff,
  type AllianceComponent,
  type ConversationArc,
  type EmotionalState,
  type MIFidelity,
  type OrchestrationProfile,
  type PersonaId,
  type PersonaRouting,
  type RogerianConditions,
  type SessionDepth,
  type SessionQuality,
  type TherapeuticAllianceScore,
  type TopicDomain,
} from './orchestration-intelligence.js';

// Biometric Habit Intelligence - Physiological Data Integration
export {
  analyzeHabitBiometricCorrelation,
  biometricHabitIntelligence,
  buildBiometricHabitContext,
  calculateReadiness,
  generateRecoveryAwareSchedule,
  loadBiometricProfile,
  normalizeAppleHealthData,
  normalizeOuraData,
  normalizeWhoopData,
  saveBiometricProfile,
  saveBiometricReading,
  type BiometricProfile,
  type BiometricReading,
  type BiometricSource,
  type HabitBiometricCorrelation,
  type ReadinessLevel,
  type RecoveryAwareSchedule,
  type SleepStage,
} from './biometric-habit-intelligence.js';

// Financial Pattern Intelligence - Behavioral Finance Analysis
export {
  analyzeSpendingPatterns,
  analyzeValuesAlignment,
  buildFinancialPatternContext,
  calculateFinancialHealthScore,
  detectBehavioralBiases,
  detectEmotionalSpending,
  financialPatternIntelligence,
  loadFinancialProfile,
  saveFinancialProfile,
  type BehavioralBias,
  type BehavioralFinanceProfile,
  type EmotionalSpendingTrigger,
  type FinancialHealthScore,
  type FinancialProfile,
  type SpendingCategory,
  type SpendingPattern,
  type Transaction,
  type ValuesAlignmentAnalysis,
} from './financial-pattern-intelligence.js';

// N=1 Experimentation Platform - Personal Science
export {
  analyzeExperiment,
  buildExperimentationContext,
  designExperiment,
  generateDailyCheckIn,
  loadExperimentationProfile,
  n1ExperimentationPlatform,
  recordDataPoint,
  saveExperiment,
  saveExperimentationProfile,
  type DataPoint,
  type ExperimentationProfile,
  type ExperimentDesign,
  type ExperimentDesignSpec,
  type ExperimentPhase,
  type ExperimentResults,
  type ExperimentStatus,
  type ExperimentVariable,
  type MeasurementType,
} from './n1-experimentation-platform.js';

// Developmental Stage Awareness - Age-Appropriate Wisdom
export {
  assessEriksonStage,
  assessKeganStage,
  assessSpiralStage,
  buildDevelopmentalContext,
  developmentalStageAwareness,
  generateCommunicationGuidelines,
  generateDevelopmentalIntervention,
  identifyGrowthEdges,
  loadDevelopmentalProfile,
  saveDevelopmentalProfile,
  type DevelopmentalIntervention,
  type DevelopmentalProfile,
  type EriksonStage,
  type KeganStage,
  type SpiralStage,
  type StageIndicator,
} from './developmental-stage-awareness.js';
