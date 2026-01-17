/**
 * Context Builder Loader
 *
 * Auto-discovery and loading of context builders.
 *
 * Benefits over manual import list:
 * - New builders are auto-discovered
 * - Easier to maintain
 * - Clear categorization
 * - Dependency ordering
 *
 * @module intelligence/context-builders/loader
 */

import { isFeatureEnabled } from '../../../config/feature-flags.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { BUILDER_IMPORTS } from './builder-imports.js';
import { BuilderCategory } from './categories.js';

const log = createLogger({ module: 'context-builder-loader' });

// ============================================================================
// CONDITIONAL LOADING CONFIG
// ============================================================================

/**
 * Categories that can be conditionally skipped based on feature flags or context.
 * This reduces startup time by not loading builders that won't be used.
 */
export interface ConditionalLoadingConfig {
  /** Skip VOICE category if voice emotion analysis is disabled */
  skipVoiceBuilders: boolean;
  /** Skip EXTERNAL category if no external integrations are configured */
  skipExternalBuilders: boolean;
  /** Skip COACHING category if not in coaching mode */
  skipCoachingBuilders: boolean;
  /** Skip TEAM category for single-persona mode */
  skipTeamBuilders: boolean;
}

let conditionalConfig: ConditionalLoadingConfig = {
  skipVoiceBuilders: false,
  skipExternalBuilders: false,
  skipCoachingBuilders: false,
  skipTeamBuilders: false,
};

/**
 * Configure conditional loading options.
 * Call this before ensureBuildersLoaded() to customize which categories load.
 */
export function configureConditionalLoading(config: Partial<ConditionalLoadingConfig>): void {
  conditionalConfig = { ...conditionalConfig, ...config };
  log.debug({ config: conditionalConfig }, 'Conditional loading configured');
}

/**
 * Check if a category should be loaded based on conditional config.
 */
function shouldLoadCategory(category: BuilderCategory): boolean {
  switch (category) {
    case BuilderCategory.VOICE:
      // Skip if voice emotion analysis is disabled
      if (conditionalConfig.skipVoiceBuilders) {
        return false;
      }
      // Also check feature flag
      if (!isFeatureEnabled('voiceEmotionDetection')) {
        return false;
      }
      return true;

    case BuilderCategory.EXTERNAL:
      // External integrations often require setup
      return !conditionalConfig.skipExternalBuilders;

    case BuilderCategory.COACHING:
      // Coaching is core functionality, but can be skipped for simpler use cases
      return !conditionalConfig.skipCoachingBuilders;

    case BuilderCategory.TEAM:
      // Multi-persona coordination - skip for single-persona mode
      return !conditionalConfig.skipTeamBuilders;

    // These categories are always required
    case BuilderCategory.SAFETY:
    case BuilderCategory.EMOTIONAL:
    case BuilderCategory.MEMORY:
    case BuilderCategory.PERSONA:
    case BuilderCategory.HUMANIZING:
      return true;

    // Default: load the category
    default:
      return true;
  }
}

// ============================================================================
// BUILDER MANIFEST
// ============================================================================

/**
 * Builder manifest organized by category.
 *
 * Each entry is a module name (without .js extension) that will be dynamically imported.
 * Modules are expected to call registerContextBuilder() on load.
 *
 * Categories are loaded in priority order:
 * 1. SAFETY - Crisis, wellbeing (must run first)
 * 2. EMOTIONAL - Emotion detection
 * 3. VOICE - Voice emotion analysis
 * 4. MEMORY - Cross-session memory
 * 5. PERSONA - Character identity
 * 6. COACHING - Life coaching
 * 7. COGNITIVE - Cognitive patterns
 * 8. ENGAGEMENT - Games, music
 * 9. TEAM - Multi-persona
 * 10. CONTEXT - Topics, intent
 * 11. EXTERNAL - External data
 * 12. HUMANIZING - Natural speech
 * 13. LEARNING - Collective learning
 */
