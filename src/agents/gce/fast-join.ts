/**
 * Fast Agent Join System
 *
 * Achieves sub-3-second agent join by:
 * 1. Pre-warming Gemini sessions at worker startup (session pooling)
 * 2. Pre-generating greeting text for instant model output
 * 3. Deferring non-critical initialization to background
 *
 * Target: User hears greeting within 2 seconds of call start.
 *
 * @module agents/gce/fast-join
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger().child({ module: 'FastJoin' });

// ============================================================================
// TYPES
// ============================================================================

export interface WarmSession {
  /** Session ID for tracking */
  id: string;
  /** When the session was created */
  createdAt: number;
  /** The pre-warmed LLM model */
  llmModel: unknown;
  /** Whether this session is currently in use */
  inUse: boolean;
  /** Model type used (gemini or openai) */
  modelType: 'gemini' | 'openai';
}

export interface GreetingCache {
  /** Persona ID */
  personaId: string;
  /** Pre-generated greeting text (multiple variants) */
  greetingTexts: string[];
  /** When this was cached */
  cachedAt: number;
}

export interface FastJoinConfig {
  /** Number of sessions to pre-warm (default: 2) */
  poolSize?: number;
  /** Personas to pre-cache greetings for */
  personas?: string[];
  /** Max age of a warm session before refresh (default: 5 min) */
  sessionMaxAgeMs?: number;
  /** Whether to enable session pooling (default: true) */
  enablePooling?: boolean;
}

export interface FastJoinMetrics {
  /** Sessions currently in pool */
  poolSize: number;
  /** Sessions currently in use */
  inUse: number;
  /** Total sessions created */
  totalCreated: number;
  /** Total sessions reused from pool */
  totalReused: number;
  /** Average time to acquire a session */
  avgAcquireTimeMs: number;
  /** Greeting cache size */
  greetingsCached: number;
}

// ============================================================================
// STATE
// ============================================================================

const warmSessionPool: WarmSession[] = [];
const greetingCache = new Map<string, GreetingCache>();
let metrics = {
  totalCreated: 0,
  totalReused: 0,
  acquireTimes: [] as number[],
};

let config: Required<FastJoinConfig> = {
  // PERFORMANCE: Increased from 2 to 5 for better cold-start handling
  // Each warm session reduces join latency by ~200ms
  poolSize: 5,
  personas: ['ferni', 'maya-santos', 'peter-john', 'alex-chen', 'jordan-taylor', 'nayan-patel', 'joel-dickson'],
  sessionMaxAgeMs: 5 * 60 * 1000, // 5 minutes
  enablePooling: true,
};

let isInitialized = false;
let isInitializing = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the fast-join system.
 * Call this during worker warmup (gce-voice-worker.ts).
 */
export async function initializeFastJoin(userConfig?: FastJoinConfig): Promise<void> {
  if (isInitialized || isInitializing) {
    log.debug('Fast-join already initialized or initializing');
    return;
  }

  isInitializing = true;
  const initStart = Date.now();

  if (userConfig) {
    config = { ...config, ...userConfig };
  }

  log.info({ config }, '🚀 Initializing fast-join system');

  try {
    // Phase 1: Pre-cache greeting texts for common personas
    await prewarmGreetingTexts();

    // Phase 2: Pre-warm session pool (if enabled)
    if (config.enablePooling) {
      await prewarmSessionPool();
    }

    isInitialized = true;
    log.info(
      {
        durationMs: Date.now() - initStart,
        poolSize: warmSessionPool.length,
        greetingsCached: greetingCache.size,
      },
      '✅ Fast-join system ready'
    );
  } catch (err) {
    log.error({ error: String(err) }, '❌ Fast-join initialization failed');
    // Continue without fast-join - fallback to normal path
  } finally {
    isInitializing = false;
  }
}

// ============================================================================
// GREETING TEXT PRE-CACHING
// ============================================================================

/**
 * Pre-generate greeting texts for all configured personas.
 * The model will use these instantly instead of generating from scratch.
 *
 * FIX (Jan 2026): Generate fresh greetings each time to get actual variety.
 * Previously called getPrewarmedGreetingForPersona which returned the same cached value.
 */
