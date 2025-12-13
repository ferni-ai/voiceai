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

import { createLogger } from '../../utils/safe-logger.js';
import { BUILDER_IMPORTS } from './builder-imports.js';
import { BuilderCategory } from './categories.js';

const log = createLogger({ module: 'context-builder-loader' });

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
  [BuilderCategory.SAFETY]: ['crisis', 'wellbeing-context'],

  // EMOTIONAL - Core emotion handling
  [BuilderCategory.EMOTIONAL]: [
    'emotional',
    'celebration',
    'celebration-growth',
    'somatic-context',
  ],

  // VOICE - Voice emotion analysis
  [BuilderCategory.VOICE]: [
    'voice-emotion',
    'advanced-voice-emotion',
    'voice-emotion-intelligence',
    'human-listening',
  ],

  // MEMORY - Cross-session persistence
  [BuilderCategory.MEMORY]: [
    'memory',
    'advanced-memory',
    'proactive-memory',
    'persona-memory',
    'human-memory', // Human-centric: dates, comfort patterns, growth, jokes
    'conversation-recap',
    'cross-session-reflection',
    'cross-session-threading',
  ],

  // PERSONA - Character and identity
  [BuilderCategory.PERSONA]: [
    'persona-identity',
    'persona-quirks',
    'persona-playful',
    'persona-vulnerability',
    'persona-mood',
    'human-personality', // Semantic matching, timing intelligence, callbacks
    'ferni-personality', // Ferni-specific: dynamic expressions, pushbacks, passions
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
  ],

  // COGNITIVE - Cognitive intelligence
  [BuilderCategory.COGNITIVE]: [
    'deep-understanding', // Unified deep intelligence: silence, rhythm, resistance, energy, goals, flow, repair, hope, chapters
    'awareness', // Momentum, thinking time, tangents, self-awareness (priority 55)
    'cognitive',
    'cognitive-quirks',
    'cognitive-distortions',
    'cognitive-insights',
    'pattern-surfacing',
    'superhuman-insights',
  ],

  // ENGAGEMENT - User engagement
  [BuilderCategory.ENGAGEMENT]: [
    'engagement',
    'engagement-context',
    'game-context',
    'storytelling',
    'music',
    'music-emotion-offers',
  ],

  // TEAM - Multi-persona coordination
  [BuilderCategory.TEAM]: [
    'team-availability',
    'team-dynamics',
    'handoff',
    'role-boundaries',
    'cameo-opportunities',
  ],

  // CONTEXT - Situational awareness
  [BuilderCategory.CONTEXT]: [
    'dynamic-tool-guidance', // High priority - injects tool hints based on user request
    'intent',
    'topics',
    'discovery',
    'personal',
    'pacing',
    'meta-conversation',
    'situational-awareness',
    'trust-context',
    'relationship-behaviors',
    'session-flow',
    'goodbye',
    'rag',
    'tasks',
  ],

  // EXTERNAL - External data sources
  [BuilderCategory.EXTERNAL]: [
    'biometrics',
    'financial-prediction',
    'anticipation',
    'social-relationships',
    'world-awareness',
    'personal-journey',
  ],

  // HUMANIZING - Make responses natural
  [BuilderCategory.HUMANIZING]: [
    'humanizing',
    'deep-humanization',
    'conversation-humanizing',
    'natural-uncertainty',
    'response-length',
    'energy-mirroring',
    'energy-awareness',
    'tool-humanization', // Natural tool usage framing
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
 */
async function loadBuildersByCategory(): Promise<{
  loaded: number;
  failed: string[];
}> {
  const failed: string[] = [];
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
    const modules = BUILDER_MANIFEST[category];
    if (!modules || modules.length === 0) continue;

    // Load all modules in this category in parallel
    const results = await Promise.allSettled(modules.map((m) => loadBuilderModule(m)));

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        loaded++;
      } else {
        failed.push(modules[index]);
      }
    });

    log.debug({ category, count: modules.length }, 'Loaded builder category');
  }

  return { loaded, failed };
}

/**
 * Ensure all builders are loaded (idempotent)
 *
 * This is the main entry point for lazy loading.
 * Call this before buildConversationContext().
 */
export async function ensureBuildersLoaded(): Promise<void> {
  // Already loaded
  if (buildersLoaded) return;

  // Loading in progress - wait for it
  if (loadingPromise) {
    await loadingPromise;
    return;
  }

  // Start loading
  loadingPromise = (async () => {
    const start = Date.now();

    const { loaded, failed } = await loadBuildersByCategory();

    buildersLoaded = true;
    const duration = Date.now() - start;

    lastLoadReport = {
      loaded,
      failed,
      durationMs: duration,
      loadedAt: Date.now(),
    };

    if (failed.length > 0) {
      log.warn({ loaded, failed, durationMs: duration }, 'Some context builders failed to load');
    } else {
      log.info({ loaded, durationMs: duration }, 'All context builders loaded');
    }
  })();

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
// EXPORTS
// ============================================================================

export default {
  ensureBuildersLoaded,
  reloadBuilders,
  areBuildersLoaded,
  getLoadingStatus,
  getAllBuilderModules,
  getBuilderModulesByCategory,
  BUILDER_MANIFEST,
};
