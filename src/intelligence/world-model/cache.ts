/**
 * 60s in-process cache for world-model snapshots (h-uman W9 TTL).
 *
 * @module intelligence/world-model/cache
 */

import type { WorldModelSnapshot } from './types.js';

export const WORLD_MODEL_CACHE_TTL_MS = 60_000;

interface CacheEntry {
  snapshot: WorldModelSnapshot;
  expiresAtMs: number;
}

const cache = new Map<string, CacheEntry>();

export function worldModelCacheKey(userId: string, sessionId?: string): string {
  return sessionId ? `${userId}:${sessionId}` : userId;
}

export function getCachedWorldModel(
  userId: string,
  sessionId?: string,
  nowMs: number = Date.now()
): WorldModelSnapshot | null {
  const key = worldModelCacheKey(userId, sessionId);
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }
  if (entry.expiresAtMs <= nowMs) {
    cache.delete(key);
    return null;
  }
  return entry.snapshot;
}

export function setCachedWorldModel(
  snapshot: WorldModelSnapshot,
  sessionId?: string,
  nowMs: number = Date.now()
): void {
  const key = worldModelCacheKey(snapshot.userId, sessionId);
  cache.set(key, {
    snapshot,
    expiresAtMs: nowMs + WORLD_MODEL_CACHE_TTL_MS,
  });
}

export function resetWorldModelCacheForTests(): void {
  cache.clear();
}