export const BUILDER_MANIFEST: Record<BuilderCategory, string[]> = {
  // SAFETY - Runs first, can override everything
  [BuilderCategory.SAFETY]: ['crisis', 'wellbeing-context', 'principal-alignment'],

  // EMOTIONAL - Core emotion handling
  // NOTE: emotional.behavioral.ts in behavioral/builders/ provides safer signal-based
  // emotion handling that cannot leak into LLM responses. Legacy builder disabled.
  [BuilderCategory.EMOTIONAL]: [
    // 'emotional',        // DISABLED: Migrated to behavioral/builders/emotional.behavioral.ts
    'celebration',
    'celebration-growth',
    'somatic-context',
    'emotional-trajectory-awareness', // E2E: Surfaces emotional trends over time ("Better Than Human")
  ],

  // VOICE - Voice emotion analysis
  [BuilderCategory.VOICE]: [
    'voice-mismatch-critical', // THE superhuman signal - runs first
    'voice-emotion',
    'advanced-voice-emotion',
    'voice-emotion-intelligence',
    'emotional-contagion-timing', // Human-like absorb→process→reflect delay pattern
    'human-listening',
  ],

  // MEMORY - Cross-session persistence
  // NOTE: unified-memory-orchestrator consolidates memory, advanced-memory, proactive-memory,
  // and human-memory into a single coordinated system. Legacy builders disabled to avoid redundancy.
  // NEW: better-than-human-memory provides proactive surfacing with timing, learning, and graph-based recall.
  // MOVED: semantic-intelligence-integration now runs on MEMORY triggers (not just COGNITIVE) for full E2E integration
  [BuilderCategory.MEMORY]: [
    'superhuman-session-priming', // NEW: Surfaces ALL superhuman memory at session start (Better Than Human)
    'better-than-human-memory', // P0: Proactive surfacing with timing intelligence and learning
    'unified-memory-orchestrator', // PRIMARY: Coordinates all memory subsystems
    'knowledge-graph', // Unified entity knowledge graph (Better Than Human memory)
    // 'memory',               // DISABLED: Consolidated into orchestrator
    // 'advanced-memory',      // DISABLED: Consolidated into orchestrator
    // 'proactive-memory',     // DISABLED: Consolidated into orchestrator
    'persona-memory', // KEPT: Persona-specific memory has unique value
    // 'human-memory',         // DISABLED: Consolidated into orchestrator
    'conversation-recap', // KEPT: Session recap is unique
    'cross-session-reflection', // KEPT: Reflection prompts are unique
    'cross-session-threading', // KEPT: Threading context is unique
    'thinking-of-you', // NEW: Proactive callbacks and "I was thinking about you" moments
    'memory-enhancement', // NEW: Tonal memory, curiosity follow-through, between-session thinking, persona growth
    'semantic-intelligence-integration', // MOVED: V3.0-V3.7 semantic intelligence - runs on every memory trigger (first 3 turns + every 5th)
    'generated-insights', // NEW: 10 categories of superhuman insights (correlations, growth, relationships, etc.)
    'memory-lane', // NEW: Surfaces meaningful memories ("On This Day", topic matches, emotional echoes)
  ],

  // PERSONA - Character and identity
  [BuilderCategory.PERSONA]: [
    'twin-profile-context', // Digital Twin profile - runs early for personalization
    'persona-identity',
    'persona-quirks',
    'persona-playful',
    'persona-vulnerability',
    'persona-mood',
    'human-personality', // Semantic matching, timing intelligence, callbacks
    'personality-v2', // SUPERHUMAN: Anticipation, timing, vulnerability, patterns, growth (Clean Architecture v2)
    'ferni-personality', // Ferni-specific: dynamic expressions, pushbacks, passions
    'ferni-coordinator-insights', // Ferni-specific: smart handoff suggestions from cross-team insights
    'peter-research-insights', // Peter-specific: deep research briefings on entry/handoff
    'maya-coaching-insights', // Maya-specific: cross-team coaching insights on entry/handoff
    'jordan-milestone-insights', // Jordan-specific: milestone and goal insights on entry/handoff
    'nayan-wisdom-insights', // Nayan-specific: big-picture wisdom synthesis on entry/handoff
    'alex-communication-insights', // Alex-specific: communication coaching on entry/handoff
    'joel-dickson-insights', // Joel-specific: investing wisdom, Bogle principles (STANDALONE persona)
    'better-than-human-direct', // Direct surfacing of Better Than Human curated phrases
    'conversational-superpowers', // Quote memory, milestones, micro-wins, jokes, names
    'conversation-forward', // Better Than Human: keep conversations moving, follow-ups
    'alive-awareness',
    'inner-world-injector',
    'spontaneous-vulnerability',
    'physical-presence',
    'lovable-presence',
  ],

  // COACHING - Life coaching capabilities
  [BuilderCategory.COACHING]: [
    'coaching-context',
    'life-coaching-context',
    'scientific-coaching',
    'therapeutic-frameworks',
    'behavioral-economics',
    'methodology', // Evidence-based frameworks from methodology.json
    'maya-habit-insights', // Maya-specific: habit patterns, predictive care, streak protection
    'prediction-surfacing', // Proactive prediction surfacing for all personas
  ],

  // COGNITIVE - Cognitive intelligence
  [BuilderCategory.COGNITIVE]: [
    'unified-intelligence', // NEW: Unified Intelligence (Levels 2-5) - cross-domain correlations, proactive insights
    'deep-understanding', // Unified deep intelligence: silence, rhythm, resistance, energy, goals, flow, repair, hope, chapters
    'awareness', // Momentum, thinking time, tangents, self-awareness (priority 55)
    'cognitive',
    'cognitive-quirks',
    'cognitive-distortions',
    'cognitive-insights',
    'pattern-surfacing',
    'superhuman-insights',
    // 'semantic-intelligence-integration', // MOVED to MEMORY for full E2E integration
    'life-context-synthesis', // Phase 6: Cross-domain life context awareness
  ],

  // ENGAGEMENT - User engagement
  [BuilderCategory.ENGAGEMENT]: [
    'engagement',
    'engagement-context',
    'game-context',
    'storytelling',
    'music',
    'music-emotion-offers',
    'daily-rituals', // NEW: Morning Sky Check, Habit Heartbeat, etc.
    'outreach-awareness', // NEW: Proactive contact outreach nudges
    'ceo-coaching-context', // CEO coaching: wins, priorities, blockers, decisions, energy
  ],

  // TEAM - Multi-persona coordination
  [BuilderCategory.TEAM]: [
    'capability-awareness', // NEW: "I can do X, defer to Y for Z" meta-awareness (runs first - high priority)
    'team-availability',
    'team-dynamics',
    'handoff',
    'semantic-intent-guidance', // Semantic pattern matching for handoffs, tools, intent
    'role-boundaries',
    'cameo-opportunities',
    'cameo-unlock', // Natural team member introductions
    'team-gossip', // Cross-persona references and banter
  ],

  // CONTEXT - Situational awareness
  // NOTE: pacing.behavioral.ts in behavioral/builders/ provides safer signal-based
  // pacing control that cannot be misinterpreted. Legacy builder disabled.
  [BuilderCategory.CONTEXT]: [
    'outbound-call-context', // On-behalf call purpose, script, compliance (runs early for outbound calls)
    'inbound-call-context', // Inbound phone call identity, recognition status, sponsored identity context
    'proactive-session-context', // E2E: Proactive check-in call trigger and opener guidance
    'family-messages-context', // Pending messages from family phone callers
    'family-awareness-context', // Mutual awareness between family members and sponsors
    'session-gap-awareness', // E2E: Days since last session with reconnection guidance
    'tool-failure-awareness', // E2E: Recent tool failures for honest acknowledgment
    'routine-awareness', // E2E: "What I Do For You" automated routines awareness
    'domain-fluency', // CONCEPTUAL capability awareness - what Ferni can help with (human-level)
    'tool-capabilities', // TECHNICAL tool capabilities (JSON format, function names)
    'dynamic-tool-guidance', // High priority - injects tool hints based on user request
    'tool-timing-context', // Tool execution timing for natural response framing
    'intent',
    'topics',
    'discovery',
    'personal',
    // 'pacing',            // DISABLED: Migrated to behavioral/builders/pacing.behavioral.ts
    'meta-conversation',
    'situational-awareness',
    'trust-context',
    'relationship-behaviors',
    'session-flow',
    'natural-discovery', // Gentle prompts to learn about dreams, values, goals
    'calendar-awareness',
    'contact-awareness',
    'captured-data-awareness', // E2E: Surfaces what passive capture has learned (contacts, pets, places)
    'message-review-awareness', // Alex: injects calendar snapshot for scheduling context
    'goodbye',
    'rag',
    'tasks',
  ],

  // EXTERNAL - External data sources
  [BuilderCategory.EXTERNAL]: [
    'biometrics',
    'career-awareness', // Career sentiment tracking over time
    'device-awareness', // Mobile/desktop context, headphones, motion
    'linkedin-awareness', // LinkedIn career milestones and professional context
    'financial-prediction',
    'anticipation',
    'social-relationships',
    'world-awareness',
    'macos-context', // macOS menubar app desktop context
    'personal-journey',
  ],

  // HUMANIZING - Make responses natural + Better Than Human features
  // NOTE: unified-humanizing consolidates the legacy humanizing builders into one orchestrator.
  // Legacy builders are DISABLED as context builders to avoid duplicate injections.
  // The files are kept because turn-processor.ts imports specific functions from them directly.
  [BuilderCategory.HUMANIZING]: [
    // RELATIONSHIP ARC SYSTEM (Complete relationship development - Dec 2024)
    // Full stranger→trusted_advisor journey with Firestore persistence
    'first-meeting-magic', // Stage: Stranger (turns 0-3) - energy matching, vulnerability, noticing
    'acquaintance-deepening', // Stage: Acquaintance (sessions 2-5) - callbacks, trust, patterns
    'friendship-flowering', // Stage: Friend (sessions 6-15) - inside jokes, growth reflection
    'trusted-advisor', // Stage: Trusted Advisor (15+) - life arc, values accountability
    // REVELATION SYSTEM (Ensures capabilities feel human, not tracked)
    'revelation-awareness', // Anti-surveillance, throttling, permission prompts
    'dynamic-speech-guidance', // LLM behavioral guidance (replaces static phrase pools)
    'unified-humanizing', // Single consolidated humanization orchestrator
    // 'humanizing',           // DISABLED: Consolidated into unified-humanizing
    // 'deep-humanization',    // DISABLED: Consolidated into unified-humanizing
    // 'conversation-humanizing', // DISABLED: Consolidated into unified-humanizing
    // 'natural-uncertainty',  // DISABLED: Consolidated into unified-humanizing
    // 'response-length',      // DISABLED: Consolidated into unified-humanizing
    // 'energy-mirroring',     // DISABLED: Consolidated into unified-humanizing
    // 'energy-awareness',     // DISABLED: Consolidated into unified-humanizing
    'tool-humanization', // Natural tool usage framing (NOT consolidated)
    'conversational-imperfections', // Mid-sentence corrections, word-finding, thought pivots (Dec 2024)
    // BETTER THAN HUMAN (Dec 2024) - These are NEW features, not part of unified-humanizing
    'proactive-noticing', // "I notice..." pattern surfacing
    'commitment-follow-up', // Accountability tracking
    'temporal-intelligence', // Time patterns, important dates
    'deep-relationship', // Shared vocabulary, milestones, inside jokes
  ],

  // LEARNING - Collective intelligence
  [BuilderCategory.LEARNING]: ['community-learning', 'wisdom-synthesis'],
};

