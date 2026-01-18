/**
 * Superhuman Integration for Context Builders
 *
 * Bridges the 10 superhuman services with persona context builders.
 * Each persona can selectively use superhuman capabilities relevant to their domain.
 *
 * SUPERHUMAN CAPABILITIES:
 * 1. Commitment Keeper - Tracks promises, intentions, decisions
 * 2. Predictive Coaching - Anticipates struggles from patterns
 * 3. Life Narrative - Builds coherent story of user's journey
 * 4. Values Alignment - Tracks stated vs demonstrated values
 * 5. Emotional First Aid - Crisis protocols and grounding
 * 6. Relationship Network - Maps user's relationship ecosystem
 * 7. Capacity Guardian - Monitors energy and burnout risk
 * 8. Dream Keeper - Guards long-term aspirations
 * 9. Relationship Milestones - Celebrates Ferni journey milestones
 * 10. Seasonal Awareness - Connects patterns to seasons/cycles
 *
 * @module intelligence/context-builders/superhuman-integration
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { SuperhumanCapabilities } from '../core/shared-types.js';
import { emitSuperhumanActivation } from '../../../api/observability-routes.js';

const log = createLogger({ module: 'context:superhuman-integration' });

// ============================================================================
// TYPES
// ============================================================================

export type PersonaSuperhuman = 'ferni' | 'peter' | 'maya' | 'jordan' | 'alex' | 'nayan';

interface SuperhumanSelectors {
  /** Which capabilities this persona should use */
  capabilities: (keyof SuperhumanCapabilities)[];
  /** Priority order (first = most important) */
  priorityOrder: (keyof SuperhumanCapabilities)[];
  /** Max tokens to inject (to avoid prompt bloat) */
  maxTokens: number;
}

// ============================================================================
// PERSONA CAPABILITY MAPPINGS
// ============================================================================

