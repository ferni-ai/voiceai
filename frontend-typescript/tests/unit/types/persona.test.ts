/**
 * Persona Types Tests
 * 
 * Tests for persona type definitions and type guards.
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
      expect(isValidPersonaId('jack-b')).toBe(true);
      expect(isValidPersonaId('jack-bogle')).toBe(true);
      expect(isValidPersonaId('peter-lynch')).toBe(true);
    });

    it('should return false for invalid persona IDs', () => {
      expect(isValidPersonaId('jack')).toBe(false);
      expect(isValidPersonaId('peter')).toBe(false);
      expect(isValidPersonaId('')).toBe(false);
      expect(isValidPersonaId('unknown')).toBe(false);
    });

    it('should return false for non-strings', () => {
      expect(isValidPersonaId(null)).toBe(false);
      expect(isValidPersonaId(undefined)).toBe(false);
      expect(isValidPersonaId(123)).toBe(false);
      expect(isValidPersonaId({})).toBe(false);
      expect(isValidPersonaId(['jack-b'])).toBe(false);
    });
  });

  describe('DEFAULT_PERSONA_ID', () => {
    it('should be jack-b', () => {
      expect(DEFAULT_PERSONA_ID).toBe('jack-b');
    });

    it('should be a valid persona ID', () => {
      expect(isValidPersonaId(DEFAULT_PERSONA_ID)).toBe(true);
    });
  });

  describe('ALL_PERSONA_IDS', () => {
    it('should contain all expected persona IDs', () => {
      expect(ALL_PERSONA_IDS).toContain('jack-b');
      expect(ALL_PERSONA_IDS).toContain('jack-bogle');
      expect(ALL_PERSONA_IDS).toContain('peter-lynch');
      expect(ALL_PERSONA_IDS).toContain('comm-specialist');
      expect(ALL_PERSONA_IDS).toContain('spend-save');
      expect(ALL_PERSONA_IDS).toContain('event-planner');
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