// ============================================================================
// LOADING STATE
// ============================================================================

let buildersLoaded = false;
let loadingPromise: Promise<void> | null = null;

export interface BuilderLoadReport {
  loaded: number;
  failed: string[];
  skipped: string[];
  durationMs: number;
  loadedAt: number;
}

let lastLoadReport: BuilderLoadReport | null = null;

// ============================================================================
// LOADER FUNCTIONS
// ============================================================================

/**
 * Get all builder module names from the manifest
 */
export function getAllBuilderModules(): string[] {
  return Object.values(BUILDER_MANIFEST).flat();
}

/**
 * Get builder modules by category
 */
export function getBuilderModulesByCategory(category: BuilderCategory): string[] {
  return BUILDER_MANIFEST[category] || [];
}

/**
 * Load a single builder module
 */
async function loadBuilderModule(moduleName: string): Promise<boolean> {
  const importer = BUILDER_IMPORTS[moduleName];
  if (!importer) {
    log.warn(
      { module: moduleName },
      'Failed to load builder module (missing from import registry)'
    );
    return false;
  }

  try {
    await importer();
    return true;
  } catch (error) {
    log.warn({ module: moduleName, error }, 'Failed to load builder module');
    return false;
  }
}

/**
 * Load all builders by category (respects priority order)
 *
 * Now supports conditional loading - categories can be skipped based on
 * feature flags and runtime configuration for faster startup.
 */
