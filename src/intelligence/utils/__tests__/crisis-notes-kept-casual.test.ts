/**
 * The turns after a crisis turn often read casual ("okay sure, that makes sense to me"), and
 * casual mode keeps at most 600 chars. The crisis follow-up note (447 chars, priority 85) lost
 * to two higher-priority notes by one character (105 + 49 + 447 = 601), so the model went
 * without its crisis guidance right when the caller had just been in distress (verify of
 * #3080, 2026-10-30). Crisis guidance is kept like the other essentials, whatever the mode.
 */
import { describe, expect, it } from 'vitest';
import { filterInjections } from '../injection-filter.js';

const note = (category: string, priority: number, length: number) => ({
  category,
  priority,
  content: `[${category}] ${'x'.repeat(length - category.length - 3)}`,
});

const AWARENESS = note('awareness', 95, 105);
const BEHAVIORAL = note('behavioral', 90, 49);
const FOLLOW_UP = note('crisis_follow_up', 85, 447);

describe('crisis guidance survives the casual budget', () => {
  it('keeps crisis_follow_up when it would tip a casual turn over 600 chars', () => {
    const kept = filterInjections([AWARENESS, BEHAVIORAL, FOLLOW_UP], { mode: 'casual' });
    expect(AWARENESS.content.length + BEHAVIORAL.content.length + FOLLOW_UP.content.length).toBe(
      601
    );
    expect(kept.map((i) => i.category)).toContain('crisis_follow_up');
  });

  it.each(['crisis_transfer', 'safety_soft_check'])(
    'keeps %s past the casual count and char caps',
    (category) => {
      const filler = [1, 2, 3].map((n) => note(`filler_${n}`, 95, 190));
      const kept = filterInjections([...filler, note(category, 80, 300)], { mode: 'casual' });
      expect(kept.map((i) => i.category)).toContain(category);
    }
  );

  it('still drops an ordinary note that does not fit', () => {
    const kept = filterInjections([AWARENESS, BEHAVIORAL, note('ordinary_note', 85, 447)], {
      mode: 'casual',
    });
    expect(kept.map((i) => i.category)).not.toContain('ordinary_note');
  });
});
