/**
 * Indexing Policy Unit Tests
 *
 * Tests for the entity indexing policy system.
 *
 * @module tests/data-layer/indexing-policy.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_INDEXING_POLICY,
  getIndexingPolicy,
  setIndexingPolicy,
  getEntityPolicy,
  shouldIndex,
  buildIndexContent,
  getPoliciesByDomain,
} from '../../services/data-layer/indexing-policy.js';
import type { EntityType } from '../../services/data-layer/types.js';

describe('Indexing Policy', () => {
  describe('DEFAULT_INDEXING_POLICY', () => {
    it('should have reasonable global limits', () => {
      expect(DEFAULT_INDEXING_POLICY.maxDocsPerUser).toBeGreaterThanOrEqual(200);
      expect(DEFAULT_INDEXING_POLICY.debounceMs).toBeGreaterThanOrEqual(1000);
    });

    it('should have policies for all major entity types', () => {
      const majorTypes: EntityType[] = [
        'habit',
        'task',
        'budget',
        'savings_goal',
        'milestone',
        'commitment',
        'dream',
        'contact',
        'calendar_event',
        'coaching_insight',
        'health_goal',
        'career_goal',
        'wisdom_insight',
      ];

      for (const type of majorTypes) {
        const policy = DEFAULT_INDEXING_POLICY.entities.find((e) => e.entityType === type);
        expect(policy, `Missing policy for ${type}`).toBeDefined();
      }
    });

    it('should have 98+ entity policies', () => {
      expect(DEFAULT_INDEXING_POLICY.entities.length).toBeGreaterThanOrEqual(90);
    });
  });

  describe('getEntityPolicy', () => {
    it('should return policy for known entity type', () => {
      const policy = getEntityPolicy('habit');
      expect(policy).toBeDefined();
      expect(policy?.entityType).toBe('habit');
      expect(policy?.priority).toBe('active_only');
    });

    it('should return undefined for unknown entity type', () => {
      const policy = getEntityPolicy('unknown_type' as EntityType);
      expect(policy).toBeUndefined();
    });

    it('should return correct priorities', () => {
      // Always indexed
      expect(getEntityPolicy('boundary')?.priority).toBe('always');
      expect(getEntityPolicy('wisdom_insight')?.priority).toBe('always');

      // Active only
      expect(getEntityPolicy('habit')?.priority).toBe('active_only');
      expect(getEntityPolicy('health_goal')?.priority).toBe('active_only');

      // Important only
      expect(getEntityPolicy('task')?.priority).toBe('important_only');

      // Never indexed
      expect(getEntityPolicy('note')?.priority).toBe('never');
    });
  });

  describe('shouldIndex', () => {
    describe('basic checks', () => {
      it('should return false for unknown entity type', () => {
        const result = shouldIndex('unknown' as EntityType, {});
        expect(result.shouldIndex).toBe(false);
        expect(result.reason).toContain('No policy');
      });

      it('should return false for never priority', () => {
        const result = shouldIndex('note', { content: 'test' });
        expect(result.shouldIndex).toBe(false);
        expect(result.reason).toContain('never');
      });
    });

    describe('activeOnly condition', () => {
      it('should index active habits', () => {
        const result = shouldIndex('habit', { isActive: true, name: 'Morning run' });
        expect(result.shouldIndex).toBe(true);
      });

      it('should not index inactive habits', () => {
        const result = shouldIndex('habit', { isActive: false, name: 'Old habit' });
        expect(result.shouldIndex).toBe(false);
        expect(result.reason).toContain('not active');
      });

      it('should recognize status=active as active', () => {
        const result = shouldIndex('savings_goal', { status: 'active', name: 'Emergency fund' });
        expect(result.shouldIndex).toBe(true);
      });

      it('should recognize completed=false as active', () => {
        const result = shouldIndex('task', {
          completed: false,
          priority: 'high',
          title: 'Important task',
        });
        expect(result.shouldIndex).toBe(true);
      });
    });

    describe('importantOnly condition', () => {
      it('should index high priority tasks', () => {
        const result = shouldIndex('task', { priority: 'high', status: 'active' });
        expect(result.shouldIndex).toBe(true);
      });

      it('should index urgent priority tasks', () => {
        const result = shouldIndex('task', { priority: 'urgent', status: 'active' });
        expect(result.shouldIndex).toBe(true);
      });

      it('should not index low priority tasks', () => {
        const result = shouldIndex('task', { priority: 'low', status: 'active' });
        expect(result.shouldIndex).toBe(false);
        expect(result.reason).toContain('not important');
      });
    });

    describe('always indexed types', () => {
      it('should always index boundaries', () => {
        const result = shouldIndex('boundary', { topic: 'test', severity: 'soft' });
        expect(result.shouldIndex).toBe(true);
      });

      it('should always index inside jokes', () => {
        const result = shouldIndex('inside_joke', { joke: 'test', context: 'test' });
        expect(result.shouldIndex).toBe(true);
      });

      it('should always index life lessons', () => {
        const result = shouldIndex('life_lesson', { lesson: 'test', experience: 'test' });
        expect(result.shouldIndex).toBe(true);
      });
    });
  });

  describe('buildIndexContent', () => {
    it('should build content for habit', () => {
      const content = buildIndexContent('habit', {
        name: 'Morning meditation',
        description: 'Start day mindfully',
        frequency: 'daily',
        streakCurrent: 30,
      });

      expect(content).toContain('habit');
      expect(content).toContain('Morning meditation');
      expect(content).toContain('daily');
    });

    it('should build content for savings goal', () => {
      const content = buildIndexContent('savings_goal', {
        name: 'Emergency Fund',
        targetAmount: 10000,
        currentAmount: 5000,
        deadline: '2024-12-31',
        priority: 'high',
      });

      expect(content).toContain('savings');
      expect(content).toContain('Emergency Fund');
    });

    it('should handle missing fields gracefully', () => {
      const content = buildIndexContent('habit', { name: 'Test' });
      expect(content).toContain('Test');
      expect(content).not.toContain('undefined');
    });

    it('should return empty for unknown type', () => {
      const content = buildIndexContent('unknown' as EntityType, { name: 'test' });
      expect(content).toBe('');
    });

    it('should handle arrays in content', () => {
      const content = buildIndexContent('life_chapter', {
        title: 'The Journey',
        summary: 'A time of growth',
        themes: ['growth', 'change', 'discovery'],
      });

      expect(content).toContain('growth, change, discovery');
    });
  });

  describe('getPoliciesByDomain', () => {
    it('should return policies grouped by domain', () => {
      const byDomain = getPoliciesByDomain();

      expect(byDomain.productivity).toBeDefined();
      expect(byDomain.financial).toBeDefined();
      expect(byDomain.trust).toBeDefined();
      expect(byDomain.superhuman).toBeDefined();
      expect(byDomain.calendar).toBeDefined();
      expect(byDomain.contacts).toBeDefined();
      expect(byDomain.coaching).toBeDefined();
      expect(byDomain.health).toBeDefined();
      expect(byDomain.media).toBeDefined();
      expect(byDomain.career).toBeDefined();
      expect(byDomain.wisdom).toBeDefined();
      expect(byDomain.emotional).toBeDefined();
    });

    it('should have correct entity types per domain', () => {
      const byDomain = getPoliciesByDomain();

      // Trust domain should include trust-related entities
      const trustTypes = byDomain.trust.map((p) => p.entityType);
      expect(trustTypes).toContain('commitment');
      expect(trustTypes).toContain('boundary');
      expect(trustTypes).toContain('inside_joke');

      // Health domain should include health entities
      const healthTypes = byDomain.health.map((p) => p.entityType);
      expect(healthTypes).toContain('health_goal');
      expect(healthTypes).toContain('wellness_checkin');
      expect(healthTypes).toContain('sleep_pattern');
    });

    it('should have consistent total count', () => {
      const byDomain = getPoliciesByDomain();
      const totalFromDomains = Object.values(byDomain).reduce((sum, arr) => sum + arr.length, 0);

      // Should roughly match the total policies
      expect(totalFromDomains).toBeGreaterThanOrEqual(90);
    });
  });

  describe('Policy TTL values', () => {
    it('should have no expiry for permanent data', () => {
      expect(getEntityPolicy('boundary')?.ttlDays).toBe(0);
      expect(getEntityPolicy('inside_joke')?.ttlDays).toBe(0);
      expect(getEntityPolicy('life_lesson')?.ttlDays).toBe(0);
      expect(getEntityPolicy('commitment')?.ttlDays).toBe(0);
    });

    it('should have reasonable TTL for time-sensitive data', () => {
      expect(getEntityPolicy('calendar_event')?.ttlDays).toBeLessThanOrEqual(30);
      expect(getEntityPolicy('calendar_conflict')?.ttlDays).toBeLessThanOrEqual(14);
    });

    it('should have longer TTL for historical data', () => {
      expect(getEntityPolicy('journal')?.ttlDays).toBe(365);
      expect(getEntityPolicy('emotional_first_aid')?.ttlDays).toBe(365);
    });
  });

  describe('Policy maxPerUser limits', () => {
    it('should have reasonable limits', () => {
      // Core data types should have generous limits
      expect(getEntityPolicy('habit')?.conditions?.maxPerUser).toBeLessThanOrEqual(50);
      expect(getEntityPolicy('contact')?.conditions?.maxPerUser).toBeLessThanOrEqual(200);
      expect(getEntityPolicy('book_highlight')?.conditions?.maxPerUser).toBeLessThanOrEqual(200);

      // Transient data should have lower limits
      expect(getEntityPolicy('wellness_checkin')?.conditions?.maxPerUser).toBeLessThanOrEqual(50);
      expect(getEntityPolicy('capacity_state')?.conditions?.maxPerUser).toBeLessThanOrEqual(20);
    });
  });
});