async function loadBuildersByCategory(): Promise<{
  loaded: number;
  failed: string[];
  skipped: string[];
}> {
  const failed: string[] = [];
  const skipped: string[] = [];
  let loaded = 0;

  // Load in category order (safety first, learning last)
  const categoryOrder: BuilderCategory[] = [
    BuilderCategory.SAFETY,
    BuilderCategory.EMOTIONAL,
    BuilderCategory.VOICE,
    BuilderCategory.MEMORY,
    BuilderCategory.PERSONA,
    BuilderCategory.COACHING,
    BuilderCategory.COGNITIVE,
    BuilderCategory.ENGAGEMENT,
    BuilderCategory.TEAM,
    BuilderCategory.CONTEXT,
    BuilderCategory.EXTERNAL,
    BuilderCategory.HUMANIZING,
    BuilderCategory.LEARNING,
  ];

  for (const category of categoryOrder) {
    // EARLY EXIT: Skip category if conditions not met
    if (!shouldLoadCategory(category)) {
      const modules = BUILDER_MANIFEST[category];
      if (modules) {
        skipped.push(...modules);
        log.debug({ category, count: modules.length }, '⏭️ Skipped builder category (conditional)');
      }
      continue;
    }

    const modules = BUILDER_MANIFEST[category];
    if (!modules || modules.length === 0) continue;

    // Load all modules in this category in parallel
    const results = await Promise.allSettled(modules.map(async (m) => loadBuilderModule(m)));

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        loaded++;
      } else {
        failed.push(modules[index]);
      }
    });

    log.debug({ category, count: modules.length }, 'Loaded builder category');
  }

  return { loaded, failed, skipped };
}