const PERSONA_SUPERHUMAN_MAP: Record<PersonaSuperhuman, SuperhumanSelectors> = {
  ferni: {
    // Ferni uses ALL capabilities as the coordinator
    capabilities: [
      'crisis',
      'commitments',
      'predictions',
      'narrative',
      'values',
      'capacity',
      'dreams',
      'network',
      'milestones',
      'seasonal',
      // BTH V1 capabilities - Ferni gets all of them
      'silence',
      'contradiction',
      'timing',
      'patterns',
      'futureSelf',
      // BTH V2 capabilities - Ferni gets all of them
      'voiceBiomarkers',
      'moodCalendar',
      'socialBattery',
      'conflictResolution',
      'protectiveSilence',
      'calendarPrep',
      'energyWave',
      'emotionalVocabulary',
      'recoveryTracking',
      'insideJokes',
    ],
    priorityOrder: [
      'crisis',
      'protectiveSilence',
      'recoveryTracking',
      'voiceBiomarkers',
      'silence',
      'contradiction',
      'socialBattery',
      'moodCalendar',
      'commitments',
      'capacity',
      'predictions',
      'milestones',
      'insideJokes',
    ],
    maxTokens: 1200, // Increased for V2 capabilities
  },
  peter: {
    // Peter focuses on patterns, predictions, and values (analytical)
    // + Pattern Mirror for research patterns, Mood Calendar for data patterns
    capabilities: [
      'predictions',
      'values',
      'commitments',
      'capacity',
      'seasonal',
      'patterns',
      // V2: Mood patterns, energy patterns for analytical insights
      'moodCalendar',
      'energyWave',
    ],
    priorityOrder: [
      'predictions',
      'patterns',
      'moodCalendar',
      'energyWave',
      'values',
      'commitments',
    ],
    maxTokens: 700,
  },
  maya: {
    // Maya focuses on habits, capacity, commitments, predictions
    // + Timing for habit timing, Patterns for habit patterns
    // + V2: Social battery (introvert/extrovert), mood calendar, recovery tracking
    capabilities: [
      'commitments',
      'predictions',
      'capacity',
      'seasonal',
      'values',
      'timing',
      'patterns',
      // V2: Social battery for energy management, mood for habit correlation
      'socialBattery',
      'moodCalendar',
      'recoveryTracking',
      'energyWave',
    ],
    priorityOrder: [
      'socialBattery',
      'recoveryTracking',
      'commitments',
      'timing',
      'capacity',
      'energyWave',
      'moodCalendar',
      'patterns',
      'predictions',
    ],
    maxTokens: 800,
  },
  jordan: {
    // Jordan focuses on dreams, milestones, narrative, seasonal
    // + Future Self for goal-setting, Timing for milestone planning
    // + V2: Calendar prep for event planning, energy wave for optimal scheduling
    capabilities: [
      'dreams',
      'milestones',
      'narrative',
      'seasonal',
      'commitments',
      'futureSelf',
      'timing',
      // V2: Calendar prep for proactive coaching, energy wave for timing
      'calendarPrep',
      'energyWave',
      'recoveryTracking',
    ],
    priorityOrder: [
      'calendarPrep',
      'dreams',
      'futureSelf',
      'milestones',
      'recoveryTracking',
      'timing',
      'energyWave',
      'seasonal',
    ],
    maxTokens: 800,
  },
  alex: {
    // Alex focuses on network, commitments, capacity
    // + Timing for communication timing
    // + V2: Conflict resolution for relationship management, social battery
    capabilities: [
      'network',
      'commitments',
      'capacity',
      'seasonal',
      'timing',
      // V2: Conflict resolution, social battery, protective silence
      'conflictResolution',
      'socialBattery',
      'protectiveSilence',
      'energyWave',
    ],
    priorityOrder: [
      'conflictResolution',
      'protectiveSilence',
      'network',
      'timing',
      'socialBattery',
      'commitments',
      'capacity',
    ],
    maxTokens: 700,
  },
  nayan: {
    // Nayan focuses on narrative, values, dreams, seasonal (wisdom)
    // + Silence for contemplative space, Contradiction for existential tensions, Future Self for legacy
    // + V2: Emotional vocabulary (deeper EQ), protective silence (boundaries), inside jokes (connection)
    capabilities: [
      'narrative',
      'values',
      'dreams',
      'seasonal',
      'milestones',
      'silence',
      'contradiction',
      'futureSelf',
      // V2: Emotional vocabulary for wisdom, protective silence for boundaries, inside jokes for depth
      'emotionalVocabulary',
      'protectiveSilence',
      'insideJokes',
      'recoveryTracking',
    ],
    priorityOrder: [
      'protectiveSilence',
      'silence',
      'contradiction',
      'emotionalVocabulary',
      'recoveryTracking',
      'narrative',
      'futureSelf',
      'values',
      'insideJokes',
      'dreams',
    ],
    maxTokens: 900,
  },
};

// ============================================================================
// TIERED CACHING SYSTEM
// ============================================================================

/**
 * Different capabilities have different staleness tolerances:
 * - Stable (5 min): seasonal, narrative, values - change slowly
 * - Normal (2 min): network, dreams, milestones - moderate change
 * - Fresh (30s): commitments, predictions, capacity - change frequently
 */
interface CachedSuperhuman {
  context: SuperhumanCapabilities;
  timestamp: number;
  userId: string;
}

interface TieredCache {
  stable: Map<string, { value: string; timestamp: number }>; // 5 min TTL
  normal: Map<string, { value: string; timestamp: number }>; // 2 min TTL
  fresh: Map<string, { value: string; timestamp: number }>; // 30s TTL
  full: Map<string, CachedSuperhuman>; // Full context cache
}

const tieredCache: TieredCache = {
  stable: new Map(),
  normal: new Map(),
  fresh: new Map(),
  full: new Map(),
};

const CACHE_TTL = {
  STABLE: 5 * 60 * 1000, // 5 minutes for seasonal, narrative, values
  NORMAL: 2 * 60 * 1000, // 2 minutes for network, dreams, milestones
  FRESH: 30 * 1000, // 30 seconds for commitments, predictions, capacity
  FULL: 60 * 1000, // 1 minute for complete context
} as const;

// Map capabilities to their cache tier
// Note: New BTH capabilities are optional (string | undefined) so we use Partial
const CAPABILITY_TIERS: Partial<
  Record<keyof SuperhumanCapabilities, keyof Omit<TieredCache, 'full'>>
