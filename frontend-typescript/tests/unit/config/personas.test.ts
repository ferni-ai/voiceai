/**
 * Personas Config Tests
 * 
 * Tests for persona configuration and helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  PERSONAS,
  getPersona,
  getCoach,
  getTeamMembers,
  normalizeAgentId,
} from '../../../src/config/personas.js';
import type { PersonaId } from '../../../src/types/persona.js';

describe('Personas Config', () => {
  describe('PERSONAS registry', () => {
    it('should have jack-b persona', () => {
      expect(PERSONAS['jack-b']).toBeDefined();
      expect(PERSONAS['jack-b'].name).toBe('Jack B');
      expect(PERSONAS['jack-b'].role).toBe('coach');
    });

    it('should have jack-bogle persona', () => {
      expect(PERSONAS['jack-bogle']).toBeDefined();
      expect(PERSONAS['jack-bogle'].name).toBe('Jack Bogle');
      expect(PERSONAS['jack-bogle'].role).toBe('team');
    });

    it('should have peter-lynch persona', () => {
      expect(PERSONAS['peter-lynch']).toBeDefined();
      expect(PERSONAS['peter-lynch'].name).toBe('Peter Lynch');
      expect(PERSONAS['peter-lynch'].role).toBe('team');
    });

    it('should have comm-specialist persona', () => {
      expect(PERSONAS['comm-specialist']).toBeDefined();
      expect(PERSONAS['comm-specialist'].name).toBe('Alex');
      expect(PERSONAS['comm-specialist'].role).toBe('team');
    });

    it('should have spend-save persona', () => {
      expect(PERSONAS['spend-save']).toBeDefined();
      expect(PERSONAS['spend-save'].name).toBe('Maya');
      expect(PERSONAS['spend-save'].role).toBe('team');
    });

    it('should have event-planner persona', () => {
      expect(PERSONAS['event-planner']).toBeDefined();
      expect(PERSONAS['event-planner'].name).toBe('Jordan');
      expect(PERSONAS['event-planner'].role).toBe('team');
    });

    it('should be frozen/immutable', () => {
      expect(Object.isFrozen(PERSONAS)).toBe(true);
    });

    it('all personas should have required fields', () => {
      for (const persona of Object.values(PERSONAS)) {
        expect(persona.id).toBeTruthy();
        expect(persona.name).toBeTruthy();
        expect(persona.initials).toBeTruthy();
        expect(persona.subtitle).toBeTruthy();
        expect(['coach', 'team']).toContain(persona.role);
        expect(Array.isArray(persona.quotes)).toBe(true);
        expect(persona.quotes.length).toBeGreaterThan(0);
        expect(persona.helperText).toBeTruthy();
      }
    });
  });

  describe('getPersona', () => {
    it('should return correct persona for valid ID', () => {
      const jackB = getPersona('jack-b');
      expect(jackB.id).toBe('jack-b');
      expect(jackB.name).toBe('Jack B');

      const jackBogle = getPersona('jack-bogle');
      expect(jackBogle.id).toBe('jack-bogle');

      const peter = getPersona('peter-lynch');
      expect(peter.id).toBe('peter-lynch');
    });

    it('should return coach for invalid ID', () => {
      const result = getPersona('invalid-id' as PersonaId);
      expect(result.id).toBe('jack-b');
      expect(result.role).toBe('coach');
    });
  });

  describe('getCoach', () => {
    it('should return jack-b persona', () => {
      const coach = getCoach();
      expect(coach.id).toBe('jack-b');
      expect(coach.role).toBe('coach');
    });
  });

  describe('getTeamMembers', () => {
    it('should return only team members', () => {
      const team = getTeamMembers();
      
      expect(team.length).toBe(5);
      expect(team.every(p => p.role === 'team')).toBe(true);
    });

    it('should not include coach', () => {
      const team = getTeamMembers();
      expect(team.find(p => p.id === 'jack-b')).toBeUndefined();
    });

    it('should include all team members', () => {
      const team = getTeamMembers();
      const ids = team.map(p => p.id);
      
      expect(ids).toContain('jack-bogle');
      expect(ids).toContain('peter-lynch');
      expect(ids).toContain('comm-specialist');
      expect(ids).toContain('spend-save');
      expect(ids).toContain('event-planner');
    });
  });

  describe('normalizeAgentId', () => {
    it('should normalize short IDs', () => {
      expect(normalizeAgentId('jack')).toBe('jack-bogle');
      expect(normalizeAgentId('peter')).toBe('peter-lynch');
    });

    it('should pass through full IDs', () => {
      expect(normalizeAgentId('jack-bogle')).toBe('jack-bogle');
      expect(normalizeAgentId('peter-lynch')).toBe('peter-lynch');
      expect(normalizeAgentId('jack-b')).toBe('jack-b');
    });

    it('should return coach for unknown IDs', () => {
      expect(normalizeAgentId('unknown')).toBe('jack-b');
      expect(normalizeAgentId('')).toBe('jack-b');
    });

    it('should handle coach alias', () => {
      expect(normalizeAgentId('coach')).toBe('jack-b');
    });

    it('should map backend legacy IDs to new frontend IDs', () => {
      // generic-advisor → comm-specialist (Alex)
      expect(normalizeAgentId('generic-advisor')).toBe('comm-specialist');
      // debt-counselor → spend-save (Maya)
      expect(normalizeAgentId('debt-counselor')).toBe('spend-save');
      // retirement-specialist → event-planner (Jordan)
      expect(normalizeAgentId('retirement-specialist')).toBe('event-planner');
    });

    it('should normalize new persona aliases', () => {
      // Alex aliases
      expect(normalizeAgentId('alex')).toBe('comm-specialist');
      expect(normalizeAgentId('comm')).toBe('comm-specialist');
      expect(normalizeAgentId('communications')).toBe('comm-specialist');
      // Maya aliases
      expect(normalizeAgentId('maya')).toBe('spend-save');
      expect(normalizeAgentId('budget')).toBe('spend-save');
      expect(normalizeAgentId('debt')).toBe('spend-save');
      // Jordan aliases
      expect(normalizeAgentId('jordan')).toBe('event-planner');
      expect(normalizeAgentId('events')).toBe('event-planner');
      expect(normalizeAgentId('retirement')).toBe('event-planner');
    });
  });
});

