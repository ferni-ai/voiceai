/**
 * The proactive engine's commitment reminder: a stable id, so its cooldown can
 * match, and only the caller's own commitments.
 *
 * Before: the id was `commitment_${Date.now()}`, so marking it surfaced never
 * stopped the next call, and the newest commitment was taken whatever it was.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkProactiveTriggers,
  clearProactiveState,
  markInsightSurfaced,
} from '../proactive-engine.js';
import type { ContextWindow } from '../../context-assembler.js';

const USER = 'user-proactive-commitment';

function contextWith(activeCommitments: string[]): ContextWindow {
  return {
    immediate: {
      timeOfDay: 'afternoon',
      dayOfWeek: 'Wednesday',
      isWeekend: false,
      hour: 15,
      isLateNight: false,
    },
    activeDomains: [],
    today: { agenda: [], upcomingMeetings: 0, hasImportantEvent: false },
    recent: { topicsDiscussed: [], emotionalPatterns: [], openThreads: [] },
    relationship: {
      trustLevel: 0.5,
      sessionCount: 3,
      daysSinceFirstContact: 10,
      activeCommitments,
    },
    capacity: { bandwidth: 'medium', stressIndicators: [], burnoutRisk: 'low' },
  } as ContextWindow;
}

const commitmentInsight = (commitments: string[]) =>
  checkProactiveTriggers(USER, contextWith(commitments), 'session_start').insights.find(
    (i) => i.category === 'commitment_reminder'
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.UTC(2026, 9, 14, 15));
  clearProactiveState();
});

afterEach(() => {
  clearProactiveState();
  vi.useRealTimers();
});

describe('proactive engine commitment reminder', () => {
  it('keeps the same id for the same commitment across calls and instances', () => {
    const said = ["I'm going to start running in the mornings"];
    const first = commitmentInsight(said);
    clearProactiveState();
    vi.setSystemTime(Date.UTC(2026, 9, 15, 15));
    const second = commitmentInsight(said);
    expect(first?.id).toBeDefined();
    expect(second?.id).toBe(first?.id);
  });

  it('does not offer a surfaced commitment again on the next call', () => {
    const said = ["I'm going to start running in the mornings"];
    const first = commitmentInsight(said);
    expect(first).toBeDefined();
    markInsightSurfaced(USER, first!.id);
    vi.setSystemTime(Date.UTC(2026, 9, 14, 18));
    expect(commitmentInsight(said)).toBeUndefined();
  });

  it('skips orders and requests to Ferni, and takes the real commitment behind them', () => {
    expect(commitmentInsight(["I'll take butter and honey"])).toBeUndefined();
    expect(commitmentInsight(["I'm going to need you to remind me"])).toBeUndefined();
    const real = commitmentInsight([
      "I'll take butter and honey",
      "I'm going to start running in the mornings",
    ]);
    expect(real?.message).toContain('start running');
  });
});
