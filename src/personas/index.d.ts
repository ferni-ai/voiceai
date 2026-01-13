/**
 * Persona Registry and Loader
 *
 * Central management for AI personas.
 *
 * ARCHITECTURE (v2 - Bundle-based):
 *   src/personas/
 *     bundles/            # Persona bundles (JSON + content files)
 *     team/               # Team coordination and handoffs
 *     behaviors.ts        # Persona-parameterized behaviors
 *     greetings.ts        # Greeting generation
 *     theatrical.ts       # Entrances, celebrations, goodbyes
 *
 * Available personas (loaded from bundles):
 *     peter-john         # Stock analyst
 *     alex-chen           # Communications specialist
 *     maya-santos         # Spend/save coach
 *     jordan-taylor       # Event planner
 *     ferni               # Life coach (team coordinator)
 */
import type { PartialPersonaConfig, PersonaConfig, PersonaId } from './types.js';
export * from './team/index.js';
export type * from './types.js';
export { getAliasesForPersona, getAllPersonaIds, getCanonicalPersonaId, getFrontendPersonaId, getPersonaDisplayName, getVoiceEntry, getVoiceId, initializeVoiceRegistry, isKnownPersona, isVoiceRegistryInitialized, resetVoiceRegistry, } from './voice-registry.js';
export { getCanonicalPersonaId as normalizePersonaId } from './voice-registry.js';
export { BASE_IDENTITY_RULES, buildSystemPrompt } from './base-identity.js';
export * from './behaviors.js';
export { checkForEasterEgg, getRandomQuirk, type DelighterContext, type EasterEggResult, } from './easter-eggs.js';
export * from './greetings.js';
export { extractMemorableMoments, getMeaningfulSilenceResponse, mergeMemorableMoments, playAmbientMusicDuringSilence, SilenceHandler, stopAmbientMusic, type SilenceContext, type SilenceResponse, type SilenceResponseType, } from './meaningful-silence.js';
export { clearAllTheatricalRegistries, clearBundleBackchannels, clearBundleCelebrations, clearBundleEntrances, clearBundleGoodbyes, clearBundleStorytelling, clearRecentBackchannels, getAllBackchannelsForPersona, getAllEntrancesForPersona, getBundleStoryMusicOffer, getCelebration, getEnhancedBackchannel, getStoryMusicOffer, getStorytellingConfig, getStorytellingIntro, getTheatricalEntrance, getTheatricalGoodbye, registerBundleBackchannels, registerBundleCelebrations, registerBundleEntrances, registerBundleGoodbyes, registerBundleStorytelling, type CelebrationType, type StorytellingConfig, } from './theatrical.js';
export { createSessionRuntime, SessionBundleRuntimeManager, type SessionContext, type SessionEnhancements, type SessionRuntimeConfig, type WelcomeBackResult, } from './session-runtime.js';
export { detectUserMoodFromContext, generateAliveEntrance, getAliveEntrance, getAliveEntranceForHandoff, type AliveEntranceResult, type EntranceContext, } from './alive-entrances.js';
/**
 * Get a persona by ID
 */
export declare function getPersona(id: PersonaId): PersonaConfig | undefined;
/**
 * Get the default persona (from env or fallback)
 *
 * WARNING: This is a SYNC function that can only return personas already loaded.
 * Use getPersonaAsync() instead for reliable persona loading with bundle support.
 *
 * Fallback chain:
 * 1. Requested persona (PERSONA_ID env var or 'ferni')
 * 2. 'ferni' (coordinator)
 *
 * THROWS if persona not found - no more generic-advisor fallback!
 * This prevents silent failures where users talk to the wrong persona.
 */
export declare function getDefaultPersona(): PersonaConfig;
/**
 * Register a new persona
 */
export declare function registerPersona(persona: PersonaConfig): void;
/**
 * List all registered persona IDs
 */
export declare function listPersonas(): PersonaId[];
/**
 * Check if a persona exists
 */
export declare function hasPersona(id: PersonaId): boolean;
/**
 * Create a persona by extending an existing one
 */
export declare function extendPersona(baseId: PersonaId, overrides: PartialPersonaConfig): PersonaConfig;
/**
 * Initialize registry from persona bundles
 * Loads all bundles and registers them as PersonaConfigs
 *
 * OPTIMIZATION: Uses priority-based loading in production:
 * - Loads the active persona (from PERSONA_ID) synchronously
 * - Loads other personas in background (non-blocking)
 * - Dramatically reduces startup time from ~40s to ~5s
 */
export declare function initializeFromBundles(): Promise<{
    loaded: number;
    failed: number;
    errors: string[];
}>;
/**
 * Get a persona by ID, falling back to bundle loading if not in registry
 * This ensures bundles are loaded before attempting to resolve aliases
 */
