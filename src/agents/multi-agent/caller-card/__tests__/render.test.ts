/**
 * The caller card as prompt lines (spec §5.4.3): the header and closing lines verbatim, Home
 * under the header, the guards in code, a 1,200-character cap that drops whole lines.
 * Fictional eval user Riley Test of Maplewood.
 */
import { describe, expect, it } from 'vitest';
import { renderCallerCard } from '../render.js';
import type { CallerCard } from '../types.js';

const MAX_CARD_CHARS = 1200;
const HEADER = 'What you know about them (private; never read it out):';
const CLOSING =
  'Use this like a friend would. Do not raise any of it unless they do or your hello already did.';

function card(place: string | null): CallerCard {
  return {
    v: 1,
    userId: 'riley-test',
    builtAt: '2026-10-31T12:00:00.000Z',
    home: place === null ? null : { value: { place, source: 'preferences' }, loadedMs: 12 },
    people: null,
    recentCalls: null,
    comingUp: null,
    budgetHit: false,
  };
}

describe('renderCallerCard', () => {
  it('renders Home between the header and closing lines, verbatim', () => {
    expect(renderCallerCard(card('Maplewood'), { forgottenTopics: [] })).toBe(
      `${HEADER}\n- Home: Maplewood.\n${CLOSING}`
    );
  });

  it('a forgotten-topics read that missed the budget (null) still renders Home', () => {
    expect(renderCallerCard(card('Maplewood'), { forgottenTopics: null })).toContain(
      '- Home: Maplewood.'
    );
  });

  it('a forgotten home drops the line, and an empty card renders nothing', () => {
    expect(renderCallerCard(card('Maplewood'), { forgottenTopics: ['Maplewood'] })).toBe('');
    expect(renderCallerCard(card(null), { forgottenTopics: [] })).toBe('');
  });

  it.each([['where I live'], ['my home'], ['home']])(
    'a forget worded as %s drops the Home line, as recall matches a fact',
    (topic) => {
      expect(renderCallerCard(card('Maplewood'), { forgottenTopics: [topic] })).toBe('');
      expect(renderCallerCard(card('Maplewood'), { forgottenTopics: ['Lakeview'] })).toContain(
        '- Home: Maplewood.'
      );
    }
  );

  it('guards the line in code: contact data, a sensitive word, markup', () => {
    expect(renderCallerCard(card('Maplewood 555\u20130142'), { forgottenTopics: [] })).toBe('');
    expect(renderCallerCard(card('Maplewood Hospital'), { forgottenTopics: [] })).toBe('');
    expect(renderCallerCard(card('# Maplewood \u{1F3E1}'), { forgottenTopics: [] })).toContain(
      '- Home: Maplewood.'
    );
  });

  it(`never exceeds ${MAX_CARD_CHARS} characters: an over-long section drops whole`, () => {
    const out = renderCallerCard(card('Maple'.repeat(300)), { forgottenTopics: [] });
    expect(out).toBe('');
    expect(renderCallerCard(card('Maplewood'), { forgottenTopics: [] }).length).toBeLessThanOrEqual(
      MAX_CARD_CHARS
    );
  });
});
