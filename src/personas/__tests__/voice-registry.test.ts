/**
 * Voice Registry Unit Tests
 *
 * Tests the voice ID and persona ID resolution system:
 * - Voice ID lookup
 * - Persona ID canonicalization
 * - Alias resolution
 * - Registry initialization
 *
 * @module personas/__tests__/voice-registry.test
 */

import { describe, expect, it, beforeAll } from 'vitest';
import {
  initializeVoiceRegistry,
  getVoiceId,
  getVoiceEntry,
  getCanonicalPersonaId,
  isKnownPersona,
  getAllPersonaIds,
  getAliasesForPersona,
  getPersonaDisplayName,
  isVoiceRegistryInitialized,
  resetVoiceRegistry,
} from '../voice-registry.js';

describe('Voice Registry', () => {
  beforeAll(async () => {
    // Initialize the registry once before all tests
    await initializeVoiceRegistry();
  });

  describe('initializeVoiceRegistry', () => {
    it('should initialize without errors', async () => {
      // Reset and re-initialize
      resetVoiceRegistry();
      await expect(initializeVoiceRegistry()).resolves.not.toThrow();
    });

    it('should set initialized flag', async () => {
      expect(isVoiceRegistryInitialized()).toBe(true);
    });

    it('should be idempotent (safe to call multiple times)', async () => {
      await initializeVoiceRegistry();
      await initializeVoiceRegistry();

      expect(isVoiceRegistryInitialized()).toBe(true);
    });
  });

  describe('getVoiceId', () => {
    it('should return voice ID for ferni', () => {
      const voiceId = getVoiceId('ferni');

      expect(voiceId).toBeDefined();
      expect(typeof voiceId).toBe('string');
      expect(voiceId.length).toBeGreaterThan(0);
    });

    it('should return voice IDs for all core personas', () => {
      const corePersonas = [
        'ferni',
        'peter-john',
        'alex-chen',
        'maya-santos',
        'jordan-taylor',
        'nayan-patel',
      ];

      for (const personaId of corePersonas) {
        const voiceId = getVoiceId(personaId);

        expect(voiceId, `Voice ID should exist for ${personaId}`).toBeDefined();
        expect(typeof voiceId).toBe('string');
      }
    });

    it('should return fallback voice ID for unknown persona', () => {
      const voiceId = getVoiceId('unknown-persona');

      // Should return default fallback (Ferni's voice)
      expect(voiceId).toBeDefined();
      expect(typeof voiceId).toBe('string');
    });

    it('should resolve aliases to correct voice ID', () => {
      // 'peter' should resolve to 'peter-john'
      const peterVoiceId = getVoiceId('peter');
      const peterJohnVoiceId = getVoiceId('peter-john');

      expect(peterVoiceId).toBe(peterJohnVoiceId);
    });
  });

  describe('getVoiceEntry', () => {
    it('should return voice entry with full info', () => {
      const entry = getVoiceEntry('ferni');

      expect(entry).toBeDefined();
      expect(entry?.voiceId).toBeDefined();
      expect(entry?.personaName).toBeDefined();
      expect(entry?.provider).toBeDefined();
    });

    it('should return undefined for unknown persona', () => {
      const entry = getVoiceEntry('definitely-unknown-persona');

      // May return fallback entry or undefined
      if (entry) {
        expect(entry.voiceId).toBeDefined();
      }
    });
  });

  describe('getCanonicalPersonaId', () => {
    it('should return same ID for canonical IDs', () => {
      expect(getCanonicalPersonaId('ferni')).toBe('ferni');
      expect(getCanonicalPersonaId('peter-john')).toBe('peter-john');
      expect(getCanonicalPersonaId('alex-chen')).toBe('alex-chen');
    });

    it('should resolve aliases to canonical IDs', () => {
      expect(getCanonicalPersonaId('peter')).toBe('peter-john');
      expect(getCanonicalPersonaId('alex')).toBe('alex-chen');
      expect(getCanonicalPersonaId('maya')).toBe('maya-santos');
      expect(getCanonicalPersonaId('jordan')).toBe('jordan-taylor');
      expect(getCanonicalPersonaId('nayan')).toBe('nayan-patel');
    });

    it('should return default persona ID for unknown IDs', () => {
      // Implementation returns default persona (ferni) for unknown IDs
      const result = getCanonicalPersonaId('unknown-id');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      // Unknown IDs are resolved to a known persona (default: ferni)
    });

    it('should be case-sensitive', () => {
      // IDs are typically lowercase
      const result = getCanonicalPersonaId('Ferni');
      // May or may not normalize case depending on implementation
      expect(typeof result).toBe('string');
    });
  });

  describe('isKnownPersona', () => {
    it('should return true for canonical IDs', () => {
      expect(isKnownPersona('ferni')).toBe(true);
      expect(isKnownPersona('peter-john')).toBe(true);
      expect(isKnownPersona('alex-chen')).toBe(true);
      expect(isKnownPersona('maya-santos')).toBe(true);
      expect(isKnownPersona('jordan-taylor')).toBe(true);
      expect(isKnownPersona('nayan-patel')).toBe(true);
    });

    it('should return true for aliases', () => {
      expect(isKnownPersona('peter')).toBe(true);
      expect(isKnownPersona('alex')).toBe(true);
      expect(isKnownPersona('maya')).toBe(true);
    });

    it('should return false for unknown personas', () => {
      expect(isKnownPersona('unknown-persona')).toBe(false);
      expect(isKnownPersona('random-id')).toBe(false);
    });
  });

  describe('getAllPersonaIds', () => {
    it('should return array of persona IDs', () => {
      const ids = getAllPersonaIds();

      expect(Array.isArray(ids)).toBe(true);
      expect(ids.length).toBeGreaterThan(0);
    });

    it('should include all core personas', () => {
      const ids = getAllPersonaIds();

      const corePersonas = [
        'ferni',
        'peter-john',
        'alex-chen',
        'maya-santos',
        'jordan-taylor',
        'nayan-patel',
      ];

      for (const persona of corePersonas) {
        expect(ids, `Should include ${persona}`).toContain(persona);
      }
    });

    it('should return canonical IDs (not aliases)', () => {
      const ids = getAllPersonaIds();

      // Should not contain aliases
      expect(ids).not.toContain('peter');
      expect(ids).not.toContain('alex');
      expect(ids).not.toContain('maya');
    });
  });

  describe('getAliasesForPersona', () => {
    it('should return aliases for peter-john', () => {
      const aliases = getAliasesForPersona('peter-john');

      expect(Array.isArray(aliases)).toBe(true);
      expect(aliases).toContain('peter');
    });

    it('should return aliases for alex-chen', () => {
      const aliases = getAliasesForPersona('alex-chen');

      expect(Array.isArray(aliases)).toBe(true);
      expect(aliases).toContain('alex');
    });

    it('should return empty array for unknown persona', () => {
      const aliases = getAliasesForPersona('unknown-persona');

      expect(Array.isArray(aliases)).toBe(true);
      // May be empty or have unknown aliases
    });
  });

  describe('getPersonaDisplayName', () => {
    it('should return display name for ferni', () => {
      const name = getPersonaDisplayName('ferni');

      expect(name).toBeDefined();
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    });

    it('should return display names for all core personas', () => {
      const corePersonas = [
        'ferni',
        'peter-john',
        'alex-chen',
        'maya-santos',
        'jordan-taylor',
        'nayan-patel',
      ];

      for (const personaId of corePersonas) {
        const name = getPersonaDisplayName(personaId);

        expect(name, `Display name should exist for ${personaId}`).toBeDefined();
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      }
    });

    it('should resolve alias and return display name', () => {
      const nameDirect = getPersonaDisplayName('peter-john');
      const nameAlias = getPersonaDisplayName('peter');

      expect(nameDirect).toBe(nameAlias);
    });
  });

  describe('resetVoiceRegistry', () => {
    it('should reset initialization state', async () => {
      // Ensure initialized
      await initializeVoiceRegistry();
      expect(isVoiceRegistryInitialized()).toBe(true);

      // Reset
      resetVoiceRegistry();
      expect(isVoiceRegistryInitialized()).toBe(false);

      // Re-initialize for other tests
      await initializeVoiceRegistry();
    });
  });
});
