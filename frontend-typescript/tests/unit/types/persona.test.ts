/**
 * Persona Types Tests
 * 
 * Tests for persona type definitions and type guards.
 * Uses canonical IDs: ferni, alex-chen, maya-santos, jordan-taylor, jack-bogle, peter-lynch
 */

import { describe, it, expect } from 'vitest';
import {
  isValidPersonaId,
  DEFAULT_PERSONA_ID,
  ALL_PERSONA_IDS,
} from '../../../src/types/persona.js';

describe('Persona Types', () => {
  describe('isValidPersonaId', () => {
    it('should return true for valid persona IDs', () => {
      expect(isValidPersonaId('ferni')).toBe(true);
      expect(isValidPersonaId('jack-bogle')).toBe(true);
      expect(isValidPersonaId('peter-lynch')).toBe(true);
      expect(isValidPersonaId('alex-chen')).toBe(true);
      expect(isValidPersonaId('maya-santos')).toBe(true);
      expect(isValidPersonaId('jordan-taylor')).toBe(true);
    });

    it('should return false for legacy persona IDs (use normalizeAgentId instead)', () => {
      // Legacy IDs are no longer valid - use normalizeAgentId to convert them
      expect(isValidPersonaId('jack-b')).toBe(false);
      expect(isValidPersonaId('comm-specialist')).toBe(false);
      expect(isValidPersonaId('spend-save')).toBe(false);
      expect(isValidPersonaId('event-planner')).toBe(false);
    });

    it('should return false for short aliases (use normalizeAgentId instead)', () => {
      expect(isValidPersonaId('jack')).toBe(false);
      expect(isValidPersonaId('peter')).toBe(false);
      expect(isValidPersonaId('alex')).toBe(false);
      expect(isValidPersonaId('maya')).toBe(false);
      expect(isValidPersonaId('jordan')).toBe(false);
    });

    it('should return false for invalid inputs', () => {
      expect(isValidPersonaId('')).toBe(false);
      expect(isValidPersonaId('unknown')).toBe(false);
    });

    it('should return false for non-strings', () => {
      expect(isValidPersonaId(null)).toBe(false);
      expect(isValidPersonaId(undefined)).toBe(false);
      expect(isValidPersonaId(123)).toBe(false);
      expect(isValidPersonaId({})).toBe(false);
      expect(isValidPersonaId(['ferni'])).toBe(false);
    });
  });

  describe('DEFAULT_PERSONA_ID', () => {
    it('should be ferni (the coach)', () => {
      expect(DEFAULT_PERSONA_ID).toBe('ferni');
    });

    it('should be a valid persona ID', () => {
      expect(isValidPersonaId(DEFAULT_PERSONA_ID)).toBe(true);
    });
  });

  describe('ALL_PERSONA_IDS', () => {
    it('should contain all expected canonical persona IDs', () => {
      expect(ALL_PERSONA_IDS).toContain('ferni');
      expect(ALL_PERSONA_IDS).toContain('jack-bogle');
      expect(ALL_PERSONA_IDS).toContain('peter-lynch');
      expect(ALL_PERSONA_IDS).toContain('alex-chen');
      expect(ALL_PERSONA_IDS).toContain('maya-santos');
      expect(ALL_PERSONA_IDS).toContain('jordan-taylor');
    });

    it('should have exactly 6 personas', () => {
      expect(ALL_PERSONA_IDS.length).toBe(6);
    });

    it('should all be valid persona IDs', () => {
      for (const id of ALL_PERSONA_IDS) {
        expect(isValidPersonaId(id)).toBe(true);
      }
    });
  });
});