async function prewarmGreetingTexts(): Promise<void> {
  const startTime = Date.now();
  log.info({ personas: config.personas.length }, '📝 Pre-caching greeting texts...');

  // Import greeting generator - use generateWarmGreeting directly for fresh randomized greetings
  const { generateWarmGreeting } = await import('../shared/warm-greeting.js');

  // Cache greeting variants per persona
  for (const personaId of config.personas) {
    try {
      const greetingVariants: string[] = [];

      // Generate multiple FRESH greeting variants for variety
      // Each call to generateWarmGreeting uses Math.random() internally
      const targetVariants = 5; // Generate more to account for potential duplicates
      for (let i = 0; i < targetVariants; i++) {
        const greeting = generateWarmGreeting(personaId);
        // Only add if unique
        if (greeting && !greetingVariants.includes(greeting)) {
          greetingVariants.push(greeting);
        }
        // Stop once we have 3 unique variants
        if (greetingVariants.length >= 3) break;
      }

      if (greetingVariants.length > 0) {
        greetingCache.set(personaId, {
          personaId,
          greetingTexts: greetingVariants,
          cachedAt: Date.now(),
        });
        log.debug({ personaId, variants: greetingVariants.length }, '✅ Greeting texts cached');
      }
    } catch (err) {
      log.warn({ personaId, error: String(err) }, '⚠️ Failed to cache greeting texts');
    }
  }

  log.info(
    {
      durationMs: Date.now() - startTime,
      cached: greetingCache.size,
      personas: config.personas.length,
    },
    '✅ Greeting texts pre-cached'
  );
}

/**
 * Get pre-cached greeting text for instant output.
 * Returns null if not cached (fallback to normal generation).
 *
 * FIX (Jan 2026): Randomly select from cached variants to avoid repetition.
 * Previously always returned index 0 or 1, causing the same greeting every time.
 */
export function getCachedGreetingText(
  personaId: string,
  options?: { isReturningUser?: boolean }
): string | null {
  const cached = greetingCache.get(personaId);
  if (!cached || cached.greetingTexts.length === 0) {
    return null;
  }

  // Randomly select from available variants for variety
  const randomIndex = Math.floor(Math.random() * cached.greetingTexts.length);
  return cached.greetingTexts[randomIndex];
}

// ============================================================================
// SESSION POOLING
// ============================================================================

/**
 * Pre-warm the session pool with ready-to-use Gemini sessions.
 * These sessions are "blank" - persona context is injected on acquisition.
 */
async function prewarmSessionPool(): Promise<void> {
  const startTime = Date.now();
  log.info({ targetSize: config.poolSize }, '🔥 Pre-warming session pool...');

  const createPromises = [];
  for (let i = 0; i < config.poolSize; i++) {
    createPromises.push(createWarmSession());
  }

  const results = await Promise.allSettled(createPromises);
  const successCount = results.filter((r) => r.status === 'fulfilled').length;

  log.info(
    {
      durationMs: Date.now() - startTime,
      created: successCount,
      target: config.poolSize,
    },
    successCount > 0 ? '✅ Session pool warmed' : '⚠️ Session pool warming failed'
  );
}

/**
 * Create a single warm session for the pool.
 */