> = {
  seasonal: 'stable',
  narrative: 'stable',
  values: 'stable',
  network: 'normal',
  dreams: 'normal',
  milestones: 'normal',
  commitments: 'fresh',
  predictions: 'fresh',
  capacity: 'fresh',
  crisis: 'fresh',
  // BTH V1 capabilities (Dec 2025)
  silence: 'fresh', // Real-time silence analysis
  contradiction: 'fresh', // Real-time emotion detection
  timing: 'normal', // Timing patterns change moderately
  patterns: 'normal', // Topic patterns change moderately
  futureSelf: 'stable', // Letters don't change often
  // BTH V2 capabilities (Dec 2025)
  voiceBiomarkers: 'fresh', // Real-time voice analysis
  moodCalendar: 'normal', // Mood patterns change moderately
  socialBattery: 'fresh', // Changes with each interaction
  conflictResolution: 'normal', // Historical patterns
  protectiveSilence: 'stable', // Boundaries change slowly
  calendarPrep: 'fresh', // Changes based on upcoming events
  energyWave: 'normal', // Energy patterns change moderately
  emotionalVocabulary: 'normal', // Vocabulary evolves moderately
  recoveryTracking: 'fresh', // Recovery state changes
  insideJokes: 'stable', // Shared history is stable
};

function getCacheKey(userId: string, capability?: string): string {
  return capability ? `superhuman:${userId}:${capability}` : `superhuman:${userId}`;
}

function getTieredValue(userId: string, capability: keyof SuperhumanCapabilities): string | null {
  const tier = CAPABILITY_TIERS[capability] ?? 'normal';
  const cacheMap = tieredCache[tier];
  const key = getCacheKey(userId, capability);
  const cached = cacheMap.get(key);

  if (!cached) return null;

  const ttl =
    tier === 'stable' ? CACHE_TTL.STABLE : tier === 'normal' ? CACHE_TTL.NORMAL : CACHE_TTL.FRESH;

  if (Date.now() - cached.timestamp < ttl) {
    return cached.value;
  }

  cacheMap.delete(key);
  return null;
}

function setTieredValue(
  userId: string,
  capability: keyof SuperhumanCapabilities,
  value: string
): void {
  const tier = CAPABILITY_TIERS[capability] ?? 'normal';
  const cacheMap = tieredCache[tier];
  const key = getCacheKey(userId, capability);
  cacheMap.set(key, { value, timestamp: Date.now() });
}

function getCachedContext(userId: string): SuperhumanCapabilities | null {
  const cached = tieredCache.full.get(getCacheKey(userId));
  if (cached && Date.now() - cached.timestamp < CACHE_TTL.FULL) {
    return cached.context;
  }
  return null;
}

function setCachedContext(userId: string, context: SuperhumanCapabilities): void {
  tieredCache.full.set(getCacheKey(userId), {
    context,
    timestamp: Date.now(),
    userId,
  });

  // Also populate tiered caches for individual capabilities
  for (const [key, value] of Object.entries(context) as [
    keyof SuperhumanCapabilities,
    string | null,
  ][]) {
    if (value && typeof value === 'string') {
      setTieredValue(userId, key, value);
    }
  }
}

/**
 * Get partially cached context - returns cached values where available
 * and null for values that need refresh
 */
function getPartialCachedContext(userId: string): Partial<SuperhumanCapabilities> {
  const partial: Partial<SuperhumanCapabilities> = {};

  for (const capability of Object.keys(CAPABILITY_TIERS) as (keyof SuperhumanCapabilities)[]) {
    const cached = getTieredValue(userId, capability);
    if (cached !== null) {
      partial[capability] = cached;
    }
  }

  return partial;
}

// ============================================================================
// MAIN INTEGRATION FUNCTION
// ============================================================================

/**
 * Get superhuman context for a specific persona.
 * Uses lazy loading to avoid importing heavy modules unless needed.
 * Includes performance tracking for monitoring.
 */
