/**
 * Persona Bundle Loader
 *
 * Loads persona bundles from the filesystem, supporting:
 * - Lazy loading of content (stories, knowledge)
 * - Hot reload during development
 * - Caching for performance
 * - Environment variable substitution in manifests
 */

import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { getLogger } from '../../utils/safe-logger.js';

import type {
  BundleBehaviors,
  BundleConflictHandling,
  BundleContextualNuances,
  BundleKnowledge,
  BundleLoadOptions,
  BundleMemoryPatterns,
  BundleMicroExpressions,
  BundlePersonaModes,
  BundlePromptAssembly,
  BundleRelationshipStages,
  BundleSituationalResponses,
  BundleStory,
  BundleStoryGraph,
  BundleVoiceExpressions,
  KnowledgeIndex,
  LoadedPersonaBundle,
  PersonaBundleManifest,
  StoryIndex,
} from './types.js';

// ============================================================================
// BUNDLE CACHE
// ============================================================================

/**
 * Global bundle cache for static persona content.
 * FIX BUG #bundle-2 & #bundle-3: Added cache metadata for invalidation.
 *
 * NOTE: Bundle content (manifest, stories, knowledge) is read-only and safe to cache globally.
 * Session-specific state (relationship turns, stories told) should use SessionBundleRuntimeManager.
 */
interface BundleCacheEntry {
  bundle: LoadedPersonaBundle;
  loadedAt: number;
  lastAccessed: number;
}

const bundleCache = new Map<string, BundleCacheEntry>();

/** Cache TTL in milliseconds (default: 30 minutes for dev hot-reload support) */
const BUNDLE_CACHE_TTL_MS = process.env.NODE_ENV === 'development' ? 30 * 1000 : 30 * 60 * 1000;

/** Maximum cache size to prevent memory issues */
const MAX_BUNDLE_CACHE_SIZE = 20;

/**
 * Check if a cache entry is stale
 */
function isCacheEntryStale(entry: BundleCacheEntry): boolean {
  return Date.now() - entry.loadedAt > BUNDLE_CACHE_TTL_MS;
}

/**
 * Evict oldest cache entries if over limit
 */
function evictOldestEntries(): void {
  if (bundleCache.size <= MAX_BUNDLE_CACHE_SIZE) return;

  // Sort by lastAccessed, remove oldest
  const entries = Array.from(bundleCache.entries()).sort(
    ([, a], [, b]) => a.lastAccessed - b.lastAccessed
  );

  const toRemove = entries.slice(0, bundleCache.size - MAX_BUNDLE_CACHE_SIZE);
  for (const [path] of toRemove) {
    bundleCache.delete(path);
    getLogger().debug({ path }, 'Evicted stale bundle from cache');
  }
}

// ============================================================================
// ENVIRONMENT VARIABLE SUBSTITUTION
// ============================================================================

/**
 * Track which env vars have already been warned about to prevent log spam.
 * FIX BUG #bundle-14: Only warn once per env var
 */
const warnedEnvVars = new Set<string>();

/**
 * Replace ${env:VAR_NAME} or ${env:VAR_NAME|default} patterns with environment variable values
 *
 * Supports:
 *   ${env:MY_VAR}              - returns env var or empty string
 *   ${env:MY_VAR|default}      - returns env var or default value
 *
 * FIX BUG #bundle-14: Only log warning once per missing env var
 */
function substituteEnvVars(value: string): string {
  // Pattern: ${env:VAR_NAME} or ${env:VAR_NAME|default_value}
  return value.replace(/\$\{env:(\w+)(?:\|([^}]*))?\}/g, (_, varName, defaultValue) => {
    const envValue = process.env[varName];
    if (envValue) {
      return envValue;
    }
    if (defaultValue !== undefined) {
      // Use default value if provided
      return defaultValue;
    }
    // FIX BUG #bundle-14: Only warn once per env var to prevent log spam
    if (!warnedEnvVars.has(varName)) {
      warnedEnvVars.add(varName);
      getLogger().warn(
        { varName },
        `Environment variable ${varName} not found and no default provided`
      );
    }
    return '';
  });
}

/**
 * Recursively substitute env vars in an object
 */
