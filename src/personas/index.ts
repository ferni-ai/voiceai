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
import type { PersonaConfig, PersonaId, PersonaRegistry, PartialPersonaConfig } from './types.js';

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

// External agents (jack-bogle, joel-dickson) now hosted at voiceai-agents repo
// Install with: npx ferni install jack-bogle --from https://github.com/sethdford/voiceai-agents

// ============================================================================
// SHARED UTILITIES EXPORTS
// ============================================================================

// Re-export types
export type * from './types.js';

// Voice Registry - single source of truth for voice IDs and persona ID normalization
export {
  initializeVoiceRegistry,
  getVoiceId,
  getVoiceEntry,
  getCanonicalPersonaId,
  isKnownPersona,
  getAllPersonaIds,
  getAliasesForPersona,
  isVoiceRegistryInitialized,
  resetVoiceRegistry,
  getFrontendPersonaId,
  getPersonaDisplayName,
} from './voice-registry.js';

// Alias for backward compatibility and semantic clarity
export { getCanonicalPersonaId as normalizePersonaId } from './voice-registry.js';

// Re-export behaviors, greetings, meaningful silence, and easter eggs
export * from './behaviors.js';
export * from './greetings.js';
export { BASE_IDENTITY_RULES, buildSystemPrompt } from './base-identity.js';
export {
  checkForEasterEgg,
  getRandomQuirk,
  type EasterEggResult,
  type DelighterContext,
} from './easter-eggs.js';
export {
  getMeaningfulSilenceResponse,
  SilenceHandler,
  extractMemorableMoments,
  mergeMemorableMoments,
  playAmbientMusicDuringSilence,
  stopAmbientMusic,
  type SilenceContext,
  type SilenceResponse,
  type SilenceResponseType,
} from './meaningful-silence.js';

// Theatrical personality - entrances, celebrations, goodbyes
export {
  getTheatricalEntrance,
  getCelebration,
  getTheatricalGoodbye,
  getEnhancedBackchannel,
  getStorytellingIntro,
  getStoryMusicOffer,
  THEATRICAL_ENTRANCES,
  CELEBRATION_MOMENTS,
  THEATRICAL_GOODBYES,
  STORYTELLING_CONFIGS,
  ENHANCED_BACKCHANNELS,
  // Bundle entrance management
  registerBundleEntrances,
  clearBundleEntrances,
  getAllEntrancesForPersona,
  // Bundle backchannel management
  registerBundleBackchannels,
  clearBundleBackchannels,
  getAllBackchannelsForPersona,
  type CelebrationType,
  type StorytellingConfig,
} from './theatrical.js';

// ============================================================================
// ALIVE ENTRANCES (context-aware handoff transitions)
// ============================================================================

export {
  generateAliveEntrance,
  getAliveEntrance,
  getAliveEntranceForHandoff,
  detectUserMoodFromContext,
  type EntranceContext,
  type AliveEntranceResult,
} from './alive-entrances.js';

// ============================================================================
// PERSONA REGISTRY
// ============================================================================

const personaRegistry: PersonaRegistry = new Map();

// Generic advisor persona (fallback when bundles aren't loaded)
personaRegistry.set('generic-advisor', GENERIC_ADVISOR_PERSONA);

// Wellness coach persona (created from generic-advisor template)
personaRegistry.set('wellness-coach', WELLNESS_COACH_PERSONA);

// NOTE: Main personas (peter-john, alex-chen, maya-santos, jordan-taylor, ferni, nayan-patel)
// are now loaded from bundles via initializeFromBundles() at startup

// ============================================================================
// REGISTRY FUNCTIONS
// ============================================================================

/**
 * Get a persona by ID
 */
export function getPersona(id: PersonaId): PersonaConfig | undefined {
  return personaRegistry.get(id);
}

/**
 * Get the default persona (from env or fallback)
 *
 * Fallback chain:
 * 1. Requested persona (PERSONA_ID env var or 'ferni')
 * 2. 'ferni' (coordinator)
 * 3. 'generic-advisor' (always available, legacy persona)
 */
export function getDefaultPersona(): PersonaConfig {
  const logger = getLogger();
  const defaultId = process.env.PERSONA_ID || 'ferni';

  // Try requested persona
  let persona = personaRegistry.get(defaultId);
  if (persona) return persona;

  // Try ferni (coordinator)
  persona = personaRegistry.get('ferni');
  if (persona) return persona;

  // Fall back to generic-advisor (always available as legacy persona)
  persona = personaRegistry.get('generic-advisor');
  if (persona) {
    logger.warn(
      { requestedId: defaultId },
      'Persona not found, using generic-advisor (bundles may not be loaded yet)'
    );
    return persona;
  }

  // This should never happen, but handle it gracefully
  logger.error('CRITICAL: No personas available in registry!');
  throw new Error('No personas available. Check that persona bundles are properly configured.');
}

/**
 * Register a new persona
 */
