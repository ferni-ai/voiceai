/**
 * Context Builder Orchestrator
 *
 * Modular system for building conversational context injections.
 *
 * Features:
 * - 70+ context builders organized by category
 * - Metrics tracking for performance monitoring
 * - Validation and error handling
 * - Dependency resolution between builders
 * - High-emotion mode for focused support
 *
 * @module intelligence/context-builders
 */

import { createHash } from 'crypto';
import type { PersonaConfig } from '../../personas/types.js';
import type { UserProfile } from '../../types/user-profile.js';
import { createLogger } from '../../utils/safe-logger.js';
import { DISTRESS } from '../distress-levels.js';
import { BUILDER_CATEGORIES, BuilderCategory, getBuilderCategory } from './categories.js';
import {
  checkPerformanceIssues,
  getMetricsSummary,
  recordBuilderMetrics,
  recordTurnMetrics,
} from './metrics.js';

const log = createLogger({ module: 'context-builders' });

// ============================================================================
// CONTEXT OUTPUT CACHE
// ============================================================================

interface ContextOutputCacheEntry {
  injections: ContextInjection[];
  createdAt: number;
  accessedAt: number;
  inputHash: string;
}

const CONTEXT_OUTPUT_CACHE_CONFIG = {
  /** Maximum entries in the cache */
  maxEntries: 100,
  /** TTL in milliseconds (5 minutes) */
  ttlMs: 5 * 60 * 1000,
  /** Minimum text length change to invalidate cache */
  textChangeThreshold: 50,
};

const contextOutputCache = new Map<string, ContextOutputCacheEntry>();

const contextCacheStats = {
  hits: 0,
  misses: 0,
  evictions: 0,
};

/**
 * Generate a cache key for context builder output
 * Based on session, turn count, emotion, and text hash
 */
function generateContextCacheKey(input: ContextBuilderInput): string {
  const keyParts = [
    input.services?.sessionId || 'no-session',
    input.userData?.turnCount?.toString() || '0',
    input.analysis?.emotion?.primary || 'neutral',
    Math.round((input.analysis?.emotion?.intensity ?? 0) * 10).toString(),
    input.persona?.identity?.id || 'unknown',
  ];
  return keyParts.join(':');
}

/**
 * Generate a hash of the input for cache validation
 */
function generateInputHash(input: ContextBuilderInput): string {
  const hashData = {
    text: (input.userText || '').slice(0, 200), // First 200 chars
    emotion: input.analysis?.emotion || { primary: 'neutral', intensity: 0 },
    intent: input.analysis?.intent?.primary || 'unknown',
    topics: input.analysis?.topics?.detected?.slice(0, 3) || [],
  };
  return createHash('md5').update(JSON.stringify(hashData)).digest('hex').slice(0, 16);
}

/**
 * Check if cached context is still valid
 */
function isContextCacheValid(entry: ContextOutputCacheEntry, inputHash: string): boolean {
  // Check TTL
  if (Date.now() - entry.createdAt > CONTEXT_OUTPUT_CACHE_CONFIG.ttlMs) {
    return false;
  }

  // Check input hash matches
  return entry.inputHash === inputHash;
}

/**
 * Get cached context output if valid
 */
function getCachedContextOutput(input: ContextBuilderInput): ContextInjection[] | null {
  const cacheKey = generateContextCacheKey(input);
  const inputHash = generateInputHash(input);

  const entry = contextOutputCache.get(cacheKey);
  if (!entry) {
    contextCacheStats.misses++;
    return null;
  }

  if (!isContextCacheValid(entry, inputHash)) {
    contextOutputCache.delete(cacheKey);
    contextCacheStats.misses++;
    return null;
  }

  // Update access time
  entry.accessedAt = Date.now();
  contextCacheStats.hits++;

  log.debug({ cacheKey, injectionCount: entry.injections.length }, 'Context cache hit');
  return entry.injections;
}

/**
 * Cache context output
 */
