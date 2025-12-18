/**
 * Voice Agent Phases Tests
 *
 * Unit tests for voice agent phase modules.
 * These test the core session initialization phases in isolation.
 *
 * @module tests/voice-agent/phases
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

// Mock LiveKit agents
vi.mock('@livekit/agents', () => ({
  voice: {
    AgentSession: vi.fn(),
  },
  log: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock Google plugins
vi.mock('@livekit/agents-plugin-google', () => ({
  __esModule: true,
  default: {},
  Gemini: vi.fn(),
}));

// Mock Silero VAD
vi.mock('@livekit/agents-plugin-silero', () => ({
  __esModule: true,
  default: {},
  VAD: vi.fn(),
}));

// Mock GenAI
vi.mock('@google/genai', () => ({
  __esModule: true,
  default: {},
  Modality: { AUDIO: 'AUDIO', TEXT: 'TEXT' },
}));

// ============================================================================
// TESTS: Load Dependencies Phase
// ============================================================================

describe('Load Dependencies Phase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadVoiceDeps', () => {
    it('should load all voice dependencies', async () => {
      const { loadVoiceDeps } = await import('../load-deps.js');

      const deps = await loadVoiceDeps();

      expect(deps).toHaveProperty('voice');
      expect(deps).toHaveProperty('google');
      expect(deps).toHaveProperty('silero');
      expect(deps).toHaveProperty('genai');
    });

    it('should cache dependencies after first load', async () => {
      const { loadVoiceDeps, getCachedVoiceDeps, areVoiceDepsLoaded } =
        await import('../load-deps.js');

      // First load
      await loadVoiceDeps();
      expect(areVoiceDepsLoaded()).toBe(true);

      // Get from cache
      const cached = getCachedVoiceDeps();
      expect(cached).not.toBeNull();
      expect(cached).toHaveProperty('voice');
    });
  });

  describe('areVoiceDepsLoaded', () => {
    it('should return true after deps are loaded', async () => {
      const { loadVoiceDeps, areVoiceDepsLoaded } = await import('../load-deps.js');

      // Should be true after loading
      await loadVoiceDeps();
      expect(areVoiceDepsLoaded()).toBe(true);
    });
  });
});

// ============================================================================
// TESTS: Load Persona Phase
// ============================================================================

describe('Load Persona Phase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadPersonaLocally', () => {
    it('should export loadPersonaLocally function', async () => {
      const { loadPersonaLocally } = await import('../load-persona.js');
      expect(typeof loadPersonaLocally).toBe('function');
    });
  });

  describe('getPrewarmedResources', () => {
    it('should export getPrewarmedResources function', async () => {
      const { getPrewarmedResources } = await import('../load-persona.js');
      expect(typeof getPrewarmedResources).toBe('function');
    });
  });
});

// ============================================================================
// TESTS: Connect Room Phase
// ============================================================================

describe('Connect Room Phase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectConnectionType', () => {
    it('should export detectConnectionType function', async () => {
      const { detectConnectionType } = await import('../connect-room.js');
      expect(typeof detectConnectionType).toBe('function');
    });

    it('should detect phone calls from participant identity', async () => {
      const { detectConnectionType } = await import('../connect-room.js');

      const mockCtx = {
        job: { metadata: '' },
      };

      const result = detectConnectionType(mockCtx as any, { identity: 'phone-123' });

      expect(result.isPhoneCall).toBe(true);
      expect(result.isWebConnection).toBe(false);
    });

    it('should detect web connections from metadata', async () => {
      const { detectConnectionType } = await import('../connect-room.js');

      const mockCtx = {
        job: { metadata: '{"source":"web"}' },
      };

      const result = detectConnectionType(mockCtx as any, { identity: 'user-123' });

      expect(result.isPhoneCall).toBe(false);
      expect(result.isWebConnection).toBe(true);
    });

    it('should handle SIP participants as phone calls', async () => {
      const { detectConnectionType } = await import('../connect-room.js');

      const mockCtx = {
        job: { metadata: '' },
      };

      const result = detectConnectionType(mockCtx as any, { identity: 'sip:+1234567890' });

      expect(result.isPhoneCall).toBe(true);
    });

    it('should handle null participant gracefully', async () => {
      const { detectConnectionType } = await import('../connect-room.js');

      const mockCtx = {
        job: { metadata: '' },
      };

      const result = detectConnectionType(mockCtx as any, null);

      expect(result.isPhoneCall).toBe(false);
      expect(result.isWebConnection).toBe(false);
    });
  });

  describe('connectToRoom', () => {
    it('should export connectToRoom function', async () => {
      const { connectToRoom } = await import('../connect-room.js');
      expect(typeof connectToRoom).toBe('function');
    });
  });

  describe('waitForParticipant', () => {
    it('should export waitForParticipant function', async () => {
      const { waitForParticipant } = await import('../connect-room.js');
      expect(typeof waitForParticipant).toBe('function');
    });
  });
});

// ============================================================================
// TESTS: Types
// ============================================================================

describe('Phase Types', () => {
  it('should export VoiceDeps type', async () => {
    // Type-only import to verify types exist
    const types = await import('../types.js');
    expect(types).toBeDefined();
  });
});