export async function getSuperhuman(
  userId: string,
  persona: PersonaSuperhuman,
  options?: {
    forceRefresh?: boolean;
    crisisSignal?: string;
    // V3 Semantic Intelligence - current conversation context
    currentTranscript?: string;
    currentTopics?: string[];
    currentEmotion?: string;
    currentMentionedPerson?: string;
  }
): Promise<string> {
  const startTime = Date.now();

  // Check cache first (skip if we have current context - need fresh semantic intelligence)
  const hasCurrentContext =
    options?.currentTranscript || options?.currentTopics || options?.currentEmotion;
  if (!options?.forceRefresh && !hasCurrentContext) {
    const cached = getCachedContext(userId);
    if (cached) {
      const duration = Date.now() - startTime;
      recordPerformance({
        builderName: 'getSuperhuman',
        durationMs: duration,
        userId,
        persona,
        timestamp: Date.now(),
        cacheHit: true,
      });

      // Emit observability event for cache hit
      const config = PERSONA_SUPERHUMAN_MAP[persona];
      emitSuperhumanActivation({
        userId,
        persona,
        capabilities: config?.capabilities || [],
        cacheHit: true,
        durationMs: duration,
      });

      log.debug(
        { persona, userId, cached: true, durationMs: duration },
        'Using cached superhuman context'
      );
      return formatForPersona(cached, persona);
    }
  }

  try {
    // Lazy import to avoid circular dependencies and reduce cold start
    const { buildSuperhumanContext } = await import('../../../services/superhuman/index.js');

    const context = await buildSuperhumanContext(userId, {
      crisisSignal: options?.crisisSignal
        ? { type: 'text', signal: options.crisisSignal }
        : undefined,
      // V3 Semantic Intelligence - pass current conversation context
      currentTranscript: options?.currentTranscript,
      currentTopics: options?.currentTopics,
      currentEmotion: options?.currentEmotion,
      currentMentionedPerson: options?.currentMentionedPerson,
    });

    // Cache the full context
    setCachedContext(userId, context);

    const duration = Date.now() - startTime;
    recordPerformance({
      builderName: 'getSuperhuman',
      durationMs: duration,
      userId,
      persona,
      timestamp: Date.now(),
      cacheHit: false,
    });

    // Emit observability event for fresh build
    const config = PERSONA_SUPERHUMAN_MAP[persona];
    emitSuperhumanActivation({
      userId,
      persona,
      capabilities: config?.capabilities || [],
      cacheHit: false,
      durationMs: duration,
    });

    log.debug({ persona, userId, durationMs: duration }, 'Built superhuman context');

    // Format for the specific persona
    return formatForPersona(context, persona);
  } catch (error) {
    const duration = Date.now() - startTime;
    recordPerformance({
      builderName: 'getSuperhuman',
      durationMs: duration,
      userId,
      persona,
      timestamp: Date.now(),
      cacheHit: false,
    });
    log.warn(
      { error, persona, userId, durationMs: duration },
      'Failed to build superhuman context'
    );
    return '';
  }
}

/**
 * Format superhuman context for a specific persona.
 * Filters to only relevant capabilities and respects token limits.
 */
function formatForPersona(context: SuperhumanCapabilities, persona: PersonaSuperhuman): string {
  const config = PERSONA_SUPERHUMAN_MAP[persona];
  if (!config) {
    return '';
  }

  const sections: string[] = [];
  let totalLength = 0;

  // Crisis always takes priority if present
  if (context.crisis && config.capabilities.includes('crisis')) {
    sections.push(context.crisis);
    totalLength += context.crisis.length;
  }

  // Add capabilities in priority order
  for (const capability of config.priorityOrder) {
    if (totalLength >= config.maxTokens) break;
    if (!config.capabilities.includes(capability)) continue;

    const content = context[capability];
    if (content && content.length > 0) {
      sections.push(content);
      totalLength += content.length;
    }
  }

  if (sections.length === 0) {
    return '';
  }

  return `[SUPERHUMAN INSIGHTS - ${persona.toUpperCase()}]\n${sections.join('\n\n')}`;
}

// ============================================================================
// PERSONA-SPECIFIC HELPERS
// ============================================================================

/**
 * Get commitment-related superhuman context (useful for Maya, Peter)
 */
export async function getCommitmentContext(userId: string): Promise<string> {
  try {
    const { buildCommitmentContext } =
      await import('../../../services/superhuman/commitment-keeper.js');
    return await buildCommitmentContext(userId);
  } catch {
    return '';
  }
}