/**
 * Internal loading implementation (extracted for mutex pattern)
 */
async function loadBuildersInternal(): Promise<void> {
  const start = Date.now();

  const { loaded, failed, skipped } = await loadBuildersByCategory();

  buildersLoaded = true;
  const duration = Date.now() - start;

  lastLoadReport = {
    loaded,
    failed,
    skipped,
    durationMs: duration,
    loadedAt: Date.now(),
  };

  if (failed.length > 0) {
    log.warn(
      { loaded, failed, skipped: skipped.length, durationMs: duration },
      'Some context builders failed to load'
    );
  } else if (skipped.length > 0) {
    log.info(
      { loaded, skipped: skipped.length, durationMs: duration },
      '✅ Context builders loaded (some skipped)'
    );
  } else {
    log.info({ loaded, durationMs: duration }, '✅ All context builders loaded');
  }
}

/**
 * Ensure all builders are loaded (idempotent)
 *
 * This is the main entry point for lazy loading.
 * Call this before buildConversationContext().
 *
 * NOTE: Uses mutex pattern to prevent race conditions - loadingPromise is set
 * SYNCHRONOUSLY before any await to prevent TOCTOU bugs where multiple callers
 * could both see loadingPromise as null and start concurrent loads.
 */
export async function ensureBuildersLoaded(): Promise<void> {
  // Already loaded - fast path
  if (buildersLoaded) return;

  // Loading in progress - wait for existing load
  if (loadingPromise) {
    await loadingPromise;
    return;
  }

  // CRITICAL: Set loadingPromise SYNCHRONOUSLY before any await
  // This prevents TOCTOU race where multiple callers see loadingPromise as null
  loadingPromise = loadBuildersInternal();

  await loadingPromise;
}