function substituteEnvVarsDeep<T>(obj: T): T {
  if (typeof obj === 'string') {
    return substituteEnvVars(obj) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => substituteEnvVarsDeep(item)) as T;
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteEnvVarsDeep(value);
    }
    return result as T;
  }
  return obj;
}

// ============================================================================
// FILE LOADING HELPERS
// ============================================================================

async function loadJsonFile<T>(path: string): Promise<T> {
  const content = await readFile(path, 'utf-8');
  return JSON.parse(content) as T;
}

async function loadMarkdownFile(path: string): Promise<string> {
  return readFile(path, 'utf-8');
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// BUNDLE LOADER
// ============================================================================

/**
 * Load a persona bundle from a directory
 */
export async function loadBundle(
  bundlePath: string,
  options: BundleLoadOptions = {}
): Promise<LoadedPersonaBundle> {
  const { preloadContent = false, cacheStories = true, forceReload = false } = options;

  // FIX BUG #bundle-2 & #bundle-3: Check cache with staleness validation
  const cached = bundleCache.get(bundlePath);
  if (cached && !forceReload && !isCacheEntryStale(cached)) {
    cached.lastAccessed = Date.now();
    return cached.bundle;
  }

  // Remove stale entry if exists
  if (cached) {
    bundleCache.delete(bundlePath);
    getLogger().debug({ bundlePath }, 'Removed stale bundle from cache');
  }

  // Load manifest
  const manifestPath = join(bundlePath, 'persona.manifest.json');
  if (!(await fileExists(manifestPath))) {
    throw new Error(`Bundle manifest not found: ${manifestPath}`);
  }

  const rawManifest = await loadJsonFile<PersonaBundleManifest>(manifestPath);
  const manifest = substituteEnvVarsDeep(rawManifest);

  // Create content caches
  const storyCache = new Map<string, BundleStory>();
  const knowledgeCache = new Map<string, BundleKnowledge>();
  let behaviorsCache: BundleBehaviors | null = null;
  let storyIndex: StoryIndex | null = null;
  let knowledgeIndex: KnowledgeIndex | null = null;

  // Extended content caches
  let voiceExpressionsCache: BundleVoiceExpressions | null = null;
  let situationalResponsesCache: BundleSituationalResponses | null = null;
  let relationshipStagesCache: BundleRelationshipStages | null = null;
  let memoryPatternsCache: BundleMemoryPatterns | null = null;
  let personaModesCache: BundlePersonaModes | null = null;
  let storyGraphCache: BundleStoryGraph | null = null;
  let microExpressionsCache: BundleMicroExpressions | null = null;
  let contextualNuancesCache: BundleContextualNuances | null = null;
  let conflictHandlingCache: BundleConflictHandling | null = null;
  let promptAssemblyCache: BundlePromptAssembly | null = null;

  // Reload callbacks
  const reloadCallbacks = new Set<() => void>();

  // Load story index if exists
  async function loadStoryIndex(): Promise<StoryIndex | null> {
    if (storyIndex) return storyIndex;

    const storiesDir = manifest.content.stories?.directory;
    if (!storiesDir) return null;

    const indexPath = join(bundlePath, storiesDir, '_index.json');
    if (await fileExists(indexPath)) {
      storyIndex = await loadJsonFile<StoryIndex>(indexPath);
      return storyIndex;
    }

    return null;
  }

  // Load knowledge index if exists
  async function loadKnowledgeIndex(): Promise<KnowledgeIndex | null> {
    if (knowledgeIndex) return knowledgeIndex;

    const knowledgeDir = manifest.content.knowledge?.directory;
    if (!knowledgeDir) return null;

    const indexPath = join(bundlePath, knowledgeDir, '_index.json');
    if (await fileExists(indexPath)) {
      knowledgeIndex = await loadJsonFile<KnowledgeIndex>(indexPath);
      return knowledgeIndex;
    }

    return null;
  }

  // Create loaded bundle
  const bundle: LoadedPersonaBundle = {
    manifest,
    bundlePath,
    loadedAt: new Date(),

    async getStory(id: string): Promise<BundleStory | null> {
      // Check cache
      if (storyCache.has(id)) {
        return storyCache.get(id)!;
      }

      // Load from index
      const index = await loadStoryIndex();
      if (!index) return null;

      const ref = index.stories.find((s) => s.id === id);
      if (!ref) return null;

      const storiesDir = manifest.content.stories?.directory;
      if (!storiesDir) return null;

      const storyPath = join(bundlePath, storiesDir, ref.file);
      if (!(await fileExists(storyPath))) return null;

      let story: BundleStory;
      if (ref.file.endsWith('.json')) {
        story = await loadJsonFile<BundleStory>(storyPath);
      } else {
        // Markdown file - wrap in story object
        const content = await loadMarkdownFile(storyPath);
        story = {
          id,
          content,
          triggers: ref.triggers,
          category: ref.category as BundleStory['category'],
        };
      }

      if (cacheStories) {
        storyCache.set(id, story);
      }

      return story;
    },

    /**
     * Get stories matching a trigger phrase
     * FIX BUG #bundle-19: Consistent case-insensitive matching
     * Matches if either:
     * 1. The user's input contains a story trigger keyword
     * 2. A story trigger keyword contains the user's search term
     * This bidirectional matching handles both "I lost my job" and "job loss"
     */
    async getStoriesByTrigger(trigger: string): Promise<BundleStory[]> {
      const index = await loadStoryIndex();
      if (!index) return [];

      // FIX BUG #bundle-19: Normalize input consistently
      const normalizedTrigger = trigger.toLowerCase().trim();
      if (!normalizedTrigger) return [];

      const matching = index.stories.filter((s) =>
        s.triggers.some((t) => {
          const normalizedStoryTrigger = t.toLowerCase().trim();
          // Bidirectional matching for flexibility
          return (
            normalizedTrigger.includes(normalizedStoryTrigger) ||
            normalizedStoryTrigger.includes(normalizedTrigger)
          );
        })
      );

      const stories: BundleStory[] = [];
      for (const ref of matching) {
        const story = await this.getStory(ref.id);
        if (story) stories.push(story);
      }

      return stories;
    },

    async getAllStories(): Promise<BundleStory[]> {
      const index = await loadStoryIndex();
      if (!index) return [];

      const stories: BundleStory[] = [];
      for (const ref of index.stories) {
        const story = await this.getStory(ref.id);
        if (story) stories.push(story);
      }

      return stories;
    },

    async getKnowledge(topic: string): Promise<BundleKnowledge | null> {
      // Check cache
      if (knowledgeCache.has(topic)) {
        return knowledgeCache.get(topic)!;
      }

      const index = await loadKnowledgeIndex();
      if (!index) return null;

      const ref = index.topics.find((t) => t.topic.toLowerCase() === topic.toLowerCase());
      if (!ref) return null;

      const knowledgeDir = manifest.content.knowledge?.directory;
      if (!knowledgeDir) return null;

      const knowledgePath = join(bundlePath, knowledgeDir, ref.file);
      if (!(await fileExists(knowledgePath))) return null;

      let knowledge: BundleKnowledge;
      if (ref.file.endsWith('.json')) {
        knowledge = await loadJsonFile<BundleKnowledge>(knowledgePath);
      } else {
        const content = await loadMarkdownFile(knowledgePath);
        knowledge = {
          id: ref.id,
          topic: ref.topic,
          content,
          domains: ref.domains,
        };
      }

      knowledgeCache.set(topic, knowledge);
      return knowledge;
    },

    async getBehaviors(): Promise<BundleBehaviors> {
      if (behaviorsCache) return behaviorsCache;

      const behaviorsDir = manifest.content.behaviors?.directory;
      if (!behaviorsDir) {
        behaviorsCache = {};
        return behaviorsCache;
      }

      const behaviorsPath = join(bundlePath, behaviorsDir);
      const behaviors: BundleBehaviors = {};

      // Load individual behavior files
      const catchphrasesPath = join(behaviorsPath, 'catchphrases.json');
      if (await fileExists(catchphrasesPath)) {
        behaviors.catchphrases = await loadJsonFile<string[]>(catchphrasesPath);
      }

      const petPeevesPath = join(behaviorsPath, 'pet-peeves.json');
      if (await fileExists(petPeevesPath)) {
        behaviors.pet_peeves = await loadJsonFile<BundleBehaviors['pet_peeves']>(petPeevesPath);
      }

      const wittyRemarksPath = join(behaviorsPath, 'witty-remarks.json');
      if (await fileExists(wittyRemarksPath)) {
        behaviors.witty_remarks = await loadJsonFile<string[]>(wittyRemarksPath);
      }

      const greetingsPath = join(behaviorsPath, 'greetings.json');
      if (await fileExists(greetingsPath)) {
        behaviors.greetings = await loadJsonFile<BundleBehaviors['greetings']>(greetingsPath);
      }

      const backchannelsPath = join(behaviorsPath, 'backchannels.json');
      if (await fileExists(backchannelsPath)) {
        behaviors.backchannels =
          await loadJsonFile<BundleBehaviors['backchannels']>(backchannelsPath);
      }

      // Load thinking sounds (supports both array and structured format)
      const thinkingSoundsPath = join(behaviorsPath, 'thinking-sounds.json');
      if (await fileExists(thinkingSoundsPath)) {
        const data = await loadJsonFile<BundleBehaviors['thinking_sounds']>(thinkingSoundsPath);
        // Support both legacy array format and new structured format
        if (Array.isArray(data)) {
          behaviors.thinking_sounds = data;
        } else if (data && typeof data === 'object') {
          // New structured format with thinking, processing, transition, etc.
          behaviors.thinking_sounds = data;
        }
      }

      // Load silence fillers
      const silenceFillersPath = join(behaviorsPath, 'silence-fillers.json');
      if (await fileExists(silenceFillersPath)) {
        behaviors.silence_fillers =
          await loadJsonFile<BundleBehaviors['silence_fillers']>(silenceFillersPath);
      }

      // Load theatrical entrances for handoff transitions (supports v1 and v2 schemas)
      const entrancesPath = join(behaviorsPath, 'entrances.json');
      if (await fileExists(entrancesPath)) {
        const entrancesData = await loadJsonFile<
          | { entrances: string[] } // v1 format
          | { schema_version: 2; static_fallback: string[]; contextual?: Record<string, string[]> } // v2 format
        >(entrancesPath);

        // Check for v2 schema
        if ('schema_version' in entrancesData && entrancesData.schema_version === 2) {
          // V2: Store the full structured object
          behaviors.entrances = entrancesData as BundleBehaviors['entrances'];
          getLogger().debug({ bundlePath }, 'Loaded v2 entrances schema');
        } else if ('entrances' in entrancesData && Array.isArray(entrancesData.entrances)) {
          // V1: Simple string array
          behaviors.entrances = entrancesData.entrances;
        }
      }

      // Load celebrations for milestone moments
      const celebrationsPath = join(behaviorsPath, 'celebrations.json');
      if (await fileExists(celebrationsPath)) {
        behaviors.celebrations =
          await loadJsonFile<BundleBehaviors['celebrations']>(celebrationsPath);
      }

      // Load theatrical goodbyes (supports both array and structured format)
      const goodbyesPath = join(behaviorsPath, 'goodbyes.json');
      if (await fileExists(goodbyesPath)) {
        const goodbyesData = await loadJsonFile<BundleBehaviors['goodbyes']>(goodbyesPath);
        // Support both legacy { goodbyes: string[] } and new structured format
        if (goodbyesData && typeof goodbyesData === 'object' && 'goodbyes' in goodbyesData) {
          behaviors.goodbyes = (goodbyesData as { goodbyes: string[] }).goodbyes;
        } else {
          behaviors.goodbyes = goodbyesData;
        }
      }

      // Load storytelling config
      const storytellingPath = join(behaviorsPath, 'storytelling.json');
      if (await fileExists(storytellingPath)) {
        behaviors.storytelling =
          await loadJsonFile<BundleBehaviors['storytelling']>(storytellingPath);
      }

      // ========================================================================
      // HUMANIZING BEHAVIORS - Deep personality content
      // ========================================================================

      // Load vulnerability (admitting uncertainty, coaching honesty)
      const vulnerabilityPath = join(behaviorsPath, 'vulnerability.json');
      if (await fileExists(vulnerabilityPath)) {
        behaviors.vulnerability =
          await loadJsonFile<BundleBehaviors['vulnerability']>(vulnerabilityPath);
      }

      // Load cultural moments (identity, family, heritage)
      const culturalMomentsPath = join(behaviorsPath, 'cultural-moments.json');
      if (await fileExists(culturalMomentsPath)) {
        behaviors.cultural_moments =
          await loadJsonFile<BundleBehaviors['cultural_moments']>(culturalMomentsPath);
      }

      // Load micro moments (small thoughtful touches)
      const microMomentsPath = join(behaviorsPath, 'micro-moments.json');
      if (await fileExists(microMomentsPath)) {
        behaviors.micro_moments =
          await loadJsonFile<BundleBehaviors['micro_moments']>(microMomentsPath);
      }

      // Load off-duty personality
      const offDutyPath = join(behaviorsPath, 'off-duty-alex.json');
      if (await fileExists(offDutyPath)) {
        behaviors.off_duty = await loadJsonFile<BundleBehaviors['off_duty']>(offDutyPath);
      }

      // Load sensory moments (embodied presence)
      const sensoryMomentsPath = join(behaviorsPath, 'sensory-moments.json');
      if (await fileExists(sensoryMomentsPath)) {
        behaviors.sensory_moments =
          await loadJsonFile<BundleBehaviors['sensory_moments']>(sensoryMomentsPath);
      }

      // Load conflict handling
      const conflictHandlingPath = join(behaviorsPath, 'conflict-handling.json');
      if (await fileExists(conflictHandlingPath)) {
        behaviors.conflict_handling =
          await loadJsonFile<BundleBehaviors['conflict_handling']>(conflictHandlingPath);
      }

      // Load relationship transitions
      const relationshipTransitionsPath = join(behaviorsPath, 'relationship-transitions.json');
      if (await fileExists(relationshipTransitionsPath)) {
        behaviors.relationship_transitions = await loadJsonFile<
          BundleBehaviors['relationship_transitions']
        >(relationshipTransitionsPath);
      }

      // ========================================================================
      // 🚀 FERNI 200% - Advanced behavior content
      // ========================================================================

      // Load emotional intelligence (emotion detection & response patterns)
      const emotionalIntelligencePath = join(behaviorsPath, 'emotional-intelligence.json');
      if (await fileExists(emotionalIntelligencePath)) {
        behaviors.emotional_intelligence =
          await loadJsonFile<BundleBehaviors['emotional_intelligence']>(emotionalIntelligencePath);
      }

      // Load physical presence (time-of-day awareness)
      const physicalPresencePath = join(behaviorsPath, 'physical-presence.json');
      if (await fileExists(physicalPresencePath)) {
        behaviors.physical_presence =
          await loadJsonFile<BundleBehaviors['physical_presence']>(physicalPresencePath);
      }

      // Load late-night presence (2am superpower)
      const lateNightPresencePath = join(behaviorsPath, 'late-night-presence.json');
      if (await fileExists(lateNightPresencePath)) {
        behaviors.late_night_presence =
          await loadJsonFile<BundleBehaviors['late_night_presence']>(lateNightPresencePath);
      }

      // Load superhuman insights (patterns, mirror, emotional weather)
      const superhumanInsightsPath = join(behaviorsPath, 'superhuman-insights.json');
      if (await fileExists(superhumanInsightsPath)) {
        behaviors.superhuman_insights =
          await loadJsonFile<BundleBehaviors['superhuman_insights']>(superhumanInsightsPath);
      }

      // Load trust phrases (Ferni-voiced trust system outputs)
      const trustPhrasesPath = join(behaviorsPath, 'trust-phrases.json');
      if (await fileExists(trustPhrasesPath)) {
        behaviors.trust_phrases =
          await loadJsonFile<BundleBehaviors['trust_phrases']>(trustPhrasesPath);
      }

      // Load I-notice power (pattern surfacing statements)
      const iNoticePowerPath = join(behaviorsPath, 'i-notice-power.json');
      if (await fileExists(iNoticePowerPath)) {
        behaviors.i_notice_power =
          await loadJsonFile<BundleBehaviors['i_notice_power']>(iNoticePowerPath);
      }

      // Load quirks (habits, guilty pleasures, opinions)
      const quirksPath = join(behaviorsPath, 'quirks.json');
      if (await fileExists(quirksPath)) {
        behaviors.quirks = await loadJsonFile<BundleBehaviors['quirks']>(quirksPath);
      }

      // Load thinking of you (proactive outreach phrases)
      const thinkingOfYouPath = join(behaviorsPath, 'thinking-of-you.json');
      if (await fileExists(thinkingOfYouPath)) {
        behaviors.thinking_of_you =
          await loadJsonFile<BundleBehaviors['thinking_of_you']>(thinkingOfYouPath);
      }

      // Load self-doubt (coaching vulnerability)
      const selfDoubtPath = join(behaviorsPath, 'self-doubt.json');
      if (await fileExists(selfDoubtPath)) {
        behaviors.self_doubt = await loadJsonFile<BundleBehaviors['self_doubt']>(selfDoubtPath);
      }

      // Load secret modes (hidden personality modes)
      const secretModesPath = join(behaviorsPath, 'secret-modes.json');
      if (await fileExists(secretModesPath)) {
        behaviors.secret_modes =
          await loadJsonFile<BundleBehaviors['secret_modes']>(secretModesPath);
      }

      // Load secret fears (deep personality)
      const secretFearsPath = join(behaviorsPath, 'secret-fears.json');
      if (await fileExists(secretFearsPath)) {
        behaviors.secret_fears =
          await loadJsonFile<BundleBehaviors['secret_fears']>(secretFearsPath);
      }

      // Load anticipation (anticipatory responses)
      const anticipationPath = join(behaviorsPath, 'anticipation.json');
      if (await fileExists(anticipationPath)) {
        behaviors.anticipation =
          await loadJsonFile<BundleBehaviors['anticipation']>(anticipationPath);
      }

      // Load mortality awareness (death/meaning content)
      const mortalityAwarenessPath = join(behaviorsPath, 'mortality-awareness.json');
      if (await fileExists(mortalityAwarenessPath)) {
        behaviors.mortality_awareness =
          await loadJsonFile<BundleBehaviors['mortality_awareness']>(mortalityAwarenessPath);
      }

      // ========================================================================
      // LOVABLE PRESENCE BEHAVIORS (Better Than Human charm system)
      // ========================================================================

      // Load lovable moments (caught mid-thought, self-deprecation, genuine excitement)
      const lovableMomentsPath = join(behaviorsPath, 'lovable-moments.json');
      if (await fileExists(lovableMomentsPath)) {
        behaviors.lovable_moments =
          await loadJsonFile<BundleBehaviors['lovable_moments']>(lovableMomentsPath);
      }

      // Load delightful surprises (tangents, oddly specific opinions, confessions)
      const delightfulSurprisesPath = join(behaviorsPath, 'delightful-surprises.json');
      if (await fileExists(delightfulSurprisesPath)) {
        behaviors.delightful_surprises =
          await loadJsonFile<BundleBehaviors['delightful_surprises']>(delightfulSurprisesPath);
      }

      // Load verbal personality (sentence starters, verbal tics, signature phrases)
      const verbalPersonalityPath = join(behaviorsPath, 'verbal-personality.json');
      if (await fileExists(verbalPersonalityPath)) {
        behaviors.verbal_personality =
          await loadJsonFile<BundleBehaviors['verbal_personality']>(verbalPersonalityPath);
      }

      // Load noticing patterns (voice changes, energy shifts, what they didn't say)
      const noticingPatternsPath = join(behaviorsPath, 'noticing-patterns.json');
      if (await fileExists(noticingPatternsPath)) {
        behaviors.noticing_patterns =
          await loadJsonFile<BundleBehaviors['noticing_patterns']>(noticingPatternsPath);
      }

      // Load live reactions (genuine surprise, delight, moved, frustration for them)
      const liveReactionsPath = join(behaviorsPath, 'live-reactions.json');
      if (await fileExists(liveReactionsPath)) {
        behaviors.live_reactions =
          await loadJsonFile<BundleBehaviors['live_reactions']>(liveReactionsPath);
      }

      behaviorsCache = behaviors;
      return behaviors;
    },

    // Extended content accessors
    async getVoiceExpressions(): Promise<BundleVoiceExpressions | null> {
      if (voiceExpressionsCache) return voiceExpressionsCache;

      const voicePath = join(bundlePath, 'content/voice/expressions.json');
      if (await fileExists(voicePath)) {
        voiceExpressionsCache = await loadJsonFile<BundleVoiceExpressions>(voicePath);
        return voiceExpressionsCache;
      }
      return null;
    },

    async getSituationalResponses(): Promise<BundleSituationalResponses | null> {
      if (situationalResponsesCache) return situationalResponsesCache;

      const responsesPath = join(bundlePath, 'content/behaviors/situational-responses.json');
      if (await fileExists(responsesPath)) {
        situationalResponsesCache = await loadJsonFile<BundleSituationalResponses>(responsesPath);
        return situationalResponsesCache;
      }
      return null;
    },

    async getRelationshipStages(): Promise<BundleRelationshipStages | null> {
      if (relationshipStagesCache) return relationshipStagesCache;

      const stagesPath = join(bundlePath, 'content/behaviors/relationship-stages.json');
      if (await fileExists(stagesPath)) {
        relationshipStagesCache = await loadJsonFile<BundleRelationshipStages>(stagesPath);
        return relationshipStagesCache;
      }
      return null;
    },

    async getMemoryPatterns(): Promise<BundleMemoryPatterns | null> {
      if (memoryPatternsCache) return memoryPatternsCache;

      const patternsPath = join(bundlePath, 'content/behaviors/memory-patterns.json');
      if (await fileExists(patternsPath)) {
        memoryPatternsCache = await loadJsonFile<BundleMemoryPatterns>(patternsPath);
        return memoryPatternsCache;
      }
      return null;
    },

    async getPersonaModes(): Promise<BundlePersonaModes | null> {
      if (personaModesCache) return personaModesCache;

      const modesPath = join(bundlePath, 'content/behaviors/persona-modes.json');
      if (await fileExists(modesPath)) {
        personaModesCache = await loadJsonFile<BundlePersonaModes>(modesPath);
        return personaModesCache;
      }
      return null;
    },

    async getStoryGraph(): Promise<BundleStoryGraph | null> {
      if (storyGraphCache) return storyGraphCache;

      const graphPath = join(bundlePath, 'content/stories/_story-graph.json');
      if (await fileExists(graphPath)) {
        storyGraphCache = await loadJsonFile<BundleStoryGraph>(graphPath);
        return storyGraphCache;
      }
      return null;
    },

    async getMicroExpressions(): Promise<BundleMicroExpressions | null> {
      if (microExpressionsCache) return microExpressionsCache;

      const microPath = join(bundlePath, 'content/voice/micro-expressions.json');
      if (await fileExists(microPath)) {
        microExpressionsCache = await loadJsonFile<BundleMicroExpressions>(microPath);
        return microExpressionsCache;
      }
      return null;
    },

    async getContextualNuances(): Promise<BundleContextualNuances | null> {
      if (contextualNuancesCache) return contextualNuancesCache;

      const nuancesPath = join(bundlePath, 'content/behaviors/contextual-nuances.json');
      if (await fileExists(nuancesPath)) {
        contextualNuancesCache = await loadJsonFile<BundleContextualNuances>(nuancesPath);
        return contextualNuancesCache;
      }
      return null;
    },

    async getConflictHandling(): Promise<BundleConflictHandling | null> {
      if (conflictHandlingCache) return conflictHandlingCache;

      const conflictPath = join(bundlePath, 'content/behaviors/conflict-handling.json');
      if (await fileExists(conflictPath)) {
        conflictHandlingCache = await loadJsonFile<BundleConflictHandling>(conflictPath);
        return conflictHandlingCache;
      }
      return null;
    },

    async getPromptAssembly(): Promise<BundlePromptAssembly | null> {
      if (promptAssemblyCache) return promptAssemblyCache;

      const assemblyPath = join(bundlePath, 'content/prompts/_assembly.json');
      if (await fileExists(assemblyPath)) {
        promptAssemblyCache = await loadJsonFile<BundlePromptAssembly>(assemblyPath);
        return promptAssemblyCache;
      }
      return null;
    },

    async reload(): Promise<void> {
      // Clear caches
      storyCache.clear();
      knowledgeCache.clear();
      behaviorsCache = null;
      storyIndex = null;
      knowledgeIndex = null;

      // Clear extended content caches
      voiceExpressionsCache = null;
      situationalResponsesCache = null;
      relationshipStagesCache = null;
      memoryPatternsCache = null;
      personaModesCache = null;
      storyGraphCache = null;
      microExpressionsCache = null;
      contextualNuancesCache = null;
      conflictHandlingCache = null;
      promptAssemblyCache = null;

      // Reload manifest
      const rawManifest = await loadJsonFile<PersonaBundleManifest>(manifestPath);
      Object.assign(manifest, substituteEnvVarsDeep(rawManifest));

      // Update timestamp
      this.loadedAt = new Date();

      // Notify listeners
      for (const callback of reloadCallbacks) {
        callback();
      }

      getLogger().info({ bundleId: manifest.identity.id }, 'Bundle reloaded');
    },

    onReload(callback: () => void): () => void {
      reloadCallbacks.add(callback);
      return () => reloadCallbacks.delete(callback);
    },
  };

  // Preload content if requested
  if (preloadContent) {
    await bundle.getAllStories();
    await bundle.getBehaviors();
    getLogger().info(
      { bundleId: manifest.identity.id, stories: storyCache.size },
      'Bundle preloaded'
    );
  }

  // FIX BUG #bundle-2 & #bundle-5: Cache bundle with metadata and enforce size limit
  const now = Date.now();
  bundleCache.set(bundlePath, {
    bundle,
    loadedAt: now,
    lastAccessed: now,
  });
  evictOldestEntries();

  getLogger().info({ bundleId: manifest.identity.id, path: bundlePath }, 'Bundle loaded');

  return bundle;
}

/**
 * Load a bundle by ID from standard search paths
 */
export async function loadBundleById(
  bundleId: string,
  options: BundleLoadOptions = {}
): Promise<LoadedPersonaBundle | null> {
  const searchPaths = getBundleSearchPaths();

  for (const basePath of searchPaths) {
    const bundlePath = join(basePath, bundleId);
    if (await fileExists(join(bundlePath, 'persona.manifest.json'))) {
      return loadBundle(bundlePath, options);
    }
  }

  getLogger().warn({ bundleId }, 'Bundle not found in any search path');
  return null;
}

/**
 * Get bundle search paths in priority order
 */
export function getBundleSearchPaths(): string[] {
  const paths: string[] = [];

  // 1. PERSONA_PATHS environment variable
  const envPaths = process.env.PERSONA_PATHS;
  if (envPaths) {
    paths.push(...envPaths.split(':').filter(Boolean));
  }

  // 2. Project-level bundles (src directory - where content files live)
  paths.push(join(process.cwd(), 'src/personas/bundles'));

  // 3. Also check dist/personas/bundles/ relative path (in case content is there)
  paths.push(join(process.cwd(), 'dist/personas/bundles'));

  // 4. User-level bundles
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home) {
    paths.push(join(home, '.voiceai/personas'));
  }

  return paths;
}

