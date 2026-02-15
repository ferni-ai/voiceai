/**
 * TTS Decoder State Cache
 *
 * Stores TTS decoder hidden state per session so voice continuity
 * is preserved across conversation turns. When the Rust TTS server
 * supports state export, this cache feeds the previous turn's decoder
 * state back into the next synthesis request — eliminating the cold-start
 * penalty and keeping prosody/timbre consistent.
 *
 * Design:
 * - LRU eviction when capacity is reached (100 sessions)
 * - 30s TTL (stale decoder state is worse than no state)
 * - Periodic cleanup every 10s to remove expired entries
 * - Hit/miss tracking for observability
 *
 * @module speech/tts-gateway/decoder-state-cache
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'DecoderStateCache' });

// ============================================================================
// TYPES
// ============================================================================

export interface DecoderState {
  /** Opaque decoder hidden state from the Rust TTS server */
  data: Buffer;
  /** Voice ID this state was generated with */
  voiceId: string;
  /** Timestamp of last update */
  updatedAt: number;
  /** Number of turns this state has been carried through */
  turnCount: number;
}

export interface DecoderStateCacheStats {
  /** Number of active sessions in cache */
  sessions: number;
  /** Total memory used by cached state buffers */
  totalSizeBytes: number;
  /** Cache hit rate (0-1) */
  hitRate: number;
  /** Total lookups */
  totalLookups: number;
  /** Total hits */
  totalHits: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_TTL_MS = 30_000;
const DEFAULT_MAX_ENTRIES = 100;
const CLEANUP_INTERVAL_MS = 10_000;

// ============================================================================
// CACHE IMPLEMENTATION
// ============================================================================

export class DecoderStateCache {
  private readonly cache = new Map<string, DecoderState>();
  private readonly accessOrder: string[] = [];
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private hits = 0;
  private misses = 0;
  private disposed = false;

  constructor(ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.startCleanup();
  }

  /**
   * Retrieve the last decoder state for a session.
   * Returns undefined if no state exists, the voice changed, or TTL expired.
   */
  getLastState(sessionId: string): DecoderState | undefined {
    const entry = this.cache.get(sessionId);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (Date.now() - entry.updatedAt > this.ttlMs) {
      this.cache.delete(sessionId);
      this.removeFromAccessOrder(sessionId);
      this.misses++;
      log.debug({ sessionId }, 'Decoder state expired (TTL)');
      return undefined;
    }

    this.hits++;
    this.touchAccessOrder(sessionId);
    return entry;
  }

  /**
   * Store or update decoder state for a session.
   * Evicts LRU entry if cache is at capacity and this is a new entry.
   */
  updateState(sessionId: string, state: DecoderState): void {
    const isUpdate = this.cache.has(sessionId);
    if (!isUpdate && this.cache.size >= this.maxEntries) {
      this.evictLRU();
    }

    this.cache.set(sessionId, state);
    this.touchAccessOrder(sessionId);

    log.debug(
      { sessionId, voiceId: state.voiceId, turnCount: state.turnCount, bytes: state.data.byteLength },
      'Decoder state cached'
    );
  }

  /** Remove all state for a session (e.g., on session end). */
  clearSession(sessionId: string): void {
    this.cache.delete(sessionId);
    this.removeFromAccessOrder(sessionId);
  }

  /** Observability stats snapshot. */
  getStats(): DecoderStateCacheStats {
    let totalSizeBytes = 0;
    this.cache.forEach((entry) => {
      totalSizeBytes += entry.data.byteLength;
    });

    const totalLookups = this.hits + this.misses;
    return {
      sessions: this.cache.size,
      totalSizeBytes,
      hitRate: totalLookups > 0 ? this.hits / totalLookups : 0,
      totalLookups,
      totalHits: this.hits,
    };
  }

  /** Stop the periodic cleanup timer and clear all state. */
  dispose(): void {
    this.disposed = true;
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
    this.accessOrder.length = 0;
    log.debug({}, 'DecoderStateCache disposed');
  }

  // ---------- LRU helpers ----------

  private touchAccessOrder(sessionId: string): void {
    this.removeFromAccessOrder(sessionId);
    this.accessOrder.push(sessionId);
  }

  private removeFromAccessOrder(sessionId: string): void {
    const idx = this.accessOrder.indexOf(sessionId);
    if (idx !== -1) this.accessOrder.splice(idx, 1);
  }

  private evictLRU(): void {
    const oldest = this.accessOrder.shift();
    if (oldest) {
      this.cache.delete(oldest);
      log.debug({ sessionId: oldest }, 'Evicted LRU decoder state');
    }
  }

  // ---------- TTL cleanup ----------

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      if (this.disposed) return;
      const now = Date.now();
      let removed = 0;

      const toRemove: string[] = [];
      this.cache.forEach((entry, sessionId) => {
        if (now - entry.updatedAt > this.ttlMs) {
          toRemove.push(sessionId);
        }
      });
      for (const sessionId of toRemove) {
        this.cache.delete(sessionId);
        this.removeFromAccessOrder(sessionId);
        removed++;
      }

      if (removed > 0) {
        log.debug({ removed, remaining: this.cache.size }, 'Decoder state cleanup sweep');
      }
    }, CLEANUP_INTERVAL_MS);

    // Don't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }
}

// ============================================================================
// INTEGRATION HELPER
// ============================================================================

/**
 * Higher-order helper that wraps a TTS request with decoder state management.
 *
 * 1. Looks up cached decoder state for the session
 * 2. Passes it into the caller-provided request function
 * 3. Stores any new state returned by the server
 * 4. Returns the synthesized audio
 *
 * This is the plug-in point for when the Rust TTS server adds state export.
 */
export async function withDecoderState(
  sessionId: string,
  voiceId: string,
  requestFn: (state?: Buffer) => Promise<{ audio: Buffer; newState?: Buffer }>
): Promise<Buffer> {
  const cache = getDecoderStateCache();
  const existing = cache.getLastState(sessionId);

  // Only reuse state if the voice hasn't changed
  const priorState = existing && existing.voiceId === voiceId ? existing.data : undefined;

  const { audio, newState } = await requestFn(priorState);

  if (newState && newState.byteLength > 0) {
    cache.updateState(sessionId, {
      data: newState,
      voiceId,
      updatedAt: Date.now(),
      turnCount: (existing?.turnCount ?? 0) + 1,
    });
  }

  return audio;
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: DecoderStateCache | null = null;

/** Get the singleton DecoderStateCache instance. */
export function getDecoderStateCache(): DecoderStateCache {
  if (!instance) {
    instance = new DecoderStateCache();
    log.info({}, 'DecoderStateCache initialized');
  }
  return instance;
}

/** Reset singleton (for tests). */
export function resetDecoderStateCache(): void {
  if (instance) {
    instance.dispose();
    instance = null;
  }
}
