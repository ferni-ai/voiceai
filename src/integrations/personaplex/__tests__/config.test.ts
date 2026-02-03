/**
 * PersonaPlex Configuration Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getFallbackVoice,
  getPersonaPlexConfig,
  getVoiceEmbeddingConfig,
  getVoicePromptForPersona,
  isPersonaPlexEnabled,
  VOICE_EMBEDDING_CONFIGS,
} from '../config.js';

describe('PersonaPlex Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isPersonaPlexEnabled', () => {
    it('returns false by default', () => {
      delete process.env.USE_PERSONAPLEX;
      expect(isPersonaPlexEnabled()).toBe(false);
    });

    it('returns true when USE_PERSONAPLEX=true', () => {
      process.env.USE_PERSONAPLEX = 'true';
      expect(isPersonaPlexEnabled()).toBe(true);
    });

    it('returns false for other values', () => {
      process.env.USE_PERSONAPLEX = 'false';
      expect(isPersonaPlexEnabled()).toBe(false);

      process.env.USE_PERSONAPLEX = '1';
      expect(isPersonaPlexEnabled()).toBe(false);
    });
  });

  describe('getPersonaPlexConfig', () => {
    it('returns default configuration', () => {
      const config = getPersonaPlexConfig();

      expect(config.url).toBe('ws://localhost:8998/api/chat');
      expect(config.voicePromptDir).toBe('./voice-embeddings');
      expect(config.debug).toBe(false);
      expect(config.connectionTimeoutMs).toBe(30000);
      expect(config.sampleRate).toBe(24000);
    });

    it('uses environment variables when set', () => {
      process.env.PERSONAPLEX_URL = 'wss://custom.server:9999/api/chat';
      process.env.PERSONAPLEX_VOICE_DIR = '/custom/path';
      process.env.PERSONAPLEX_DEBUG = 'true';
      process.env.PERSONAPLEX_TIMEOUT_MS = '60000';
      process.env.PERSONAPLEX_SAMPLE_RATE = '48000';

      const config = getPersonaPlexConfig();

      expect(config.url).toBe('wss://custom.server:9999/api/chat');
      expect(config.voicePromptDir).toBe('/custom/path');
      expect(config.debug).toBe(true);
      expect(config.connectionTimeoutMs).toBe(60000);
      expect(config.sampleRate).toBe(48000);
    });

    it('constructs URL from host/port when URL not set', () => {
      delete process.env.PERSONAPLEX_URL;
      process.env.PERSONAPLEX_HOST = '192.168.1.100';
      process.env.PERSONAPLEX_PORT = '9000';

      const config = getPersonaPlexConfig();

      expect(config.url).toBe('ws://192.168.1.100:9000/api/chat');
    });

    it('uses wss when SSL enabled', () => {
      delete process.env.PERSONAPLEX_URL;
      process.env.PERSONAPLEX_SSL = 'true';

      const config = getPersonaPlexConfig();

      expect(config.url).toMatch(/^wss:\/\//);
    });
  });

  describe('VOICE_EMBEDDING_CONFIGS', () => {
    it('has configuration for all personas', () => {
      const expectedPersonas = [
        'ferni',
        'maya-santos',
        'alex-chen',
        'peter-john',
        'jordan-taylor',
        'nayan-patel',
      ];

      const configuredPersonas = VOICE_EMBEDDING_CONFIGS.map((c) => c.personaId);

      for (const persona of expectedPersonas) {
        expect(configuredPersonas).toContain(persona);
      }
    });

    it('each config has required fields', () => {
      for (const config of VOICE_EMBEDDING_CONFIGS) {
        expect(config.personaId).toBeDefined();
        expect(config.cartesiaVoiceId).toBeDefined();
        expect(config.embeddingFilename).toMatch(/\.pt$/);
        expect(config.fallbackVoice).toBeDefined();
        expect(config.sampleText).toBeDefined();
        expect(config.sampleText.length).toBeGreaterThan(100);
      }
    });
  });

  describe('getVoiceEmbeddingConfig', () => {
    it('returns config for valid persona', () => {
      const config = getVoiceEmbeddingConfig('ferni');

      expect(config).toBeDefined();
      expect(config?.personaId).toBe('ferni');
      expect(config?.embeddingFilename).toBe('ferni.pt');
    });

    it('returns config for persona with different casing', () => {
      const config = getVoiceEmbeddingConfig('FERNI');

      expect(config).toBeDefined();
      expect(config?.personaId).toBe('ferni');
    });

    it('returns undefined for unknown persona', () => {
      const config = getVoiceEmbeddingConfig('unknown-persona');

      expect(config).toBeUndefined();
    });
  });

  describe('getVoicePromptForPersona', () => {
    it('returns embedding filename for known persona', () => {
      const voicePrompt = getVoicePromptForPersona('ferni');

      expect(voicePrompt).toBe('ferni.pt');
    });

    it('returns default for unknown persona', () => {
      const voicePrompt = getVoicePromptForPersona('unknown');

      expect(voicePrompt).toBe('NATM1.pt');
    });
  });

  describe('getFallbackVoice', () => {
    it('returns fallback for known persona', () => {
      expect(getFallbackVoice('ferni')).toBe('NATM1');
      expect(getFallbackVoice('maya-santos')).toBe('NATF2');
      expect(getFallbackVoice('alex-chen')).toBe('NATF1');
    });

    it('returns default fallback for unknown persona', () => {
      expect(getFallbackVoice('unknown')).toBe('NATM1');
    });
  });
});
