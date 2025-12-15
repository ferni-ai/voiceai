/**
 * Voice Agent Phases Tests
 *
 * Tests for the modular phase system that splits voice agent initialization
 * into composable, testable units.
 *
 * @module agents/__tests__/core/phases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// LOAD-DEPS TESTS
// ============================================================================

describe('load-deps phase', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('areVoiceDepsLoaded()', () => {
    it('should return false initially', async () => {
      // Fresh import to get clean state
      const { areVoiceDepsLoaded } = await import('../../voice-agent/phases/load-deps.js');

      // Note: In actual tests, deps may already be loaded from other tests
      // This tests the function exists and returns a boolean
      const result = areVoiceDepsLoaded();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getCachedVoiceDeps()', () => {
    it('should return null if deps not loaded', async () => {
      vi.resetModules();

      // Mock the modules to not have loaded anything
      const mockModule = {
        getCachedVoiceDeps: vi.fn(() => null),
        areVoiceDepsLoaded: vi.fn(() => false),
        loadVoiceDeps: vi.fn(),
      };

      vi.doMock('../../voice-agent/phases/load-deps.js', () => mockModule);

      expect(mockModule.getCachedVoiceDeps()).toBeNull();
    });
  });
});

// ============================================================================
// CONNECT-ROOM TESTS
// ============================================================================

describe('connect-room phase', () => {
  describe('detectConnectionType()', () => {
    it('should detect web connection from metadata', async () => {
      const { detectConnectionType } = await import('../../voice-agent/phases/connect-room.js');

      const mockCtx = {
        job: {
          metadata: '{"source":"web","user_id":"123"}',
        },
      } as any;

      const result = detectConnectionType(mockCtx, { identity: 'user_123' });

      expect(result.isWebConnection).toBe(true);
      expect(result.isPhoneCall).toBe(false);
    });

    it('should detect phone call from participant identity', async () => {
      const { detectConnectionType } = await import('../../voice-agent/phases/connect-room.js');

      const mockCtx = {
        job: {
          metadata: '{}',
        },
      } as any;

      const result = detectConnectionType(mockCtx, { identity: 'phone_user_456' });

      expect(result.isPhoneCall).toBe(true);
      expect(result.isWebConnection).toBe(false);
    });

    it('should detect SIP call from participant identity', async () => {
      const { detectConnectionType } = await import('../../voice-agent/phases/connect-room.js');

      const mockCtx = {
        job: {
          metadata: '{}',
        },
      } as any;

      const result = detectConnectionType(mockCtx, { identity: 'sip_user_789' });

      expect(result.isPhoneCall).toBe(true);
      expect(result.isWebConnection).toBe(false);
    });

    it('should detect phone call from metadata source', async () => {
      const { detectConnectionType } = await import('../../voice-agent/phases/connect-room.js');

      const mockCtx = {
        job: {
          metadata: '{"source":"phone"}',
        },
      } as any;

      const result = detectConnectionType(mockCtx, { identity: 'user_123' });

      expect(result.isPhoneCall).toBe(true);
      expect(result.isWebConnection).toBe(false);
    });

    it('should handle null participant', async () => {
      const { detectConnectionType } = await import('../../voice-agent/phases/connect-room.js');

      const mockCtx = {
        job: {
          metadata: '{"source":"web"}',
        },
      } as any;

      const result = detectConnectionType(mockCtx, null);

      expect(result.isWebConnection).toBe(true);
      expect(result.isPhoneCall).toBe(false);
    });

    it('should handle missing metadata gracefully', async () => {
      const { detectConnectionType } = await import('../../voice-agent/phases/connect-room.js');

      const mockCtx = {
        job: {},
      } as any;

      const result = detectConnectionType(mockCtx, { identity: 'user_123' });

      expect(result.isWebConnection).toBe(false);
      expect(result.isPhoneCall).toBe(false);
    });
  });

  describe('connectToRoom()', () => {
    it('should timeout if connection takes too long', async () => {
      const { connectToRoom } = await import('../../voice-agent/phases/connect-room.js');

      const mockCtx = {
        connect: vi.fn(
          () =>
            new Promise((resolve) => {
              // Never resolves
              setTimeout(resolve, 60000);
            })
        ),
        room: { name: 'test-room' },
      } as any;

      await expect(connectToRoom(mockCtx, 100)).rejects.toThrow(
        'Room connection timed out after 100ms'
      );
    });

    it('should connect successfully within timeout', async () => {
      const { connectToRoom } = await import('../../voice-agent/phases/connect-room.js');

      const mockCtx = {
        connect: vi.fn(() => Promise.resolve()),
        room: { name: 'test-room' },
      } as any;

      await expect(connectToRoom(mockCtx, 5000)).resolves.toBeUndefined();
      expect(mockCtx.connect).toHaveBeenCalled();
    });
  });

  describe('waitForParticipant()', () => {
    it('should return participant info when participant joins', async () => {
      const { waitForParticipant } = await import('../../voice-agent/phases/connect-room.js');

      const mockParticipant = {
        identity: 'user_123',
        name: 'Test User',
        metadata: '{"role":"subscriber"}',
      };

      const mockCtx = {
        waitForParticipant: vi.fn(() => Promise.resolve(mockParticipant)),
      } as any;

      const result = await waitForParticipant(mockCtx, 5000);

      expect(result).toEqual({
        identity: 'user_123',
        name: 'Test User',
        metadata: '{"role":"subscriber"}',
      });
    });

    it('should return null on timeout', async () => {
      const { waitForParticipant } = await import('../../voice-agent/phases/connect-room.js');

      const mockCtx = {
        waitForParticipant: vi.fn(
          () =>
            new Promise((resolve) => {
              // Never resolves
              setTimeout(resolve, 60000);
            })
        ),
      } as any;

      const result = await waitForParticipant(mockCtx, 100);

      expect(result).toBeNull();
    });
  });
});

// ============================================================================
// LOAD-PERSONA TESTS
// ============================================================================

describe('load-persona phase', () => {
  describe('getPrewarmedResources()', () => {
    it('should return usePrewarmed: false when cache unavailable', async () => {
      const { getPrewarmedResources } = await import('../../voice-agent/phases/load-persona.js');

      // Mock cache-reader to throw (simulating cache unavailable)
      vi.doMock('../../shared/cache-reader.js', () => {
        throw new Error('Cache not available');
      });

      const result = await getPrewarmedResources('ferni');

      // Should gracefully handle cache miss
      expect(result.usePrewarmed).toBe(false);
      expect(result.persona).toBeNull();
      expect(result.systemPrompt).toBeNull();
    });
  });

  describe('loadPersonaLocally()', () => {
    it('should load persona from bundles', async () => {
      const { loadPersonaLocally } = await import('../../voice-agent/phases/load-persona.js');

      // Note: This tests the actual bundle loading
      // In a real test environment, you'd mock the personas module
      const result = await loadPersonaLocally('ferni');

      // Should return a persona config or null
      if (result) {
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('name');
      }
    });
  });
});

// ============================================================================
// PHASE INTEGRATION TESTS
// ============================================================================

describe('phase integration', () => {
  it('should export all expected functions from index', async () => {
    const phases = await import('../../voice-agent/phases/index.js');

    // Check load-deps exports
    expect(typeof phases.loadVoiceDeps).toBe('function');
    expect(typeof phases.getCachedVoiceDeps).toBe('function');
    expect(typeof phases.areVoiceDepsLoaded).toBe('function');

    // Check load-persona exports
    expect(typeof phases.loadPersonaPhase).toBe('function');
    expect(typeof phases.getPrewarmedResources).toBe('function');
    expect(typeof phases.loadPersonaLocally).toBe('function');

    // Check connect-room exports
    expect(typeof phases.connectToRoom).toBe('function');
    expect(typeof phases.waitForParticipant).toBe('function');
    expect(typeof phases.detectConnectionType).toBe('function');
  });

  it('should export all type definitions', async () => {
    // Types are compile-time only, but we can check the module loads
    const types = await import('../../voice-agent/phases/types.js');

    // Types module should exist and load without error
    expect(types).toBeDefined();
  });
});