/**
 * Get predictive coaching context (useful for Peter, Maya)
 *
 * This now integrates THREE systems:
 * 1. Predictive coaching (temporal/emotional patterns)
 * 2. Coaching patterns (linguistic patterns)
 * 3. Superhuman observations ("only I would notice" insights)
 */
export async function getPredictiveContext(userId: string, sessionId?: string): Promise<string> {
  const sections: string[] = [];

  try {
    // 1. Core predictive coaching context
    const { buildPredictiveContextString } =
      await import('../../../services/superhuman/predictive-coaching.js');
    const predictiveContext = await buildPredictiveContextString(userId);
    if (predictiveContext) {
      sections.push(predictiveContext);
    }
  } catch {
    // Non-fatal
  }

  try {
    // 2. Enhanced predictive intelligence context (if session available)
    if (sessionId) {
      const { getPredictiveContextForTurn } =
        await import('../../../agents/integrations/predictive-intelligence-integration.js');
      const intelligenceContext = await getPredictiveContextForTurn(userId, sessionId);
      if (intelligenceContext) {
        sections.push(intelligenceContext);
      }
    }
  } catch {
    // Non-fatal
  }

  try {
    // 3. Coaching patterns ready to surface
    const { getPatternsToSurface, generatePatternSurfacingQuestion } =
      await import('../../coaching-patterns.js');
    const patternsToSurface = await getPatternsToSurface(userId);
    if (patternsToSurface.length > 0) {
      sections.push('\n[COACHING PATTERNS READY TO SURFACE]');
      sections.push('These patterns have reached confidence threshold:');
      for (const pattern of patternsToSurface.slice(0, 2)) {
        const question = generatePatternSurfacingQuestion(pattern);
        sections.push(`• ${pattern.pattern} (seen ${pattern.occurrences}x)`);
        sections.push(`  → Ask: "${question}"`);
      }
    }
  } catch {
    // Non-fatal
  }

  return sections.join('\n');
}

/**
 * Get life narrative context (useful for Nayan, Jordan)
 */
export async function getNarrativeContext(userId: string): Promise<string> {
  try {
    const { buildNarrativeContextString } =
      await import('../../../services/superhuman/life-narrative.js');
    return await buildNarrativeContextString(userId);
  } catch {
    return '';
  }
}

/**
 * Get values alignment context (useful for Nayan, Peter)
 */
export async function getValuesContext(userId: string): Promise<string> {
  try {
    const { buildValuesContext } = await import('../../../services/superhuman/values-alignment.js');
    return await buildValuesContext(userId);
  } catch {
    return '';
  }
}

/**
 * Get capacity/burnout context (useful for Maya, Alex)
 */
export async function getCapacityContext(userId: string): Promise<string> {
  try {
    const { buildCapacityContext } =
      await import('../../../services/superhuman/capacity-guardian.js');
    return await buildCapacityContext(userId);
  } catch {
    return '';
  }
}

/**
 * Get dream keeper context (useful for Jordan, Nayan)
 */
export async function getDreamContext(userId: string): Promise<string> {
  try {
    const { buildDreamContext } = await import('../../../services/superhuman/dream-keeper.js');
    return await buildDreamContext(userId);
  } catch {
    return '';
  }
}

/**
 * Get relationship network context (useful for Alex)
 */
export async function getNetworkContext(userId: string): Promise<string> {
  try {
    const { buildNetworkContext } =
      await import('../../../services/superhuman/relationship-network.js');
    return await buildNetworkContext(userId);
  } catch {
    return '';
  }
}

/**
 * Get seasonal awareness context (useful for all)
 */
