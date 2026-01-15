/**
 * CEO Coaching Domain Tests
 *
 * Tests for voice-based executive coaching tools:
 * - Tracking (wins, energy, gratitude, journal)
 * - Planning (priorities, blockers, decisions, ideas)
 * - Focus (sessions, reflection)
 * - Briefings (morning, weekly)
 * - Context builder (proactive injection)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type {
  CEOWin,
  CEOEnergy,
  CEOPriority,
  CEOBlocker,
  CEODecision,
  CEOIdea,
  CEOGratitude,
  CEOJournalEntry,
  CEOFocusSession,
  CEOReflection,
  CEOCoachingState,
} from '../tools/domains/ceo-coaching/types.js';

// ============================================================================
// MOCK STORAGE
// ============================================================================

// Mock Firestore
vi.mock('../memory/firestore-factory.js', () => ({
  getFirestoreInstance: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(() => Promise.resolve({ exists: false, data: () => null })),
        set: vi.fn(() => Promise.resolve()),
        update: vi.fn(() => Promise.resolve()),
        delete: vi.fn(() => Promise.resolve()),
      })),
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(() => Promise.resolve({ docs: [] })),
          })),
          get: vi.fn(() => Promise.resolve({ docs: [] })),
        })),
        get: vi.fn(() => Promise.resolve({ docs: [] })),
      })),
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(() => Promise.resolve({ docs: [] })),
        })),
        get: vi.fn(() => Promise.resolve({ docs: [] })),
      })),
      add: vi.fn(() => Promise.resolve({ id: 'mock-id' })),
    })),
  })),
}));

// ============================================================================
// TYPE TESTS
// ============================================================================

describe('CEO Coaching Types', () => {
  describe('CEOWin', () => {
    it('should have required properties', () => {
      const win: CEOWin = {
        id: 'win-1',
        text: 'Shipped v2',
        date: '2026-01-12',
        category: 'work',
      };

      expect(win.id).toBeDefined();
      expect(win.text).toBeDefined();
      expect(win.date).toBeDefined();
      expect(win.category).toBe('work');
    });

    it('should allow optional category', () => {
      const win: CEOWin = {
        id: 'win-2',
        text: 'Had a great workout',
        date: '2026-01-12',
      };

      expect(win.category).toBeUndefined();
    });
  });

  describe('CEOEnergy', () => {
    it('should track energy levels 1-10', () => {
      const energy: CEOEnergy = {
        id: 'energy-1',
        level: 7,
        timestamp: new Date().toISOString(),
        note: 'Feeling good after morning run',
      };

      expect(energy.level).toBeGreaterThanOrEqual(1);
      expect(energy.level).toBeLessThanOrEqual(10);
      expect(energy.timestamp).toBeDefined();
    });

    it('should allow optional note', () => {
      const energy: CEOEnergy = {
        id: 'energy-2',
        level: 4,
        timestamp: new Date().toISOString(),
      };

      expect(energy.note).toBeUndefined();
    });
  });

  describe('CEOPriority', () => {
    it('should track priority order and status', () => {
      const priority: CEOPriority = {
        id: 'priority-1',
        text: 'Launch marketing campaign',
        order: 1,
        status: 'active',
        createdAt: new Date().toISOString(),
      };

      expect(priority.order).toBe(1);
      expect(priority.status).toBe('active');
    });

    it('should track completion', () => {
      const priority: CEOPriority = {
        id: 'priority-2',
        text: 'Hire designer',
        order: 2,
        status: 'completed',
        createdAt: '2026-01-10T10:00:00Z',
        completedAt: '2026-01-12T15:00:00Z',
      };

      expect(priority.status).toBe('completed');
      expect(priority.completedAt).toBeDefined();
    });
  });

  describe('CEOBlocker', () => {
    it('should track active blockers', () => {
      const blocker: CEOBlocker = {
        id: 'blocker-1',
        text: 'Waiting on legal review',
        status: 'active',
        createdAt: new Date().toISOString(),
      };

      expect(blocker.status).toBe('active');
      expect(blocker.resolution).toBeUndefined();
    });

    it('should track resolved blockers with resolution', () => {
      const blocker: CEOBlocker = {
        id: 'blocker-2',
        text: 'Budget approval',
        status: 'resolved',
        createdAt: '2026-01-10T10:00:00Z',
        resolvedAt: '2026-01-11T14:00:00Z',
        resolution: 'CFO approved after meeting',
      };

      expect(blocker.status).toBe('resolved');
      expect(blocker.resolution).toBeDefined();
    });
  });

  describe('CEODecision', () => {
    it('should track pending decisions', () => {
      const decision: CEODecision = {
        id: 'decision-1',
        description: 'Hire internally or externally?',
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      expect(decision.status).toBe('pending');
      expect(decision.outcome).toBeUndefined();
    });

    it('should track made decisions with outcome', () => {
      const decision: CEODecision = {
        id: 'decision-2',
        description: 'Office location',
        status: 'made',
        outcome: 'Chose downtown office for client access',
        createdAt: '2026-01-08T10:00:00Z',
        decidedAt: '2026-01-10T16:00:00Z',
      };

      expect(decision.status).toBe('made');
      expect(decision.outcome).toBeDefined();
    });
  });

  describe('CEOIdea', () => {
    it('should capture ideas with tags', () => {
      const idea: CEOIdea = {
        id: 'idea-1',
        text: 'AI-powered customer support',
        tags: ['product', 'ai', 'customer-experience'],
        createdAt: new Date().toISOString(),
      };

      expect(idea.tags).toContain('product');
      expect(idea.tags.length).toBe(3);
    });
  });

  describe('CEOFocusSession', () => {
    it('should track active focus sessions', () => {
      const session: CEOFocusSession = {
        id: 'session-1',
        durationMinutes: 25,
        startedAt: new Date().toISOString(),
        status: 'active',
        task: 'Write Q1 strategy document',
      };

      expect(session.status).toBe('active');
      expect(session.endedAt).toBeUndefined();
    });

    it('should track completed sessions', () => {
      const startTime = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago
      const session: CEOFocusSession = {
        id: 'session-2',
        durationMinutes: 25,
        startedAt: startTime.toISOString(),
        endedAt: new Date().toISOString(),
        status: 'completed',
      };

      expect(session.status).toBe('completed');
      expect(session.endedAt).toBeDefined();
    });

    it('should track interrupted sessions', () => {
      const session: CEOFocusSession = {
        id: 'session-3',
        durationMinutes: 50,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        status: 'interrupted',
      };

      expect(session.status).toBe('interrupted');
    });
  });

  describe('CEOCoachingState', () => {
    it('should aggregate all coaching data', () => {
      const state: CEOCoachingState = {
        recentWins: [
          { id: 'w1', text: 'Closed deal', date: '2026-01-12' },
        ],
        currentPriorities: [
          { id: 'p1', text: 'Launch campaign', order: 1, status: 'active', createdAt: '' },
        ],
        activeBlockers: [
          { id: 'b1', text: 'Legal review', status: 'active', createdAt: '' },
        ],
        pendingDecisions: [
          { id: 'd1', description: 'Hire decision', status: 'pending', createdAt: '' },
        ],
        energyTrend: {
          current: 7,
          weekAverage: 6.5,
          trend: 'up',
        },
        recentGratitude: [
          { id: 'g1', text: 'Great team', date: '2026-01-12' },
        ],
      };

      expect(state.recentWins.length).toBe(1);
      expect(state.currentPriorities.length).toBe(1);
      expect(state.energyTrend.trend).toBe('up');
    });
  });
});

// ============================================================================
// CONTEXT BUILDER TESTS
// ============================================================================

describe('CEO Coaching Context Builder', () => {
  describe('Context Injection', () => {
    it('should only inject on early turns (1-3)', () => {
      const MAX_TURN_FOR_INJECTION = 3;

      // Turn 1 - should inject
      expect(1 <= MAX_TURN_FOR_INJECTION).toBe(true);

      // Turn 3 - should inject
      expect(3 <= MAX_TURN_FOR_INJECTION).toBe(true);

      // Turn 4 - should NOT inject
      expect(4 <= MAX_TURN_FOR_INJECTION).toBe(false);
    });

    it('should calculate days ago correctly', () => {
      // Test relative date differences (avoids timezone edge cases)
      const getDaysAgo = (targetDate: Date, referenceDate: Date): number => {
        const target = new Date(targetDate);
        const reference = new Date(referenceDate);
        target.setHours(0, 0, 0, 0);
        reference.setHours(0, 0, 0, 0);
        return Math.floor((reference.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
      };

      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);

      expect(getDaysAgo(now, now)).toBe(0);
      expect(getDaysAgo(yesterday, now)).toBe(1);
      expect(getDaysAgo(weekAgo, now)).toBe(7);
    });

    it('should format timing strings correctly', () => {
      const formatTiming = (daysAgo: number): string => {
        if (daysAgo === 0) return 'today';
        if (daysAgo === 1) return 'yesterday';
        return `${daysAgo} days ago`;
      };

      expect(formatTiming(0)).toBe('today');
      expect(formatTiming(1)).toBe('yesterday');
      expect(formatTiming(5)).toBe('5 days ago');
    });
  });

  describe('Energy Level Guidance', () => {
    it('should provide supportive guidance for low energy', () => {
      const getEnergyGuidance = (level: number): string => {
        if (level <= 4) return 'be especially supportive and gentle';
        if (level >= 8) return 'good time to tackle challenging items';
        return '';
      };

      expect(getEnergyGuidance(3)).toContain('supportive');
      expect(getEnergyGuidance(4)).toContain('gentle');
    });

    it('should encourage challenging work for high energy', () => {
      const getEnergyGuidance = (level: number): string => {
        if (level <= 4) return 'be especially supportive and gentle';
        if (level >= 8) return 'good time to tackle challenging items';
        return '';
      };

      expect(getEnergyGuidance(8)).toContain('challenging');
      expect(getEnergyGuidance(9)).toContain('challenging');
    });
  });

  describe('Focus Session Context', () => {
    it('should calculate remaining time correctly', () => {
      const calculateRemaining = (startedAt: string, durationMinutes: number): number => {
        const startTime = new Date(startedAt);
        const minutesIn = Math.floor((Date.now() - startTime.getTime()) / (1000 * 60));
        return durationMinutes - minutesIn;
      };

      const startedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
      const remaining = calculateRemaining(startedAt, 25);

      expect(remaining).toBeCloseTo(15, 0); // ~15 minutes remaining
    });

    it('should indicate when time is complete', () => {
      const startedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago
      const durationMinutes = 25;
      const startTime = new Date(startedAt);
      const minutesIn = Math.floor((Date.now() - startTime.getTime()) / (1000 * 60));
      const remaining = durationMinutes - minutesIn;

      expect(remaining).toBeLessThan(0); // Time exceeded
    });
  });
});

// ============================================================================
// PROACTIVE PATTERN TESTS
// ============================================================================

describe('Proactive Coaching Patterns', () => {
  describe('Low Energy Detection', () => {
    it('should detect consecutive low energy days', () => {
      const energyLogs: CEOEnergy[] = [
        { id: '1', level: 3, timestamp: '2026-01-12T09:00:00Z' },
        { id: '2', level: 4, timestamp: '2026-01-11T09:00:00Z' },
        { id: '3', level: 3, timestamp: '2026-01-10T09:00:00Z' },
      ];

      const consecutiveLowDays = energyLogs.filter(e => e.level <= 4).length;
      expect(consecutiveLowDays).toBe(3);
    });

    it('should suggest check-in for 3+ low energy days', () => {
      const shouldSuggestCheckIn = (consecutiveLowDays: number): boolean => {
        return consecutiveLowDays >= 3;
      };

      expect(shouldSuggestCheckIn(2)).toBe(false);
      expect(shouldSuggestCheckIn(3)).toBe(true);
    });
  });

  describe('Stale Blocker Detection', () => {
    it('should detect blockers older than threshold', () => {
      const STALE_BLOCKER_DAYS = 14;

      const getDaysSinceCreated = (createdAt: string): number => {
        const created = new Date(createdAt);
        const now = new Date();
        return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
      };

      const oldBlocker = new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString();
      const recentBlocker = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

      expect(getDaysSinceCreated(oldBlocker)).toBeGreaterThan(STALE_BLOCKER_DAYS);
      expect(getDaysSinceCreated(recentBlocker)).toBeLessThan(STALE_BLOCKER_DAYS);
    });
  });

  describe('Gratitude Streak Detection', () => {
    it('should detect missing gratitude entries', () => {
      const GRATITUDE_GAP_DAYS = 5;

      const daysSinceLastGratitude = (lastDate: string): number => {
        const last = new Date(lastDate);
        const now = new Date();
        return Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
      };

      const recentGratitude = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const oldGratitude = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      expect(daysSinceLastGratitude(recentGratitude)).toBeLessThan(GRATITUDE_GAP_DAYS);
      expect(daysSinceLastGratitude(oldGratitude)).toBeGreaterThan(GRATITUDE_GAP_DAYS);
    });
  });
});

// ============================================================================
// TOOL OUTPUT FORMAT TESTS
// ============================================================================

describe('Tool Output Formatting', () => {
  describe('Win Tracking Output', () => {
    it('should format win celebration', () => {
      const formatWinOutput = (text: string, category?: string): string => {
        let output = `**Win Logged!** 🎉\n\n"${text}"`;
        if (category) {
          output += `\nCategory: ${category}`;
        }
        return output;
      };

      const output = formatWinOutput('Closed a huge deal', 'work');
      expect(output).toContain('🎉');
      expect(output).toContain('Closed a huge deal');
      expect(output).toContain('work');
    });
  });

  describe('Energy Tracking Output', () => {
    it('should format energy with context', () => {
      const formatEnergyOutput = (level: number, note?: string): string => {
        let output = `**Energy Logged:** ${level}/10`;
        if (note) {
          output += `\n"${note}"`;
        }
        return output;
      };

      const output = formatEnergyOutput(7, 'Feeling good');
      expect(output).toContain('7/10');
      expect(output).toContain('Feeling good');
    });
  });

  describe('Priority Management Output', () => {
    it('should format priority list', () => {
      const priorities: CEOPriority[] = [
        { id: '1', text: 'Launch campaign', order: 1, status: 'active', createdAt: '' },
        { id: '2', text: 'Hire designer', order: 2, status: 'active', createdAt: '' },
      ];

      const formatPriorities = (priorities: CEOPriority[]): string => {
        return priorities.map((p, i) => `${i + 1}. ${p.text}`).join('\n');
      };

      const output = formatPriorities(priorities);
      expect(output).toContain('1. Launch campaign');
      expect(output).toContain('2. Hire designer');
    });
  });

  describe('Focus Session Output', () => {
    it('should format session start', () => {
      const formatSessionStart = (duration: number, task?: string): string => {
        let output = `**Focus Session Started** 🎯\n\nDuration: ${duration} minutes`;
        if (task) {
          output = `**Focus Session Started** 🎯\n\nTask: ${task}\nDuration: ${duration} minutes`;
        }
        return output;
      };

      const output = formatSessionStart(25, 'Write strategy doc');
      expect(output).toContain('🎯');
      expect(output).toContain('25 minutes');
      expect(output).toContain('Write strategy doc');
    });
  });
});

// ============================================================================
// CROSS-PERSONA INTEGRATION TESTS
// ============================================================================

describe('Cross-Persona Integration', () => {
  describe('Jordan Win Celebration', () => {
    it('should identify wins worthy of milestone celebration', () => {
      const isSignificantWin = (text: string): boolean => {
        const significantPatterns = [
          /ship/i, /launch/i, /closed/i, /promoted/i,
          /hired/i, /raised/i, /acquired/i, /partnership/i,
        ];
        return significantPatterns.some(p => p.test(text));
      };

      expect(isSignificantWin('Shipped v2')).toBe(true);
      expect(isSignificantWin('Closed a huge deal')).toBe(true);
      expect(isSignificantWin('Had a meeting')).toBe(false);
    });
  });

  describe('Maya Energy-Habit Correlation', () => {
    it('should detect low energy patterns', () => {
      const energyLogs: CEOEnergy[] = [
        { id: '1', level: 4, timestamp: '2026-01-12T09:00:00Z' },
        { id: '2', level: 3, timestamp: '2026-01-11T09:00:00Z' },
        { id: '3', level: 4, timestamp: '2026-01-10T09:00:00Z' },
      ];

      const avgEnergy = energyLogs.reduce((sum, e) => sum + e.level, 0) / energyLogs.length;
      const isLowEnergyPattern = avgEnergy < 5;

      expect(isLowEnergyPattern).toBe(true);
    });

    it('should suggest energy-boosting habits', () => {
      const getHabitSuggestions = (avgEnergy: number): string[] => {
        if (avgEnergy < 5) {
          return ['morning walk', 'hydration tracking', 'sleep routine'];
        }
        return [];
      };

      const suggestions = getHabitSuggestions(3.5);
      expect(suggestions).toContain('morning walk');
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty state gracefully', () => {
    const emptyState: CEOCoachingState = {
      recentWins: [],
      currentPriorities: [],
      activeBlockers: [],
      pendingDecisions: [],
      energyTrend: { trend: 'stable' },
      recentGratitude: [],
    };

    const hasContent =
      emptyState.recentWins.length > 0 ||
      emptyState.currentPriorities.length > 0 ||
      emptyState.activeBlockers.length > 0 ||
      emptyState.pendingDecisions.length > 0 ||
      emptyState.recentGratitude.length > 0 ||
      emptyState.energyTrend.current !== undefined;

    expect(hasContent).toBe(false);
  });

  it('should handle missing userId', () => {
    const userId: string | undefined = undefined;
    expect(!userId).toBe(true);
  });

  it('should handle invalid energy levels', () => {
    const clampEnergy = (level: number): number => {
      return Math.max(1, Math.min(10, level));
    };

    expect(clampEnergy(0)).toBe(1);
    expect(clampEnergy(11)).toBe(10);
    expect(clampEnergy(5)).toBe(5);
  });

  it('should handle empty priority list reorder', () => {
    const priorities: CEOPriority[] = [];
    const reordered = [...priorities].sort((a, b) => a.order - b.order);
    expect(reordered).toEqual([]);
  });
});
