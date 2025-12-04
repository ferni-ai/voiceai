/**
 * Personas Config Tests
 * 
 * Tests for persona configuration and helpers.
 * Uses canonical IDs: ferni, alex-chen, maya-santos, jordan-taylor, jack-bogle, peter-lynch
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
    it('should have ferni persona (coach)', () => {
      expect(PERSONAS['ferni']).toBeDefined();
      expect(PERSONAS['ferni'].name).toBe('Ferni');
      expect(PERSONAS['ferni'].role).toBe('coach');
    });

    it('should have jack-bogle persona', () => {
      expect(PERSONAS['jack-bogle']).toBeDefined();
      expect(PERSONAS['jack-bogle'].name).toBe('Jack');
      expect(PERSONAS['jack-bogle'].role).toBe('team');
    });

    it('should have peter-lynch persona', () => {
      expect(PERSONAS['peter-lynch']).toBeDefined();
      expect(PERSONAS['peter-lynch'].name).toBe('Peter');
      expect(PERSONAS['peter-lynch'].role).toBe('team');
    });

    it('should have alex-chen persona', () => {
      expect(PERSONAS['alex-chen']).toBeDefined();
      expect(PERSONAS['alex-chen'].name).toBe('Alex');
      expect(PERSONAS['alex-chen'].role).toBe('team');
    });

    it('should have maya-santos persona', () => {
      expect(PERSONAS['maya-santos']).toBeDefined();
      expect(PERSONAS['maya-santos'].name).toBe('Maya');
      expect(PERSONAS['maya-santos'].role).toBe('team');
    });

    it('should have jordan-taylor persona', () => {
      expect(PERSONAS['jordan-taylor']).toBeDefined();
      expect(PERSONAS['jordan-taylor'].name).toBe('Jordan');
      expect(PERSONAS['jordan-taylor'].role).toBe('team');
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
      const ferni = getPersona('ferni');
      expect(ferni.id).toBe('ferni');
      expect(ferni.name).toBe('Ferni');

      const jackBogle = getPersona('jack-bogle');
      expect(jackBogle.id).toBe('jack-bogle');

      const peter = getPersona('peter-lynch');
      expect(peter.id).toBe('peter-lynch');
    });

    it('should return coach for invalid ID', () => {
      const result = getPersona('invalid-id' as PersonaId);
      expect(result.id).toBe('ferni');
      expect(result.role).toBe('coach');
    });

    it('should support legacy IDs via lookup', () => {
      // Legacy jack-b should resolve to ferni
      const jackB = getPersona('jack-b');
      expect(jackB.id).toBe('ferni');
      expect(jackB.name).toBe('Ferni');
    });
  });

  describe('getCoach', () => {
    it('should return ferni persona', () => {
      const coach = getCoach();
      expect(coach.id).toBe('ferni');
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
      expect(team.find(p => p.id === 'ferni')).toBeUndefined();
    });

    it('should include all team members', () => {
      const team = getTeamMembers();
      const ids = team.map(p => p.id);
      
      expect(ids).toContain('jack-bogle');
      expect(ids).toContain('peter-lynch');
      expect(ids).toContain('alex-chen');
      expect(ids).toContain('maya-santos');
      expect(ids).toContain('jordan-taylor');
    });
  });

  describe('normalizeAgentId', () => {
    it('should normalize short IDs to canonical', () => {
      expect(normalizeAgentId('jack')).toBe('jack-bogle');
      expect(normalizeAgentId('peter')).toBe('peter-lynch');
      expect(normalizeAgentId('alex')).toBe('alex-chen');
      expect(normalizeAgentId('maya')).toBe('maya-santos');
      expect(normalizeAgentId('jordan')).toBe('jordan-taylor');
    });

    it('should pass through canonical IDs', () => {
      expect(normalizeAgentId('ferni')).toBe('ferni');
      expect(normalizeAgentId('jack-bogle')).toBe('jack-bogle');
      expect(normalizeAgentId('peter-lynch')).toBe('peter-lynch');
      expect(normalizeAgentId('alex-chen')).toBe('alex-chen');
      expect(normalizeAgentId('maya-santos')).toBe('maya-santos');
      expect(normalizeAgentId('jordan-taylor')).toBe('jordan-taylor');
    });

    it('should return coach (ferni) for unknown IDs', () => {
      expect(normalizeAgentId('unknown')).toBe('ferni');
      expect(normalizeAgentId('')).toBe('ferni');
    });

    it('should handle coach aliases', () => {
      expect(normalizeAgentId('coach')).toBe('ferni');
      expect(normalizeAgentId('life-coach')).toBe('ferni');
    });

    it('should map legacy IDs to canonical IDs', () => {
      // Legacy jack-b → ferni
      expect(normalizeAgentId('jack-b')).toBe('ferni');
      // Legacy comm-specialist → alex-chen
      expect(normalizeAgentId('comm-specialist')).toBe('alex-chen');
      // Legacy spend-save → maya-santos
      expect(normalizeAgentId('spend-save')).toBe('maya-santos');
      // Legacy event-planner → jordan-taylor
      expect(normalizeAgentId('event-planner')).toBe('jordan-taylor');
    });

    it('should map backend legacy aliases to canonical IDs', () => {
      // generic-advisor → alex-chen
      expect(normalizeAgentId('generic-advisor')).toBe('alex-chen');
      // debt-counselor → maya-santos
      expect(normalizeAgentId('debt-counselor')).toBe('maya-santos');
      // retirement-specialist → jordan-taylor
      expect(normalizeAgentId('retirement-specialist')).toBe('jordan-taylor');
    });

    it('should normalize communication aliases', () => {
      expect(normalizeAgentId('comm')).toBe('alex-chen');
      expect(normalizeAgentId('communications')).toBe('alex-chen');
    });

    it('should normalize maya aliases', () => {
      expect(normalizeAgentId('budget')).toBe('maya-santos');
      expect(normalizeAgentId('debt')).toBe('maya-santos');
    });

    it('should normalize jordan aliases', () => {
      expect(normalizeAgentId('events')).toBe('jordan-taylor');
      expect(normalizeAgentId('retirement')).toBe('jordan-taylor');
    });
  });
});