/**
 * Clear the bundle cache
 * FIX BUG #bundle-3: Add support for targeted cache invalidation
 */
export function clearBundleCache(bundleId?: string): void {
  if (bundleId) {
    for (const [path, entry] of bundleCache) {
      if (entry.bundle.manifest.identity.id === bundleId) {
        bundleCache.delete(path);
        getLogger().debug({ bundleId, path }, 'Cleared bundle from cache');
      }
    }
  } else {
    const count = bundleCache.size;
    bundleCache.clear();
    getLogger().debug({ count }, 'Cleared all bundles from cache');
  }
}

/**
 * Get all cached bundles
 */
export function getCachedBundles(): LoadedPersonaBundle[] {
  return Array.from(bundleCache.values()).map((entry) => entry.bundle);
}

/**
 * Get cache statistics for monitoring
 */
export function getBundleCacheStats(): {
  size: number;
  entries: Array<{ bundleId: string; loadedAt: Date; lastAccessed: Date }>;
} {
  return {
    size: bundleCache.size,
    entries: Array.from(bundleCache.values()).map((entry) => ({
      bundleId: entry.bundle.manifest.identity.id,
      loadedAt: new Date(entry.loadedAt),
      lastAccessed: new Date(entry.lastAccessed),
    })),
  };
}

export default {
  loadBundle,
  loadBundleById,
  getBundleSearchPaths,
  clearBundleCache,
  getCachedBundles,
  getBundleCacheStats,
};
