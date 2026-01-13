/**
 * Superhuman Trigger Intelligence System
 *
 * Phase 1: Semantic Core - embedding-based trigger matching
 * Phase 2: Personal Memory Integration - user trigger profiles
 * Phase 3: Temporal Intelligence - time-based pattern detection
 * Phase 4: Effectiveness Learning - adaptive trigger personalization
 * Phase 5: Anticipatory Triggers - early signal detection before full expression
 * Phase 6: Cross-Domain Synthesis - aggregate life context across all personas
 *
 * This module provides "Better than Human" trigger detection by combining:
 * 1. Semantic matching using embeddings (captures emotional undertones)
 * 2. Pattern matching (catches explicit signals)
 * 3. Context awareness (time, relationship, conversation state)
 * 4. Personal memory (significant dates, relationships, communication patterns)
 * 5. Temporal patterns (day-of-week, time-of-day, anniversary proximity)
 * 6. Effectiveness learning (engagement/deflection tracking, adaptive scoring)
 * 7. Anticipatory detection (partial input + voice prosody = early response)
 * 8. Cross-domain synthesis (sleep + calendar + finance + goals + relationships = life context)
 *
 * @module TriggerIntelligence
 */
export type { ProactiveTrigger, EmbeddedTrigger, TriggerCategory, TriggerContext, SemanticMatch, HybridMatchResult, HybridMatchConfig, CachedTriggerEmbedding, TriggerEmbeddingCacheConfig, SemanticMatchAnalytics, BehaviorFile, PersonaTriggerSet, } from './types.js';
export { DEFAULT_HYBRID_CONFIG } from './types.js';
export type { SignificantDateType, SignificantDate, RelationshipType, EmotionalValence, Relationship, PhrasePattern, TemporalPattern, SensitiveTopic, CommunicationPatterns, TriggerEffectiveness, UserTriggerProfile, ProfileExtractionResult, ProfileContextBoost, } from './user-trigger-profile.types.js';
export { DEFAULT_USER_TRIGGER_PROFILE } from './user-trigger-profile.types.js';
export type { DayOfWeek, TimeOfDayBucket, TriggerFiringEvent, DayOfWeekPattern, TimeOfDayPattern, RecurringDatePattern, TemporalIntelligence, } from './user-trigger-profile.types.js';
export { DEFAULT_TEMPORAL_INTELLIGENCE } from './user-trigger-profile.types.js';
export { TriggerEmbeddingService, getTriggerEmbeddingService, resetTriggerEmbeddingService, detectTriggerCategory, } from './trigger-embedding-service.js';
export { matchTriggersHybrid, getSemanticSimilarity, shouldSkipTriggers, getTriggerProbabilityBoost, recordSemanticMatch, getSemanticAnalytics, resetSemanticAnalytics, } from './semantic-trigger-matcher.js';
export { TriggerEmbeddingCache, getTriggerEmbeddingCache, resetTriggerEmbeddingCache, } from './trigger-embedding-cache.js';
export { UserTriggerProfileService, getUserTriggerProfileService, resetUserTriggerProfileService, type ProfileServiceConfig, } from './user-trigger-profile-service.js';
export { extractSignificantDates, hasDateMentions, extractYear, extractRelationships, hasRelationshipMentions, extractCommunicationPatterns, hasDistressSignals, hasDeflectionSignals, getDominantPattern, type DateExtractionOptions, type DateExtractionResult, type RelationshipExtractionOptions, type RelationshipExtractionResult, type CommunicationPatternExtractionOptions, type CommunicationPatternExtractionResult, } from './extractors/index.js';
export { generatePersonalContextBoost, applyPersonalContextBoost, DEFAULT_PERSONAL_CONTEXT_CONFIG, type PersonalContextConfig, type PersonalContextBoost, } from './personal-context-integrator.js';
export { DEFAULT_TEMPORAL_CONFIG, type TemporalPatternConfig, getDayOfWeek, getTimeOfDayBucket, daysUntilRecurringDate, daysSinceRecurringDate, createTriggerFiringEvent, recordFiringEvent, analyzeDayOfWeekPatterns, analyzeTimeOfDayPatterns, analyzeRecurringDatePatterns, analyzeTemporalPatterns, calculateTemporalBoost, type TemporalBoostResult, recordTemporalBoost, recordFiringEventAnalytics, getTemporalAnalytics, resetTemporalAnalytics, type TemporalAnalytics, } from './temporal-pattern-detector.js';
export { loadUserTriggerContext, getSessionTriggerContext, recordTriggerOutcome, saveUserTriggerContext, getCombinedTriggerBoost, getApproachingSignificantDates, clearAllSessionContexts, getActiveSessionCount, type TriggerContext as SessionTriggerContext, } from './voice-agent-integration.js';
export { DEFAULT_EFFECTIVENESS_CONFIG, type EffectivenessConfig, type TriggerOutcomeEvent, type EngagementSignal, type DeflectionSignal, type EffectivenessResult, type UserEffectivenessAnalysis, recordOutcomeEvent, getSessionOutcomes, clearSessionOutcomes, detectEngagementSignals, detectDeflectionSignals, calculateEffectivenessFromEvents, calculateEffectivenessFromRecord, analyzeUserEffectiveness, getEffectivenessMultiplier, applyEffectivenessToScore, recordEffectivenessAnalytics, getEffectivenessAnalytics, resetEffectivenessAnalytics, type EffectivenessAnalytics, } from './effectiveness-calculator.js';
export type { AnticipatedOutcomeType, VoiceProsodyCue, AnticipatorySignal, AnticipationEvent, AnticipationSafeguards, AnticipatoryIntelligence, } from './user-trigger-profile.types.js';
export { DEFAULT_ANTICIPATION_SAFEGUARDS, DEFAULT_ANTICIPATORY_INTELLIGENCE, } from './user-trigger-profile.types.js';
export { DEFAULT_SIGNAL_LEARNER_CONFIG, type SignalLearnerConfig, COMMON_ANTICIPATORY_PHRASES, detectAnticipatorySignals, type SignalDetectionResult, learnFromUtterance, type LearningInput, recordAnticipationEvent, getAnticipatoryAnalytics, type AnticipatoryAnalytics, } from './anticipatory-signal-learner.js';
export { DEFAULT_ENGINE_CONFIG, type AnticipatoryEngineConfig, DEFAULT_RESPONSE_TEMPLATES, type AnticipatoryResponseTemplate, type AvatarCue, processPartialInput, checkPendingAnticipation, recordAnticipatoryOutcome, type AnticipatoryEngineResult, clearAnticipatorySession, clearAllAnticipatorySessions, getAnticipatorySessionStats, getPersonaResponseTemplates, recordAnticipationFiring, getAnticipatoryEngineAnalytics, resetAnticipatoryEngineAnalytics, } from './anticipatory-trigger-engine.js';
export type { SleepDomainData, CalendarDomainData, FinanceDomainData, GoalsDomainData, RelationshipDomainData, HabitsDomainData, DomainStressIndicator, SynthesisTrigger, LifeContextSnapshot, DomainDataCollector, AggregatorConfig, } from './life-context-snapshot.js';
export { DEFAULT_LIFE_CONTEXT_SNAPSHOT } from './life-context-snapshot.js';
export { sleepDataCollector, calendarDataCollector, financeDataCollector, goalsDataCollector, relationshipDataCollector, habitsDataCollector, domainCollectors, collectAllDomainData, clearDomainCache, clearAllDomainCaches, getDomainCacheStats, } from './domain-data-collectors.js';
export { aggregateLifeContext, summarizeLifeContext, computeSleepStress, computeCalendarStress, computeFinanceStress, computeGoalsStress, computeRelationshipStress, computeHabitsStress, detectCrossDomainPatterns, calculateOverallLoadScore, calculateWellbeingScore, DEFAULT_AGGREGATOR_CONFIG, } from './life-context-aggregator.js';
export type { DetectedPattern } from './life-context-aggregator.js';
export { generateSynthesisTriggers, populateSynthesisTriggers, getMostImportantTrigger, getTriggersByCategory, getTriggersForPersona, recordSynthesisTriggers, getSynthesisAnalytics, resetSynthesisAnalytics, allTriggerTemplates, supportTriggerTemplates, celebrationTriggerTemplates, warningTriggerTemplates, nuancedTriggerTemplates, type TriggerTemplate, type SynthesisAnalytics, } from './synthesis-trigger-generator.js';
//# sourceMappingURL=index.d.ts.map