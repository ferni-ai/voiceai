import { describe, expect, it } from 'vitest';
import { generatedAt, selectEvalUsers } from '../../../scripts/voice-eval/eval-users.js';

const HOUR = 3_600_000;
const now = new Date(2026, 9, 7, 12, 0, 0); // local, like run.sh's `date`

const ids = [
  'voice-eval-long-day-20261006002617-83a2', // ~36h old
  'voice-eval-catch-up-20261007113000-1ed2', // 30 min old: a run may be in progress
  'voice-eval-v12-story-1', // legacy fixed id
  'voice-eval-sam', // the fixed user run.sh still offers
  'firebase-uid-0123456789', // a real user
  'voice-evaluation-notes', // not our prefix (no dash after "eval")
];

describe('generatedAt', () => {
  it('reads the local time run.sh writes into the id', () => {
    expect(generatedAt('voice-eval-long-day-20261006002617-83a2')).toEqual(
      new Date(2026, 9, 6, 0, 26, 17)
    );
  });

  it('is null for fixed ids and near-misses', () => {
    expect(generatedAt('voice-eval-v12-story-1')).toBeNull();
    expect(generatedAt('voice-eval-x-20261006002617-83A2')).toBeNull(); // hex is lowercase
    expect(generatedAt('voice-eval-x-2026100600261-83a2')).toBeNull(); // 13 digits
  });
});

describe('selectEvalUsers', () => {
  it('selects only old generated users by default and says why the rest stay', () => {
    const s = selectEvalUsers(ids, { now, minAgeMs: 24 * HOUR, includeLegacy: false });
    expect(s.generated).toEqual(['voice-eval-long-day-20261006002617-83a2']);
    expect(s.legacy).toEqual([]);
    expect(s.kept).toEqual([
      { id: 'voice-eval-catch-up-20261007113000-1ed2', reason: 'too-recent' },
      { id: 'voice-eval-sam', reason: 'always-kept' },
      { id: 'voice-eval-v12-story-1', reason: 'legacy-not-included' },
    ]);
  });

  it('adds legacy fixed ids only when asked, and never voice-eval-sam or a real user', () => {
    const s = selectEvalUsers(ids, { now, minAgeMs: 24 * HOUR, includeLegacy: true });
    expect(s.legacy).toEqual(['voice-eval-v12-story-1']);
    const selected = [...s.generated, ...s.legacy];
    expect(selected).not.toContain('voice-eval-sam');
    expect(selected).not.toContain('firebase-uid-0123456789');
    expect(selected).not.toContain('voice-evaluation-notes');
  });

  it('honours an explicit keep list', () => {
    const s = selectEvalUsers(ids, {
      now,
      minAgeMs: 24 * HOUR,
      includeLegacy: true,
      keep: ['voice-eval-v12-story-1'],
    });
    expect(s.legacy).toEqual([]);
    expect(s.kept).toContainEqual({ id: 'voice-eval-v12-story-1', reason: 'always-kept' });
  });
});
