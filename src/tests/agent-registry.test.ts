/**
 * Agent Registry Tests
 *
 * Validates the new ID-based agent system.
 */

import { describe, it, expect } from 'vitest';
import {
  AGENT_IDS,
  ALL_AGENT_IDS,
  AGENT_CONFIGS,
  resolveAgentId,
  getDisplayName,
  getVoiceIdForAgent,
  getBundleId,
  getFrontendId,
  isValidAgent,
  isSameAgent,
  isCoach,
  isTeamMember,
  getTeamMemberIds,
  getHandoffToolName,
  buildHandoffToolMap,
  validateRegistry,
} from '../personas/agent-registry.js';

describe('Agent Registry', () => {
  describe('Agent IDs', () => {
    it('should have exactly 5 agents', () => {
      // Currently: coach, researcher, comm, budget, planner
      expect(ALL_AGENT_IDS).toHaveLength(5);
    });

    it('should have semantic IDs', () => {
      expect(AGENT_IDS.COACH).toBe('coach');
      expect(AGENT_IDS.RESEARCHER).toBe('researcher');
      expect(AGENT_IDS.COMM).toBe('comm');
      expect(AGENT_IDS.BUDGET).toBe('budget');
      expect(AGENT_IDS.PLANNER).toBe('planner');
    });
  });

  describe('ID Resolution', () => {
    it('should resolve agent IDs', () => {
      expect(resolveAgentId('coach')).toBe('coach');
      expect(resolveAgentId('researcher')).toBe('researcher');
      expect(resolveAgentId('comm')).toBe('comm');
      expect(resolveAgentId('budget')).toBe('budget');
      expect(resolveAgentId('planner')).toBe('planner');
    });

    it('should resolve legacy IDs (ferni, jack-b, etc.)', () => {
      expect(resolveAgentId('ferni')).toBe('coach');
      expect(resolveAgentId('jack-b')).toBe('coach');
      expect(resolveAgentId('peter-john')).toBe('researcher');
      expect(resolveAgentId('alex-chen')).toBe('comm');
      expect(resolveAgentId('maya-santos')).toBe('budget');
      expect(resolveAgentId('jordan-taylor')).toBe('planner');
    });

    it('should resolve frontend IDs', () => {
      expect(resolveAgentId('jack-b')).toBe('coach');
      expect(resolveAgentId('comm-specialist')).toBe('comm');
      expect(resolveAgentId('spend-save')).toBe('budget');
      expect(resolveAgentId('event-planner')).toBe('planner');
    });

    it('should resolve short names', () => {
      expect(resolveAgentId('peter')).toBe('researcher');
      expect(resolveAgentId('alex')).toBe('comm');
      expect(resolveAgentId('maya')).toBe('budget');
      expect(resolveAgentId('jordan')).toBe('planner');
    });

    it('should be case-insensitive', () => {
      expect(resolveAgentId('COACH')).toBe('coach');
      expect(resolveAgentId('PETER-JOHN')).toBe('researcher');
    });

    it('should handle whitespace', () => {
      expect(resolveAgentId('  coach  ')).toBe('coach');
      expect(resolveAgentId(' researcher ')).toBe('researcher');
    });

    it('should default to coach for unknown IDs', () => {
      expect(resolveAgentId('unknown')).toBe('coach');
      expect(resolveAgentId('')).toBe('coach');
    });
  });

  describe('Agent Config', () => {
    it('should have configs for all agents', () => {
      for (const id of ALL_AGENT_IDS) {
        expect(AGENT_CONFIGS[id]).toBeDefined();
        expect(AGENT_CONFIGS[id].displayName).toBeDefined();
        expect(AGENT_CONFIGS[id].voiceId).toBeDefined();
        expect(AGENT_CONFIGS[id].bundleId).toBeDefined();
        expect(AGENT_CONFIGS[id].frontendId).toBeDefined();
      }
    });

    it('should have display names', () => {
      expect(getDisplayName('coach')).toBe('Ferni');
      expect(getDisplayName('researcher')).toBe('Peter');
      expect(getDisplayName('comm')).toBe('Alex');
      expect(getDisplayName('budget')).toBe('Maya');
      expect(getDisplayName('planner')).toBe('Jordan');
    });

    it('should get display names from any alias', () => {
      expect(getDisplayName('ferni')).toBe('Ferni');
      expect(getDisplayName('jack-b')).toBe('Ferni');
      expect(getDisplayName('alex-chen')).toBe('Alex');
    });
  });

  describe('Voice IDs', () => {
    it('should return voice IDs for all agents', () => {
      for (const id of ALL_AGENT_IDS) {
        const voiceId = getVoiceIdForAgent(id);
        expect(voiceId).toBeDefined();
        expect(typeof voiceId).toBe('string');
        expect(voiceId.length).toBeGreaterThan(0);
      }
    });

    it('should return same voice ID for aliases', () => {
      expect(getVoiceIdForAgent('coach')).toBe(getVoiceIdForAgent('ferni'));
      expect(getVoiceIdForAgent('comm')).toBe(getVoiceIdForAgent('alex-chen'));
    });
  });

  describe('Bundle IDs', () => {
    it('should return bundle IDs', () => {
      expect(getBundleId('coach')).toBe('ferni');
      expect(getBundleId('researcher')).toBe('peter-john');
      expect(getBundleId('comm')).toBe('alex-chen');
      expect(getBundleId('budget')).toBe('maya-santos');
      expect(getBundleId('planner')).toBe('jordan-taylor');
    });
  });

  describe('Frontend IDs', () => {
    it('should return frontend IDs', () => {
      expect(getFrontendId('coach')).toBe('jack-b');
      expect(getFrontendId('researcher')).toBe('peter-john');
      expect(getFrontendId('comm')).toBe('comm-specialist');
      expect(getFrontendId('budget')).toBe('spend-save');
      expect(getFrontendId('planner')).toBe('event-planner');
    });
  });

  describe('Comparison Helpers', () => {
    it('should identify same agent with different IDs', () => {
      expect(isSameAgent('coach', 'ferni')).toBe(true);
      expect(isSameAgent('coach', 'jack-b')).toBe(true);
      expect(isSameAgent('comm', 'alex-chen')).toBe(true);
      expect(isSameAgent('comm', 'comm-specialist')).toBe(true);
    });

    it('should identify different agents', () => {
      expect(isSameAgent('coach', 'researcher')).toBe(false);
      expect(isSameAgent('comm', 'budget')).toBe(false);
    });

    it('should identify coach', () => {
      expect(isCoach('coach')).toBe(true);
      expect(isCoach('ferni')).toBe(true);
      expect(isCoach('jack-b')).toBe(true);
      expect(isCoach('researcher')).toBe(false);
    });

    it('should identify team members', () => {
      expect(isTeamMember('coach')).toBe(false);
      expect(isTeamMember('researcher')).toBe(true);
      expect(isTeamMember('comm')).toBe(true);
      expect(isTeamMember('budget')).toBe(true);
      expect(isTeamMember('planner')).toBe(true);
    });

    it('should get team member IDs', () => {
      const teamMembers = getTeamMemberIds();
      expect(teamMembers).toHaveLength(4);
      expect(teamMembers).not.toContain('coach');
      expect(teamMembers).toContain('researcher');
    });
  });

  describe('Handoff Tools', () => {
    it('should return handoff tool names', () => {
      expect(getHandoffToolName('coach')).toBe('handoffToCoach');
      expect(getHandoffToolName('researcher')).toBe('handoffToResearcher');
      expect(getHandoffToolName('comm')).toBe('handoffToComm');
      expect(getHandoffToolName('budget')).toBe('handoffToBudget');
      expect(getHandoffToolName('planner')).toBe('handoffToPlanner');
    });

    it('should build handoff tool map', () => {
      const map = buildHandoffToolMap();
      expect(map.get('ferni')).toBe('handoffToCoach');
      expect(map.get('jack-b')).toBe('handoffToCoach');
      expect(map.get('alex-chen')).toBe('handoffToComm');
      expect(map.get('comm-specialist')).toBe('handoffToComm');
    });
  });

  describe('Validation', () => {
    it('should validate agent inputs', () => {
      expect(isValidAgent('coach')).toBe(true);
      expect(isValidAgent('ferni')).toBe(true);
      expect(isValidAgent('unknown')).toBe(false);
    });

    it('should validate registry consistency', () => {
      const result = validateRegistry();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});

describe('Migration Compatibility', () => {
  it('should resolve ALL legacy IDs used in the codebase', () => {
    // From handoff.ts and voice-agent.ts
    const legacyIds = [
      'jack-b',
      'ferni',
      'peter-john',
      'comm-specialist',
      'alex-chen',
      'alex',
      'spend-save',
      'maya-santos',
      'maya',
      'event-planner',
      'jordan-taylor',
      'jordan',
      'peter',
      'coach',
      'life-coach',
    ];

    for (const id of legacyIds) {
      expect(isValidAgent(id)).toBe(true);
      const resolved = resolveAgentId(id);
      expect(ALL_AGENT_IDS).toContain(resolved);
    }
  });
});