async function createWarmSession(): Promise<WarmSession | null> {
  try {
    const sessionId = `warm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Import necessary modules
    const google = await import('@livekit/agents-plugin-google');

    // Create a minimal LLM model (will inject persona instructions on acquisition)
    // Using basic instructions that work for any persona
    const { modelConfig } = await import('../../services/model-config.js');
    const geminiConfig = modelConfig.getDefault();
    const { Modality } = await import('@google/genai');

    const llmModel = new google.beta.realtime.RealtimeModel({
      model: geminiConfig.model,
      modalities: [Modality.TEXT],
      temperature: geminiConfig.temperature,
      instructions: 'You are a helpful AI assistant. Waiting for persona context.',
    });

    const warmSession: WarmSession = {
      id: sessionId,
      createdAt: Date.now(),
      llmModel,
      inUse: false,
      modelType: 'gemini',
    };

    warmSessionPool.push(warmSession);
    metrics.totalCreated++;

    log.debug({ sessionId }, '🔥 Warm session created');
    return warmSession;
  } catch (err) {
    log.warn({ error: String(err) }, '⚠️ Failed to create warm session');
    return null;
  }
}

/**
 * Acquire a warm session from the pool.
 * If pool is empty, returns null (caller should create new session).
 */
export async function acquireWarmSession(): Promise<WarmSession | null> {
  if (!config.enablePooling) {
    return null;
  }

  const acquireStart = Date.now();

  // Try to get an available session from the pool
  const available = warmSessionPool.find(
    (s) => !s.inUse && Date.now() - s.createdAt < config.sessionMaxAgeMs
  );

  if (available) {
    available.inUse = true;
    metrics.totalReused++;
    metrics.acquireTimes.push(Date.now() - acquireStart);

    log.debug(
      { sessionId: available.id, acquireTimeMs: Date.now() - acquireStart },
      '✅ Acquired warm session from pool'
    );

    // Replenish pool in background
    replenishPoolBackground();

    return available;
  }

  // Pool exhausted
  log.debug('ℹ️ No warm sessions available in pool');
  return null;
}

/**
 * Release a session back to the pool (or discard if too old).
 */
export function releaseWarmSession(session: WarmSession): void {
  session.inUse = false;

  // If session is too old, remove it and let replenish create a fresh one
  if (Date.now() - session.createdAt > config.sessionMaxAgeMs) {
    const index = warmSessionPool.indexOf(session);
    if (index >= 0) {
      warmSessionPool.splice(index, 1);
    }
    log.debug({ sessionId: session.id }, '♻️ Warm session expired, removed from pool');
    replenishPoolBackground();
  }
}

/**
 * Replenish the pool in the background (non-blocking).
 */
function replenishPoolBackground(): void {
  const availableCount = warmSessionPool.filter((s) => !s.inUse).length;
  if (availableCount < config.poolSize) {
    // Don't await - let it run in background
    createWarmSession().catch((err) => {
      log.warn({ error: String(err) }, '⚠️ Background pool replenish failed');
    });
  }
}

// ============================================================================
// DEFERRED INITIALIZATION HELPERS
// ============================================================================

/**
 * Helper to defer non-critical initialization to background.
 * Returns a cleanup function to wait for deferred tasks.
 */
export function createDeferredInit(): {
  defer: (name: string, fn: () => Promise<void>) => void;
  waitForAll: () => Promise<void>;
} {
  const tasks: Array<Promise<void>> = [];
  const taskNames: string[] = [];

  return {
    defer: (name: string, fn: () => Promise<void>) => {
      taskNames.push(name);
      tasks.push(
        fn().catch((err) => {
          log.warn({ task: name, error: String(err) }, '⚠️ Deferred task failed');
        })
      );
    },
    waitForAll: async () => {
      if (tasks.length > 0) {
        log.debug({ tasks: taskNames }, '⏳ Waiting for deferred tasks...');
        await Promise.allSettled(tasks);
        log.debug({ count: tasks.length }, '✅ Deferred tasks complete');
      }
    },
  };
}

// ============================================================================
// METRICS
// ============================================================================

/**
 * Get fast-join metrics for monitoring.
 */
export function getFastJoinMetrics(): FastJoinMetrics {
  const avgAcquireTime =
    metrics.acquireTimes.length > 0
      ? metrics.acquireTimes.reduce((a, b) => a + b, 0) / metrics.acquireTimes.length
      : 0;

  return {
    poolSize: warmSessionPool.filter((s) => !s.inUse).length,
    inUse: warmSessionPool.filter((s) => s.inUse).length,
    totalCreated: metrics.totalCreated,
    totalReused: metrics.totalReused,
    avgAcquireTimeMs: Math.round(avgAcquireTime),
    greetingsCached: greetingCache.size,
  };
}

/**
 * Check if fast-join is ready.
 */
export function isFastJoinReady(): boolean {
  return isInitialized;
}

/**
 * Reset fast-join state (for testing).
 */
export function resetFastJoin(): void {
  warmSessionPool.length = 0;
  greetingCache.clear();
  metrics = { totalCreated: 0, totalReused: 0, acquireTimes: [] };
  isInitialized = false;
  isInitializing = false;
}