export async function getSeasonalContext(userId: string): Promise<string> {
  try {
    const { buildSeasonalContext } =
      await import('../../../services/superhuman/seasonal-awareness.js');
    return await buildSeasonalContext(userId);
  } catch {
    return '';
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear cached superhuman context for a user
 */
export function clearSuperhumanCache(userId: string): void {
  tieredCache.full.delete(getCacheKey(userId));

  // Clear all tiered caches for this user
  for (const capability of Object.keys(CAPABILITY_TIERS) as (keyof SuperhumanCapabilities)[]) {
    const key = getCacheKey(userId, capability);
    tieredCache.stable.delete(key);
    tieredCache.normal.delete(key);
    tieredCache.fresh.delete(key);
  }
}

/**
 * Clear all superhuman cache
 */
export function clearAllSuperhumanCache(): void {
  tieredCache.full.clear();
  tieredCache.stable.clear();
  tieredCache.normal.clear();
  tieredCache.fresh.clear();
}

/**
 * Pre-warm cache for a user (call during session start)
 * This builds context in the background so it's ready when needed.
 */
export async function warmupSuperhumanCache(userId: string): Promise<void> {
  try {
    // Don't block - run in background
    const start = Date.now();

    const { buildSuperhumanContext } = await import('../../../services/superhuman/index.js');

    const context = await buildSuperhumanContext(userId);
    setCachedContext(userId, context);

    log.info({ userId, durationMs: Date.now() - start }, '🔥 Warmed superhuman cache');
  } catch (error) {
    log.warn({ error, userId }, 'Cache warmup failed (non-critical)');
  }
}

/**
 * Get cache statistics for debugging
 */
export function getCacheStats(): {
  fullCacheSize: number;
  stableCacheSize: number;
  normalCacheSize: number;
  freshCacheSize: number;
} {
  return {
    fullCacheSize: tieredCache.full.size,
    stableCacheSize: tieredCache.stable.size,
    normalCacheSize: tieredCache.normal.size,
    freshCacheSize: tieredCache.fresh.size,
  };
}

// ============================================================================
// PERFORMANCE TRACKING
// ============================================================================

interface PerformanceEntry {
  builderName: string;
  durationMs: number;
  userId: string;
  persona: PersonaSuperhuman;
  timestamp: number;
  cacheHit: boolean;
}

const performanceLog: PerformanceEntry[] = [];
const MAX_PERFORMANCE_ENTRIES = 100;

/**
 * Record a performance entry
 */
function recordPerformance(entry: PerformanceEntry): void {
  performanceLog.push(entry);

  // Keep only last N entries
  if (performanceLog.length > MAX_PERFORMANCE_ENTRIES) {
    performanceLog.shift();
  }

  // Log slow operations
  if (entry.durationMs > 200) {
    log.warn({ ...entry }, `Slow superhuman context build: ${entry.durationMs}ms`);
  }
}

/**
 * Get performance statistics
 */
export function getPerformanceStats(): {
  totalCalls: number;
  averageDurationMs: number;
  cacheHitRate: number;
  slowestCall: PerformanceEntry | null;
  recentCalls: PerformanceEntry[];
} {
  if (performanceLog.length === 0) {
    return {
      totalCalls: 0,
      averageDurationMs: 0,
      cacheHitRate: 0,
      slowestCall: null,
      recentCalls: [],
    };
  }

  const totalCalls = performanceLog.length;
  const totalDuration = performanceLog.reduce((sum, e) => sum + e.durationMs, 0);
  const cacheHits = performanceLog.filter((e) => e.cacheHit).length;
  const slowest = performanceLog.reduce(
    (max, e) => (e.durationMs > (max?.durationMs || 0) ? e : max),
    null as PerformanceEntry | null
  );

  return {
    totalCalls,
    averageDurationMs: Math.round(totalDuration / totalCalls),
    cacheHitRate: Math.round((cacheHits / totalCalls) * 100) / 100,
    slowestCall: slowest,
    recentCalls: performanceLog.slice(-10),
  };
}

/**
 * Clear performance log
 */
export function clearPerformanceLog(): void {
  performanceLog.length = 0;
}

/**
 * Wrap a context builder with performance tracking
 */
export function withPerformanceTracking<T>(
  builderName: string,
  fn: () => Promise<T>,
  meta: { userId: string; persona: PersonaSuperhuman; cacheHit?: boolean }
): Promise<T> {
  const startTime = Date.now();

  return fn().finally(() => {
    const duration = Date.now() - startTime;
    recordPerformance({
      builderName,
      durationMs: duration,
      userId: meta.userId,
      persona: meta.persona,
      timestamp: Date.now(),
      cacheHit: meta.cacheHit ?? false,
    });
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export { PERSONA_SUPERHUMAN_MAP };
