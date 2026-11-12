/**
 * selectEvalUsers with `only` (cleanup-users.ts --ids) and parseIdList: an --ids run may delete
 * only the listed voice-eval ids, never another user, and a listed id that isn't there deletes
 * nothing in its place.
 */
import { describe, expect, it } from 'vitest';
import { parseIdList, selectEvalUsers } from '../eval-users.js';

const now = new Date(2026, 10, 12, 12, 0, 0);
const old = (scenario: string, hex: string) => `voice-eval-${scenario}-20261111100000-${hex}`;
const base = { now, minAgeMs: 3_600_000, includeLegacy: false };

describe('selectEvalUsers with only (--ids)', () => {
  const mine = old('robust-spanish', 'aa01');
  const theirs = old('follow-through', 'bb02');
  const legacy = 'voice-eval-v12-story-1';

  it('selects only listed ids; every other eval user is kept as not-in-ids', () => {
    const sel = selectEvalUsers([mine, theirs, 'voice-eval-sam'], {
      ...base,
      only: new Set([mine]),
    });
    expect(sel.generated).toEqual([mine]);
    expect(sel.kept).toContainEqual({ id: theirs, reason: 'not-in-ids' });
    expect(sel.kept).toContainEqual({ id: 'voice-eval-sam', reason: 'always-kept' });
  });

  it('a listed id that is not there selects nothing in its place', () => {
    const sel = selectEvalUsers([theirs], { ...base, only: new Set([mine]) });
    expect(sel.generated).toEqual([]);
    expect(sel.legacy).toEqual([]);
  });

  it('keeps the other guards: a listed id still waits out the minimum age', () => {
    const fresh = 'voice-eval-robust-spanish-20261112115900-cc03';
    const sel = selectEvalUsers([fresh], { ...base, only: new Set([fresh]) });
    expect(sel.generated).toEqual([]);
    expect(sel.kept).toContainEqual({ id: fresh, reason: 'too-recent' });
  });

  it('never selects voice-eval-sam, even when listed', () => {
    const sel = selectEvalUsers(['voice-eval-sam'], { ...base, only: new Set(['voice-eval-sam']) });
    expect(sel.generated).toEqual([]);
  });

  it('without only, behaves as before (other generated users selected)', () => {
    const sel = selectEvalUsers([mine, theirs, legacy], base);
    expect(sel.generated).toEqual([theirs, mine]);
    expect(sel.kept).toContainEqual({ id: legacy, reason: 'legacy-not-included' });
  });
});

describe('parseIdList', () => {
  it('reads one id per line, skipping blanks and comments', () => {
    const list = parseIdList(`# run 11-11\n${old('a', '0001')}\n\n  ${old('b', '0002')}  \n`);
    expect([...list.ids]).toEqual([old('a', '0001'), old('b', '0002')]);
    expect(list.invalid).toEqual([]);
  });

  it('flags any line that is not a voice-eval id, so the file is refused', () => {
    const list = parseIdList(`${old('a', '0001')}\nreal-user-123\nvoice-eval-x/../y\n`);
    expect(list.invalid).toEqual(['real-user-123', 'voice-eval-x/../y']);
  });

  it('an empty file lists nothing', () => {
    expect(parseIdList('\n# nothing\n').ids.size).toBe(0);
  });
});
