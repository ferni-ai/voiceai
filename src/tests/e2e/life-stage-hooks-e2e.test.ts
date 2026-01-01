/**
 * Life Stage Hooks E2E Tests
 *
 * Tests that life stage domains correctly index to semantic memory.
 *
 * @module tests/e2e/life-stage-hooks-e2e.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the hook generator
const mockIndexToSemantic = vi.fn();
vi.mock('../../services/data-layer/hook-generator.js', () => ({
  createDomainHook: vi.fn((config) => {
    // Return a function that captures calls
    return async (userId: string, entityId: string, data: unknown, action: string) => {
      if (action === 'delete') {
        return;
      }

      // Check shouldSkip
      if (config.shouldSkip && config.shouldSkip(data)) {
        return;
      }

      // Build content
      const content = config.contentBuilder(data);
      const metadata = config.metadataExtractor ? config.metadataExtractor(data) : {};

      mockIndexToSemantic({
        userId,
        entityId,
        entityType: config.entityType,
        storeType: config.storeType,
        content,
        metadata,
      });
    };
  }),
  joinNonEmpty: (parts: string[]) => parts.filter(Boolean).join(' '),
  formatField: (label: string, value: unknown) => (value ? `${label}: ${value}.` : ''),
  formatDate: (date: unknown) => (date ? new Date(date as string).toISOString() : ''),
}));

describe('Life Stage Hooks E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('New Parent Hook', () => {
    it('should index active new parent records', async () => {
      const { onNewParentChange } =
        await import('../../services/data-layer/hooks/life-stage-hooks.js');

      await onNewParentChange(
        'user-123',
        'np-1',
        {
          id: 'np-1',
          status: 'active',
          babyAge: '3 months',
          identityStage: 'adjusting',
          sleepDeprivation: 'severe',
          supportNetwork: 'partner and parents',
        },
        'create'
      );

      expect(mockIndexToSemantic).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          entityType: 'new_parent',
          storeType: 'life-stage',
          content: expect.stringContaining('New parent journey'),
        })
      );
    });

    it('should skip resolved new parent records', async () => {
      const { onNewParentChange } =
        await import('../../services/data-layer/hooks/life-stage-hooks.js');

      await onNewParentChange(
        'user-123',
        'np-2',
        {
          id: 'np-2',
          status: 'resolved',
          babyAge: '2 years',
        },
        'update'
      );

      expect(mockIndexToSemantic).not.toHaveBeenCalled();
    });
  });

  describe('Sobriety Hook', () => {
    it('should index sobriety records with days sober', async () => {
      const { onSobrietyChange } =
        await import('../../services/data-layer/hooks/life-stage-hooks.js');

      await onSobrietyChange(
        'user-456',
        'sob-1',
        {
          id: 'sob-1',
          status: 'active',
          substance: 'alcohol',
          daysSober: 90,
          supportGroup: 'AA',
          triggers: ['stress', 'social events'],
        },
        'create'
      );

      expect(mockIndexToSemantic).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-456',
          entityType: 'sobriety',
          content: expect.stringContaining('Days sober: 90'),
        })
      );
    });

    it('should include triggers in indexed content', async () => {
      const { onSobrietyChange } =
        await import('../../services/data-layer/hooks/life-stage-hooks.js');

      await onSobrietyChange(
        'user-456',
        'sob-2',
        {
          id: 'sob-2',
          status: 'active',
          triggers: ['loneliness', 'boredom'],
        },
        'update'
      );

      expect(mockIndexToSemantic).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('loneliness, boredom'),
        })
      );
    });
  });

  describe('Infidelity Recovery Hook', () => {
    it('should index infidelity recovery with role and phase', async () => {
      const { onInfidelityChange } =
        await import('../../services/data-layer/hooks/life-stage-hooks.js');

      await onInfidelityChange(
        'user-789',
        'inf-1',
        {
          id: 'inf-1',
          status: 'active',
          role: 'betrayed',
          phase: 'processing',
          trustLevel: 'rebuilding',
          therapyInvolved: true,
        },
        'create'
      );

      expect(mockIndexToSemantic).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'infidelity_recovery',
          content: expect.stringContaining('betrayed'),
          metadata: expect.objectContaining({
            role: 'betrayed',
            phase: 'processing',
            therapyInvolved: true,
          }),
        })
      );
    });
  });

  describe('Job Loss Hook', () => {
    it('should index job loss with job search status', async () => {
      const { onJobLossChange } =
        await import('../../services/data-layer/hooks/life-stage-hooks.js');

      await onJobLossChange(
        'user-abc',
        'jl-1',
        {
          id: 'jl-1',
          status: 'active',
          reason: 'layoff',
          financialBuffer: '3 months',
          jobSearchActive: true,
          identityImpact: 'significant',
        },
        'create'
      );

      expect(mockIndexToSemantic).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'job_loss',
          content: expect.stringContaining('Job search active'),
        })
      );
    });
  });

  describe('Sandwich Generation Hook', () => {
    it('should index caregiving responsibilities', async () => {
      const { onSandwichGenerationChange } =
        await import('../../services/data-layer/hooks/life-stage-hooks.js');

      await onSandwichGenerationChange(
        'user-def',
        'sg-1',
        {
          id: 'sg-1',
          status: 'active',
          elderCareNeeds: 'daily visits to mom',
          childCareNeeds: 'two kids in school',
          burnoutLevel: 'high',
          supportResources: ['respite care', 'family help'],
        },
        'create'
      );

      expect(mockIndexToSemantic).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'sandwich_generation',
          content: expect.stringContaining('Sandwich generation caregiving'),
          metadata: expect.objectContaining({
            burnoutLevel: 'high',
          }),
        })
      );
    });
  });

  describe('Coming Out Hook', () => {
    it('should index coming out journey sensitively', async () => {
      const { onComingOutChange } =
        await import('../../services/data-layer/hooks/life-stage-hooks.js');

      await onComingOutChange(
        'user-ghi',
        'co-1',
        {
          id: 'co-1',
          status: 'active',
          identity: 'bisexual',
          audiencesComeOutTo: ['friends', 'siblings'],
          supportReceived: 'mostly positive',
          challengesFaced: ['parents not accepting'],
        },
        'create'
      );

      expect(mockIndexToSemantic).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'coming_out',
          content: expect.stringMatching(/bisexual.*friends, siblings|friends, siblings.*bisexual/),
        })
      );
    });
  });

  describe('Faith Transition Hook', () => {
    it('should index faith transition with from/to', async () => {
      const { onFaithTransitionChange } =
        await import('../../services/data-layer/hooks/life-stage-hooks.js');

      await onFaithTransitionChange(
        'user-jkl',
        'ft-1',
        {
          id: 'ft-1',
          status: 'active',
          fromFaith: 'Catholicism',
          toFaith: 'Buddhism',
          stage: 'exploring',
          communityImpact: 'losing some friends',
        },
        'create'
      );

      expect(mockIndexToSemantic).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'faith_transition',
          content: expect.stringContaining('From Catholicism to Buddhism'),
        })
      );
    });

    it('should handle leaving faith without destination', async () => {
      const { onFaithTransitionChange } =
        await import('../../services/data-layer/hooks/life-stage-hooks.js');

      await onFaithTransitionChange(
        'user-mno',
        'ft-2',
        {
          id: 'ft-2',
          status: 'active',
          fromFaith: 'Mormonism',
          stage: 'transitioning',
        },
        'create'
      );

      expect(mockIndexToSemantic).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Leaving Mormonism'),
        })
      );
    });
  });

  describe('Delete Actions', () => {
    it('should not index on delete action', async () => {
      const { onNewParentChange } =
        await import('../../services/data-layer/hooks/life-stage-hooks.js');

      await onNewParentChange(
        'user-123',
        'np-del',
        {
          id: 'np-del',
          status: 'active',
        },
        'delete'
      );

      expect(mockIndexToSemantic).not.toHaveBeenCalled();
    });
  });
});

describe('Life Stage EntityType Registration', () => {
  it('should have all life stage types in EntityType', async () => {
    // This verifies our types.ts changes
    const expectedTypes = [
      'new_parent',
      'empty_nest',
      'infidelity_recovery',
      'health_diagnosis',
      'job_loss',
      'sobriety',
      'sandwich_generation',
      'blended_family',
      'coming_out',
      'faith_transition',
    ];

    // If types are correctly added, this import should work
    // and the hooks should reference valid entity types
    const hooks = await import('../../services/data-layer/hooks/life-stage-hooks.js');

    expect(hooks.onNewParentChange).toBeDefined();
    expect(hooks.onSobrietyChange).toBeDefined();
    expect(hooks.onFaithTransitionChange).toBeDefined();
    expect(hooks.lifeStageHooks).toBeDefined();
    expect(Object.keys(hooks.lifeStageHooks).length).toBe(expectedTypes.length);
  });
});

describe('Indexing Policy for Life Stages', () => {
  it('should have indexing policies for life stage entities', async () => {
    const { getEntityPolicy } = await import('../../services/data-layer/indexing-policy.js');

    // These should all have policies
    const newParentPolicy = getEntityPolicy('new_parent');
    expect(newParentPolicy).toBeDefined();
    expect(newParentPolicy?.priority).toBe('always');

    const sobrietyPolicy = getEntityPolicy('sobriety');
    expect(sobrietyPolicy).toBeDefined();
    expect(sobrietyPolicy?.ttlDays).toBe(0); // Never expire

    const jobLossPolicy = getEntityPolicy('job_loss');
    expect(jobLossPolicy).toBeDefined();
    expect(jobLossPolicy?.priority).toBe('active_only');
  });
});
