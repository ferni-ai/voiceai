/**
 * Tests for TTS Decoder State Cache
 *
 * Covers: basic CRUD, TTL expiry, LRU eviction, hit rate tracking,
 * withDecoderState helper flow, concurrent access, and cleanup timer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DecoderStateCache,
  getDecoderStateCache,
  resetDecoderStateCache,
  withDecoderState,
} from '../decoder-state-cache.js';
import type { DecoderState } from '../decoder-state-cache.js';

// ============================================================================
// HELPERS
// ============================================================================

function makeState(overrides: Partial<DecoderState> = {}): DecoderState {
  return {
    data: Buffer.from('test-decoder-state'),
    voiceId: 'ferni',
    updatedAt: Date.now(),
    turnCount: 1,
    ...overrides,
  };
}

// ============================================================================
// BASIC GET / SET / CLEAR
// ============================================================================

describe('DecoderStateCache', () => {
  let cache: DecoderStateCache;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new DecoderStateCache(30_000, 100);
  });

  afterEach(() => {
    cache.dispose();
    vi.useRealTimers();
  });

  it('returns undefined for unknown session', () => {
    expect(cache.getLastState('unknown-session')).toBeUndefined();
  });

  it('stores and retrieves decoder state', () => {
    const state = makeState();
    cache.updateState('session-1', state);

    const retrieved = cache.getLastState('session-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.voiceId).toBe('ferni');
    expect(retrieved!.data.toString()).toBe('test-decoder-state');
  });

  it('clears a specific session', () => {
    cache.updateState('session-1', makeState());
    cache.updateState('session-2', makeState());

    cache.clearSession('session-1');

    expect(cache.getLastState('session-1')).toBeUndefined();
    expect(cache.getLastState('session-2')).toBeDefined();
  });

  it('updates existing session state in-place', () => {
    cache.updateState('session-1', makeState({ turnCount: 1 }));
    cache.updateState('session-1', makeState({ turnCount: 5 }));

    const retrieved = cache.getLastState('session-1');
    expect(retrieved!.turnCount).toBe(5);
    expect(cache.getStats().sessions).toBe(1);
  });

  // ============================================================================
  // TTL EXPIRY
  // ============================================================================

  it('expires entries after TTL', () => {
    cache.updateState('session-1', makeState());

    // Advance past TTL
    vi.advanceTimersByTime(31_000);

    expect(cache.getLastState('session-1')).toBeUndefined();
  });

  it('does not expire entries within TTL', () => {
    cache.updateState('session-1', makeState());

    vi.advanceTimersByTime(20_000);

    expect(cache.getLastState('session-1')).toBeDefined();
  });

  // ============================================================================
  // LRU EVICTION
  // ============================================================================

  it('evicts LRU entry when capacity is reached', () => {
    const smallCache = new DecoderStateCache(30_000, 3);

    smallCache.updateState('s1', makeState());
    smallCache.updateState('s2', makeState());
    smallCache.updateState('s3', makeState());
    // s1 is oldest — should be evicted
    smallCache.updateState('s4', makeState());

    expect(smallCache.getLastState('s1')).toBeUndefined();
    expect(smallCache.getLastState('s2')).toBeDefined();
    expect(smallCache.getLastState('s4')).toBeDefined();
    expect(smallCache.getStats().sessions).toBe(3);

    smallCache.dispose();
  });

  it('refreshes LRU order on access', () => {
    const smallCache = new DecoderStateCache(30_000, 3);

    smallCache.updateState('s1', makeState());
    smallCache.updateState('s2', makeState());
    smallCache.updateState('s3', makeState());

    // Access s1 to make it recently used
    smallCache.getLastState('s1');

    // s2 is now oldest — should be evicted
    smallCache.updateState('s4', makeState());

    expect(smallCache.getLastState('s1')).toBeDefined();
    expect(smallCache.getLastState('s2')).toBeUndefined();

    smallCache.dispose();
  });

  // ============================================================================
  // HIT RATE TRACKING
  // ============================================================================

  it('tracks hit and miss rates', () => {
    cache.updateState('session-1', makeState());

    cache.getLastState('session-1'); // hit
    cache.getLastState('session-1'); // hit
    cache.getLastState('unknown');   // miss

    const stats = cache.getStats();
    expect(stats.totalHits).toBe(2);
    expect(stats.totalLookups).toBe(3);
    expect(stats.hitRate).toBeCloseTo(2 / 3);
  });

  it('reports 0 hit rate when no lookups', () => {
    expect(cache.getStats().hitRate).toBe(0);
  });

  // ============================================================================
  // STATS
  // ============================================================================

  it('reports total size in bytes', () => {
    const buf1 = Buffer.alloc(1024);
    const buf2 = Buffer.alloc(2048);

    cache.updateState('s1', makeState({ data: buf1 }));
    cache.updateState('s2', makeState({ data: buf2 }));

    const stats = cache.getStats();
    expect(stats.sessions).toBe(2);
    expect(stats.totalSizeBytes).toBe(3072);
  });

  // ============================================================================
  // CLEANUP TIMER
  // ============================================================================

  it('periodic cleanup removes expired entries', () => {
    cache.updateState('s1', makeState());

    // Advance past TTL + one cleanup interval
    vi.advanceTimersByTime(31_000 + 10_000);

    // Entry should have been removed by cleanup sweep
    expect(cache.getStats().sessions).toBe(0);
  });

  it('cleanup only removes expired, not active entries', () => {
    cache.updateState('s1', makeState());

    // Advance to just before TTL + trigger cleanup
    vi.advanceTimersByTime(10_000);

    expect(cache.getStats().sessions).toBe(1);
  });

  // ============================================================================
  // CONCURRENT ACCESS SAFETY
  // ============================================================================

  it('handles rapid concurrent updates to the same session', () => {
    for (let i = 0; i < 50; i++) {
      cache.updateState('session-1', makeState({ turnCount: i }));
    }

    const state = cache.getLastState('session-1');
    expect(state).toBeDefined();
    expect(state!.turnCount).toBe(49);
    expect(cache.getStats().sessions).toBe(1);
  });

  it('handles interleaved get/set across many sessions', () => {
    for (let i = 0; i < 50; i++) {
      cache.updateState(`s-${i}`, makeState({ turnCount: i }));
      if (i > 0) {
        expect(cache.getLastState(`s-${i - 1}`)).toBeDefined();
      }
    }

    expect(cache.getStats().sessions).toBe(50);
  });
});

// ============================================================================
// withDecoderState HELPER
// ============================================================================

describe('withDecoderState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetDecoderStateCache();
  });

  afterEach(() => {
    resetDecoderStateCache();
    vi.useRealTimers();
  });

  it('passes undefined state on first call for a session', async () => {
    const audio = Buffer.from('audio-data');

    const result = await withDecoderState('session-1', 'ferni', async (state) => {
      expect(state).toBeUndefined();
      return { audio };
    });

    expect(result).toBe(audio);
  });

  it('stores new state and passes it on subsequent calls', async () => {
    const newState = Buffer.from('decoder-hidden-state');
    const audio = Buffer.from('audio-data');

    // First call — returns new state
    await withDecoderState('session-1', 'ferni', async () => {
      return { audio, newState };
    });

    // Second call — should receive the stored state
    await withDecoderState('session-1', 'ferni', async (state) => {
      expect(state).toBeDefined();
      expect(state!.toString()).toBe('decoder-hidden-state');
      return { audio };
    });
  });

  it('increments turnCount on successive updates', async () => {
    const audio = Buffer.from('audio');
    const newState = Buffer.from('state');

    await withDecoderState('session-1', 'ferni', async () => ({ audio, newState }));
    await withDecoderState('session-1', 'ferni', async () => ({ audio, newState }));
    await withDecoderState('session-1', 'ferni', async () => ({ audio, newState }));

    const cache = getDecoderStateCache();
    const entry = cache.getLastState('session-1');
    expect(entry!.turnCount).toBe(3);
  });

  it('does not reuse state if voice changed', async () => {
    const audio = Buffer.from('audio');
    const newState = Buffer.from('ferni-state');

    // First call with voice "ferni"
    await withDecoderState('session-1', 'ferni', async () => ({ audio, newState }));

    // Second call with different voice — should NOT get ferni's state
    await withDecoderState('session-1', 'maya', async (state) => {
      expect(state).toBeUndefined();
      return { audio };
    });
  });

  it('does not store state when newState is not returned', async () => {
    const audio = Buffer.from('audio');

    await withDecoderState('session-1', 'ferni', async () => ({ audio }));

    const cache = getDecoderStateCache();
    expect(cache.getLastState('session-1')).toBeUndefined();
  });

  it('does not store empty buffer as state', async () => {
    const audio = Buffer.from('audio');
    const emptyState = Buffer.alloc(0);

    await withDecoderState('session-1', 'ferni', async () => ({ audio, newState: emptyState }));

    const cache = getDecoderStateCache();
    // The miss from getLastState above counts, but the point is no entry was stored
    expect(cache.getStats().sessions).toBe(0);
  });
});

// ============================================================================
// SINGLETON
// ============================================================================

describe('getDecoderStateCache singleton', () => {
  afterEach(() => {
    resetDecoderStateCache();
  });

  it('returns the same instance on repeated calls', () => {
    const a = getDecoderStateCache();
    const b = getDecoderStateCache();
    expect(a).toBe(b);
  });

  it('returns a fresh instance after reset', () => {
    const a = getDecoderStateCache();
    resetDecoderStateCache();
    const b = getDecoderStateCache();
    expect(a).not.toBe(b);
  });
});
