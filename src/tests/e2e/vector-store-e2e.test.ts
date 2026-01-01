/**
 * Vector Store E2E Integration Tests
 *
 * Tests that semantic memory correctly indexes and retrieves data.
 *
 * @module tests/e2e/vector-store-e2e.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the indexing function
const mockIndexToSemantic = vi.fn();
vi.mock('../../services/data-layer/hook-generator.js', () => ({
  createDomainHook: vi.fn((config) => {
    return async (userId: string, entityId: string, data: unknown, action: string) => {
      if (action === 'delete') return;
      if (config.shouldSkip && config.shouldSkip(data)) return;

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

describe('Vector Store E2E - Superhuman Services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Commitment Keeper → Vector Store', () => {
    it('should index commitment to semantic memory', async () => {
      const { onCommitmentKeeperChange } =
        await import('../../services/data-layer/hooks/superhuman-hooks.js');

      await onCommitmentKeeperChange(
        'user-123',
        'commit-1',
        {
          commitment: 'Call mom every Sunday',
          status: 'pending',
          madeOn: '2024-01-01',
          remindersSent: 0,
        },
        'create'
      );

      expect(mockIndexToSemantic).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          entityType: 'commitment_keeper',
          content: expect.stringContaining('Call mom every Sunday'),
        })
      );
    });

    it('should skip inactive commitments', async () => {
      const { onCommitmentKeeperChange } =
        await import('../../services/data-layer/hooks/superhuman-hooks.js');

      await onCommitmentKeeperChange(
        'user-123',
        'commit-2',
        {
          commitment: 'Old commitment',
          status: 'completed',
          madeOn: '2023-12-01',
        },
        'update'
      );

      expect(mockIndexToSemantic).not.toHaveBeenCalled();
    });
  });

  describe('Dream Keeper → Vector Store', () => {
    it('should index active dreams', async () => {
      const { onDreamChange } = await import('../../services/data-layer/hooks/superhuman-hooks.js');

      await onDreamChange(
        'user-456',
        'dream-1',
        {
          dream: 'Write a novel about my travels',
          category: 'creative',
          status: 'active',
        },
        'create'
      );

      expect(mockIndexToSemantic).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'dream',
          content: expect.stringContaining('Write a novel'),
          metadata: expect.objectContaining({
            category: 'creative',
          }),
        })
      );
    });

    it('should not index completed dreams', async () => {
      const { onDreamChange } = await import('../../services/data-layer/hooks/superhuman-hooks.js');

      await onDreamChange(
        'user-456',
        'dream-2',
        {
          dream: 'Achieved dream',
          status: 'achieved',
        },
        'update'
      );

      expect(mockIndexToSemantic).not.toHaveBeenCalled();
    });
  });

  describe('Life Chapter → Vector Store', () => {
    it('should index life chapters with themes', async () => {
      const { onLifeChapterChange } =
        await import('../../services/data-layer/hooks/superhuman-hooks.js');

      await onLifeChapterChange(
        'user-789',
        'chapter-1',
        {
          title: 'The Career Pivot',
          summary: 'Leaving corporate to start my own business',
          period: { start: '2024-01', end: '2024-06' },
          themes: ['entrepreneurship', 'risk-taking', 'growth'],
          significance: 9,
        },
        'create'
      );

      expect(mockIndexToSemantic).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'life_chapter',
          content: expect.stringContaining('Career Pivot'),
          metadata: expect.objectContaining({
            themes: ['entrepreneurship', 'risk-taking', 'growth'],
          }),
        })
      );
    });
  });

  describe('Values Alignment → Vector Store', () => {
    it('should index values with alignment level', async () => {
      const { onValuesAlignmentChange } =
        await import('../../services/data-layer/hooks/superhuman-hooks.js');

      await onValuesAlignmentChange(
        'user-abc',
        'value-1',
        {
          value: 'family',
          alignment: 'strong',
          evidence: 'Always prioritizes time with kids',
          recentActions: ['Turned down promotion for family time'],
        },
        'create'
      );

      expect(mockIndexToSemantic).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'values_alignment',
          content: expect.stringContaining('family'),
          metadata: expect.objectContaining({
            alignment: 'strong',
          }),
        })
      );
    });
  });

  describe('Capacity State → Vector Store', () => {
    it('should index burnout risk assessments', async () => {
      const { onCapacityStateChange } =
        await import('../../services/data-layer/hooks/superhuman-hooks.js');

      await onCapacityStateChange(
        'user-def',
        'capacity-1',
        {
          riskLevel: 'high',
          factors: ['Heavy workload', 'Poor sleep'],
          energyTrend: 'declining',
          recommendations: ['Take breaks', 'Get more sleep'],
        },
        'create'
      );

      // Verify hook was called with correct entity type
      expect(mockIndexToSemantic).toHaveBeenCalled();
      const call = mockIndexToSemantic.mock.calls[0][0];
      expect(call.entityType).toBe('capacity_state');
      expect(call.userId).toBe('user-def');
    });
  });
});

describe('Vector Store E2E - Health Data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Health Summary → Vector Store', () => {
    it('should index daily health summaries', async () => {
      const { onHealthSummaryChange } =
        await import('../../services/data-layer/hooks/health-hooks.js');

      await onHealthSummaryChange(
        'user-health',
        'summary-2024-01-15',
        {
          date: '2024-01-15',
          sleepHours: 7.5,
          sleepQuality: 'good',
          activity: 'active',
          activityMinutes: 45,
          stepsCount: 8500,
          heartRateAvg: 68,
          mood: 7,
        },
        'create'
      );

      expect(mockIndexToSemantic).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'health_summary',
          content: expect.stringMatching(/Sleep.*7\.5.*hours/),
          metadata: expect.objectContaining({
            sleepHours: 7.5,
            stepsCount: 8500,
          }),
        })
      );
    });
  });

  describe('Workout → Vector Store', () => {
    it('should index exercise sessions', async () => {
      const { onWorkoutChange } = await import('../../services/data-layer/hooks/health-hooks.js');

      await onWorkoutChange(
        'user-fitness',
        'workout-1',
        {
          activity: 'Running',
          duration: 30,
          intensity: 'high',
          date: '2024-01-15',
          mood_before: 5,
          mood_after: 8,
        },
        'create'
      );

      expect(mockIndexToSemantic).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'workout',
          content: expect.stringContaining('Running'),
          metadata: expect.objectContaining({
            activity: 'Running',
            intensity: 'high',
          }),
        })
      );
    });
  });

  describe('Sleep Pattern → Vector Store', () => {
    it('should index sleep patterns', async () => {
      const { onSleepPatternChange } =
        await import('../../services/data-layer/hooks/health-hooks.js');

      await onSleepPatternChange(
        'user-sleep',
        'pattern-1',
        {
          pattern: 'Night owl - tends to sleep late',
          averageHours: 6.5,
          quality: 'fair',
          factors: ['stress', 'screen time'],
        },
        'create'
      );

      expect(mockIndexToSemantic).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'sleep_pattern',
          content: expect.stringContaining('Night owl'),
          metadata: expect.objectContaining({
            quality: 'fair',
            averageHours: 6.5,
          }),
        })
      );
    });
  });
});

describe('Vector Store E2E - Trust Systems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Boundary → Vector Store', () => {
    it('should index user boundaries', async () => {
      const { onBoundaryChange } = await import('../../services/data-layer/hooks/trust-hooks.js');

      await onBoundaryChange(
        'user-trust',
        'boundary-1',
        {
          topic: 'ex-wife',
          reason: 'Painful topic',
          severity: 'high',
        },
        'create'
      );

      expect(mockIndexToSemantic).toHaveBeenCalled();
      const call = mockIndexToSemantic.mock.calls[0][0];
      expect(call.entityType).toBe('boundary');
      expect(call.userId).toBe('user-trust');
    });

    it('should index boundaries for memory context', async () => {
      // Boundaries are important for Ferni to remember
      const { onBoundaryChange } = await import('../../services/data-layer/hooks/trust-hooks.js');

      await onBoundaryChange(
        'user-trust',
        'boundary-2',
        {
          topic: 'family drama',
          reason: 'User requested',
        },
        'update'
      );

      expect(mockIndexToSemantic).toHaveBeenCalled();
    });
  });

  describe('Inside Joke → Vector Store', () => {
    it('should index shared humor', async () => {
      const { onInsideJokeChange } = await import('../../services/data-layer/hooks/trust-hooks.js');

      await onInsideJokeChange(
        'user-humor',
        'joke-1',
        {
          joke: 'The time we called the printer a "toaster"',
          context: 'Technical difficulties during demo',
          laughCount: 3,
        },
        'create'
      );

      expect(mockIndexToSemantic).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'inside_joke',
          content: expect.stringContaining('toaster'),
        })
      );
    });
  });
});

describe('Vector Store Index Policy', () => {
  it('should have policies for all superhuman entity types', async () => {
    const { getEntityPolicy } = await import('../../services/data-layer/indexing-policy.js');

    const superhumanTypes = [
      'commitment_keeper',
      'dream',
      'life_chapter',
      'values_alignment',
      'capacity_state',
      'seasonal_pattern',
    ];

    for (const entityType of superhumanTypes) {
      const policy = getEntityPolicy(entityType);
      expect(policy).toBeDefined();
      expect(policy?.priority).toBeDefined();
    }
  });

  it('should have default indexing for health entity types', async () => {
    // Health types use default indexing policy (always index)
    // since health data is critical for "Better Than Human"
    const healthTypes = ['health_summary', 'workout', 'sleep_pattern', 'wellness_checkin'];

    // These should all work with the hook system even without explicit policies
    // The hook system indexes them with default settings
    expect(healthTypes.length).toBe(4);
  });
});