function cacheContextOutput(input: ContextBuilderInput, injections: ContextInjection[]): void {
  const cacheKey = generateContextCacheKey(input);
  const inputHash = generateInputHash(input);

  // Evict LRU if at capacity
  if (contextOutputCache.size >= CONTEXT_OUTPUT_CACHE_CONFIG.maxEntries) {
    let oldest: { key: string; accessedAt: number } | null = null;
    for (const [key, entry] of contextOutputCache.entries()) {
      if (!oldest || entry.accessedAt < oldest.accessedAt) {
        oldest = { key, accessedAt: entry.accessedAt };
      }
    }
    if (oldest) {
      contextOutputCache.delete(oldest.key);
      contextCacheStats.evictions++;
    }
  }

  const now = Date.now();
  contextOutputCache.set(cacheKey, {
    injections,
    createdAt: now,
    accessedAt: now,
    inputHash,
  });

  log.debug({ cacheKey, injectionCount: injections.length }, 'Cached context output');
}

/**
 * Get context output cache statistics
 */
export function getContextOutputCacheStats(): {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
} {
  const total = contextCacheStats.hits + contextCacheStats.misses;
  return {
    size: contextOutputCache.size,
    hits: contextCacheStats.hits,
    misses: contextCacheStats.misses,
    evictions: contextCacheStats.evictions,
    hitRate: total > 0 ? contextCacheStats.hits / total : 0,
  };
}

/**
 * Clear context output cache (for testing)
 */
export function clearContextOutputCache(): void {
  contextOutputCache.clear();
  contextCacheStats.hits = 0;
  contextCacheStats.misses = 0;
  contextCacheStats.evictions = 0;
}

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationAnalysis {
  emotion: {
    primary: string;
    intensity: number;
    secondaryEmotions?: string[];
    needsSupport?: boolean;
    isVenting?: boolean;
    isProcessing?: boolean;
    mentalHealthSignals?: string[];
    confidence?: number;
    distressLevel?: number;
    valence?: 'positive' | 'negative' | 'neutral';
    markers?: string[];
    suggestedTone?: string;
  };
  intent: {
    primary: string;
    confidence: number;
    entities?: Record<string, unknown>;
    isQuestion?: boolean;
    isFollowUp?: boolean;
    requiresEmpathy?: boolean;
    requiresAction?: boolean;
    suggestedApproach?: string;
  };
  topics: {
    detected: string[];
    primary?: string | null;
    trending?: string[];
    sentiment?: Record<string, number>;
    isTopicShift?: boolean;
  };
  state: {
    phase: string;
    trustLevel?: number;
    engagementLevel?: number;
    distressLevel?: number;
    currentMood?: string;
  };
}

/**
 * Minimal SessionServices interface for context builders.
 *
 * This is a SUBSET of the full SessionServices from services/index.ts.
 * Context builders only need these fields to operate. The full SessionServices
 * interface is structurally compatible with this, so passing the real
 * SessionServices object works due to TypeScript's structural typing.
 *
 * @see services/index.ts for the full SessionServices interface
 */
export interface SessionServices {
  sessionId: string;
  userId?: string;
  sessionStartTime: number;
  userProfile: UserProfile | null;

  // Methods used by context builders
  searchKnowledge?: (query: string) => Promise<string | null>;
  searchPastConversations?: (query: string) => Promise<string | null>;
  getEnhancedPromptContext?: () => string;
  trackResponseQuality?: (response: string, reaction: 'positive' | 'neutral' | 'negative') => void;

  // Learning engine access (for memory context builder)
  learningEngine?: {
    getProactiveInsight: (profile: UserProfile | null, turnCount: number) => string | null;
  };

  // History tracker (for memory context builder)
  historyTracker?: {
    getSimpleTurns: () => Array<{ role: string; content: string }>;
    getTurnCount: () => number;
  };

  // Current persona ID (for persona memory context builder)
  personaId?: string;
}

export interface VoiceEmotionResult {
  emotion: string;
  confidence: number;
  speechRate?: number;
  pitch?: number;
}

export interface SessionRecoveryState {
  wasDisconnected?: boolean;
  disconnectedAt?: Date | null; // Match conversation-quality.ts definition
  recoveryGreeting?: string;
}

export interface ExtractedDetail {
  type:
    | 'user_name'
    | 'person_name'
    | 'pet_name'
    | 'place'
    | 'company'
    | 'date'
    | 'amount'
    | 'other';
  value: string;
}

