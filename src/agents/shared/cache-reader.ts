/**
 * Lightweight Cache File Reader for Child Processes
 *
 * ZERO DEPENDENCIES - uses only Node.js built-ins (fs, no imports).
 * This is used by child processes to read pre-warmed persona configs
 * written by the main process.
 *
 * For main process cache management (writing, warmup), use resource-server.ts.
 *
 * @module cache-reader
 */

import * as fs from 'fs';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CACHE_DIR = process.env.CACHE_DIR || '/tmp/ferni-cache';
const PERSONA_CACHE_FILE = `${CACHE_DIR}/persona-configs.json`;
const WARMUP_STATUS_FILE = `${CACHE_DIR}/warmup-status.json`;

// Cache validity duration (10 minutes)
const CACHE_MAX_AGE_MS = 10 * 60 * 1000;

// ============================================================================
// TYPES
// ============================================================================

export interface PersonaCacheEntry {
  name: string;
  systemPrompt: string;
  voice: {
    voiceId: string;
    provider: string;
  };
  personality?: {
    warmth?: number;
    humorLevel?: number;
    directness?: number;
    energy?: number;
  };
  speechCharacteristics?: {
    baseSpeedMultiplier?: number;
    pauseMultiplier?: number;
  };
}

interface WarmupStatus {
  warmedUp: boolean;
  timestamp: number;
  personaCount?: number;
}

// ============================================================================
// IN-MEMORY CACHE (avoid repeated file reads)
// ============================================================================

let _personaCache: Record<string, PersonaCacheEntry> | null = null;
let _cacheLoadedAt: number = 0;

/**
 * Load and cache persona configs from file.
 * Returns cached version if already loaded within this process.
 */
function loadPersonaCache(): Record<string, PersonaCacheEntry> | null {
  // Return in-memory cache if still valid
  if (_personaCache && Date.now() - _cacheLoadedAt < CACHE_MAX_AGE_MS) {
    return _personaCache;
  }

  try {
    if (fs.existsSync(PERSONA_CACHE_FILE)) {
      const data = fs.readFileSync(PERSONA_CACHE_FILE, 'utf-8');
      _personaCache = JSON.parse(data) as Record<string, PersonaCacheEntry>;
      _cacheLoadedAt = Date.now();
      return _personaCache;
    }
  } catch {
    // File read or parse error - return null
  }

  return null;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if main process has finished warming up.
 * Validates that the cache file exists and is recent.
 */
export function isMainProcessWarmedUp(): boolean {
  try {
    if (!fs.existsSync(WARMUP_STATUS_FILE)) {
      return false;
    }

    const data = fs.readFileSync(WARMUP_STATUS_FILE, 'utf-8');
    const status = JSON.parse(data) as WarmupStatus;

    // Check if cache is recent
    const cacheAge = Date.now() - status.timestamp;
    if (cacheAge >= CACHE_MAX_AGE_MS) {
      process.stderr.write(
        `[cache-reader] Cache too old: ${Math.round(cacheAge / 1000)}s (max ${CACHE_MAX_AGE_MS / 1000}s)\n`
      );
      return false;
    }

    return status.warmedUp === true;
  } catch {
    return false;
  }
}

/**
 * Get persona config from cache.
 * Returns null if cache miss or not warmed up.
 */
export function getPersonaConfig(personaId: string): PersonaCacheEntry | null {
  const cache = loadPersonaCache();
  if (!cache) {
    return null;
  }

  const config = cache[personaId];
  if (config) {
    process.stderr.write(`[cache-reader] ✅ Cache hit for persona: ${personaId}\n`);
    return config;
  }

  process.stderr.write(`[cache-reader] Cache miss for persona: ${personaId}\n`);
  return null;
}

/**
 * Get system prompt from cache.
 * Returns null if cache miss.
 */
export function getSystemPrompt(personaId: string): string | null {
  const config = getPersonaConfig(personaId);
  return config?.systemPrompt ?? null;
}

/**
 * Get voice config from cache.
 * Returns null if cache miss.
 */
export function getVoiceConfig(personaId: string): { voiceId: string; provider: string } | null {
  const config = getPersonaConfig(personaId);
  return config?.voice ?? null;
}

/**
 * Get all cached persona IDs.
 */
export function getCachedPersonaIds(): string[] {
  const cache = loadPersonaCache();
  return cache ? Object.keys(cache) : [];
}

/**
 * Get cache statistics for debugging.
 */
export function getCacheStats(): {
  isWarmedUp: boolean;
  personaCount: number;
  cacheAgeMs: number | null;
  cachedIds: string[];
} {
  const cache = loadPersonaCache();
  const cachedIds = cache ? Object.keys(cache) : [];

  let cacheAgeMs: number | null = null;
  try {
    if (fs.existsSync(WARMUP_STATUS_FILE)) {
      const data = fs.readFileSync(WARMUP_STATUS_FILE, 'utf-8');
      const status = JSON.parse(data) as WarmupStatus;
      cacheAgeMs = Date.now() - status.timestamp;
    }
  } catch {
    // Ignore errors
  }

  return {
    isWarmedUp: isMainProcessWarmedUp(),
    personaCount: cachedIds.length,
    cacheAgeMs,
    cachedIds,
  };
}

/**
 * Clear in-memory cache (useful for testing or forcing reload).
 */
export function clearMemoryCache(): void {
  _personaCache = null;
  _cacheLoadedAt = 0;
}

