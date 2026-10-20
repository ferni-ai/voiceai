import { describe, expect, it } from 'vitest';
import {
  CLOCK_SKEW_MS,
  MAX_CALL_AGE_MS,
  MAX_ITEMS,
  parseSince,
  rememberedFromCall,
} from '../call-remembered.js';
import type { RememberedFact } from '../memory-control.js';

const NOW = new Date('2026-10-18T20:00:00.000Z');
const START = Date.parse('2026-10-18T19:30:00.000Z');
const at = (minutesAfterStart: number) =>
  new Date(START + minutesAfterStart * 60_000).toISOString();
const fact = (id: string, detail: string, learnedAt?: string, over: Partial<RememberedFact> = {}) =>
  ({ id, subject: 'you', detail, learnedAt, ...over }) as RememberedFact;
const allLight = () => true;

describe('parseSince', () => {
  it('reads epoch milliseconds and ISO times', () => {
    expect(parseSince('1760816400000')).toBe(1760816400000);
    expect(parseSince('2026-10-18T19:30:00.000Z')).toBe(START);
  });
  it.each([null, undefined, '', 'yesterday', '-5', '0', 'NaN', '12'])('refuses %s', (raw) =>
    expect(parseSince(raw)).toBeUndefined()
  );
});

describe('rememberedFromCall', () => {
  it('keeps what was learned at or after the call start, newest first', () => {
    const items = rememberedFromCall(
      [
        fact('old', 'job: nurse', at(-10)),
        fact('a', 'dog name: Biscuit', at(5)),
        fact('b', 'trip: Lisbon in May', at(20)),
        fact('start', 'sister: Dana', at(0)),
      ],
      START,
      NOW,
      allLight
    );
    expect(items.map((i) => i.id)).toEqual(['b', 'a', 'start']);
    expect(items[0]).toEqual({
      id: 'b',
      subject: 'you',
      detail: 'trip: Lisbon in May',
      learnedAt: at(20),
    });
  });

  it('skips facts with no date or a bad one, future ones, earlier ones and ones typed in the app', () => {
    const items = rememberedFromCall(
      [
        fact('nodate', 'x: 1'),
        fact('bad', 'x: 2', 'not a date'),
        fact('future', 'x: 3', new Date(NOW.getTime() + CLOCK_SKEW_MS + 60_000).toISOString()),
        fact('earlier', 'x: 4', at(5), { earlier: true }),
        fact('app', 'x: 5', at(5), { fromYou: true }),
        fact('ok', 'x: 6', at(5)),
      ],
      START,
      NOW,
      allLight
    );
    expect(items.map((i) => i.id)).toEqual(['ok']);
  });

  it('shows only light topics', () => {
    const items = rememberedFromCall(
      [fact('heavy', "dad's funeral", at(5)), fact('light', 'trip: Lisbon', at(6))],
      START,
      NOW,
      (text) => !text.includes('funeral')
    );
    expect(items.map((i) => i.id)).toEqual(['light']);
  });

  it('shows the same thing once and at most three things', () => {
    const facts = [
      fact('1', 'a: 1', at(1)),
      fact('2', 'A: 1', at(2)),
      fact('3', 'b: 2', at(3)),
      fact('4', 'c: 3', at(4)),
      fact('5', 'd: 4', at(5)),
    ];
    const items = rememberedFromCall(facts, START, NOW, allLight);
    expect(items).toHaveLength(MAX_ITEMS);
    expect(items.map((i) => i.id)).toEqual(['5', '4', '3']);
    const same = rememberedFromCall([facts[0]!, facts[1]!], START, NOW, allLight);
    expect(same.map((i) => i.id)).toEqual(['2']);
  });

  it('does not reach back further than a call could last', () => {
    const long = new Date(NOW.getTime() - MAX_CALL_AGE_MS - 60_000).toISOString();
    const items = rememberedFromCall(
      [fact('stale', 'x: 1', long), fact('ok', 'x: 2', at(5))],
      START - 10 * 86_400_000,
      NOW,
      allLight
    );
    expect(items.map((i) => i.id)).toEqual(['ok']);
  });

  it('is empty with nothing that qualifies', () => {
    expect(rememberedFromCall([], START, NOW, allLight)).toEqual([]);
  });
});
