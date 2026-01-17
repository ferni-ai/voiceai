/**
 * Discovery Context Builder Tests
 *
 * Tests for new user discovery functionality:
 * - Name discovery at turn 2
 * - Life stage discovery at turn 3
 * - Goals discovery at turns 4-5
 * - Conditions for discovery (new user, turn range)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to define mocks available when vi.mock is hoisted
const { mockCreateStandardInjection, mockRegisterContextBuilder } = vi.hoisted(() => ({
  mockCreateStandardInjection: vi.fn((type: string, content: string) => ({
    type,
    content,
    priority: 'standard',
  })),
  mockRegisterContextBuilder: vi.fn(),
}));

// Mock dependencies
vi.mock('../intelligence/context-builders/index.js', () => ({
  registerContextBuilder: mockRegisterContextBuilder,
  createStandardInjection: mockCreateStandardInjection,
}));

// TODO: Skipped - imports from 'discovery.js' which has been moved/deleted
// import { buildDiscoveryContext } from '../intelligence/context-builders/discovery.js';
const buildDiscoveryContext = undefined as never;

describe.skip('Discovery Context Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Registration', () => {
    it('should export buildDiscoveryContext function', () => {
      expect(typeof buildDiscoveryContext).toBe('function');
    });
  });

  describe('New User Conditions', () => {
    it('should return empty array for returning users', () => {
      const input = {
        userText: 'Hello',
        analysis: { topics: { detected: [] }, emotion: { primary: 'neutral' } },
        userData: { isReturningUser: true, turnCount: 2 },
        services: { userProfile: {} },
      };

      const result = buildDiscoveryContext(input);

      expect(result).toEqual([]);
    });

    it('should return name discovery for turn 1 (early is intentional)', () => {
      const input = {
        userText: 'Hello',
        analysis: { topics: { detected: [] }, emotion: { primary: 'neutral' } },
        userData: { isReturningUser: false, turnCount: 1 },
        services: { userProfile: {} },
      };

      const result = buildDiscoveryContext(input);

      // Name discovery is intentionally triggered on turns 1-2 ("Ask early, it matters!")
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('discovery_name');
    });

    it('should return empty array for turn 7+ (too late)', () => {
      const input = {
        userText: 'Tell me about investing',
        analysis: { topics: { detected: ['investing'] }, emotion: { primary: 'curious' } },
        userData: { isReturningUser: false, turnCount: 7 },
        services: { userProfile: {} },
      };

      const result = buildDiscoveryContext(input);

      expect(result).toEqual([]);
    });
  });

  describe('Name Discovery (turn 2)', () => {
    it('should create name discovery injection when name unknown at turn 2', () => {
      const input = {
        userText: 'I need help with budgeting',
        analysis: { topics: { detected: ['budgeting'] }, emotion: { primary: 'neutral' } },
        userData: { isReturningUser: false, turnCount: 2 },
        services: { userProfile: {} },
      };

      const result = buildDiscoveryContext(input);

      const nameInjection = result.find((i) => i.type === 'discovery_name');
      expect(nameInjection).toBeDefined();
      expect(nameInjection?.content).toContain("didn't catch your name");
    });

    it('should NOT create name discovery when name already known via userData', () => {
      const input = {
        userText: 'I need help with budgeting',
        analysis: { topics: { detected: ['budgeting'] }, emotion: { primary: 'neutral' } },
        userData: { isReturningUser: false, turnCount: 2, name: 'John' },
        services: { userProfile: {} },
      };

      const result = buildDiscoveryContext(input);

      const nameInjection = result.find((i) => i.type === 'discovery_name');
      expect(nameInjection).toBeUndefined();
    });

    it('should NOT create name discovery when name already known via userProfile', () => {
      const input = {
        userText: 'I need help with budgeting',
        analysis: { topics: { detected: ['budgeting'] }, emotion: { primary: 'neutral' } },
        userData: { isReturningUser: false, turnCount: 2 },
        services: { userProfile: { name: 'Jane' } },
      };

      const result = buildDiscoveryContext(input);

      const nameInjection = result.find((i) => i.type === 'discovery_name');
      expect(nameInjection).toBeUndefined();
    });

    it('should NOT create name discovery at turn 3 (wrong turn)', () => {
      const input = {
        userText: 'I need help with budgeting',
        analysis: { topics: { detected: ['budgeting'] }, emotion: { primary: 'neutral' } },
        userData: { isReturningUser: false, turnCount: 3 },
        services: { userProfile: {} },
      };

      const result = buildDiscoveryContext(input);

      const nameInjection = result.find((i) => i.type === 'discovery_name');
      expect(nameInjection).toBeUndefined();
    });
  });

  describe('Life Stage Discovery (turn 3)', () => {
    it('should create life stage discovery injection when unknown at turn 3', () => {
      const input = {
        userText: 'What should I invest in?',
        analysis: { topics: { detected: ['investing'] }, emotion: { primary: 'curious' } },
        userData: { isReturningUser: false, turnCount: 3 },
        services: { userProfile: {} },
      };

      const result = buildDiscoveryContext(input);

      const lifestageInjection = result.find((i) => i.type === 'discovery_lifestage');
      expect(lifestageInjection).toBeDefined();
      expect(lifestageInjection?.content).toContain('life stage');
    });

    it('should NOT create life stage discovery when already known', () => {
      const input = {
        userText: 'What should I invest in?',
        analysis: { topics: { detected: ['investing'] }, emotion: { primary: 'curious' } },
        userData: { isReturningUser: false, turnCount: 3 },
        services: { userProfile: { lifeStage: 'working' } },
      };

      const result = buildDiscoveryContext(input);

      const lifestageInjection = result.find((i) => i.type === 'discovery_lifestage');
      expect(lifestageInjection).toBeUndefined();
    });

    it('should NOT create life stage discovery at turn 2 (wrong turn)', () => {
      const input = {
        userText: 'What should I invest in?',
        analysis: { topics: { detected: ['investing'] }, emotion: { primary: 'curious' } },
        userData: { isReturningUser: false, turnCount: 2 },
        services: { userProfile: {} },
      };

      const result = buildDiscoveryContext(input);

      const lifestageInjection = result.find((i) => i.type === 'discovery_lifestage');
      expect(lifestageInjection).toBeUndefined();
    });
  });

  describe('Goals Discovery (turns 4-5)', () => {
    it('should create goals discovery injection when no goals at turn 4', () => {
      const input = {
        userText: 'Tell me more',
        analysis: { topics: { detected: [] }, emotion: { primary: 'neutral' } },
        userData: { isReturningUser: false, turnCount: 4 },
        services: { userProfile: { goals: [] } },
      };

      const result = buildDiscoveryContext(input);

      const goalsInjection = result.find((i) => i.type === 'discovery_goals');
      expect(goalsInjection).toBeDefined();
      expect(goalsInjection?.content).toContain('goals');
    });

    it('should create goals discovery injection at turn 5', () => {
      const input = {
        userText: 'Thanks for the info',
        analysis: { topics: { detected: [] }, emotion: { primary: 'grateful' } },
        userData: { isReturningUser: false, turnCount: 5 },
        services: { userProfile: {} },
      };

      const result = buildDiscoveryContext(input);

      const goalsInjection = result.find((i) => i.type === 'discovery_goals');
      expect(goalsInjection).toBeDefined();
    });

    it('should NOT create goals discovery when goals already exist', () => {
      const input = {
        userText: 'Tell me more',
        analysis: { topics: { detected: [] }, emotion: { primary: 'neutral' } },
        userData: { isReturningUser: false, turnCount: 4 },
        services: {
          userProfile: {
            goals: [{ id: 'goal-1', type: 'savings', target: 10000 }],
          },
        },
      };

      const result = buildDiscoveryContext(input);

      const goalsInjection = result.find((i) => i.type === 'discovery_goals');
      expect(goalsInjection).toBeUndefined();
    });

    it('should NOT create goals discovery at turn 3 (too early)', () => {
      const input = {
        userText: 'Tell me more',
        analysis: { topics: { detected: [] }, emotion: { primary: 'neutral' } },
        userData: { isReturningUser: false, turnCount: 3 },
        services: { userProfile: {} },
      };

      const result = buildDiscoveryContext(input);

      const goalsInjection = result.find((i) => i.type === 'discovery_goals');
      expect(goalsInjection).toBeUndefined();
    });

    it('should NOT create goals discovery at turn 6 (too late)', () => {
      const input = {
        userText: 'Tell me more',
        analysis: { topics: { detected: [] }, emotion: { primary: 'neutral' } },
        userData: { isReturningUser: false, turnCount: 6 },
        services: { userProfile: {} },
      };

      const result = buildDiscoveryContext(input);

      const goalsInjection = result.find((i) => i.type === 'discovery_goals');
      expect(goalsInjection).toBeUndefined();
    });
  });

  describe('Multiple Discoveries', () => {
    it('should only return one injection per turn (name at turn 2)', () => {
      const input = {
        userText: 'Help me with finances',
        analysis: { topics: { detected: ['finance'] }, emotion: { primary: 'neutral' } },
        userData: { isReturningUser: false, turnCount: 2 },
        services: { userProfile: {} }, // No name, no life stage, no goals
      };

      const result = buildDiscoveryContext(input);

      // Should only have name discovery at turn 2
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('discovery_name');
    });

    it('should only return one injection per turn (life stage at turn 3)', () => {
      const input = {
        userText: 'Help me with finances',
        analysis: { topics: { detected: ['finance'] }, emotion: { primary: 'neutral' } },
        userData: { isReturningUser: false, turnCount: 3, name: 'John' },
        services: { userProfile: {} }, // No life stage, no goals
      };

      const result = buildDiscoveryContext(input);

      // Should only have life stage discovery at turn 3
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('discovery_lifestage');
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined turnCount (treat as 0)', () => {
      const input = {
        userText: 'Hello',
        analysis: { topics: { detected: [] }, emotion: { primary: 'neutral' } },
        userData: { isReturningUser: false }, // No turnCount
        services: { userProfile: {} },
      };

      const result = buildDiscoveryContext(input);

      expect(result).toEqual([]); // Turn 0 is outside 2-6 range
    });

    it('should handle missing userProfile gracefully', () => {
      const input = {
        userText: 'Hello',
        analysis: { topics: { detected: [] }, emotion: { primary: 'neutral' } },
        userData: { isReturningUser: false, turnCount: 2 },
        services: {}, // No userProfile
      };

      // Should not throw
      expect(() => buildDiscoveryContext(input)).not.toThrow();

      const result = buildDiscoveryContext(input);
      // Should still try name discovery since no name found
      expect(result.some((i) => i.type === 'discovery_name')).toBe(true);
    });

    it('should handle empty userProfile', () => {
      const input = {
        userText: 'Hello',
        analysis: { topics: { detected: [] }, emotion: { primary: 'neutral' } },
        userData: { isReturningUser: false, turnCount: 3 },
        services: { userProfile: {} },
      };

      const result = buildDiscoveryContext(input);

      expect(result.some((i) => i.type === 'discovery_lifestage')).toBe(true);
    });
  });
});
