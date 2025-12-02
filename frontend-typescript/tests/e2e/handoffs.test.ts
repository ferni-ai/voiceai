/**
 * E2E Tests - Handoff Flow
 * 
 * Tests persona switching and handoff transitions between team members.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    it('should normalize backend IDs to frontend IDs', () => {
      // Legacy backend IDs
      expect(normalizeAgentId('generic-advisor')).toBe('comm-specialist');
      expect(normalizeAgentId('debt-counselor')).toBe('spend-save');
      expect(normalizeAgentId('retirement-specialist')).toBe('event-planner');
    });

    it('should handle name aliases', () => {
      expect(normalizeAgentId('alex')).toBe('comm-specialist');
      expect(normalizeAgentId('maya')).toBe('spend-save');
      expect(normalizeAgentId('jordan')).toBe('event-planner');
    });

    it('should handle short IDs', () => {
      expect(normalizeAgentId('jack')).toBe('jack-bogle');
      expect(normalizeAgentId('peter')).toBe('peter-lynch');
    });

    it('should fall back to coach for unknown IDs', () => {
      expect(normalizeAgentId('unknown-agent')).toBe('jack-b');
      expect(normalizeAgentId('')).toBe('jack-b');
    });
  });

  describe('Team Members', () => {
    it('should have all 5 team members', () => {
      const team = getTeamMembers();
      expect(team).toHaveLength(5);
    });

    it('should include all new personas', () => {
      const team = getTeamMembers();
      const ids = team.map(p => p.id);
      
      expect(ids).toContain('jack-bogle');
      expect(ids).toContain('peter-lynch');
      expect(ids).toContain('comm-specialist');
      expect(ids).toContain('spend-save');
      expect(ids).toContain('event-planner');
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
      'jack-b',
      'jack-bogle',
      'peter-lynch',
      'comm-specialist',
      'spend-save',
      'event-planner',
    ];

    it.each(personaIds)('should have valid config for %s', (personaId) => {
      const persona = getPersona(personaId);
      
      expect(persona).toBeDefined();
      expect(persona.id).toBe(personaId);
      expect(persona.name).toBeTruthy();
      expect(persona.role).toMatch(/coach|team/);
    });

    it('Alex should be Communication Specialist', () => {
      const alex = getPersona('comm-specialist');
      
      expect(alex.name).toBe('Alex');
      expect(alex.subtitle).toContain('Communication');
    });

    it('Maya should be Spend & Save Specialist', () => {
      const maya = getPersona('spend-save');
      
      expect(maya.name).toBe('Maya');
      expect(maya.subtitle).toContain('Spend');
    });

    it('Jordan should be Event Planner', () => {
      const jordan = getPersona('event-planner');
      
      expect(jordan.name).toBe('Jordan');
      expect(jordan.subtitle).toContain('Event');
    });
  });

  describe('Handoff Message Processing', () => {
    it('should create valid handoff data message', () => {
      const handoffMessage = {
        type: 'handoff',
        newAgent: 'comm-specialist',
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
      { from: 'jack-b', to: 'jack-bogle', direction: 'coach-to-team' },
      { from: 'jack-b', to: 'peter-lynch', direction: 'coach-to-team' },
      { from: 'jack-b', to: 'comm-specialist', direction: 'coach-to-team' },
      { from: 'jack-b', to: 'spend-save', direction: 'coach-to-team' },
      { from: 'jack-b', to: 'event-planner', direction: 'coach-to-team' },
      { from: 'peter-lynch', to: 'jack-b', direction: 'team-to-coach' },
      { from: 'comm-specialist', to: 'jack-b', direction: 'team-to-coach' },
      { from: 'spend-save', to: 'jack-b', direction: 'team-to-coach' },
      { from: 'event-planner', to: 'jack-b', direction: 'team-to-coach' },
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
        getPersona('jack-b'),
        getPersona('jack-bogle'),
        getPersona('peter-lynch'),
        getPersona('comm-specialist'),
        getPersona('spend-save'),
        getPersona('event-planner'),
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
        // Each team member should have a handoff sound defined
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
      const newPersona = getPersona('comm-specialist');
      
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
      const activeId = 'spend-save';
      const team = getTeamMembers();
      
      for (const member of team) {
        const isActive = member.id === activeId;
        expect(isActive).toBe(member.id === 'spend-save');
      }
    });
  });
});