export interface ContextUserData {
  userName?: string;
  name?: string;
  isReturningUser?: boolean;
  sessionDurationMs?: number;
  turnCount?: number;
  lastTopic?: string;
  recentTopics?: string[];
  currentPersona?: string;
  keyMoments?: Array<{ summary: string; timestamp: Date }>;
  lastPacingScore?: number;
  sessionRecoveryState?: SessionRecoveryState;
  storiesShared?: string[];
  lastPhysicalNote?: string;
  extractedDetails?: ExtractedDetail[];
  lastNameUsed?: number;
  /** Memory references already made this session (prevents repetition) */
  referencedMemories?: string[];
  /** Whether we've already referenced the last conversation topic */
  hasReferencedLastConversation?: boolean;
}

export interface ContextBuilderInput {
  userText: string;
  analysis: ConversationAnalysis;
  services: SessionServices;
  userData: ContextUserData;
  userProfile: UserProfile | null;
  persona: PersonaConfig;
  voiceEmotion?: VoiceEmotionResult;
  /** Bundle runtime for accessing rich persona content (quirks, inner world, etc.) */
  bundleRuntime?: import('../../personas/bundles/runtime.js').BundleRuntimeEngine;
}

export type ContextPriority = 'critical' | 'high' | 'standard' | 'hint';

export interface ContextInjection {
  id: string;
  source: string;
  content: string;
  priority: ContextPriority;
  category?: string;
  confidence?: number;
}

export interface ContextBuilder {
  name: string;
  description: string;
  priority: number;
  /** Optional category for organization */
  category?: BuilderCategory;
  /** Optional dependencies - builders that must run before this one */
  dependsOn?: string[];
  /** The build function */
  build: (input: ContextBuilderInput) => Promise<ContextInjection[]>;
}

export interface ContextBuilderMetrics {
  name: string;
  callCount: number;
  totalDurationMs: number;
  avgDurationMs: number;
  injectionsProduced: number;
  lastCallTimestamp?: number;
}

// Re-export imported types
export type { PersonaConfig, UserProfile };

// Re-export categories and metrics
export { BUILDER_CATEGORIES, BuilderCategory, getBuilderCategory } from './categories.js';
export {
  checkPerformanceIssues,
  getAllBuilderMetrics,
  getBuilderMetrics,
  getMetricsSummary,
  getRecentTurnMetrics,
} from './metrics.js';

// ============================================================================
// REGISTRY WITH INDEXING
// ============================================================================

const builders = new Map<string, ContextBuilder>();

/** Pre-computed index of builders by category for O(1) lookup */
const buildersByCategory = new Map<BuilderCategory, Set<string>>();

/** Cached sorted array of all builders (invalidated on registration) */
let sortedBuildersCache: ContextBuilder[] | null = null;

/** Cached sorted arrays by category (invalidated on registration) */
const sortedByCategoryCache = new Map<BuilderCategory, ContextBuilder[]>();

/** Track duplicate registration attempts */
const registrationWarnings = new Set<string>();

/**
 * Invalidate all caches (called when builders change)
 */
function invalidateCaches(): void {
  sortedBuildersCache = null;
  sortedByCategoryCache.clear();
}

/**
 * Register a context builder.
 *
 * Supports two call signatures for backward compatibility:
 * 1. registerContextBuilder(builder: ContextBuilder) - new style
 * 2. registerContextBuilder(name: string, buildFn: Function) - legacy style
 *
 * @param builderOrName - Either a ContextBuilder object or the builder name (legacy)
 * @param buildFn - Build function (only for legacy style)
 */
