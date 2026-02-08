/**
 * Persona Instruct Profiles unit tests
 */

import { describe, expect, it } from 'vitest';
import {
  getPersonaInstructProfile,
  getAllInstructProfiles,
  checkTriggerPatterns,
  getEnergyInstruct,
  getLateNightInstruct,
} from '../persona-instruct-profiles.js';

describe('persona-instruct-profiles', () => {
  describe('getPersonaInstructProfile', () => {
    it('returns profile for known persona ferni', () => {
      const profile = getPersonaInstructProfile('ferni');
      expect(profile.personaId).toBe('ferni');
      expect(profile.name).toBeDefined();
      expect(profile.baseInstruct).toBeDefined();
      expect(profile.speedDescription).toBeDefined();
    });

    it('falls back to Ferni for unknown persona', () => {
      const profile = getPersonaInstructProfile('unknown-persona-xyz');
      expect(profile.personaId).toBe('ferni');
    });
  });

  describe('getAllInstructProfiles', () => {
    it('returns non-empty array of profiles', () => {
      const all = getAllInstructProfiles();
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBeGreaterThan(0);
    });
  });

  describe('checkTriggerPatterns', () => {
    it('returns null when no pattern matches', () => {
      const result = checkTriggerPatterns('ferni', 'hello world');
      expect(result).toBeNull();
    });
  });

  describe('getEnergyInstruct', () => {
    it('returns low energy instruct when energy < 0.3', () => {
      const result = getEnergyInstruct('ferni', 0.2);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
    it('returns null for normal energy', () => {
      const result = getEnergyInstruct('ferni', 0.5);
      expect(result).toBeNull();
    });
  });

  describe('getLateNightInstruct', () => {
    it('returns instruct for late night hour', () => {
      const result = getLateNightInstruct('ferni', 23);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
    it('returns null for daytime hour', () => {
      const result = getLateNightInstruct('ferni', 14);
      expect(result).toBeNull();
    });
  });
});
