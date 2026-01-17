/**
 * Semantic Data Layer Integration Tests
 *
 * End-to-end tests for the complete semantic data store system.
 *
 * @module tests/data-layer/integration.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock external dependencies
vi.mock('../../memory/firestore-vector-store.js', () => ({
  getFirestoreVectorStore: vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    addDocument: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({ documentCount: 0, indexedCount: 0 }),
  })),
}));

vi.mock('../../memory/embeddings.js', () => ({
  embed: vi.fn().mockResolvedValue(new Array(768).fill(0.1)),
}));

// Import after mocking
import { onStoreChange } from '../../services/data-layer/store-hooks.js';
import {
  shouldIndex,
  buildIndexContent,
  getEntityPolicy,
} from '../../services/data-layer/indexing-policy.js';
import {
  onCommitmentChange,
  onBoundaryChange,
  onDreamChange,
  onHealthGoalChange,
  onCoachingInsightChange,
} from '../../services/data-layer/hooks/index.js';
import { getSemanticContextBuilder } from '../../services/data-layer/semantic-context-builder.js';
import type { EntityType, StoreType } from '../../services/data-layer/types.js';

describe('Semantic Data Layer Integration', () => {
  let capturedStoreChanges: Array<{
    storeType: StoreType;
    entityType: EntityType;
    content: string;
    metadata: Record<string, unknown>;
  }> = [];

  beforeEach(() => {
    capturedStoreChanges = [];
    vi.clearAllMocks();

    // Spy on onStoreChange to capture what hooks send
    vi.spyOn({ onStoreChange }, 'onStoreChange').mockImplementation((data) => {
      capturedStoreChanges.push({
        storeType: data.storeType,
        entityType: data.entityType,
        content: data.content,
        metadata: data.metadata || {},
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Full Pipeline: Hook → Policy → Index', () => {
    it('should flow data from hook through policy check to content building', () => {
      // 1. Create entity data
      const commitment = {
        description: 'Call parents every Sunday',
        madeBy: 'user' as const,
        status: 'active' as const,
        deadline: '2024-12-31',
      };

      // 2. Trigger hook
      onCommitmentChange('user_integration_test', 'commit_1', commitment, 'create');

      // 3. Verify policy would allow indexing
      const policyCheck = shouldIndex('commitment', commitment);
      expect(policyCheck.shouldIndex).toBe(true);

      // 4. Build index content
      const content = buildIndexContent('commitment', commitment);
      expect(content).toContain('commitment');
    });

    it('should correctly skip entities that fail policy', () => {
      // 1. Create low-priority task
      const task = {
        title: 'Low priority task',
        priority: 'low',
        status: 'active',
      };

      // 2. Check policy - should fail importantOnly
      const policyCheck = shouldIndex('task', task);
      expect(policyCheck.shouldIndex).toBe(false);
      expect(policyCheck.reason).toContain('important');
    });

    it('should correctly skip inactive entities', () => {
      const inactiveHabit = {
        name: 'Old habit',
        isActive: false,
        frequency: 'daily',
      };

      const policyCheck = shouldIndex('habit', inactiveHabit);
      expect(policyCheck.shouldIndex).toBe(false);
      expect(policyCheck.reason).toContain('active');
    });
  });

  describe('Cross-Domain Entity Types', () => {
    const testCases: Array<{
      domain: StoreType;
      entityType: EntityType;
      entity: Record<string, unknown>;
    }> = [
      {
        domain: 'trust',
        entityType: 'commitment',
        entity: { description: 'Test', madeBy: 'user', status: 'active' },
      },
      {
        domain: 'trust',
        entityType: 'boundary',
        entity: { topic: 'Test topic', severity: 'soft' },
      },
      {
        domain: 'superhuman',
        entityType: 'dream',
        entity: { dream: 'Test dream', category: 'personal', status: 'active' },
      },
      {
        domain: 'coaching',
        entityType: 'coaching_insight',
        entity: { insight: 'Test', context: 'Test', personaId: 'maya', category: 'behavior' },
      },
      {
        domain: 'health',
        entityType: 'health_goal',
        entity: { goal: 'Test', category: 'fitness', status: 'active' },
      },
      {
        domain: 'career',
        entityType: 'career_goal',
        entity: { goal: 'Test', category: 'promotion', status: 'active' },
      },
      {
        domain: 'wisdom',
        entityType: 'wisdom_insight',
        entity: { insight: 'Test', category: 'self' },
      },
    ];

    it.each(testCases)(
      'should have valid policy for $entityType in $domain domain',
      ({ entityType, entity }) => {
        const policy = getEntityPolicy(entityType);

        expect(policy).toBeDefined();
        expect(policy?.entityType).toBe(entityType);

        // Build content should work
        const content = buildIndexContent(entityType, entity);
        expect(content.length).toBeGreaterThan(0);
      }
    );
  });

  describe('Policy Configuration Consistency', () => {
    it('should have consistent priorities across similar entity types', () => {
      // Trust-building entities should always be indexed
      expect(getEntityPolicy('boundary')?.priority).toBe('always');
      expect(getEntityPolicy('inside_joke')?.priority).toBe('always');
      expect(getEntityPolicy('trust_milestone')?.priority).toBe('always');

      // Goals should be active_only
      expect(getEntityPolicy('health_goal')?.priority).toBe('active_only');
      expect(getEntityPolicy('career_goal')?.priority).toBe('active_only');
      expect(getEntityPolicy('savings_goal')?.priority).toBe('active_only');

      // Wisdom should always be indexed
      expect(getEntityPolicy('wisdom_insight')?.priority).toBe('always');
      expect(getEntityPolicy('life_lesson')?.priority).toBe('always');
    });

    it('should have reasonable TTL values by data category', () => {
      // Permanent data: TTL = 0
      const permanentTypes: EntityType[] = ['boundary', 'life_lesson', 'inside_joke', 'habit'];
      for (const type of permanentTypes) {
        expect(getEntityPolicy(type)?.ttlDays).toBe(0);
      }

      // Time-sensitive: TTL < 90
      expect(getEntityPolicy('calendar_event')?.ttlDays).toBeLessThanOrEqual(90);
      expect(getEntityPolicy('deadline')?.ttlDays).toBeLessThanOrEqual(30);
    });

    it('should have appropriate maxPerUser limits', () => {
      // Contacts can have many entries
      expect(getEntityPolicy('contact')?.conditions?.maxPerUser).toBeGreaterThanOrEqual(50);

      // Book highlights can be numerous
      expect(getEntityPolicy('book_highlight')?.conditions?.maxPerUser).toBeGreaterThanOrEqual(50);

      // Capacity states should be limited (recent only)
      expect(getEntityPolicy('capacity_state')?.conditions?.maxPerUser).toBeLessThanOrEqual(20);
    });
  });

  describe('Context Builder Integration', () => {
    it('should initialize without errors', async () => {
      const builder = getSemanticContextBuilder();
      await expect(builder.buildContext('test_user', 'test query')).resolves.toBeDefined();
    });

    it('should handle proactive context building', async () => {
      const builder = getSemanticContextBuilder();
      const proactive = await builder.buildProactiveContext('test_user');

      expect(proactive).toHaveProperty('commitments');
      expect(proactive).toHaveProperty('patterns');
      expect(proactive).toHaveProperty('opportunities');
    });
  });

  describe('Entity Type Coverage', () => {
    it('should have 90+ entity types defined', async () => {
      const allEntityTypes = new Set<string>();

      // Import the module (already imported at top)
      const { DEFAULT_INDEXING_POLICY } =
        await import('../../services/data-layer/indexing-policy.js');
      DEFAULT_INDEXING_POLICY.entities.forEach((e: { entityType: string }) => {
        allEntityTypes.add(e.entityType);
      });

      expect(allEntityTypes.size).toBeGreaterThanOrEqual(90);
    });

    it('should cover all 9+ domains', async () => {
      const domains = [
        'productivity',
        'financial',
        'lifeData',
        'trust',
        'superhuman',
        'calendar',
        'contacts',
        'coaching',
        'health',
        'media',
        'career',
        'wisdom',
        'emotional',
      ];

      const { getPoliciesByDomain } = await import('../../services/data-layer/indexing-policy.js');
      const byDomain = getPoliciesByDomain();

      let coveredDomains = 0;
      for (const domain of domains) {
        if (byDomain[domain] && byDomain[domain].length > 0) {
          coveredDomains++;
        }
      }

      // Should cover at least 9 domains
      expect(coveredDomains).toBeGreaterThanOrEqual(9);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing metadata gracefully', () => {
      const content = buildIndexContent('habit', { name: 'Test' });
      expect(content).not.toContain('undefined');
      expect(content).not.toContain('null');
    });

    it('should handle unknown entity types', () => {
      const policy = getEntityPolicy('completely_unknown' as EntityType);
      expect(policy).toBeUndefined();

      const shouldIndexResult = shouldIndex('completely_unknown' as EntityType, {});
      expect(shouldIndexResult.shouldIndex).toBe(false);
    });
  });
});

describe('Real-World Scenarios', () => {
  describe('User Journey: Onboarding', () => {
    it('should handle initial data capture correctly', () => {
      // Simulate onboarding data collection
      const onboardingData = {
        habits: [
          { name: 'Morning meditation', frequency: 'daily', isActive: true },
          { name: 'Exercise', frequency: 'weekly', isActive: true },
        ],
        goals: [
          { goal: 'Reduce stress', category: 'mental', status: 'active' },
          { goal: 'Run 5K', category: 'fitness', status: 'active' },
        ],
        boundaries: [{ topic: 'Diet discussions', severity: 'soft', reason: 'Sensitive topic' }],
      };

      // All habits should pass policy
      for (const habit of onboardingData.habits) {
        expect(shouldIndex('habit', habit).shouldIndex).toBe(true);
      }

      // All goals should pass policy
      for (const goal of onboardingData.goals) {
        expect(shouldIndex('health_goal', goal).shouldIndex).toBe(true);
      }

      // Boundaries always pass
      for (const boundary of onboardingData.boundaries) {
        expect(shouldIndex('boundary', boundary).shouldIndex).toBe(true);
      }
    });
  });

  describe('User Journey: Daily Coaching Session', () => {
    it('should capture coaching insights correctly', () => {
      const sessionData = {
        insights: [
          {
            insight: 'User responds well to visual examples',
            context: 'Goal setting',
            personaId: 'maya',
            category: 'behavior',
          },
          {
            insight: 'Perfectionism is blocking progress',
            context: 'Task completion',
            personaId: 'ferni',
            category: 'mindset',
          },
        ],
        breakthrough: {
          description: 'Realized fear of failure was root cause',
          trigger: 'Socratic questioning',
          impact: 'Ready to take first step',
        },
      };

      // All coaching insights should be indexed
      for (const insight of sessionData.insights) {
        expect(shouldIndex('coaching_insight', insight).shouldIndex).toBe(true);
        const content = buildIndexContent('coaching_insight', insight);
        expect(content.length).toBeGreaterThan(0);
      }

      // Breakthrough should be indexed
      expect(shouldIndex('breakthrough_moment', sessionData.breakthrough).shouldIndex).toBe(true);
    });
  });

  describe('User Journey: Persona Handoff', () => {
    it('should prepare context for persona handoff', async () => {
      const builder = getSemanticContextBuilder();

      // Simulate handoff from Ferni to Maya
      const handoffContext = await builder.buildHandoffContext(
        'user123',
        'ferni',
        'maya',
        'User wants to establish better morning routine'
      );

      expect(handoffContext).toContain('ferni');
      expect(handoffContext).toContain('maya');
      expect(handoffContext).toContain('morning routine');
    });
  });
});