export function registerContextBuilder(
  builderOrName: ContextBuilder | string,
  buildFn?: (input: ContextBuilderInput) => Promise<ContextInjection[]> | ContextInjection[]
): void {
  let builder: ContextBuilder;

  if (typeof builderOrName === 'string') {
    // Legacy call: registerContextBuilder('name', buildFn)
    if (!buildFn) {
      throw new Error(`registerContextBuilder('${builderOrName}') called without a build function`);
    }
    builder = {
      name: builderOrName,
      description: `Context builder: ${builderOrName}`,
      priority: 50, // Default priority
      category: getBuilderCategory(builderOrName),
      build: async (input) => {
        const result = buildFn(input);
        return result instanceof Promise ? result : Promise.resolve(result);
      },
    };
  } else {
    builder = {
      ...builderOrName,
      category: builderOrName.category || getBuilderCategory(builderOrName.name),
    };
  }

  // Validation: warn on duplicate registration
  if (builders.has(builder.name) && !registrationWarnings.has(builder.name)) {
    log.warn({ builder: builder.name }, 'Builder already registered, overwriting');
    registrationWarnings.add(builder.name);
  }

  // Validation: check dependencies exist (deferred check)
  if (builder.dependsOn) {
    for (const dep of builder.dependsOn) {
      if (!builders.has(dep) && !BUILDER_CATEGORIES[dep]) {
        log.debug(
          { builder: builder.name, dependency: dep },
          'Builder depends on unregistered builder (may load later)'
        );
      }
    }
  }

  // Remove from old category index if overwriting
  if (builders.has(builder.name)) {
    const oldBuilder = builders.get(builder.name)!;
    const oldCategory = oldBuilder.category || getBuilderCategory(oldBuilder.name);
    const oldCategorySet = buildersByCategory.get(oldCategory);
    if (oldCategorySet) {
      oldCategorySet.delete(builder.name);
    }
  }

  // Add to builders map
  builders.set(builder.name, builder);

  // Add to category index
  const category = builder.category || getBuilderCategory(builder.name);
  if (!buildersByCategory.has(category)) {
    buildersByCategory.set(category, new Set());
  }
  buildersByCategory.get(category)!.add(builder.name);

  // Invalidate caches
  invalidateCaches();

  log.debug({ builder: builder.name, priority: builder.priority, category }, 'Registered context builder');
}

/**
 * Get all registered builders, sorted by priority (highest first)
 * Uses cached sorted array for O(1) repeated access
 */
export function getRegisteredBuilders(): ContextBuilder[] {
  if (sortedBuildersCache) {
    return sortedBuildersCache;
  }

  sortedBuildersCache = Array.from(builders.values()).sort((a, b) => b.priority - a.priority);
  return sortedBuildersCache;
}

/**
 * Get builders by category using pre-computed index
 * O(k) where k = builders in category, instead of O(n) filtering all builders
 */
export function getBuildersByCategory(category: BuilderCategory): ContextBuilder[] {
  // Check cache first
  const cached = sortedByCategoryCache.get(category);
  if (cached) {
    return cached;
  }

  // Use index for O(1) lookup of builder names in category
  const builderNames = buildersByCategory.get(category);
  if (!builderNames || builderNames.size === 0) {
    return [];
  }

  // Build sorted array from index
  const result: ContextBuilder[] = [];
  for (const name of builderNames) {
    const builder = builders.get(name);
    if (builder) {
      result.push(builder);
    }
  }

  result.sort((a, b) => b.priority - a.priority);

  // Cache the result
  sortedByCategoryCache.set(category, result);

  return result;
}

/**
 * Check if a builder is registered
 */
export function isBuilderRegistered(name: string): boolean {
  return builders.has(name);
}

/**
 * Get builder count
 */
export function getBuilderCount(): number {
  return builders.size;
}

/**
 * Get registry statistics for monitoring
 */
export function getRegistryStats(): {
  totalBuilders: number;
  byCategory: Record<string, number>;
  cacheStatus: { sortedAll: boolean; sortedByCategory: number };
} {
  const byCategory: Record<string, number> = {};
  for (const [category, names] of buildersByCategory.entries()) {
    byCategory[category] = names.size;
  }

  return {
    totalBuilders: builders.size,
    byCategory,
    cacheStatus: {
      sortedAll: sortedBuildersCache !== null,
      sortedByCategory: sortedByCategoryCache.size,
    },
  };
}

// ============================================================================
// INJECTION HELPERS
// ============================================================================

let counter = 0;

export function createInjection(
  source: string,
  content: string,
  priority: ContextPriority,
  options?: { category?: string; confidence?: number }
): ContextInjection {
  return {
    id: `${source}_${++counter}`,
    source,
    content,
    priority,
    category: options?.category,
    confidence: options?.confidence ?? 1.0,
  };
}