/**
 * Get the last builder load report (useful for testing and observability).
 */
export function getLastLoadReport(): BuilderLoadReport | null {
  return lastLoadReport;
}

/**
 * Force reload all builders (for testing)
 */
export async function reloadBuilders(): Promise<void> {
  buildersLoaded = false;
  loadingPromise = null;
  lastLoadReport = null;
  await ensureBuildersLoaded();
}

/**
 * Check if builders are loaded
 */
export function areBuildersLoaded(): boolean {
  return buildersLoaded;
}

/**
 * Get loading status
 */
export function getLoadingStatus(): {
  loaded: boolean;
  loading: boolean;
  totalModules: number;
} {
  return {
    loaded: buildersLoaded,
    loading: loadingPromise !== null && !buildersLoaded,
    totalModules: getAllBuilderModules().length,
  };
}

// ============================================================================
// PRE-WARMING (SESSION START OPTIMIZATION)
// ============================================================================

/**
 * Pre-warm context builders in background at session start.
 * Fire-and-forget - doesn't block session startup.
 *
 * Call this early in session initialization to ensure builders
 * are loaded before the first conversation turn.
 *
 * @example
 * // In session initialization
 * prewarmBuildersInBackground(); // Non-blocking
 */
export function prewarmBuildersInBackground(): void {
  if (!isFeatureEnabled('contextBuilderPrewarm')) {
    log.debug('Context builder pre-warm disabled by feature flag');
    return;
  }

  // Already loaded, nothing to do
  if (buildersLoaded) {
    log.debug('Context builders already loaded, skipping pre-warm');
    return;
  }

  // Fire-and-forget - don't await
  log.info('🔥 Pre-warming context builders in background');
  ensureBuildersLoaded().catch((error) => {
    log.warn({ error: String(error) }, 'Context builder pre-warm failed');
  });
}

/**
 * Pre-warm with conditional loading config.
 * Allows session-specific optimization based on session context.
 *
 * @param config - Conditional loading configuration
 */
export function prewarmBuildersWithConfig(config: Partial<ConditionalLoadingConfig>): void {
  if (!isFeatureEnabled('contextBuilderPrewarm')) {
    log.debug('Context builder pre-warm disabled by feature flag');
    return;
  }

  // Configure conditional loading
  configureConditionalLoading(config);

  // Trigger pre-warm
  prewarmBuildersInBackground();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  ensureBuildersLoaded,
  reloadBuilders,
  areBuildersLoaded,
  getLoadingStatus,
  getAllBuilderModules,
  getBuilderModulesByCategory,
  configureConditionalLoading,
  prewarmBuildersInBackground,
  prewarmBuildersWithConfig,
  BUILDER_MANIFEST,
};
