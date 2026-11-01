/**
 * Under timing pressure (the caller has waited, tools in flight) filterInjectionsByPressure keeps
 * a few notes. It sorted lowest priority first, though higher is more important, so on a slow
 * crisis turn the timing hints filled the slots: severe dropped `safety`, critical dropped
 * `safety` and `crisis_response`, and every level dropped `crisis_follow_up` (2026-10-30).
 */
import { describe, expect, it } from 'vitest';
import { filterInjectionsByPressure } from '../timing-aware-injection.js';

const note = (category: string, priority: number, length: number) => ({
  category,
  priority,
  content: category[0]!.repeat(length),
});

const CRISIS_TURN = [
  note('safety', 99, 150),
  note('crisis_response', 98, 150),
  note('crisis_follow_up', 85, 200),
  note('scientific_early_warning', 95, 120),
  note('timing_state', 40, 60),
  note('tool_hint', 50, 60),
];

describe('crisis guidance under timing pressure', () => {
  it.each(['moderate', 'severe', 'critical'] as const)(
    'keeps every crisis note at %s pressure',
    (level) => {
      const kept = filterInjectionsByPressure(CRISIS_TURN, level).map((i) => i.category);
      expect(kept).toEqual(
        expect.arrayContaining([
          'safety',
          'crisis_response',
          'crisis_follow_up',
          'scientific_early_warning',
        ])
      );
    }
  );

  it('fills the remaining slots by priority, highest first', () => {
    const kept = filterInjectionsByPressure(
      [note('timing_state', 40, 60), note('tool_hint', 50, 60), note('system_state', 70, 60)],
      'critical'
    ).map((i) => i.category);
    expect(kept).toEqual(['system_state', 'tool_hint']);
  });
});