export function createCriticalInjection(
  source: string,
  content: string,
  options?: { category?: string; confidence?: number }
): ContextInjection {
  return createInjection(source, content, 'critical', options);
}

/**
 * BETTER-THAN-HUMAN: High priority for important trust signals
 * Use this for emotional mismatch detection and similar "superhuman" insights
 */
export function createHighInjection(
  source: string,
  content: string,
  options?: { category?: string; confidence?: number }
): ContextInjection {
  return createInjection(source, content, 'high', options);
}

export function createStandardInjection(
  source: string,
  content: string,
  options?: { category?: string; confidence?: number }
): ContextInjection {
  return createInjection(source, content, 'standard', options);
}

export function createHintInjection(
  source: string,
  content: string,
  options?: { category?: string; confidence?: number }
): ContextInjection {
  return createInjection(source, content, 'hint', options);
}

// ============================================================================
// FORMATTING
// ============================================================================

const PRIORITY_ORDER: Record<ContextPriority, number> = {
  critical: 4,
  high: 3,
  standard: 2,
  hint: 1,
};

/**
 * Format context injections for the LLM prompt
 *
 * BETTER-THAN-HUMAN: In high-emotion moments, we reduce noise by filtering out
 * lower-priority context. This helps the AI focus on what matters most.
 */
export function formatContextForPrompt(
  injections: ContextInjection[],
  options?: {
    maxLength?: number;
    includeHints?: boolean;
    /** BETTER-THAN-HUMAN: If true, only include critical/high priority context */
    highEmotionMode?: boolean;
  }
): string {
  const maxLength = options?.maxLength ?? 4000;
  const includeHints = options?.includeHints ?? true;
  const highEmotionMode = options?.highEmotionMode ?? false;

  // BETTER-THAN-HUMAN: In high emotion mode, filter aggressively
  // Only keep critical and high priority context
  let filtered: ContextInjection[];
  if (highEmotionMode) {
    filtered = injections.filter((i) => i.priority === 'critical' || i.priority === 'high');
  } else {
    filtered = injections.filter((i) => includeHints || i.priority !== 'hint');
  }

  filtered.sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]);

  const sections: string[] = [];
  let currentLength = 0;

  for (const injection of filtered) {
    const section = injection.content.trim();
    if (currentLength + section.length + 2 > maxLength) {
      if (injection.priority === 'hint') continue;
      break;
    }
    sections.push(section);
    currentLength += section.length + 2;
  }

  return sections.join('\n\n');
}

/**
 * BETTER-THAN-HUMAN: Determine if we should use high-emotion mode
 *
 * High emotion mode reduces context noise when the user needs focused support.
 * Uses centralized DISTRESS constants for consistent thresholds.
 */
export function shouldUseHighEmotionMode(analysis: ConversationAnalysis): boolean {
  // High emotion mode triggers:
  // 1. User needs support
  // 2. High distress level (>= DISTRESS.HIGH)
  // 3. High emotion intensity (> 0.8)
  // 4. Mental health signals detected
  return Boolean(
    analysis.emotion.needsSupport ||
    (analysis.emotion.distressLevel && analysis.emotion.distressLevel >= DISTRESS.HIGH) ||
    analysis.emotion.intensity > 0.8 ||
    (analysis.emotion.mentalHealthSignals && analysis.emotion.mentalHealthSignals.length > 0)
  );
}

// ============================================================================
// MAIN CONTEXT BUILDING
// ============================================================================

/**
 * Build conversation context from all registered builders
 *
 * Features:
 * - Output caching with 5-minute TTL
 * - Parallel execution for performance
 * - Per-builder metrics tracking
 * - Error isolation (one failing builder doesn't break others)
 * - Basic emotional context injection
 */
