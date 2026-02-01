/**
 * Unified TTS Cache Service
 *
 * Implements ITTSCache with an LRU cache and optional delegation to
 * existing cache implementations (greeting, conversational, speculative).
 *
 * This lives in the services layer to maintain proper architecture.
 * The gateway depends on this interface, not concrete implementations.
 *
 * @module services/tts/tts-cache
 */

import { LRUCache } from 'lru-cache';
import type {
  ITTSCache,
  CacheEntry,
  CacheStats,
  SSMLProsodyConfig,
} from '../../speech/tts-gateway/types.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'TTSCache' });

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default maximum cache entries */
const DEFAULT_MAX_ENTRIES = 500;

// ============================================================================
// JSON FUNCTION CALL FILTERING
// ============================================================================

/**
 * Check if text looks like a JSON function call that should NOT be cached.
 *
 * FIX (Jan 2026): Prevents caching audio for tool call leakage.
 * When LLM outputs `{"fn":"getNews"}` instead of speaking, we were
 * caching the audio for this gibberish, causing repeated playback.
 */
function isJsonFunctionCall(text: string): boolean {
  const trimmed = text.trim();

  // Empty or very short - not a function call
  if (trimmed.length < 5) {
    return false;
  }

  // Check for JSON function call patterns
  // Complete or partial JSON: `{"fn":"...
  if (/^\s*`?\s*\{\s*["']?fn["']?\s*:/i.test(trimmed)) {
    return true;
  }

  // Backtick-wrapped JSON start
  if (trimmed.startsWith('`{') || trimmed.startsWith('` {')) {
    return true;
  }

  return false;
}

/** Default TTL in milliseconds (30 minutes) */
const DEFAULT_TTL_MS = 30 * 60 * 1000;

/** Maximum audio size to cache (5MB) */
const MAX_AUDIO_SIZE_BYTES = 5 * 1024 * 1024;

// ============================================================================
// CACHE IMPLEMENTATION
// ============================================================================

/**
 * TTS Cache configuration
 */
export interface TTSCacheConfig {
  /** Maximum cache entries */
  maxEntries?: number;
  /** TTL in milliseconds */
  ttlMs?: number;
  /** Maximum audio size to cache in bytes */
  maxAudioSizeBytes?: number;
}

/**
 * Unified TTS Cache implementation
 *
 * Uses an LRU cache with configurable size and TTL.
 */
export class TTSCache implements ITTSCache {
  private readonly cache: LRUCache<string, CacheEntry>;
  private readonly maxAudioSizeBytes: number;

  // Statistics
  private lookups = 0;
  private hits = 0;
  private misses = 0;

  constructor(config: TTSCacheConfig = {}) {
    const maxEntries = config.maxEntries ?? DEFAULT_MAX_ENTRIES;
    const ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
    this.maxAudioSizeBytes = config.maxAudioSizeBytes ?? MAX_AUDIO_SIZE_BYTES;

    this.cache = new LRUCache<string, CacheEntry>({
      max: maxEntries,
      ttl: ttlMs,
      // Size calculation for memory tracking
      sizeCalculation: (entry) => {
        // Approximate memory: audio buffer + metadata
        return entry.audio.byteLength + 200;
      },
      maxSize: this.maxAudioSizeBytes * 2, // Allow some overhead
    });

    log.info(
      { maxEntries, ttlMs, maxAudioSizeBytes: this.maxAudioSizeBytes },
      'TTS Cache initialized'
    );
  }

  /**
   * Look up cached audio
   */
  async get(
    text: string,
    voiceId: string,
    prosody?: SSMLProsodyConfig
  ): Promise<CacheEntry | null> {
    this.lookups++;

    // FIX (Jan 2026): Don't return cached JSON function calls
    // These are tool call leakage and should NEVER be spoken
    // Also delete any existing cached entries for these
    if (isJsonFunctionCall(text)) {
      const key = this.buildCacheKey(text, voiceId, prosody);
      if (this.cache.has(key)) {
        log.warn(
          { text: text.slice(0, 50) },
          '🚫 TTS Cache: Deleting cached JSON function call (legacy entry)'
        );
        this.cache.delete(key);
      }
      this.misses++;
      return null;
    }

    const key = this.buildCacheKey(text, voiceId, prosody);
    const entry = this.cache.get(key);

    if (entry) {
      this.hits++;
      entry.hitCount++;

      log.debug(
        {
          text: text.slice(0, 50),
          voiceId: voiceId.slice(0, 8),
          hitCount: entry.hitCount,
        },
        '🎯 TTS Cache HIT'
      );

      return entry;
    }

    this.misses++;
    log.debug(
      {
        text: text.slice(0, 50),
        voiceId: voiceId.slice(0, 8),
      },
      '❌ TTS Cache MISS'
    );

    return null;
  }

  /**
   * Store audio in cache
   */
  async set(
    text: string,
    voiceId: string,
    audio: ArrayBuffer,
    durationMs: number,
    prosody?: SSMLProsodyConfig
  ): Promise<void> {
    // FIX (Jan 2026): Don't cache JSON function calls
    // These are tool call leakage and should NEVER be spoken or cached
    if (isJsonFunctionCall(text)) {
      log.warn({ text: text.slice(0, 50) }, '🚫 TTS Cache: Refusing to cache JSON function call');
      return;
    }

    // Don't cache very large audio
    if (audio.byteLength > this.maxAudioSizeBytes) {
      log.debug(
        {
          audioBytes: audio.byteLength,
          maxBytes: this.maxAudioSizeBytes,
          text: text.slice(0, 50),
        },
        'Audio too large to cache'
      );
      return;
    }

    // Don't cache empty audio
    if (audio.byteLength === 0) {
      return;
    }

    const key = this.buildCacheKey(text, voiceId, prosody);
    const entry: CacheEntry = {
      audio,
      durationMs,
      createdAt: Date.now(),
      voiceId,
      prosody,
      hitCount: 0,
    };

    this.cache.set(key, entry);

    log.debug(
      {
        text: text.slice(0, 50),
        voiceId: voiceId.slice(0, 8),
        audioBytes: audio.byteLength,
        durationMs,
      },
      '💾 TTS Cache SET'
    );
  }

  /**
   * Check if text is cached
   */
  async has(text: string, voiceId: string, prosody?: SSMLProsodyConfig): Promise<boolean> {
    const key = this.buildCacheKey(text, voiceId, prosody);
    return this.cache.has(key);
  }

  /**
   * Delete specific entry
   */
  async delete(text: string, voiceId: string, prosody?: SSMLProsodyConfig): Promise<void> {
    const key = this.buildCacheKey(text, voiceId, prosody);
    this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.lookups = 0;
    this.hits = 0;
    this.misses = 0;
    log.info({}, 'TTS Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    let memoryBytes = 0;
    for (const entry of this.cache.values()) {
      memoryBytes += entry.audio.byteLength;
    }

    return {
      size: this.cache.size,
      lookups: this.lookups,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.lookups > 0 ? this.hits / this.lookups : 0,
      memoryBytes,
    };
  }

  /**
   * Build cache key from parameters
   *
   * Key format: `${voiceId}:${prosodyHash}:${normalizedText}`
   *
   * The prosody hash ensures different prosody configs get different entries.
   */
  private buildCacheKey(text: string, voiceId: string, prosody?: SSMLProsodyConfig): string {
    // Normalize text: lowercase, collapse whitespace
    const normalizedText = text.toLowerCase().replace(/\s+/g, ' ').trim();

    // Create prosody hash (simple string representation)
    let prosodyHash = 'default';
    if (prosody) {
      const parts: string[] = [];
      if (prosody.speed !== undefined) parts.push(`s${prosody.speed}`);
      if (prosody.volume !== undefined) parts.push(`v${prosody.volume}`);
      if (prosody.emotion) parts.push(`e${prosody.emotion}`);
      if (prosody.emotionIntensity !== undefined) parts.push(`i${prosody.emotionIntensity}`);
      if (parts.length > 0) {
        prosodyHash = parts.join('_');
      }
    }

    return `${voiceId}:${prosodyHash}:${normalizedText}`;
  }
}

// ============================================================================
// DELEGATING CACHE (Bridges to existing caches)
// ============================================================================

/**
 * Delegating TTS Cache
 *
 * Wraps the primary cache and checks existing caches on miss.
 * This provides backward compatibility while migrating to the new architecture.
 */
export class DelegatingTTSCache implements ITTSCache {
  private readonly primaryCache: TTSCache;
  private readonly legacyCacheLookup?: (
    text: string,
    voiceId: string
  ) => Promise<{ audio: ArrayBuffer; durationMs: number } | null>;

  constructor(
    config: TTSCacheConfig = {},
    legacyCacheLookup?: (
      text: string,
      voiceId: string
    ) => Promise<{ audio: ArrayBuffer; durationMs: number } | null>
  ) {
    this.primaryCache = new TTSCache(config);
    this.legacyCacheLookup = legacyCacheLookup;
  }

  async get(
    text: string,
    voiceId: string,
    prosody?: SSMLProsodyConfig
  ): Promise<CacheEntry | null> {
    // Try primary cache first
    const primaryResult = await this.primaryCache.get(text, voiceId, prosody);
    if (primaryResult) {
      return primaryResult;
    }

    // Try legacy cache if provided (without prosody since legacy doesn't support it)
    if (this.legacyCacheLookup && !prosody) {
      try {
        const legacyResult = await this.legacyCacheLookup(text, voiceId);
        if (legacyResult) {
          // Store in primary cache for future lookups
          await this.primaryCache.set(text, voiceId, legacyResult.audio, legacyResult.durationMs);

          return {
            audio: legacyResult.audio,
            durationMs: legacyResult.durationMs,
            createdAt: Date.now(),
            voiceId,
            hitCount: 1,
          };
        }
      } catch (error) {
        log.warn({ error: String(error) }, 'Legacy cache lookup failed');
      }
    }

    return null;
  }

  async set(
    text: string,
    voiceId: string,
    audio: ArrayBuffer,
    durationMs: number,
    prosody?: SSMLProsodyConfig
  ): Promise<void> {
    return this.primaryCache.set(text, voiceId, audio, durationMs, prosody);
  }

  async has(text: string, voiceId: string, prosody?: SSMLProsodyConfig): Promise<boolean> {
    return this.primaryCache.has(text, voiceId, prosody);
  }

  async delete(text: string, voiceId: string, prosody?: SSMLProsodyConfig): Promise<void> {
    return this.primaryCache.delete(text, voiceId, prosody);
  }

  async clear(): Promise<void> {
    return this.primaryCache.clear();
  }

  getStats(): CacheStats {
    return this.primaryCache.getStats();
  }
}

// ============================================================================
// FACTORY & SINGLETON
// ============================================================================

let cacheInstance: ITTSCache | null = null;

/**
 * Get the singleton TTS cache instance
 */
export function getTTSCache(): ITTSCache {
  if (!cacheInstance) {
    cacheInstance = new TTSCache();
  }
  return cacheInstance;
}

/**
 * Create a new TTS cache instance
 */
export function createTTSCache(config?: TTSCacheConfig): ITTSCache {
  return new TTSCache(config);
}

/**
 * Create a delegating TTS cache with legacy support
 */
export function createDelegatingTTSCache(
  config?: TTSCacheConfig,
  legacyCacheLookup?: (
    text: string,
    voiceId: string
  ) => Promise<{ audio: ArrayBuffer; durationMs: number } | null>
): ITTSCache {
  return new DelegatingTTSCache(config, legacyCacheLookup);
}

/**
 * Set the global cache instance (for DI)
 */
export function setTTSCache(cache: ITTSCache): void {
  cacheInstance = cache;
}
