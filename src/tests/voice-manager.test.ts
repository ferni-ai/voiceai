/**
 * Voice Manager Tests
 *
 * Tests for the voice manager module that handles:
 * - Voice switching between personas
 * - Voice configuration management
 * - VoiceAgentId normalization
 * - Singleton pattern
 *
 * @module tests/voice-manager
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the external TTS dependencies before importing the module
vi.mock('@livekit/agents-plugin-cartesia', () => ({
  TTS: class MockCartesiaTTS {
    constructor(_config?: { model?: string; voice?: string }) {}
    synthesize(_text: string) {
      return {
        [Symbol.asyncIterator]: async function* () {
          yield { data: new Uint8Array([0]) };
        },
      };
    }
    stream() {
      return {
        [Symbol.asyncIterator]: async function* () {
          yield { data: new Uint8Array([0]) };
        },
      };
    }
  },
}));

vi.mock('@livekit/agents', () => ({
  tts: {
    TTS: class MockTTS {
      constructor(_sampleRate?: number, _channels?: number, _options?: object) {}
      synthesize(_text: string) {
        return {
          [Symbol.asyncIterator]: async function* () {
            yield { data: new Uint8Array([0]) };
          },
        };
      }
      stream() {
        return {
          [Symbol.asyncIterator]: async function* () {
            yield { data: new Uint8Array([0]) };
          },
        };
      }
    },
    ChunkedStream: class {},
    SynthesizeStream: class {},
  },
}));

vi.mock('../tools/handoff/index.js', () => ({
  handoffEvents: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  },
  getCurrentAgent: vi.fn().mockReturnValue('ferni'),
}));

vi.mock('../personas/voice-registry.js', () => ({
  getVoiceId: vi.fn((personaId: string) => `voice-id-${personaId}`),
  getCanonicalPersonaId: vi.fn((id: string) => {
    const mapping: Record<string, string> = {
      'jack-b': 'ferni',
      peter: 'peter-john',
      'comm-specialist': 'alex-chen',
      alex: 'alex-chen',
      'spend-save': 'maya-santos',
      maya: 'maya-santos',
      'event-planner': 'jordan-taylor',
      jordan: 'jordan-taylor',
      nayan: 'nayan-patel',
    };
    return mapping[id] || id;
  }),
}));

vi.mock('../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  createPersonaAwareTTS,
  getVoiceManager,
  resetVoiceManager,
  VOICES,
  type VoiceAgentId,
} from '../speech/voice-manager.js';

// ============================================================================
// TESTS
// ============================================================================

describe('VoiceManager', () => {
  beforeEach(() => {
    resetVoiceManager();
  });

  afterEach(() => {
    resetVoiceManager();
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Singleton Pattern
  // --------------------------------------------------------------------------

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = getVoiceManager();
      const instance2 = getVoiceManager();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getVoiceManager();
      resetVoiceManager();
      const instance2 = getVoiceManager();
      expect(instance2).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // VOICES Configuration
  // --------------------------------------------------------------------------

  describe('VOICES Configuration', () => {
    it('should have all canonical persona IDs', () => {
      const canonicalIds: VoiceAgentId[] = [
        'ferni',
        'peter-john',
        'alex-chen',
        'maya-santos',
        'jordan-taylor',
        'nayan-patel',
      ];

      for (const id of canonicalIds) {
        expect(VOICES[id]).toBeDefined();
        expect(VOICES[id].name).toBeTruthy();
        expect(VOICES[id].model).toBeTruthy();
        expect(VOICES[id].description).toBeTruthy();
      }
    });

    it('should have all legacy alias IDs', () => {
      const aliasIds: VoiceAgentId[] = [
        'jack-b',
        'peter',
        'comm-specialist',
        'alex',
        'spend-save',
        'maya',
        'event-planner',
        'jordan',
        'nayan',
      ];

      for (const id of aliasIds) {
        expect(VOICES[id]).toBeDefined();
      }
    });

    it('should have consistent model across all voices', () => {
      const expectedModel = process.env.CARTESIA_MODEL || 'sonic-3';
      for (const [_id, config] of Object.entries(VOICES)) {
        expect(config.model).toBe(expectedModel);
      }
    });
  });

  // --------------------------------------------------------------------------
  // getCurrentVoice Method
  // --------------------------------------------------------------------------

  describe('getCurrentVoice()', () => {
    it('should return default voice config', () => {
      const manager = getVoiceManager();
      const voice = manager.getCurrentVoice();

      expect(voice).toBeDefined();
      expect(voice.name).toBe('Ferni');
    });

    it('should return voice config after switching', () => {
      const manager = getVoiceManager();
      manager.switchVoice('peter-john');
      const voice = manager.getCurrentVoice();

      expect(voice.name).toBe('Peter');
    });
  });

  // --------------------------------------------------------------------------
  // switchVoice Method
  // --------------------------------------------------------------------------

  describe('switchVoice()', () => {
    it('should switch to canonical persona ID', () => {
      const manager = getVoiceManager();
      manager.switchVoice('peter-john');

      expect(manager.getCurrentAgentId()).toBe('peter-john');
    });

    it('should handle alias IDs', () => {
      const manager = getVoiceManager();
      manager.switchVoice('maya');

      expect(manager.getCurrentAgentId()).toBe('maya-santos');
    });

    it('should not switch if already using the voice', () => {
      const manager = getVoiceManager();
      manager.switchVoice('ferni');
      manager.switchVoice('ferni'); // Should be no-op

      expect(manager.getCurrentAgentId()).toBe('ferni');
    });

    it('should switch to all canonical personas', () => {
      const manager = getVoiceManager();
      const personas: VoiceAgentId[] = [
        'ferni',
        'peter-john',
        'alex-chen',
        'maya-santos',
        'jordan-taylor',
        'nayan-patel',
      ];

      for (const persona of personas) {
        manager.switchVoice(persona);
        expect(manager.getCurrentAgentId()).toBe(persona);
      }
    });

    it('should default to ferni for unknown agents', () => {
      const manager = getVoiceManager();
      manager.switchVoice('unknown-agent');

      expect(manager.getCurrentAgentId()).toBe('ferni');
    });
  });

  // --------------------------------------------------------------------------
  // onVoiceSwitch Method
  // --------------------------------------------------------------------------

  describe('onVoiceSwitch()', () => {
    it('should register callback and receive notifications', () => {
      const manager = getVoiceManager();
      const callback = vi.fn();

      manager.onVoiceSwitch(callback);
      manager.switchVoice('peter-john');

      expect(callback).toHaveBeenCalledWith('ferni', 'peter-john');
    });

    it('should return unsubscribe function', () => {
      const manager = getVoiceManager();
      const callback = vi.fn();

      const unsubscribe = manager.onVoiceSwitch(callback);
      unsubscribe();
      manager.switchVoice('peter-john');

      expect(callback).not.toHaveBeenCalled();
    });

    it('should support multiple subscribers', () => {
      const manager = getVoiceManager();
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      manager.onVoiceSwitch(callback1);
      manager.onVoiceSwitch(callback2);
      manager.switchVoice('alex-chen');

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should handle errors in callbacks gracefully', () => {
      const manager = getVoiceManager();
      const errorCallback = vi.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });
      const goodCallback = vi.fn();

      manager.onVoiceSwitch(errorCallback);
      manager.onVoiceSwitch(goodCallback);

      expect(() => {
        manager.switchVoice('maya-santos');
      }).not.toThrow();

      expect(goodCallback).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // getVoiceId Method
  // --------------------------------------------------------------------------

  describe('getVoiceId()', () => {
    it('should return voice ID for current voice', () => {
      const manager = getVoiceManager();
      const voiceId = manager.getVoiceId();

      expect(typeof voiceId).toBe('string');
      expect(voiceId.length).toBeGreaterThan(0);
    });

    it('should return different IDs for different voices', () => {
      const manager = getVoiceManager();

      const ferniId = manager.getVoiceId();
      manager.switchVoice('peter-john');
      const peterId = manager.getVoiceId();

      expect(ferniId).not.toBe(peterId);
    });
  });

  // --------------------------------------------------------------------------
  // isPeter Method
  // --------------------------------------------------------------------------

  describe('isPeter()', () => {
    it('should return false by default', () => {
      const manager = getVoiceManager();
      expect(manager.isPeter()).toBe(false);
    });

    it('should return true when using peter-john voice', () => {
      const manager = getVoiceManager();
      manager.switchVoice('peter-john');
      expect(manager.isPeter()).toBe(true);
    });

    it('should return true for peter alias', () => {
      const manager = getVoiceManager();
      manager.switchVoice('peter');
      expect(manager.isPeter()).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // isNayan Method
  // --------------------------------------------------------------------------

  describe('isNayan()', () => {
    it('should return false by default', () => {
      const manager = getVoiceManager();
      expect(manager.isNayan()).toBe(false);
    });

    it('should return true when using nayan-patel voice', () => {
      const manager = getVoiceManager();
      manager.switchVoice('nayan-patel');
      expect(manager.isNayan()).toBe(true);
    });

    it('should return true for nayan alias', () => {
      const manager = getVoiceManager();
      manager.switchVoice('nayan');
      expect(manager.isNayan()).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // getCurrentAgentId Method
  // --------------------------------------------------------------------------

  describe('getCurrentAgentId()', () => {
    it('should return default agent ID', () => {
      const manager = getVoiceManager();
      expect(manager.getCurrentAgentId()).toBe('ferni');
    });

    it('should return current agent after switch', () => {
      const manager = getVoiceManager();
      manager.switchVoice('jordan-taylor');
      expect(manager.getCurrentAgentId()).toBe('jordan-taylor');
    });
  });

  // --------------------------------------------------------------------------
  // initialize Method
  // --------------------------------------------------------------------------

  describe('initialize()', () => {
    it('should initialize without error', () => {
      const manager = getVoiceManager();
      expect(() => {
        manager.initialize();
      }).not.toThrow();
    });

    it('should be idempotent', () => {
      const manager = getVoiceManager();
      manager.initialize();
      manager.initialize();
      // Should not throw or create duplicate instances
      expect(manager.getCurrentVoice()).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // cleanup Method
  // --------------------------------------------------------------------------

  describe('cleanup()', () => {
    it('should clean up without error', () => {
      const manager = getVoiceManager();
      manager.initialize();

      expect(() => {
        manager.cleanup();
      }).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // createTTS Method
  // --------------------------------------------------------------------------

  describe('createTTS()', () => {
    it('should create TTS instance', () => {
      const manager = getVoiceManager();
      const tts = manager.createTTS();
      expect(tts).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // getCurrentTTS Method
  // --------------------------------------------------------------------------

  describe('getCurrentTTS()', () => {
    it('should return TTS instance', () => {
      const manager = getVoiceManager();
      const tts = manager.getCurrentTTS();
      expect(tts).toBeDefined();
    });

    it('should auto-initialize if not initialized', () => {
      const manager = getVoiceManager();
      // Without calling initialize first
      expect(() => {
        manager.getCurrentTTS();
      }).not.toThrow();
    });
  });
});

// ============================================================================
// PersonaAwareTTS Tests
// ============================================================================

describe('PersonaAwareTTS', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Constructor
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('should create instance with voice config', () => {
      const tts = createPersonaAwareTTS('TestPersona', {
        voiceId: 'test-voice-id',
      });

      expect(tts).toBeDefined();
      expect(tts.getPersonaName()).toBe('TestPersona');
      expect(tts.getVoiceId()).toBe('test-voice-id');
    });
  });

  // --------------------------------------------------------------------------
  // switchVoice Method
  // --------------------------------------------------------------------------

  describe('switchVoice()', () => {
    it('should switch to new voice', () => {
      const tts = createPersonaAwareTTS('Ferni', {
        voiceId: 'ferni-voice-id',
      });

      tts.switchVoice('Peter', 'peter-voice-id');

      expect(tts.getPersonaName()).toBe('Peter');
      expect(tts.getVoiceId()).toBe('peter-voice-id');
    });

    it('should not switch to same voice', () => {
      const tts = createPersonaAwareTTS('Ferni', {
        voiceId: 'ferni-voice-id',
      });

      tts.switchVoice('Ferni Again', 'ferni-voice-id');

      expect(tts.getPersonaName()).toBe('Ferni');
    });
  });

  // --------------------------------------------------------------------------
  // getVoiceId Method
  // --------------------------------------------------------------------------

  describe('getVoiceId()', () => {
    it('should return current voice ID', () => {
      const tts = createPersonaAwareTTS('TestPersona', {
        voiceId: 'my-voice-id',
      });

      expect(tts.getVoiceId()).toBe('my-voice-id');
    });
  });

  // --------------------------------------------------------------------------
  // getPersonaName Method
  // --------------------------------------------------------------------------

  describe('getPersonaName()', () => {
    it('should return persona name', () => {
      const tts = createPersonaAwareTTS('Maya', {
        voiceId: 'maya-voice-id',
      });

      expect(tts.getPersonaName()).toBe('Maya');
    });
  });

  // --------------------------------------------------------------------------
  // hasPendingSwitch Method
  // --------------------------------------------------------------------------

  describe('hasPendingSwitch()', () => {
    it('should return false initially', () => {
      const tts = createPersonaAwareTTS('Test', {
        voiceId: 'test-id',
      });

      expect(tts.hasPendingSwitch()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // cleanup Method
  // --------------------------------------------------------------------------

  describe('cleanup()', () => {
    it('should clean up without error', () => {
      const tts = createPersonaAwareTTS('Test', {
        voiceId: 'test-id',
      });

      expect(() => {
        tts.cleanup();
      }).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // synthesize Method
  // --------------------------------------------------------------------------

  describe('synthesize()', () => {
    it('should return stream-like object', () => {
      const tts = createPersonaAwareTTS('Test', {
        voiceId: 'test-id',
      });

      const result = tts.synthesize('Hello world');
      expect(result).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // stream Method
  // --------------------------------------------------------------------------

  describe('stream()', () => {
    it('should return stream object', () => {
      const tts = createPersonaAwareTTS('Test', {
        voiceId: 'test-id',
      });

      const stream = tts.stream();
      expect(stream).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // International Accent Support
  // --------------------------------------------------------------------------

  describe('Accent Support', () => {
    it('should default to american accent', () => {
      const tts = createPersonaAwareTTS('Ferni', {
        voiceId: 'ferni-voice-id',
      });

      expect(tts.getAccent()).toBe('american');
      expect(tts.isLocalized()).toBe(false);
    });

    it('should accept accent in config', () => {
      const tts = createPersonaAwareTTS('Ferni', {
        voiceId: 'localized-british-ferni-id',
        accent: 'british',
        isLocalizedVoice: true,
      });

      expect(tts.getAccent()).toBe('british');
      expect(tts.isLocalized()).toBe(true);
    });

    it('should support all four accent types', () => {
      const accents = ['american', 'british', 'australian', 'indian'] as const;

      for (const accent of accents) {
        const tts = createPersonaAwareTTS('Ferni', {
          voiceId: `ferni-${accent}-voice-id`,
          accent,
          isLocalizedVoice: accent !== 'american',
        });

        expect(tts.getAccent()).toBe(accent);
      }
    });

    it('should switch accent with switchAccent()', () => {
      const tts = createPersonaAwareTTS('Ferni', {
        voiceId: 'ferni-voice-id',
        accent: 'american',
      });

      expect(tts.getAccent()).toBe('american');

      // Switch to british
      tts.switchAccent('british');
      expect(tts.getAccent()).toBe('british');
    });

    it('should not switch if already using the same accent', () => {
      const tts = createPersonaAwareTTS('Ferni', {
        voiceId: 'ferni-voice-id',
        accent: 'australian',
      });

      // Should be a no-op, not create a new TTS instance
      tts.switchAccent('australian');
      expect(tts.getAccent()).toBe('australian');
    });

    it('should preserve accent when switching voice', () => {
      const tts = createPersonaAwareTTS('Ferni', {
        voiceId: 'ferni-british-voice-id',
        accent: 'british',
        isLocalizedVoice: true,
      });

      // Switch to Peter but keep the accent
      tts.switchVoice('Peter', 'peter-british-voice-id');

      expect(tts.getPersonaName()).toBe('Peter');
      expect(tts.getAccent()).toBe('british');
    });

    it('should allow changing accent when switching voice', () => {
      const tts = createPersonaAwareTTS('Ferni', {
        voiceId: 'ferni-voice-id',
        accent: 'american',
      });

      // Switch to Peter with a different accent
      tts.switchVoice('Peter', 'peter-indian-voice-id', 'indian');

      expect(tts.getPersonaName()).toBe('Peter');
      expect(tts.getAccent()).toBe('indian');
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Voice Manager Edge Cases', () => {
  beforeEach(() => {
    resetVoiceManager();
  });

  afterEach(() => {
    resetVoiceManager();
    vi.clearAllMocks();
  });

  it('should handle rapid voice switching', () => {
    const manager = getVoiceManager();

    expect(() => {
      for (let i = 0; i < 50; i++) {
        const agents: VoiceAgentId[] = ['ferni', 'peter-john', 'alex-chen', 'maya-santos'];
        manager.switchVoice(agents[i % agents.length]);
      }
    }).not.toThrow();
  });

  it('should handle multiple subscribers and unsubscribes', () => {
    const manager = getVoiceManager();
    const callbacks: Array<() => void> = [];

    // Add many subscribers
    for (let i = 0; i < 20; i++) {
      const unsubscribe = manager.onVoiceSwitch(vi.fn());
      callbacks.push(unsubscribe);
    }

    // Unsubscribe half
    for (let i = 0; i < 10; i++) {
      callbacks[i]();
    }

    expect(() => {
      manager.switchVoice('peter-john');
    }).not.toThrow();
  });

  it('should maintain state after multiple resets', () => {
    for (let i = 0; i < 5; i++) {
      const manager = getVoiceManager();
      manager.switchVoice('alex-chen');
      resetVoiceManager();
    }

    const freshManager = getVoiceManager();
    expect(freshManager.getCurrentAgentId()).toBe('ferni');
  });
});
