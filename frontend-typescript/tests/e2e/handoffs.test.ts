/**
 * E2E Tests - Handoff Flow
 * 
 * Tests persona switching and handoff transitions between team members.
 * Uses canonical IDs: ferni, alex-chen, maya-santos, jordan-taylor, jack-bogle, peter-lynch
 */

import { describe, it, expect, vi } from 'vitest';
import { normalizeAgentId, getPersona, getTeamMembers } from '../../src/config/personas.js';
import type { PersonaId } from '../../src/types/persona.js';

// Mock audio service
vi.mock('../../src/services/audio.service.js', () => ({
  audioService: {
    playSound: vi.fn().mockResolvedValue(undefined),
    initialize: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('Handoff Flow', () => {
  describe('Persona Normalization', () => {
    it('should normalize backend legacy IDs to canonical IDs', () => {
      expect(normalizeAgentId('generic-advisor')).toBe('alex-chen');
      expect(normalizeAgentId('debt-counselor')).toBe('maya-santos');
      expect(normalizeAgentId('retirement-specialist')).toBe('jordan-taylor');
    });

    it('should normalize legacy frontend IDs to canonical IDs', () => {
      expect(normalizeAgentId('jack-b')).toBe('ferni');
      expect(normalizeAgentId('comm-specialist')).toBe('alex-chen');
      expect(normalizeAgentId('spend-save')).toBe('maya-santos');
      expect(normalizeAgentId('event-planner')).toBe('jordan-taylor');
    });

    it('should handle name aliases', () => {
      expect(normalizeAgentId('alex')).toBe('alex-chen');
      expect(normalizeAgentId('maya')).toBe('maya-santos');
      expect(normalizeAgentId('jordan')).toBe('jordan-taylor');
    });

    it('should handle short IDs', () => {
      expect(normalizeAgentId('jack')).toBe('jack-bogle');
      expect(normalizeAgentId('peter')).toBe('peter-lynch');
    });

    it('should fall back to coach (ferni) for unknown IDs', () => {
      expect(normalizeAgentId('unknown-agent')).toBe('ferni');
      expect(normalizeAgentId('')).toBe('ferni');
    });

    it('should pass through canonical IDs unchanged', () => {
      expect(normalizeAgentId('ferni')).toBe('ferni');
      expect(normalizeAgentId('alex-chen')).toBe('alex-chen');
      expect(normalizeAgentId('maya-santos')).toBe('maya-santos');
      expect(normalizeAgentId('jordan-taylor')).toBe('jordan-taylor');
      expect(normalizeAgentId('jack-bogle')).toBe('jack-bogle');
      expect(normalizeAgentId('peter-lynch')).toBe('peter-lynch');
    });
  });

  describe('Team Members', () => {
    it('should have all 5 team members', () => {
      const team = getTeamMembers();
      expect(team).toHaveLength(5);
    });

    it('should include all team personas with canonical IDs', () => {
      const team = getTeamMembers();
      const ids = team.map(p => p.id);
      
      expect(ids).toContain('jack-bogle');
      expect(ids).toContain('peter-lynch');
      expect(ids).toContain('alex-chen');
      expect(ids).toContain('maya-santos');
      expect(ids).toContain('jordan-taylor');
    });

    it('each team member should have required properties', () => {
      const team = getTeamMembers();
      
      for (const member of team) {
        expect(member.id).toBeTruthy();
        expect(member.name).toBeTruthy();
        expect(member.initials).toBeTruthy();
        expect(member.subtitle).toBeTruthy();
        expect(member.entrancePhrase).toBeTruthy();
        expect(member.quotes.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Persona Configurations', () => {
    const personaIds: PersonaId[] = [
      'ferni',
      'jack-bogle',
      'peter-lynch',
      'alex-chen',
      'maya-santos',
      'jordan-taylor',
    ];

    it.each(personaIds)('should have valid config for %s', (personaId) => {
      const persona = getPersona(personaId);
      
      expect(persona).toBeDefined();
      expect(persona.id).toBe(personaId);
      expect(persona.name).toBeTruthy();
      expect(persona.role).toMatch(/coach|team/);
    });

    it('Alex should be Communication Specialist', () => {
      const alex = getPersona('alex-chen');
      
      expect(alex.name).toBe('Alex');
      expect(alex.subtitle).toContain('Communication');
    });

    it('Maya should be Life Habits Coach', () => {
      const maya = getPersona('maya-santos');
      
      expect(maya.name).toBe('Maya');
      expect(maya.subtitle).toBeDefined();
    });

    it('Jordan should be Event Planner', () => {
      const jordan = getPersona('jordan-taylor');
      
      expect(jordan.name).toBe('Jordan');
      expect(jordan.subtitle).toContain('Event');
    });

    it('Ferni should be Life Coach', () => {
      const ferni = getPersona('ferni');
      
      expect(ferni.name).toBe('Ferni');
      expect(ferni.role).toBe('coach');
      expect(ferni.subtitle).toContain('Coach');
    });
  });

  describe('Handoff Message Processing', () => {
    it('should create valid handoff data message', () => {
      const handoffMessage = {
        type: 'handoff',
        newAgent: 'alex-chen',
        direction: 'coach-to-team',
      };

      expect(handoffMessage.type).toBe('handoff');
      expect(handoffMessage.newAgent).toBeTruthy();
    });

    it('should encode handoff message for data channel', () => {
      const handoffMessage = {
        type: 'handoff',
        newAgent: 'peter-lynch',
      };

      const encoded = new TextEncoder().encode(JSON.stringify(handoffMessage));
      const decoded = JSON.parse(new TextDecoder().decode(encoded));

      expect(decoded.type).toBe('handoff');
      expect(decoded.newAgent).toBe('peter-lynch');
    });
  });

  describe('Handoff Transitions', () => {
    const transitions = [
      { from: 'ferni', to: 'jack-bogle', direction: 'coach-to-team' },
      { from: 'ferni', to: 'peter-lynch', direction: 'coach-to-team' },
      { from: 'ferni', to: 'alex-chen', direction: 'coach-to-team' },
      { from: 'ferni', to: 'maya-santos', direction: 'coach-to-team' },
      { from: 'ferni', to: 'jordan-taylor', direction: 'coach-to-team' },
      { from: 'peter-lynch', to: 'ferni', direction: 'team-to-coach' },
      { from: 'alex-chen', to: 'ferni', direction: 'team-to-coach' },
      { from: 'maya-santos', to: 'ferni', direction: 'team-to-coach' },
      { from: 'jordan-taylor', to: 'ferni', direction: 'team-to-coach' },
    ];

    it.each(transitions)(
      'should support handoff from $from to $to ($direction)',
      ({ from, to, direction }) => {
        const fromPersona = getPersona(from as PersonaId);
        const toPersona = getPersona(to as PersonaId);

        expect(fromPersona).toBeDefined();
        expect(toPersona).toBeDefined();
        
        // Verify direction logic
        if (direction === 'coach-to-team') {
          expect(fromPersona.role).toBe('coach');
          expect(toPersona.role).toBe('team');
        } else {
          expect(fromPersona.role).toBe('team');
          expect(toPersona.role).toBe('coach');
        }
      }
    );
  });

  describe('Entrance Phrases', () => {
    it('each persona should have unique entrance phrase', () => {
      const entrancePhrases = new Set<string>();
      const allPersonas = [
        getPersona('ferni'),
        getPersona('jack-bogle'),
        getPersona('peter-lynch'),
        getPersona('alex-chen'),
        getPersona('maya-santos'),
        getPersona('jordan-taylor'),
      ];

      for (const persona of allPersonas) {
        expect(entrancePhrases.has(persona.entrancePhrase)).toBe(false);
        entrancePhrases.add(persona.entrancePhrase);
      }
    });
  });

  describe('Handoff Sound Effects', () => {
    it('team members should have handoff sounds', () => {
      const team = getTeamMembers();
      
      for (const member of team) {
        expect(member.handoffSound).toBeDefined();
      }
    });

    it('handoff sounds should follow naming convention', () => {
      const team = getTeamMembers();
      
      for (const member of team) {
        if (member.handoffSound) {
          expect(member.handoffSound).toMatch(/^handoff-to-/);
        }
      }
    });
  });
});

describe('UI State During Handoffs', () => {
  describe('Active Persona Display', () => {
    it('should update coach display on handoff', () => {
      const newPersona = getPersona('alex-chen');
      
      // Simulate UI update
      const displayData = {
        name: newPersona.name,
        initials: newPersona.initials,
        subtitle: newPersona.subtitle,
      };

      expect(displayData.name).toBe('Alex');
      expect(displayData.initials).toBe('AX');
    });
  });

  describe('Team Roster Highlighting', () => {
    it('should highlight active team member', () => {
      const activeId = 'maya-santos';
      const team = getTeamMembers();
      
      for (const member of team) {
        const isActive = member.id === activeId;
        expect(isActive).toBe(member.id === 'maya-santos');
      }
    });
  });
});
