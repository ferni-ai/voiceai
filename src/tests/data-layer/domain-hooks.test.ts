/**
 * Domain Hooks Unit Tests
 *
 * Tests for all domain-specific hooks.
 *
 * @module tests/data-layer/domain-hooks.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as storeHooks from '../../services/data-layer/store-hooks.js';

// Mock the store hooks
vi.mock('../../services/data-layer/store-hooks.js', () => ({
  onStoreChange: vi.fn(),
}));

// Import hooks after mocking
import {
  // Trust hooks
  onCommitmentChange,
  onBoundaryChange,
  onInsideJokeChange,
  onGrowthReflectionChange,
  onSmallWinChange,
  // Superhuman hooks
  onDreamChange,
  onLifeChapterChange,
  onValuesAlignmentChange,
  onCapacityStateChange,
  // Calendar hooks
  onCalendarEventChange,
  onMeetingMemoryChange,
  onDeadlineChange,
  // Contacts hooks
  onContactChange,
  onGiftIdeaChange,
  onRelationshipNoteChange,
  // Coaching hooks
  onCoachingInsightChange,
  onBreakthroughMomentChange,
  onStuckPatternChange,
  // Health hooks
  onHealthGoalChange,
  onWellnessCheckinChange,
  // Media hooks
  onMusicPreferenceChange,
  onBookHighlightChange,
  // Career hooks
  onCareerGoalChange,
  onSkillDevelopmentChange,
  // Wisdom hooks
  onWisdomInsightChange,
  onLifeLessonChange,
} from '../../services/data-layer/hooks/index.js';

describe('Domain Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // TRUST HOOKS
  // ============================================================================

  describe('Trust Hooks', () => {
    it('onCommitmentChange should index commitment with correct content', () => {
      const commitment = {
        description: 'Call mom every Sunday',
        madeBy: 'user' as const,
        status: 'active' as const,
        deadline: '2024-12-31',
      };

      onCommitmentChange('user123', 'commit1', commitment, 'create');

      expect(storeHooks.onStoreChange).toHaveBeenCalledWith(
        expect.objectContaining({
          storeType: 'trust',
          entityType: 'commitment',
          userId: 'user123',
          entityId: 'commit1',
          changeType: 'create',
        })
      );

      const call = vi.mocked(storeHooks.onStoreChange).mock.calls[0][0];
      expect(call.content).toContain('Call mom every Sunday');
      expect(call.content).toContain('user');
      expect(call.content).toContain('active');
    });

    it('onCommitmentChange should skip cancelled commitments', () => {
      const commitment = {
        description: 'Cancelled commitment',
        madeBy: 'user' as const,
        status: 'cancelled' as const,
      };

      onCommitmentChange('user123', 'commit1', commitment, 'update');

      expect(storeHooks.onStoreChange).not.toHaveBeenCalled();
    });

    it('onBoundaryChange should index boundary topics', () => {
      const boundary = {
        topic: 'Ex-relationship',
        reason: 'Still processing',
        severity: 'hard' as const,
      };

      onBoundaryChange('user123', 'bound1', boundary, 'create');

      expect(storeHooks.onStoreChange).toHaveBeenCalledWith(
        expect.objectContaining({
          storeType: 'trust',
          entityType: 'boundary',
        })
      );

      const call = vi.mocked(storeHooks.onStoreChange).mock.calls[0][0];
      expect(call.content).toContain('Ex-relationship');
      expect(call.content).toContain('hard');
    });

    it('onInsideJokeChange should capture shared moments', () => {
      const joke = {
        joke: 'The thing about coffee',
        context: 'Morning conversation',
        sharedMoment: 'First week together',
      };

      onInsideJokeChange('user123', 'joke1', joke, 'create');

      const call = vi.mocked(storeHooks.onStoreChange).mock.calls[0][0];
      expect(call.content).toContain('coffee');
      expect(call.content).toContain('Morning conversation');
    });

    it('onGrowthReflectionChange should capture observations', () => {
      const reflection = {
        observation: 'User is more confident in meetings',
        area: 'professional',
        evidence: 'Led two meetings this week',
      };

      onGrowthReflectionChange('user123', 'reflect1', reflection, 'create');

      const call = vi.mocked(storeHooks.onStoreChange).mock.calls[0][0];
      expect(call.content).toContain('more confident');
      expect(call.content).toContain('professional');
    });

    it('onSmallWinChange should celebrate efforts', () => {
      const win = {
        win: 'Completed morning routine',
        effort: 'Woke up 30 min early',
        celebration: 'Acknowledged progress',
      };

      onSmallWinChange('user123', 'win1', win, 'create');

      const call = vi.mocked(storeHooks.onStoreChange).mock.calls[0][0];
      expect(call.content).toContain('morning routine');
      expect(call.content).toContain('30 min early');
    });
  });

  // ============================================================================
  // SUPERHUMAN HOOKS
  // ============================================================================

  describe('Superhuman Hooks', () => {
    it('onDreamChange should index dreams with steps', () => {
      const dream = {
        dream: 'Start a podcast',
        category: 'creative' as const,
        timeframe: 'medium' as const,
        steps: ['Buy equipment', 'Plan first episode'],
        status: 'active' as const,
      };

      onDreamChange('user123', 'dream1', dream, 'create');

      const call = vi.mocked(storeHooks.onStoreChange).mock.calls[0][0];
      expect(call.content).toContain('podcast');
      expect(call.content).toContain('creative');
      expect(call.content).toContain('Buy equipment');
    });

    it('onDreamChange should skip deferred dreams', () => {
      const dream = {
        dream: 'Deferred dream',
        category: 'personal' as const,
        status: 'deferred' as const,
      };

      onDreamChange('user123', 'dream1', dream, 'update');

      expect(storeHooks.onStoreChange).not.toHaveBeenCalled();
    });

    it('onLifeChapterChange should capture narrative', () => {
      const chapter = {
        title: 'The New Beginning',
        summary: 'Started a new career path',
        period: { start: '2024-01-01', end: '2024-06-30' },
        themes: ['growth', 'change', 'courage'],
      };

      onLifeChapterChange('user123', 'chapter1', chapter, 'create');

      const call = vi.mocked(storeHooks.onStoreChange).mock.calls[0][0];
      expect(call.content).toContain('New Beginning');
      expect(call.content).toContain('growth');
      expect(call.content).toContain('change');
    });

    it('onCapacityStateChange should track energy levels', () => {
      const state = {
        level: 'low' as const,
        factors: ['poor sleep', 'high workload'],
        recommendation: 'Consider taking a break',
      };

      onCapacityStateChange('user123', 'state1', state, 'create');

      const call = vi.mocked(storeHooks.onStoreChange).mock.calls[0][0];
      expect(call.content).toContain('low');
      expect(call.content).toContain('poor sleep');
      expect(call.content.toLowerCase()).toContain('taking a break');
    });
  });

  // ============================================================================
  // CALENDAR HOOKS
  // ============================================================================

  describe('Calendar Hooks', () => {
    it('onCalendarEventChange should index events', () => {
      const event = {
        title: 'Team Meeting',
        date: '2024-12-20',
        time: '10:00',
        attendees: ['Alice', 'Bob'],
        notes: 'Discuss Q1 planning',
      };

      onCalendarEventChange('user123', 'event1', event, 'create');

      const call = vi.mocked(storeHooks.onStoreChange).mock.calls[0][0];
      expect(call.content).toContain('Team Meeting');
      expect(call.content).toContain('Alice, Bob');
    });

    it('onMeetingMemoryChange should capture key points', () => {
      const memory = {
        meetingTitle: 'Project Kickoff',
        date: '2024-12-15',
        keyPoints: ['Timeline agreed', 'Budget approved'],
        actionItems: ['Create roadmap', 'Schedule followup'],
      };

      onMeetingMemoryChange('user123', 'memory1', memory, 'create');

      const call = vi.mocked(storeHooks.onStoreChange).mock.calls[0][0];
      expect(call.content).toContain('Project Kickoff');
      expect(call.content).toContain('Timeline agreed');
      expect(call.content).toContain('Create roadmap');
    });

    it('onDeadlineChange should skip completed deadlines', () => {
      const deadline = {
        title: 'Completed deadline',
        date: '2024-12-01',
        importance: 'high' as const,
        status: 'completed' as const,
      };

      onDeadlineChange('user123', 'deadline1', deadline, 'update');

      expect(storeHooks.onStoreChange).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // CONTACTS HOOKS
  // ============================================================================

  describe('Contacts Hooks', () => {
    it('onContactChange should index contact with dates', () => {
      const contact = {
        name: 'John Smith',
        relationship: 'Friend from college',
        notes: 'Likes hiking',
        importantDates: [{ label: 'Birthday', date: '1990-05-15' }],
      };

      onContactChange('user123', 'contact1', contact, 'create');

      const call = vi.mocked(storeHooks.onStoreChange).mock.calls[0][0];
      expect(call.content).toContain('John Smith');
      expect(call.content).toContain('Friend from college');
      expect(call.content).toContain('Birthday');
    });

    it('onGiftIdeaChange should skip given gifts', () => {
      const gift = {
        forContact: 'Mom',
        idea: 'Already given',
        status: 'given' as const,
      };

      onGiftIdeaChange('user123', 'gift1', gift, 'update');

      expect(storeHooks.onStoreChange).not.toHaveBeenCalled();
    });

    it('onRelationshipNoteChange should capture notes', () => {
      const note = {
        contactName: 'Sarah',
        note: 'Prefers morning calls',
        context: 'Mentioned during last chat',
      };

      onRelationshipNoteChange('user123', 'note1', note, 'create');

      const call = vi.mocked(storeHooks.onStoreChange).mock.calls[0][0];
      expect(call.content).toContain('Sarah');
      expect(call.content).toContain('morning calls');
    });
  });

  // ============================================================================
  // COACHING HOOKS
  // ============================================================================

  describe('Coaching Hooks', () => {
    it('onCoachingInsightChange should capture insights', () => {
      const insight = {
        insight: 'User responds well to visual examples',
        context: 'Goal-setting session',
        personaId: 'maya',
        category: 'behavior' as const,
        actionable: true,
      };

      onCoachingInsightChange('user123', 'insight1', insight, 'create');

      const call = vi.mocked(storeHooks.onStoreChange).mock.calls[0][0];
      expect(call.content).toContain('visual examples');
      expect(call.content).toContain('behavior');
    });

    it('onBreakthroughMomentChange should capture aha moments', () => {
      const breakthrough = {
        description: 'Realized fear was holding them back',
        trigger: 'Question about past attempts',
        impact: 'New confidence in approaching goal',
      };

      onBreakthroughMomentChange('user123', 'break1', breakthrough, 'create');

      const call = vi.mocked(storeHooks.onStoreChange).mock.calls[0][0];
      expect(call.content).toContain('fear');
      expect(call.content).toContain('confidence');
    });

    it('onStuckPatternChange should track blockers', () => {
      const pattern = {
        pattern: 'Procrastination before big projects',
        context: 'Work tasks',
        frequency: 'frequent' as const,
        attempts: ['Time blocking', 'Pomodoro'],
      };

      onStuckPatternChange('user123', 'pattern1', pattern, 'create');

      const call = vi.mocked(storeHooks.onStoreChange).mock.calls[0][0];
      expect(call.content).toContain('Procrastination');
      expect(call.content).toContain('frequent');
      expect(call.content).toContain('Pomodoro');
    });
  });

  // ============================================================================
  // HEALTH HOOKS
  // ============================================================================

  describe('Health Hooks', () => {
    it('onHealthGoalChange should index active goals', () => {
      const goal = {
        goal: 'Run a 5K',
        category: 'fitness' as const,
        targetDate: '2024-03-15',
        progress: 40,
        status: 'active' as const,
      };

      onHealthGoalChange('user123', 'goal1', goal, 'create');

      const call = vi.mocked(storeHooks.onStoreChange).mock.calls[0][0];
      expect(call.content).toContain('Run a 5K');
      expect(call.content).toContain('40%');
    });

    it('onHealthGoalChange should skip achieved goals', () => {
      const goal = {
        goal: 'Achieved goal',
        category: 'fitness' as const,
        status: 'achieved' as const,
      };

      onHealthGoalChange('user123', 'goal1', goal, 'update');

      expect(storeHooks.onStoreChange).not.toHaveBeenCalled();
    });

    it('onWellnessCheckinChange should capture checkins', () => {
      const checkin = {
        mood: 7,
        energy: 6,
        notes: 'Good day overall',
        stressLevel: 4,
        timestamp: '2024-12-20T10:00:00Z',
      };

      onWellnessCheckinChange('user123', 'checkin1', checkin, 'create');

      const call = vi.mocked(storeHooks.onStoreChange).mock.calls[0][0];
      expect(call.content).toContain('Mood 7/10');
      expect(call.content).toContain('Energy 6/10');
      expect(call.content).toContain('Stress: 4/10');
    });
  });

  // ============================================================================
  // MEDIA HOOKS
  // ============================================================================

  describe('Media Hooks', () => {
    it('onMusicPreferenceChange should capture preferences', () => {
      const pref = {
        artist: 'Taylor Swift',
        genre: 'Pop',
        mood: 'upbeat',
        context: 'Working out',
      };

      onMusicPreferenceChange('user123', 'pref1', pref, 'create');

      const call = vi.mocked(storeHooks.onStoreChange).mock.calls[0][0];
      expect(call.content).toContain('Taylor Swift');
      expect(call.content).toContain('Pop');
    });

    it('onBookHighlightChange should capture highlights', () => {
      const highlight = {
        bookTitle: 'Atomic Habits',
        author: 'James Clear',
        highlight: 'Small habits make a big difference',
        reflection: 'Applies to my morning routine',
      };

      onBookHighlightChange('user123', 'highlight1', highlight, 'create');

      const call = vi.mocked(storeHooks.onStoreChange).mock.calls[0][0];
      expect(call.content).toContain('Atomic Habits');
      expect(call.content).toContain('James Clear');
      expect(call.content).toContain('Small habits');
    });
  });

  // ============================================================================
  // CAREER HOOKS
  // ============================================================================

  describe('Career Hooks', () => {
    it('onCareerGoalChange should index career goals', () => {
      const goal = {
        goal: 'Get promoted to Senior Engineer',
        category: 'promotion' as const,
        timeframe: '6 months',
        progress: 60,
        status: 'active' as const,
      };

      onCareerGoalChange('user123', 'goal1', goal, 'create');

      const call = vi.mocked(storeHooks.onStoreChange).mock.calls[0][0];
      expect(call.content).toContain('Senior Engineer');
      expect(call.content).toContain('promotion');
      expect(call.content).toContain('60%');
    });

    it('onSkillDevelopmentChange should track skills', () => {
      const skill = {
        skill: 'TypeScript',
        currentLevel: 'intermediate' as const,
        targetLevel: 'advanced' as const,
        method: 'Online course + projects',
        progress: 45,
      };

      onSkillDevelopmentChange('user123', 'skill1', skill, 'create');

      const call = vi.mocked(storeHooks.onStoreChange).mock.calls[0][0];
      expect(call.content).toContain('TypeScript');
      expect(call.content).toContain('intermediate');
      expect(call.content).toContain('advanced');
    });
  });

  // ============================================================================
  // WISDOM HOOKS
  // ============================================================================

  describe('Wisdom Hooks', () => {
    it('onWisdomInsightChange should capture wisdom', () => {
      const insight = {
        insight: 'Happiness comes from within',
        source: 'Meditation practice',
        category: 'self' as const,
        resonanceLevel: 9,
      };

      onWisdomInsightChange('user123', 'insight1', insight, 'create');

      const call = vi.mocked(storeHooks.onStoreChange).mock.calls[0][0];
      expect(call.content).toContain('Happiness comes from within');
      expect(call.content).toContain('Meditation');
      expect(call.content).toContain('9/10');
    });

    it('onLifeLessonChange should capture lessons', () => {
      const lesson = {
        lesson: 'Trust the process',
        experience: 'Building the startup',
        applicationArea: 'Work and personal projects',
      };

      onLifeLessonChange('user123', 'lesson1', lesson, 'create');

      const call = vi.mocked(storeHooks.onStoreChange).mock.calls[0][0];
      expect(call.content).toContain('Trust the process');
      expect(call.content).toContain('startup');
    });
  });
});
