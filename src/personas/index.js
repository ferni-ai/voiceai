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
import { getLogger } from '../utils/safe-logger.js';
// ============================================================================
// CORE EXPORTS
// ============================================================================
// Team configuration
export * from './team/index.js';
// ============================================================================
// LEGACY IMPORTS (for backward compatibility)
// ============================================================================
// Generic advisor persona (fallback when bundles aren't loaded)
import { GENERIC_ADVISOR_PERSONA } from './generic-advisor/index.js';
// Wellness coach persona (created from generic-advisor template)
import { WELLNESS_COACH_PERSONA } from './wellness-coach/index.js';
// Voice Registry - single source of truth for voice IDs and persona ID normalization
export { getAliasesForPersona, getAllPersonaIds, getCanonicalPersonaId, getFrontendPersonaId, getPersonaDisplayName, getVoiceEntry, getVoiceId, initializeVoiceRegistry, isKnownPersona, isVoiceRegistryInitialized, resetVoiceRegistry, } from './voice-registry.js';
// Alias for backward compatibility and semantic clarity
export { getCanonicalPersonaId as normalizePersonaId } from './voice-registry.js';
// Re-export behaviors, greetings, meaningful silence, and easter eggs
export { BASE_IDENTITY_RULES, buildSystemPrompt } from './base-identity.js';
export * from './behaviors.js';
export { checkForEasterEgg, getRandomQuirk, } from './easter-eggs.js';
export * from './greetings.js';
export { extractMemorableMoments, getMeaningfulSilenceResponse, mergeMemorableMoments, playAmbientMusicDuringSilence, SilenceHandler, stopAmbientMusic, } from './meaningful-silence.js';
// Theatrical personality - entrances, celebrations, goodbyes
// NOTE: All theatrical content now loaded from persona bundles
export { 
// Bundle management
clearAllTheatricalRegistries, clearBundleBackchannels, clearBundleCelebrations, clearBundleEntrances, clearBundleGoodbyes, clearBundleStorytelling, clearRecentBackchannels, 
// Getters
getAllBackchannelsForPersona, getAllEntrancesForPersona, getBundleStoryMusicOffer, getCelebration, getEnhancedBackchannel, getStoryMusicOffer, getStorytellingConfig, getStorytellingIntro, getTheatricalEntrance, getTheatricalGoodbye, 
// Registrations
registerBundleBackchannels, registerBundleCelebrations, registerBundleEntrances, registerBundleGoodbyes, registerBundleStorytelling, } from './theatrical.js';
// ============================================================================
// SESSION RUNTIME MANAGER
// ============================================================================
export { createSessionRuntime, SessionBundleRuntimeManager, } from './session-runtime.js';
// ============================================================================
// ALIVE ENTRANCES (context-aware handoff transitions)
// ============================================================================
export { detectUserMoodFromContext, generateAliveEntrance, getAliveEntrance, getAliveEntranceForHandoff, } from './alive-entrances.js';
// ============================================================================
// PERSONA REGISTRY
// ============================================================================
const personaRegistry = new Map();
// ============================================================================
// TEMPLATE PERSONAS (NOT for production use)
// These exist as templates for creating new personas via extendPersona().
// See src/personas/generic-advisor/index.ts for usage documentation.
// For production, use bundle-based personas loaded via initializeFromBundles().
// ============================================================================
personaRegistry.set('generic-advisor', GENERIC_ADVISOR_PERSONA);
personaRegistry.set('wellness-coach', WELLNESS_COACH_PERSONA);
// NOTE: Main personas (peter-john, alex-chen, maya-santos, jordan-taylor, ferni, nayan-patel)
// are now loaded from bundles via initializeFromBundles() at startup
// ============================================================================
// REGISTRY FUNCTIONS
// ============================================================================
/**
 * Get a persona by ID
 */
export function getPersona(id) {
    return personaRegistry.get(id);
}
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
export function getDefaultPersona() {
    const logger = getLogger();
    const defaultId = process.env.PERSONA_ID || 'ferni';
    // Try requested persona
    let persona = personaRegistry.get(defaultId);
    if (persona)
        return persona;
    // Try ferni (coordinator)
    persona = personaRegistry.get('ferni');
    if (persona)
        return persona;
    // FAIL LOUDLY - do NOT fall back to generic-advisor!
    // If bundles aren't loaded yet, caller should use getPersonaAsync() instead
    logger.error({ requestedId: defaultId, availablePersonas: Array.from(personaRegistry.keys()) }, 'CRITICAL: Persona not found! Bundles may not be loaded yet. Use getPersonaAsync() instead.');
    throw new Error(`Persona '${defaultId}' not found. Available: ${Array.from(personaRegistry.keys()).join(', ')}. ` +
        `If called at module load time, use getPersonaAsync() instead of getDefaultPersona().`);
}
/**
 * Register a new persona
 */
