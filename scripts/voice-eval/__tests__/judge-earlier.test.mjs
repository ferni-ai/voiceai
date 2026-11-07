// A call made as the same eval caller as earlier calls (the nightly memlive chain shares
// one uid) is judged with those calls in view, so true recall isn't scored as invented.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DIMENSIONS, earlierCallsIn, earlierCallsOf, promptFor } from '../judge.mjs';

const persona = { id: 'ferni', name: 'Ferni', bio: '' };
const order = Object.keys(DIMENSIONS);
const opts = { sounds: false, checks: [] };
const call = (uid, wallT0, said) => ({
  meta: { scenario: 'memlive-mover-quiz', uid },
  wallT0,
  userSpeech: [[500, 1500]],
  events: [
    { who: 'agent', text: 'Hey Sam.', t: 100 },
    { who: 'user', text: said, t: 1600 },
  ],
});

const quiz = call('voice-eval-memlive-mover-1', 3000, 'So what do you remember?');
const first = call('voice-eval-memlive-mover-1', 1000, 'We are moving to a town called Larkfield.');
const second = call('voice-eval-memlive-mover-1', 2000, 'The movers come on the ninth.');
const stranger = call('voice-eval-other-1', 500, 'I have a cat named Pickle.');

describe('earlierCallsOf', () => {
  it('keeps only calls by the same caller made before this one, oldest first', () => {
    const later = call('voice-eval-memlive-mover-1', 4000, 'One more thing.');
    expect(earlierCallsOf(quiz, [later, second, stranger, quiz, first])).toEqual([first, second]);
  });

  it('finds nothing for a run without a caller id or start time', () => {
    expect(earlierCallsOf({ ...quiz, meta: {} }, [first])).toEqual([]);
    expect(earlierCallsOf({ ...quiz, wallT0: undefined }, [first])).toEqual([]);
  });
});

describe('promptFor with earlier calls', () => {
  const p = (seed) => promptFor(quiz, seed, order, persona, opts);

  it('one earlier call reads exactly as a single seed did', () => {
    expect(p([first])).toBe(p(first));
    expect(p(first)).toContain('EARLIER CALL between the same two');
  });

  it('no earlier call reads exactly as before', () => {
    expect(p([])).toBe(p(null));
    expect(p(null)).toContain('There was no earlier call');
  });

  it('several earlier calls are all shown, oldest first', () => {
    const text = p([first, second]);
    expect(text).toContain('EARLIER CALLS between the same two, oldest first');
    expect(text).not.toContain('There was no earlier call');
    const a = text.indexOf('Call 1:');
    const b = text.indexOf('Call 2:');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(text.indexOf('Larkfield')).toBeGreaterThan(a);
    expect(text.indexOf('Larkfield')).toBeLessThan(b);
    expect(text.indexOf('the ninth')).toBeGreaterThan(b);
  });
});

describe('earlierCallsIn (the run directory)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'judge-earlier-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const put = (name, value) => {
    const f = join(dir, name);
    writeFileSync(f, typeof value === 'string' ? value : JSON.stringify(value));
    return f;
  };

  it('reads the same caller’s earlier runs and seed calls, never sidecars or other callers', () => {
    put('memlive-mover-1-n1sweep.json', first);
    put('memlive-mover-2-n1sweep.json', second);
    put('asked-once-answer-n1s1.seed.json', call('voice-eval-memlive-mover-1', 1500, 'Seeded line.'));
    put('memlive-mover-2-n1sweep.score.json', { ...second, wallT0: 1 });
    put('memlive-mover-2-n1sweep.judge.json', { ...second, wallT0: 2 });
    put('memlive-mover-2-n1sweep.judge.claude.json', { ...second, wallT0: 3 });
    put('memlive-mover-2-n1sweep.realism.json', { ...second, wallT0: 4 });
    put('recall-s03.seeded.json', { meta: { uid: quiz.meta.uid }, wallT0: 5, now: '2026-11-06' });
    put('other-n1.json', stranger);
    put('broken.json', '{ not json');
    const f = put('memlive-mover-quiz-n1sweep.json', quiz);
    const said = earlierCallsIn(f, quiz).map((r) => r.events[1].text);
    expect(said).toEqual(['We are moving to a town called Larkfield.', 'Seeded line.', 'The movers come on the ninth.']);
  });
});