export declare function getPersonaAsync(id: PersonaId): Promise<PersonaConfig | undefined>;
export { bundleToPersonaConfig, discoverAndLoadBundles, loadBundleAsPersona, loadBundleById, } from './bundles/index.js';
export { GENERIC_ADVISOR_PERSONA } from './generic-advisor/index.js';
export { WELLNESS_COACH_PERSONA } from './wellness-coach/index.js';
export { buildCognitivePromptInjection, cognitiveProfiles, detectQuestionComplexity, detectUserExpertise, getCognitiveEngine, getCognitiveGuidance, getCognitiveProfile, removeCognitiveEngine, resetAllCognitiveEngines, } from './cognitive-index.js';
export type { AttentionFocus, AttentionProfile, CognitiveBiasConfig, CognitiveBiasType, CognitiveContext, CognitiveGuidance, CognitiveProfile, InformationProcessingStyle, MetacognitionConfig, ReasoningStyle, TheoryOfMindConfig, } from './cognitive-index.js';
export { AgentRegistry, type Agent } from './registry/unified-registry.js';
export { AgentRole, getAgentRoleForPersona, getHandoffToolName, getPersonaId, getPersonaMetadata, getTeamMemberIds, isCoach, isKnownPersonaId, isTeamMember, PERSONA_REGISTRY, resolveAgentId, ROLE_TO_PERSONA, type PersonaId, type PersonaMetadata, } from './id-mapping.js';
export { ALIAS_TO_CANONICAL, ALL_CANONICAL_IDS, assertCanonical, CANONICAL_IDS, CANONICAL_TO_FRONTEND, DISPLAY_NAMES, fromFrontend, FRONTEND_TO_CANONICAL, isCanonicalId, isKnownId, isSamePersona, toCanonical, toFrontend, validateAndLog, type CanonicalPersonaId, type FrontendPersonaId, } from './persona-ids.js';
export { clearRelationshipEngine, getRelationshipEngine, getRelationshipPersistence, loadAllRelationshipMemories, loadRelationshipMemory, RELATIONSHIP_STAGE_CONFIGS, RelationshipMemoryEngine, RelationshipMemoryPersistence, saveRelationshipMemory, } from './relationship-memory/index.js';
export type { CallbackAttempt, CallbackEffectiveness, EmotionalTrajectory, InsideJoke, InsideJokeSeed, RelationshipContext, RelationshipMemory, RelationshipMilestone, RelationshipMilestoneType, RelationshipPromptInjection, RelationshipStage, RelationshipStageConfig, RelationshipUpdateResult, SharedMoment, SharedMomentType, TemporalPattern, } from './relationship-memory/index.js';
export { alexDifferentiation, cognitiveDifferentiation, ferniDifferentiation, getCognitiveDifferentiation, getDisagreementPhrase, getInsightLeadIn, getPersonaQuestion, jordanDifferentiation, mayaDifferentiation, nayanDifferentiation, peterDifferentiation, } from './cognitive-differentiation.js';
export type { CognitiveDifferentiation, DisagreementApproach, DisagreementStyle, InsightFraming, InsightFramingStyle, QuestioningStyle, ResponsePacing, SilenceHandling, SilenceInterpretation, } from './cognitive-differentiation.js';
export { buildHandoffContext, checkTeamInsideJoke, generateHandoffNote, getAllTeamReferences, getTeamChemistryConfig, getTeamCompliment, getTeamDynamics, getTeamReference, shouldIncludeTeamReference, } from './shared/team-chemistry.js';
export type { HandoffContext, TeamChemistryConfig, TeamInsideJoke, TeamPairDynamic, TeamReference, TeamStory, } from './shared/team-chemistry.js';
export { clearPersonaIntelligence, getPersonaIntelligence, PersonaIntelligenceEngine, resetAllPersonaIntelligence, } from './persona-intelligence.js';
export type { PersonaIntelligenceConfig, PersonaIntelligenceContext, UnifiedPromptInjection, } from './persona-intelligence.js';
export { analyzePredictively, detectConcerns, detectPatterns, getAnticipatoryInsights, getProactiveFollowUps, loadPredictiveIntelligence, } from './predictive-intelligence.js';
export type { AnticipatoryInsight, DetectedConcern, DetectedPattern, PatternMatchContext, PredictiveAnalysis, PredictiveIntelligence, ProactiveFollowUp, } from './predictive-intelligence.js';
export { detectMoments, detectPrimaryMoment, getMomentPriority, hasMoment, } from './moment-detection.js';
export type { DetectedMoment, MomentDetectionContext } from './moment-detection.js';
declare const _default: {
    get: typeof getPersona;
    getDefault: typeof getDefaultPersona;
    register: typeof registerPersona;
    list: typeof listPersonas;
    has: typeof hasPersona;
    extend: typeof extendPersona;
    initializeFromBundles: typeof initializeFromBundles;
    getAsync: typeof getPersonaAsync;
};
export default _default;
//# sourceMappingURL=index.d.ts.map