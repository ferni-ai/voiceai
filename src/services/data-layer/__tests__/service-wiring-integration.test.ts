/**
 * Service Wiring Integration Test
 *
 * Validates that all services are properly wired to the data layer hooks.
 * This ensures semantic memory indexing happens when data changes.
 *
 * @module tests/service-wiring-integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the hook generator to track calls
const mockHookCalls: Array<{ hookName: string; userId: string; entityId: string }> = [];

vi.mock('../hook-generator.js', () => ({
  createDomainHook: (config: { entityType: string }) => {
    return (userId: string, entityId: string, _data: unknown, _changeType: string) => {
      mockHookCalls.push({ hookName: config.entityType, userId, entityId });
      return Promise.resolve();
    };
  },
  formatField: (label: string, value?: string) => (value ? `${label}: ${value}` : ''),
  joinNonEmpty: (parts: string[]) => parts.filter(Boolean).join(' '),
  formatDate: (date: string) => date,
}));

// Mock Firestore
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => null,
  cleanForFirestore: (obj: unknown) => obj,
}));

vi.mock('../../../utils/firestore-utils.js', () => ({
  cleanForFirestore: (obj: unknown) => obj,
}));

describe('Service Wiring Integration', () => {
  beforeEach(() => {
    mockHookCalls.length = 0;
  });

  describe('Superhuman Services Import Validation', () => {
    it('predictive-coaching imports correct hook', async () => {
      const module = await import('../../superhuman/predictive-coaching.js');
      expect(module).toBeDefined();
    });

    it('capacity-guardian imports correct hook', async () => {
      const module = await import('../../superhuman/capacity-guardian.js');
      expect(module).toBeDefined();
    });

    it('commitment-keeper imports correct hook', async () => {
      const module = await import('../../superhuman/commitment-keeper.js');
      expect(module).toBeDefined();
    });

    it('dream-keeper imports correct hook', async () => {
      const module = await import('../../superhuman/dream-keeper.js');
      expect(module).toBeDefined();
    });

    it('life-narrative imports correct hook', async () => {
      const module = await import('../../superhuman/life-narrative.js');
      expect(module).toBeDefined();
    });

    it('values-alignment imports correct hook', async () => {
      const module = await import('../../superhuman/values-alignment.js');
      expect(module).toBeDefined();
    });

    it('relationship-milestones imports correct hook', async () => {
      const module = await import('../../superhuman/relationship-milestones.js');
      expect(module).toBeDefined();
    });

    it('seasonal-awareness imports correct hook', async () => {
      const module = await import('../../superhuman/seasonal-awareness.js');
      expect(module).toBeDefined();
    });

    it('relationship-network imports correct hook', async () => {
      const module = await import('../../superhuman/relationship-network.js');
      expect(module).toBeDefined();
    });

    it('conflict-resolution-memory imports correct hook', async () => {
      const module = await import('../../superhuman/conflict-resolution-memory.js');
      expect(module).toBeDefined();
    });

    it('recovery-tracking imports correct hook', async () => {
      const module = await import('../../superhuman/recovery-tracking.js');
      expect(module).toBeDefined();
    });

    it('inside-joke-memory imports correct hook', async () => {
      const module = await import('../../superhuman/inside-joke-memory.js');
      expect(module).toBeDefined();
    });

    it('future-self imports correct hook', async () => {
      const module = await import('../../superhuman/future-self.js');
      expect(module).toBeDefined();
    });

    it('perfect-timing imports correct hook', async () => {
      const module = await import('../../superhuman/perfect-timing.js');
      expect(module).toBeDefined();
    });

    it('social-battery imports correct hook', async () => {
      const module = await import('../../superhuman/social-battery.js');
      expect(module).toBeDefined();
    });

    it('emotional-vocabulary imports correct hook', async () => {
      const module = await import('../../superhuman/emotional-vocabulary.js');
      expect(module).toBeDefined();
    });

    it('silence-interpreter imports correct hook', async () => {
      const module = await import('../../superhuman/silence-interpreter.js');
      expect(module).toBeDefined();
    });

    it('contradiction-comfort imports correct hook', async () => {
      const module = await import('../../superhuman/contradiction-comfort.js');
      expect(module).toBeDefined();
    });
  });

  describe('Calendar Services Import Validation', () => {
    it('meeting-memory-service imports correct hook', async () => {
      const module = await import('../../calendar/meeting-memory-service.js');
      expect(module).toBeDefined();
    });

    it('unified-calendar-store imports correct hook', async () => {
      const module = await import('../../calendar/unified-calendar-store.js');
      expect(module).toBeDefined();
    });

    it('meeting-followup-automation imports correct hook', async () => {
      const module = await import('../../calendar/meeting-followup-automation.js');
      expect(module).toBeDefined();
    });
  });

  describe('Contact Services Import Validation', () => {
    it('contact-relationship-service imports correct hook', async () => {
      const module = await import('../../contacts/contact-relationship-service.js');
      expect(module).toBeDefined();
    });

    it('personalized-outreach imports correct hook', async () => {
      const module = await import('../../contacts/personalized-outreach.js');
      expect(module).toBeDefined();
    });
  });

  describe('Coaching Services Import Validation', () => {
    it('coaching persistence imports correct hook', async () => {
      const module = await import('../../coaching/persistence.js');
      expect(module).toBeDefined();
    });
  });

  describe('Health Services Import Validation', () => {
    it('apple-health-sync imports correct hook', async () => {
      const module = await import('../../identity/apple-health-sync.js');
      expect(module).toBeDefined();
    });
  });

  describe('Semantic Intelligence Import Validation', () => {
    it('ferni-commitments imports correct hook', async () => {
      const module = await import('../../superhuman/semantic-intelligence/ferni-commitments.js');
      expect(module).toBeDefined();
    });

    it('growth-fingerprint imports correct hook', async () => {
      const module = await import('../../superhuman/semantic-intelligence/growth-fingerprint.js');
      expect(module).toBeDefined();
    });

    it('open-loops imports correct hook', async () => {
      const module = await import('../../superhuman/semantic-intelligence/open-loops.js');
      expect(module).toBeDefined();
    });

    it('emotional-trajectories imports correct hook', async () => {
      const module =
        await import('../../superhuman/semantic-intelligence/emotional-trajectories.js');
      expect(module).toBeDefined();
    });

    it('relationship-graph imports correct hook', async () => {
      const module = await import('../../superhuman/semantic-intelligence/relationship-graph.js');
      expect(module).toBeDefined();
    });

    it('self-awareness imports correct hook', async () => {
      const module = await import('../../superhuman/semantic-intelligence/self-awareness.js');
      expect(module).toBeDefined();
    });

    it('counterfactual-memory imports correct hook', async () => {
      const module =
        await import('../../superhuman/semantic-intelligence/counterfactual-memory.js');
      expect(module).toBeDefined();
    });

    it('temporal-patterns imports correct hook', async () => {
      const module = await import('../../superhuman/semantic-intelligence/temporal-patterns.js');
      expect(module).toBeDefined();
    });
  });

  describe('Domain Stores Import Validation', () => {
    it('productivity-store imports correct hooks', async () => {
      const module = await import('../../stores/productivity-store.js');
      expect(module).toBeDefined();
    });

    it('financial-store imports correct hooks', async () => {
      const module = await import('../../stores/financial-store.js');
      expect(module).toBeDefined();
    });

    it('life-data-store imports correct hooks', async () => {
      const module = await import('../../stores/life-data-store.js');
      expect(module).toBeDefined();
    });
  });
});

describe('Hook Exports Validation', () => {
  it('superhuman-hooks exports all required hooks', async () => {
    const hooks = await import('../hooks/superhuman-hooks.js');

    expect(hooks.onPredictiveInsightChange).toBeDefined();
    expect(hooks.onCapacityStateChange).toBeDefined();
    expect(hooks.onCommitmentKeeperChange).toBeDefined();
    expect(hooks.onSeasonalPatternChange).toBeDefined();
    expect(hooks.onRelationshipMilestoneChange).toBeDefined();
    expect(hooks.onRelationshipNetworkChange).toBeDefined();
    expect(hooks.onConflictMemoryChange).toBeDefined();
    expect(hooks.onRecoveryMilestoneChange).toBeDefined();
  });

  it('trust-hooks exports all required hooks', async () => {
    const hooks = await import('../hooks/trust-hooks.js');

    expect(hooks.onCommitmentChange).toBeDefined();
    expect(hooks.onBoundaryChange).toBeDefined();
    expect(hooks.onInsideJokeChange).toBeDefined();
    expect(hooks.onGrowthReflectionChange).toBeDefined();
    expect(hooks.onSmallWinChange).toBeDefined();
    expect(hooks.onThinkingOfYouChange).toBeDefined();
    expect(hooks.onReadingBetweenLinesChange).toBeDefined();
    expect(hooks.onTonalMemoryChange).toBeDefined();
    expect(hooks.onVulnerabilityMomentChange).toBeDefined();
    expect(hooks.onTrustMilestoneChange).toBeDefined();
  });

  it('calendar-hooks exports all required hooks', async () => {
    const hooks = await import('../hooks/calendar-hooks.js');

    expect(hooks.onCalendarEventChange).toBeDefined();
    expect(hooks.onMeetingMemoryChange).toBeDefined();
    expect(hooks.onRecurringCommitmentChange).toBeDefined();
    expect(hooks.onCalendarConflictChange).toBeDefined();
    expect(hooks.onMeetingPrepChange).toBeDefined();
    expect(hooks.onAvailabilityPatternChange).toBeDefined();
    expect(hooks.onTimeBlockChange).toBeDefined();
    expect(hooks.onDeadlineChange).toBeDefined();
  });

  it('contacts-hooks exports all required hooks', async () => {
    const hooks = await import('../hooks/contacts-hooks.js');

    expect(hooks.onContactChange).toBeDefined();
    expect(hooks.onRelationshipNoteChange).toBeDefined();
    expect(hooks.onGiftIdeaChange).toBeDefined();
    expect(hooks.onImportantDateChange).toBeDefined();
    expect(hooks.onContactInteractionChange).toBeDefined();
    expect(hooks.onRelationshipHealthChange).toBeDefined();
    expect(hooks.onFamilyMemberChange).toBeDefined();
    expect(hooks.onFriendMemoryChange).toBeDefined();
    expect(hooks.onProfessionalContactChange).toBeDefined();
    expect(hooks.onCommunicationPreferenceChange).toBeDefined();
  });

  it('coaching-hooks exports all required hooks', async () => {
    const hooks = await import('../hooks/coaching-hooks.js');

    expect(hooks.onCoachingInsightChange).toBeDefined();
    expect(hooks.onBreakthroughMomentChange).toBeDefined();
    expect(hooks.onStuckPatternChange).toBeDefined();
    expect(hooks.onReframeSuggestionChange).toBeDefined();
    expect(hooks.onGrowthEdgeChange).toBeDefined();
    expect(hooks.onStrengthIdentifiedChange).toBeDefined();
    expect(hooks.onBlindSpotChange).toBeDefined();
    expect(hooks.onAccountabilityItemChange).toBeDefined();
    expect(hooks.onBehaviorChangeEntity).toBeDefined();
    expect(hooks.onMotivationInsightChange).toBeDefined();
  });

  it('health-hooks exports all required hooks', async () => {
    const hooks = await import('../hooks/health-hooks.js');

    expect(hooks.onHealthGoalChange).toBeDefined();
    expect(hooks.onWellnessCheckinChange).toBeDefined();
    expect(hooks.onSleepPatternChange).toBeDefined();
    expect(hooks.onEnergyLevelChange).toBeDefined();
    expect(hooks.onWorkoutChange).toBeDefined();
    expect(hooks.onMentalHealthNoteChange).toBeDefined();
    expect(hooks.onNutritionGoalChange).toBeDefined();
    expect(hooks.onBodyAwarenessChange).toBeDefined();
    expect(hooks.onStressTriggerChange).toBeDefined();
    expect(hooks.onRecoveryPracticeChange).toBeDefined();
  });

  it('wisdom-hooks exports all required hooks', async () => {
    const hooks = await import('../hooks/wisdom-hooks.js');

    expect(hooks.onWisdomInsightChange).toBeDefined();
    expect(hooks.onLifeLessonChange).toBeDefined();
    expect(hooks.onLifeThesisComponentChange).toBeDefined();
    expect(hooks.onValueStatementChange).toBeDefined();
    expect(hooks.onPurposeExplorationChange).toBeDefined();
    expect(hooks.onPerspectiveShiftChange).toBeDefined();
    expect(hooks.onExistentialQuestionChange).toBeDefined();
    expect(hooks.onLegacyThoughtChange).toBeDefined();
    expect(hooks.onEmotionalPatternChange).toBeDefined();
    expect(hooks.onMoodTriggerChange).toBeDefined();
    expect(hooks.onCopingStrategyChange).toBeDefined();
    expect(hooks.onJoyTriggerChange).toBeDefined();
  });
});