export function registerPersona(persona: PersonaConfig): void {
  if (personaRegistry.has(persona.id)) {
    getLogger().warn({ personaId: persona.id }, 'Persona already registered, overwriting');
  }
  personaRegistry.set(persona.id, persona);
}

/**
 * List all registered persona IDs
 */
export function listPersonas(): PersonaId[] {
  return Array.from(personaRegistry.keys());
}

/**
 * Check if a persona exists
 */
export function hasPersona(id: PersonaId): boolean {
  return personaRegistry.has(id);
}

/**
 * Create a persona by extending an existing one
 */
export function extendPersona(baseId: PersonaId, overrides: PartialPersonaConfig): PersonaConfig {
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
  } as PersonaConfig;
}

// ============================================================================
// BUNDLE INTEGRATION
// ============================================================================

import { discoverAndLoadBundles, loadBundleAsPersona } from './bundles/index.js';

/**
 * Initialize registry from persona bundles
 * Loads all bundles and registers them as PersonaConfigs
 */
export async function initializeFromBundles(): Promise<{
  loaded: number;
  failed: number;
  errors: string[];
}> {
  const result = await discoverAndLoadBundles();

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

  getLogger().info(
    { loaded: result.personas.length, failed: result.errors.length },
    'Initialized personas from bundles'
  );

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
export async function getPersonaAsync(id: PersonaId): Promise<PersonaConfig | undefined> {
  // Check registry first
  const existing = personaRegistry.get(id);
  if (existing) return existing;

  // If bundles haven't been initialized yet, do it now
  // This ensures aliases like 'jack-b' -> 'ferni' are registered
  if (!bundlesInitialized) {
    await initializeFromBundles();
    bundlesInitialized = true;

    // Check registry again after initialization
    const afterInit = personaRegistry.get(id);
    if (afterInit) return afterInit;
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
export {
  discoverAndLoadBundles,
  loadBundleAsPersona,
  loadBundleById,
  bundleToPersonaConfig,
} from './bundles/index.js';

// ============================================================================
// LEGACY EXPORTS
// ============================================================================

// Generic advisor persona (fallback when bundles aren't loaded)
export { GENERIC_ADVISOR_PERSONA } from './generic-advisor/index.js';

// Wellness coach persona (created from generic-advisor template)
export { WELLNESS_COACH_PERSONA } from './wellness-coach/index.js';

// NOTE: Main personas (peter-john, alex-chen, maya-santos, jordan-taylor, ferni, nayan-patel)
// are now bundle-based. Use getPersona() or getPersonaAsync() to access them.
// External agents (jack-bogle, joel-dickson) available at voiceai-agents repo.

// ============================================================================
// COGNITIVE INTELLIGENCE SYSTEM
// ============================================================================

// Export cognitive intelligence types and utilities
export {
  getCognitiveGuidance,
  buildCognitivePromptInjection,
  detectQuestionComplexity,
  detectUserExpertise,
  getCognitiveEngine,
  removeCognitiveEngine,
  resetAllCognitiveEngines,
  getCognitiveProfile,
  cognitiveProfiles,
} from './cognitive-index.js';

export type {
  CognitiveProfile,
  CognitiveContext,
  CognitiveGuidance,
  ReasoningStyle,
  AttentionFocus,
  AttentionProfile,
  TheoryOfMindConfig,
  CognitiveBiasConfig,
  CognitiveBiasType,
  MetacognitionConfig,
  InformationProcessingStyle,
} from './cognitive-index.js';

// ============================================================================
// UNIFIED REGISTRY (Auto-discovered agents from bundles)
// ============================================================================

export { AgentRegistry, type Agent } from './registry/unified-registry.js';

// ============================================================================
// ID MAPPING (Roles, metadata, aliases)
// Re-exported here to provide single import point
// ============================================================================

export {
  AgentRole,
  type PersonaId,
  type PersonaMetadata,
  ROLE_TO_PERSONA,
  PERSONA_REGISTRY,
  resolveAgentId,
  getAgentRoleForPersona,
  getPersonaId,
  getPersonaMetadata,
  getHandoffToolName,
  isCoach,
  isTeamMember,
  getTeamMemberIds,
  isKnownPersonaId,
} from './id-mapping.js';

// ============================================================================
// PERSONA IDS (Constants, types, validation)
// Re-exported for tests and validation
// ============================================================================

export {
  CANONICAL_IDS,
  ALL_CANONICAL_IDS,
  ALIAS_TO_CANONICAL,
  CANONICAL_TO_FRONTEND,
  FRONTEND_TO_CANONICAL,
  DISPLAY_NAMES,
  type CanonicalPersonaId,
  type FrontendPersonaId,
  toCanonical,
  toFrontend,
  fromFrontend,
  isCanonicalId,
  isKnownId,
  isSamePersona,
  assertCanonical,
  validateAndLog,
} from './persona-ids.js';

// ============================================================================
// HANDOFF EVENT DATA (re-exported from handoff module)
// ============================================================================

export { createHandoffEvent, type HandoffEventData } from '../tools/handoff/types.js';

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
