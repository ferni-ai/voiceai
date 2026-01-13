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
export { DEFAULT_HYBRID_CONFIG } from './types.js';
export { DEFAULT_USER_TRIGGER_PROFILE } from './user-trigger-profile.types.js';
export { DEFAULT_TEMPORAL_INTELLIGENCE } from './user-trigger-profile.types.js';
// Trigger Embedding Service
export { TriggerEmbeddingService, getTriggerEmbeddingService, resetTriggerEmbeddingService, detectTriggerCategory, } from './trigger-embedding-service.js';
// Semantic Trigger Matcher
export { matchTriggersHybrid, getSemanticSimilarity, shouldSkipTriggers, getTriggerProbabilityBoost, recordSemanticMatch, getSemanticAnalytics, resetSemanticAnalytics, } from './semantic-trigger-matcher.js';
// Trigger Embedding Cache
export { TriggerEmbeddingCache, getTriggerEmbeddingCache, resetTriggerEmbeddingCache, } from './trigger-embedding-cache.js';
// Phase 2: User Trigger Profile Service
export { UserTriggerProfileService, getUserTriggerProfileService, resetUserTriggerProfileService, } from './user-trigger-profile-service.js';
// Phase 2: Profile Extractors
export { extractSignificantDates, hasDateMentions, extractYear, extractRelationships, hasRelationshipMentions, extractCommunicationPatterns, hasDistressSignals, hasDeflectionSignals, getDominantPattern, } from './extractors/index.js';
// Phase 2: Personal Context Integration
export { generatePersonalContextBoost, applyPersonalContextBoost, DEFAULT_PERSONAL_CONTEXT_CONFIG, } from './personal-context-integrator.js';
// Phase 3: Temporal Pattern Detector
export { 
// Configuration
DEFAULT_TEMPORAL_CONFIG, 
// Helpers
getDayOfWeek, getTimeOfDayBucket, daysUntilRecurringDate, daysSinceRecurringDate, 
// Event recording
createTriggerFiringEvent, recordFiringEvent, 
// Pattern analysis
analyzeDayOfWeekPatterns, analyzeTimeOfDayPatterns, analyzeRecurringDatePatterns, analyzeTemporalPatterns, 
// Boost calculation
calculateTemporalBoost, 
// Analytics
recordTemporalBoost, recordFiringEventAnalytics, getTemporalAnalytics, resetTemporalAnalytics, } from './temporal-pattern-detector.js';
// Voice Agent Integration (Phase 2 + 3 combined)
export { loadUserTriggerContext, getSessionTriggerContext, recordTriggerOutcome, saveUserTriggerContext, getCombinedTriggerBoost, getApproachingSignificantDates, clearAllSessionContexts, getActiveSessionCount, } from './voice-agent-integration.js';
// Phase 4: Effectiveness Learning
export { 
// Configuration
DEFAULT_EFFECTIVENESS_CONFIG, 
// Session outcome tracking
recordOutcomeEvent, getSessionOutcomes, clearSessionOutcomes, 
// Signal detection
detectEngagementSignals, detectDeflectionSignals, 
// Effectiveness calculation
calculateEffectivenessFromEvents, calculateEffectivenessFromRecord, analyzeUserEffectiveness, 
// Trigger matching integration
getEffectivenessMultiplier, applyEffectivenessToScore, 
// Analytics
recordEffectivenessAnalytics, getEffectivenessAnalytics, resetEffectivenessAnalytics, } from './effectiveness-calculator.js';
export { DEFAULT_ANTICIPATION_SAFEGUARDS, DEFAULT_ANTICIPATORY_INTELLIGENCE, } from './user-trigger-profile.types.js';
// Phase 5: Anticipatory Signal Learner
export { 
// Configuration
DEFAULT_SIGNAL_LEARNER_CONFIG, 
// Common patterns
COMMON_ANTICIPATORY_PHRASES, 
// Signal detection
detectAnticipatorySignals, 
// Learning
learnFromUtterance, 
// Event recording
recordAnticipationEvent, 
// Analytics
getAnticipatoryAnalytics, } from './anticipatory-signal-learner.js';
// Phase 5: Anticipatory Trigger Engine
export { 
// Configuration
DEFAULT_ENGINE_CONFIG, 
// Response templates
DEFAULT_RESPONSE_TEMPLATES, 
// Main engine
processPartialInput, checkPendingAnticipation, recordAnticipatoryOutcome, 
// Session management
clearAnticipatorySession, clearAllAnticipatorySessions, getAnticipatorySessionStats, 
// Persona customization
getPersonaResponseTemplates, 
// Analytics
recordAnticipationFiring, getAnticipatoryEngineAnalytics, resetAnticipatoryEngineAnalytics, } from './anticipatory-trigger-engine.js';
export { DEFAULT_LIFE_CONTEXT_SNAPSHOT } from './life-context-snapshot.js';
// Phase 6: Domain Data Collectors
export { sleepDataCollector, calendarDataCollector, financeDataCollector, goalsDataCollector, relationshipDataCollector, habitsDataCollector, domainCollectors, collectAllDomainData, clearDomainCache, clearAllDomainCaches, getDomainCacheStats, } from './domain-data-collectors.js';
// Phase 6: Life Context Aggregator
export { aggregateLifeContext, summarizeLifeContext, computeSleepStress, computeCalendarStress, computeFinanceStress, computeGoalsStress, computeRelationshipStress, computeHabitsStress, detectCrossDomainPatterns, calculateOverallLoadScore, calculateWellbeingScore, DEFAULT_AGGREGATOR_CONFIG, } from './life-context-aggregator.js';
// Phase 6: Synthesis Trigger Generator
export { generateSynthesisTriggers, populateSynthesisTriggers, getMostImportantTrigger, getTriggersByCategory, getTriggersForPersona, recordSynthesisTriggers, getSynthesisAnalytics, resetSynthesisAnalytics, allTriggerTemplates, supportTriggerTemplates, celebrationTriggerTemplates, warningTriggerTemplates, nuancedTriggerTemplates, } from './synthesis-trigger-generator.js';
//# sourceMappingURL=index.js.map