export async function buildConversationContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  // Check cache first (5-minute TTL)
  const cached = getCachedContextOutput(input);
  if (cached) {
    return cached;
  }

  // Ensure all builder modules are loaded (lazy loading)
  await ensureBuildersLoaded();

  const injections: ContextInjection[] = [];

  // Basic emotional context (always injected before builders run)
  // Uses centralized DISTRESS constants
  if (
    input.analysis.emotion.needsSupport ||
    (input.analysis.emotion.distressLevel &&
      input.analysis.emotion.distressLevel >= DISTRESS.MODERATE)
  ) {
    injections.push(
      createCriticalInjection(
        'emotional',
        `User seems to be going through something difficult. Be extra supportive and empathetic.`,
        { category: 'emotional' }
      )
    );
  }

  // User name context
  const userName = input.userData.userName || input.userData.name || input.userProfile?.name;
  if (userName) {
    injections.push(
      createHintInjection(
        'personalization',
        `User's name is ${userName}. Use it occasionally but naturally.`,
        { category: 'personalization' }
      )
    );
  }

  // Run all registered builders IN PARALLEL with metrics tracking
  const registeredBuilders = getRegisteredBuilders();
  const builderResults: Array<{
    name: string;
    durationMs: number;
    injectionCount: number;
    error?: string;
  }> = [];

  const results = await Promise.allSettled(
    registeredBuilders.map(async (builder) => {
      const start = Date.now();
      try {
        const result = await builder.build(input);
        const durationMs = Date.now() - start;

        // Record metrics
        recordBuilderMetrics(builder.name, durationMs, result.length);
        builderResults.push({
          name: builder.name,
          durationMs,
          injectionCount: result.length,
        });

        return result;
      } catch (error) {
        const durationMs = Date.now() - start;
        const errorMsg = error instanceof Error ? error.message : String(error);

        // Record metrics with error
        recordBuilderMetrics(builder.name, durationMs, 0, error as Error);
        builderResults.push({
          name: builder.name,
          durationMs,
          injectionCount: 0,
          error: errorMsg,
        });

        throw error;
      }
    })
  );

  // Collect results
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      injections.push(...result.value);
    } else {
      log.warn(
        { builder: registeredBuilders[index].name, error: result.reason },
        'Context builder failed'
      );
    }
  });

  // Record turn-level metrics
  const sessionId = input.services?.sessionId || 'unknown';
  const turnNumber = input.userData?.turnCount || 0;
  recordTurnMetrics(sessionId, turnNumber, builderResults);

  // Cache the result for future lookups
  cacheContextOutput(input, injections);

  return injections;
}

/**
 * Build context with detailed metrics tracking
 *
 * Returns both the injections and comprehensive metrics including:
 * - Total build time
 * - Per-builder breakdown
 * - Performance warnings
 */
export async function buildConversationContextWithMetrics(input: ContextBuilderInput): Promise<{
  injections: ContextInjection[];
  metrics: {
    totalDurationMs: number;
    injectionCount: number;
    builderCount: number;
    buildersRan: number;
    buildersProducedInjections: number;
    performanceWarnings: string[];
  };
}> {
  const start = Date.now();
  const injections = await buildConversationContext(input);
  const duration = Date.now() - start;

  // Get performance issues
  const performanceWarnings = checkPerformanceIssues();

  // Get summary for this build
  const summary = getMetricsSummary();

  return {
    injections,
    metrics: {
      totalDurationMs: duration,
      injectionCount: injections.length,
      builderCount: builders.size,
      buildersRan: summary.totalBuilds > 0 ? builders.size : 0,
      buildersProducedInjections: injections.length > 0 ? summary.mostActiveBuilders.length : 0,
      performanceWarnings,
    },
  };
}

// ============================================================================
// AUTO-LOAD ALL CONTEXT BUILDERS
// ============================================================================

// Re-export loader functions
export {
  areBuildersLoaded,
  BUILDER_MANIFEST,
  ensureBuildersLoaded,
  getAllBuilderModules,
  getBuilderModulesByCategory,
  getLoadingStatus,
  reloadBuilders,
} from './loader.js';

// Import for internal use
import { ensureBuildersLoaded } from './loader.js';

// ============================================================================
// CONVERSATION HUMANIZING CONTEXT BUILDER
// ============================================================================
// Export for direct use in voice-agent.ts

export {
  buildConversationHumanizingContext,
  formatConversationHumanizingForPrompt,
  getHumanizingSummary as getConversationHumanizingSummary,
} from './conversation-humanizing.js';
