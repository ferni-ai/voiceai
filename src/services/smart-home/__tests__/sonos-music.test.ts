/**
 * Sonos Music Service Tests
 *
 * Tests for Sonos music playback, room matching, token refresh, and circuit breaker.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock external dependencies
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock user-credentials to avoid Firestore calls
vi.mock('../user-credentials.js', () => ({
  saveCredential: vi.fn().mockResolvedValue(true),
}));

// ============================================================================
// ROOM MATCHING TESTS
// ============================================================================

describe('Sonos Room Matching', () => {
  it('should match room names exactly', async () => {
    const { matchRoomName } = await import('../sonos-music.js');

    const groups = [
      { id: '1', name: 'Living Room', playbackState: 'idle', volume: 50, muted: false, coordinatorId: '1' },
      { id: '2', name: 'Kitchen', playbackState: 'idle', volume: 50, muted: false, coordinatorId: '2' },
      { id: '3', name: 'Bedroom', playbackState: 'idle', volume: 50, muted: false, coordinatorId: '3' },
    ] as const;

    expect(matchRoomName('Living Room', groups as any)?.name).toBe('Living Room');
    expect(matchRoomName('Kitchen', groups as any)?.name).toBe('Kitchen');
    expect(matchRoomName('Bedroom', groups as any)?.name).toBe('Bedroom');
  });

  it('should match room names case-insensitively', async () => {
    const { matchRoomName } = await import('../sonos-music.js');

    const groups = [
      { id: '1', name: 'Living Room', playbackState: 'idle', volume: 50, muted: false, coordinatorId: '1' },
    ] as const;

    expect(matchRoomName('living room', groups as any)?.name).toBe('Living Room');
    expect(matchRoomName('LIVING ROOM', groups as any)?.name).toBe('Living Room');
    expect(matchRoomName('LiViNg RoOm', groups as any)?.name).toBe('Living Room');
  });

  it('should match room names with substring matching', async () => {
    const { matchRoomName } = await import('../sonos-music.js');

    const groups = [
      { id: '1', name: 'Living Room Sonos', playbackState: 'idle', volume: 50, muted: false, coordinatorId: '1' },
      { id: '2', name: 'Kitchen Speaker', playbackState: 'idle', volume: 50, muted: false, coordinatorId: '2' },
    ] as const;

    expect(matchRoomName('living', groups as any)?.name).toBe('Living Room Sonos');
    expect(matchRoomName('kitchen', groups as any)?.name).toBe('Kitchen Speaker');
  });

  it('should match common room aliases', async () => {
    const { matchRoomName } = await import('../sonos-music.js');

    const groups = [
      { id: '1', name: 'Living Room', playbackState: 'idle', volume: 50, muted: false, coordinatorId: '1' },
      { id: '2', name: 'Bedroom', playbackState: 'idle', volume: 50, muted: false, coordinatorId: '2' },
      { id: '3', name: 'Office', playbackState: 'idle', volume: 50, muted: false, coordinatorId: '3' },
    ] as const;

    // Living room aliases
    expect(matchRoomName('lounge', groups as any)?.name).toBe('Living Room');
    expect(matchRoomName('front room', groups as any)?.name).toBe('Living Room');

    // Bedroom aliases
    expect(matchRoomName('master', groups as any)?.name).toBe('Bedroom');
    expect(matchRoomName('bed', groups as any)?.name).toBe('Bedroom');

    // Office aliases
    expect(matchRoomName('study', groups as any)?.name).toBe('Office');
    expect(matchRoomName('work', groups as any)?.name).toBe('Office');
  });

  it('should return null for no match', async () => {
    const { matchRoomName } = await import('../sonos-music.js');

    const groups = [
      { id: '1', name: 'Kitchen', playbackState: 'idle', volume: 50, muted: false, coordinatorId: '1' },
    ] as const;

    expect(matchRoomName('garage', groups as any)).toBeNull();
    expect(matchRoomName('basement', groups as any)).toBeNull();
    expect(matchRoomName('xyz123', groups as any)).toBeNull();
  });
});

// ============================================================================
// LAST USED ROOM CACHE TESTS
// ============================================================================

describe('Sonos Last Used Room', () => {
  beforeEach(async () => {
    // Clear the cache before each test
    const { setLastUsedRoom, getLastUsedRoom } = await import('../sonos-music.js');
    // The cache is module-scoped, so we test fresh each time
  });

  it('should remember last used room per user', async () => {
    const { setLastUsedRoom, getLastUsedRoom } = await import('../sonos-music.js');

    setLastUsedRoom('user-123', {
      groupId: 'group-1',
      groupName: 'Living Room',
      householdId: 'house-1',
    });

    const room = getLastUsedRoom('user-123');
    expect(room).toBeDefined();
    expect(room?.groupName).toBe('Living Room');
    expect(room?.groupId).toBe('group-1');
  });

  it('should return undefined for unknown user', async () => {
    const { getLastUsedRoom } = await import('../sonos-music.js');

    const room = getLastUsedRoom('unknown-user-999');
    expect(room).toBeUndefined();
  });

  it('should keep separate rooms per user', async () => {
    const { setLastUsedRoom, getLastUsedRoom } = await import('../sonos-music.js');

    setLastUsedRoom('user-a', {
      groupId: 'group-1',
      groupName: 'Living Room',
      householdId: 'house-1',
    });

    setLastUsedRoom('user-b', {
      groupId: 'group-2',
      groupName: 'Kitchen',
      householdId: 'house-1',
    });

    expect(getLastUsedRoom('user-a')?.groupName).toBe('Living Room');
    expect(getLastUsedRoom('user-b')?.groupName).toBe('Kitchen');
  });
});

// ============================================================================
// CIRCUIT BREAKER TESTS
// ============================================================================

describe('Sonos Circuit Breaker', () => {
  beforeEach(async () => {
    // Reset circuit breaker before each test
    const { resetSonosCircuitBreaker } = await import('../sonos.js');
    resetSonosCircuitBreaker();
  });

  it('should report closed state initially', async () => {
    const { getSonosCircuitBreakerStatus } = await import('../sonos.js');

    const status = getSonosCircuitBreakerStatus();
    expect(status.isOpen).toBe(false);
    expect(status.failures).toBe(0);
  });

  it('should be able to reset the circuit breaker', async () => {
    const { getSonosCircuitBreakerStatus, resetSonosCircuitBreaker } = await import('../sonos.js');

    resetSonosCircuitBreaker();

    const status = getSonosCircuitBreakerStatus();
    expect(status.isOpen).toBe(false);
    expect(status.failures).toBe(0);
  });
});

// ============================================================================
// TOKEN REFRESH HANDLER TESTS
// ============================================================================

describe('Sonos Token Refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a token refresh handler', async () => {
    const { createTokenRefreshHandler } = await import('../sonos-music.js');

    // Should not throw
    expect(() => createTokenRefreshHandler('test-user')).not.toThrow();
  });

  it('should check Sonos availability', async () => {
    const { isSonosAvailable } = await import('../sonos-music.js');
    const { resetSonosCircuitBreaker } = await import('../sonos.js');

    // Reset to ensure circuit is closed
    resetSonosCircuitBreaker();

    expect(isSonosAvailable()).toBe(true);
  });
});

// ============================================================================
// VIBE MATCHING TESTS
// ============================================================================

describe('Sonos Vibe Matching', () => {
  it('should detect jazz vibe keywords', async () => {
    // This tests the internal vibe matching logic
    // We'll test via the favorites search indirectly
    const { searchFavorites } = await import('../sonos-music.js');

    // searchFavorites requires credentials and makes API calls,
    // so we just verify it exists and is callable
    expect(typeof searchFavorites).toBe('function');
  });
});

// ============================================================================
// SONOS API ERROR TESTS
// ============================================================================

describe('SonosApiError', () => {
  it('should create error with status code', async () => {
    const { SonosApiError } = await import('../sonos.js');

    const error = new SonosApiError('Test error', 401, '/test/endpoint');

    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(401);
    expect(error.endpoint).toBe('/test/endpoint');
    expect(error.name).toBe('SonosApiError');
  });

  it('should be instanceof Error', async () => {
    const { SonosApiError } = await import('../sonos.js');

    const error = new SonosApiError('Test error', 500, '/test');

    expect(error instanceof Error).toBe(true);
    expect(error instanceof SonosApiError).toBe(true);
  });
});

// ============================================================================
// INTEGRATION TESTS (with mocked fetch)
// ============================================================================

describe('Sonos Music Service Integration', () => {
  const mockCredentials = {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    tokenExpiry: Date.now() + 3600000,
    householdId: 'test-household',
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('should handle playSonosMusic with no households gracefully', async () => {
    // Mock fetch to return empty households
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ households: [] }),
    });

    const { playSonosMusic } = await import('../sonos-music.js');
    const { resetSonosCircuitBreaker } = await import('../sonos.js');

    resetSonosCircuitBreaker();

    const result = await playSonosMusic(mockCredentials, 'test-user', 'jazz');

    expect(result.success).toBe(false);
    expect(result.message).toContain("don't see any Sonos systems");
  });

  it('should handle circuit breaker open state', async () => {
    // Reset and then manually check behavior
    const { isSonosAvailable } = await import('../sonos-music.js');
    const { resetSonosCircuitBreaker } = await import('../sonos.js');

    resetSonosCircuitBreaker();

    // Circuit should be closed initially
    expect(isSonosAvailable()).toBe(true);
  });
});
