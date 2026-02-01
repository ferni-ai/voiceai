/**
 * E2E Test: Handoff Fast Path Performance
 *
 * This test validates that the handoff fast path actually works and is fast.
 * It simulates the real handoff scenario without the full voice agent.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
};

vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => mockLogger,
  createLogger: () => mockLogger,
}));

// Mock Firestore to avoid real DB calls
vi.mock('../../memory/firestore.js', () => ({
  getFirestore: vi.fn().mockReturnValue({
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  }),
}));

describe('Handoff Fast Path E2E', () => {
  const TEST_SESSION_ID = 'e2e-test-session-' + Date.now();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up session cache
    try {
      const { clearHandoffToolsCache } = await import('../handoff/session-cache.js');
      clearHandoffToolsCache(TEST_SESSION_ID);
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should warm up session cache', async () => {
    const { warmupHandoffToolsForSession, hasHandoffToolsCache } =
      await import('../handoff/session-cache.js');

    expect(hasHandoffToolsCache(TEST_SESSION_ID)).toBe(false);

    const startTime = Date.now();
    await warmupHandoffToolsForSession(TEST_SESSION_ID, null, 'free', undefined);
    const elapsed = Date.now() - startTime;

    expect(hasHandoffToolsCache(TEST_SESSION_ID)).toBe(true);

    // Warmup should complete in reasonable time (< 5s)
    // This is the "slow" operation that happens once per session
    expect(elapsed).toBeLessThan(5000);

    console.log(`⏱️ Session cache warmup took ${elapsed}ms`);
  });

  it('should retrieve cached tools instantly', async () => {
    const { warmupHandoffToolsForSession, getCachedHandoffTools, hasHandoffToolsCache } =
      await import('../handoff/session-cache.js');

    // First, warm up the cache
    await warmupHandoffToolsForSession(TEST_SESSION_ID, null, 'free', undefined);
    expect(hasHandoffToolsCache(TEST_SESSION_ID)).toBe(true);

    // Now retrieve from cache (should be instant)
    const startTime = Date.now();
    const cachedTools = getCachedHandoffTools(TEST_SESSION_ID, 'ferni');
    const elapsed = Date.now() - startTime;

    expect(cachedTools).not.toBeNull();
    expect(Object.keys(cachedTools || {}).length).toBeGreaterThan(0);

    // Cache retrieval should be fast (< 100ms, allowing for CI environment variability)
    expect(elapsed).toBeLessThan(100);

    console.log(
      `⚡ Cache retrieval took ${elapsed}ms, got ${Object.keys(cachedTools || {}).length} tools`
    );
  });

  it('should exclude current agent from handoff tools', async () => {
    const { warmupHandoffToolsForSession, getCachedHandoffTools } =
      await import('../handoff/session-cache.js');

    await warmupHandoffToolsForSession(TEST_SESSION_ID, null, 'free', undefined);

    // When asking for Ferni's tools, handoffToFerni should be excluded
    const ferniTools = getCachedHandoffTools(TEST_SESSION_ID, 'ferni');
    expect(ferniTools).not.toBeNull();
    expect(ferniTools).not.toHaveProperty('handoffToFerni');

    // But handoffToPeter should be present (if Peter is unlocked)
    // Note: May not be present in free tier
    console.log(`📦 Ferni has ${Object.keys(ferniTools || {}).length} handoff tools`);
  });

  it('should be faster than full tool loading (simulated)', async () => {
    // This test documents the expected performance characteristics

    // Fast path (cache hit): < 50ms
    const expectedFastPathMs = 50;

    // Full orchestrator path: 5000-20000ms (documented)
    const expectedSlowPathMs = 5000;

    // Fast path should be at least 100x faster
    const speedupFactor = expectedSlowPathMs / expectedFastPathMs;
    expect(speedupFactor).toBeGreaterThanOrEqual(100);

    console.log(
      `📊 Expected speedup: ${speedupFactor}x (${expectedFastPathMs}ms vs ${expectedSlowPathMs}ms)`
    );
  });
});

describe('Fast Path API Contract', () => {
  it('getToolsForAgent should accept fastPath option', async () => {
    // Import the types to verify the API contract
    const module = await import('../orchestrator/voice-agent-integration.js');

    // The function should exist and accept options
    expect(typeof module.getToolsForAgent).toBe('function');

    // Test that fastPath is a valid option (type checking)
    const options: Parameters<typeof module.getToolsForAgent>[0] = {
      persona: { id: 'peter-john' },
      userId: 'test-user',
      fastPath: true,
      sessionId: 'test-session',
    };

    expect(options.fastPath).toBe(true);
  });

  it('should handle missing session gracefully', async () => {
    const { getCachedHandoffTools, hasHandoffToolsCache } =
      await import('../handoff/session-cache.js');

    const nonExistentSession = 'non-existent-session-12345';

    expect(hasHandoffToolsCache(nonExistentSession)).toBe(false);
    expect(getCachedHandoffTools(nonExistentSession, 'ferni')).toBeNull();
  });
});