export function registerPersona(persona) {
    if (personaRegistry.has(persona.id)) {
        getLogger().warn({ personaId: persona.id }, 'Persona already registered, overwriting');
    }
    personaRegistry.set(persona.id, persona);
}
/**
 * List all registered persona IDs
 */
export function listPersonas() {
    return Array.from(personaRegistry.keys());
}
/**
 * Check if a persona exists
 */
export function hasPersona(id) {
    return personaRegistry.has(id);
}
/**
 * Create a persona by extending an existing one
 */
export function extendPersona(baseId, overrides) {
    const base = personaRegistry.get(baseId);
    if (!base) {
        throw new Error(`Base persona '${baseId}' not found`);
    }
    return {
        ...base,
        ...overrides,
        // Deep merge nested configs
        voice: { ...base.voice, ...overrides.voice },
        identity: { ...base.identity, ...overrides.identity },
        communication: { ...base.communication, ...overrides.communication },
        personality: { ...base.personality, ...overrides.personality },
        knowledge: { ...base.knowledge, ...overrides.knowledge },
        // Arrays get replaced, not merged (intentional)
        stories: overrides.stories ?? base.stories,
        catchphrases: overrides.catchphrases ?? base.catchphrases,
        petPeeves: overrides.petPeeves ?? base.petPeeves,
    };
}
// ============================================================================
// BUNDLE INTEGRATION
// ============================================================================
import { discoverAndLoadBundles, discoverAndLoadBundlesWithPriority, loadBundleAsPersona, } from './bundles/index.js';
/**
 * Initialize registry from persona bundles
 * Loads all bundles and registers them as PersonaConfigs
 *
 * OPTIMIZATION: Uses priority-based loading in production:
 * - Loads the active persona (from PERSONA_ID) synchronously
 * - Loads other personas in background (non-blocking)
 * - Dramatically reduces startup time from ~40s to ~5s
 */
export async function initializeFromBundles() {
    // Use priority-based loading in production for faster startup
    const usePriorityLoading = process.env.NODE_ENV === 'production';
    const result = usePriorityLoading
        ? await discoverAndLoadBundlesWithPriority(process.env.PERSONA_ID, true)
        : await discoverAndLoadBundles();
    for (let i = 0; i < result.personas.length; i++) {
        const persona = result.personas[i];
        const bundle = result.bundles[i];
        // Register under main ID
        if (!personaRegistry.has(persona.id)) {
            personaRegistry.set(persona.id, persona);
        }
        // Also register under name (lowercase) for convenience
        const nameKey = persona.name.toLowerCase().replace(/\s+/g, '-');
        if (!personaRegistry.has(nameKey)) {
            personaRegistry.set(nameKey, persona);
        }
        // Register aliases from bundle manifest
        const aliases = bundle?.manifest?.identity?.aliases;
        if (aliases && Array.isArray(aliases)) {
            for (const alias of aliases) {
                if (!personaRegistry.has(alias)) {
                    personaRegistry.set(alias, persona);
                }
            }
        }
    }
    bundlesInitialized = true;
    getLogger().info({ loaded: result.personas.length, failed: result.errors.length }, 'Initialized personas from bundles');
    return {
        loaded: result.personas.length,
        failed: result.errors.length,
        errors: result.errors,
    };
}
// Track if bundles have been initialized
let bundlesInitialized = false;
/**
 * Get a persona by ID, falling back to bundle loading if not in registry
 * This ensures bundles are loaded before attempting to resolve aliases
 */
export async function getPersonaAsync(id) {
    // Check registry first
    const existing = personaRegistry.get(id);
    if (existing)
        return existing;
    // If bundles haven't been initialized yet, do it now
    // This ensures aliases like 'jack-b' -> 'ferni' are registered
    if (!bundlesInitialized) {
        await initializeFromBundles();
        bundlesInitialized = true;
        // Check registry again after initialization
        const afterInit = personaRegistry.get(id);
        if (afterInit)
            return afterInit;
    }
    // Try to load from bundle by exact ID
    const bundlePersona = await loadBundleAsPersona(id);
    if (bundlePersona) {
        personaRegistry.set(id, bundlePersona);
        return bundlePersona;
    }
    return undefined;
}
// Re-export bundle functions for convenience
export { bundleToPersonaConfig, discoverAndLoadBundles, loadBundleAsPersona, loadBundleById, } from './bundles/index.js';
// ============================================================================
// LEGACY EXPORTS
// ============================================================================
// Generic advisor persona (fallback when bundles aren't loaded)
export { GENERIC_ADVISOR_PERSONA } from './generic-advisor/index.js';
// Wellness coach persona (created from generic-advisor template)
export { WELLNESS_COACH_PERSONA } from './wellness-coach/index.js';
// NOTE: Main personas (peter-john, alex-chen, maya-santos, jordan-taylor, ferni, nayan-patel)
// are now bundle-based. Use getPersona() or getPersonaAsync() to access them.
// Additional marketplace agents available in marketplace-agents/ directory.
// ============================================================================
// COGNITIVE INTELLIGENCE SYSTEM
// ============================================================================
// Export cognitive intelligence types and utilities
export { buildCognitivePromptInjection, cognitiveProfiles, detectQuestionComplexity, detectUserExpertise, getCognitiveEngine, getCognitiveGuidance, getCognitiveProfile, removeCognitiveEngine, resetAllCognitiveEngines, } from './cognitive-index.js';
// ============================================================================
// UNIFIED REGISTRY (Auto-discovered agents from bundles)
// ============================================================================
export { AgentRegistry } from './registry/unified-registry.js';
// ============================================================================
// ID MAPPING (Roles, metadata, aliases)
// Re-exported here to provide single import point
// ============================================================================
export { AgentRole, getAgentRoleForPersona, getHandoffToolName, getPersonaId, getPersonaMetadata, getTeamMemberIds, isCoach, isKnownPersonaId, isTeamMember, PERSONA_REGISTRY, resolveAgentId, ROLE_TO_PERSONA, } from './id-mapping.js';
// ============================================================================
// PERSONA IDS (Constants, types, validation)
// Re-exported for tests and validation
// ============================================================================
export { ALIAS_TO_CANONICAL, ALL_CANONICAL_IDS, assertCanonical, CANONICAL_IDS, CANONICAL_TO_FRONTEND, DISPLAY_NAMES, fromFrontend, FRONTEND_TO_CANONICAL, isCanonicalId, isKnownId, isSamePersona, toCanonical, toFrontend, validateAndLog, } from './persona-ids.js';
// ============================================================================
// RELATIONSHIP MEMORY ENGINE
// ============================================================================
export { clearRelationshipEngine, getRelationshipEngine, getRelationshipPersistence, loadAllRelationshipMemories, loadRelationshipMemory, RELATIONSHIP_STAGE_CONFIGS, RelationshipMemoryEngine, RelationshipMemoryPersistence, saveRelationshipMemory, } from './relationship-memory/index.js';
// ============================================================================
// COGNITIVE DIFFERENTIATION
// ============================================================================
export { alexDifferentiation, cognitiveDifferentiation, ferniDifferentiation, getCognitiveDifferentiation, getDisagreementPhrase, getInsightLeadIn, getPersonaQuestion, jordanDifferentiation, mayaDifferentiation, nayanDifferentiation, peterDifferentiation, } from './cognitive-differentiation.js';
// ============================================================================
// TEAM CHEMISTRY
// ============================================================================
export { buildHandoffContext, checkTeamInsideJoke, generateHandoffNote, getAllTeamReferences, getTeamChemistryConfig, getTeamCompliment, getTeamDynamics, getTeamReference, shouldIncludeTeamReference, } from './shared/team-chemistry.js';
// ============================================================================
// UNIFIED PERSONA INTELLIGENCE
// ============================================================================
export { clearPersonaIntelligence, getPersonaIntelligence, PersonaIntelligenceEngine, resetAllPersonaIntelligence, } from './persona-intelligence.js';
// ============================================================================
// PREDICTIVE INTELLIGENCE
// ============================================================================
export { analyzePredictively, detectConcerns, detectPatterns, getAnticipatoryInsights, getProactiveFollowUps, loadPredictiveIntelligence, } from './predictive-intelligence.js';
// ============================================================================
// MOMENT DETECTION
// ============================================================================
export { detectMoments, detectPrimaryMoment, getMomentPriority, hasMoment, } from './moment-detection.js';
// ============================================================================
// DEFAULT EXPORT
// ============================================================================
export default {
    // Core API
    get: getPersona,
    getDefault: getDefaultPersona,
    register: registerPersona,
    list: listPersonas,
    has: hasPersona,
    extend: extendPersona,
    // Bundle API
    initializeFromBundles,
    getAsync: getPersonaAsync,
};
//# sourceMappingURL=index.js.map