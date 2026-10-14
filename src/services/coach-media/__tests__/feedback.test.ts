import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storeUserPreferences = vi.fn(async (_userId: string, _prefs: unknown[]) => undefined);
vi.mock('../../user-preferences-store.js', () => ({ storeUserPreferences }));

// The pick log as claimAnswer keeps it: a pick that already says whether it helped is not re-recorded.
const log = new Map<string, { helped: string | null }>();
const claimAnswer = vi.fn(async (_u: string, id: string, a: { helped: string | null }) => {
  const known = log.get(id);
  if (!known || known.helped) return false;
  log.set(id, { helped: a.helped });
  return true;
});
const markAsked = vi.fn(async () => undefined);
vi.mock('../pick-log.js', () => ({ claimAnswer, markAsked }));

const { classifyHelpfulness, recordFollowUpAnswer, recordFollowUpAsked, recordHelped } =
  await import('../feedback.js');
const { classifyFollowUpAnswer } = await import('../../trust-systems/commitment-follow-through.js');

beforeEach(() => {
  vi.stubEnv('COACH_MEDIA', 'on');
  storeUserPreferences.mockClear();
  claimAnswer.mockClear();
  markAsked.mockClear();
  log.clear();
  for (const id of ['1', '2', '3', '4']) log.set(id, { helped: null });
});
afterEach(() => vi.unstubAllEnvs());

describe('classifyHelpfulness', () => {
  it.each([
    ['It helped a lot', 'yes'],
    ['that was great, thanks', 'yes'],
    ['loved it honestly', 'yes'],
    ['it kind of helped', 'somewhat'],
    ["it didn't help", 'no'],
    ['not really helpful', 'no'],
    ['too long, I gave up', 'no'],
    ['how was your day?', null],
  ])('%s → %s', (text, expected) => {
    expect(classifyHelpfulness(text)).toBe(expected);
  });

  it('reads replies the generic follow-up reader does not', () => {
    expect(classifyFollowUpAnswer('it helped')).toBeNull();
    expect(classifyFollowUpAnswer('that was great')).toBeNull();
  });
});

describe('recordFollowUpAnswer', () => {
  it('stores a coaching answer as a coaching_media preference', async () => {
    const answer = {
      id: 'coach-media-1',
      content: "try the video 'Shin Rehab'",
      outcome: 'not_done',
    };
    expect(await recordFollowUpAnswer('u1', answer, "honestly it didn't help")).toBe('no');
    expect(storeUserPreferences).toHaveBeenCalledWith('u1', [
      expect.objectContaining({
        category: 'coaching_media',
        value: "video 'Shin Rehab'",
        isNegative: true,
      }),
    ]);
  });

  it('hears "I did it" as tried, not as helped, and ignores other commitments', async () => {
    const coaching = { id: 'coach-media-2', content: "try the book 'X'", outcome: 'done' };
    expect(await recordFollowUpAnswer('u1', coaching, 'yep I did it')).toBeNull();
    expect(claimAnswer).toHaveBeenCalledWith('u1', '2', { outcome: 'done', helped: null });
    const other = { id: 'commitment_9', content: 'call mom', outcome: 'done' };
    expect(await recordFollowUpAnswer('u1', other, 'it helped')).toBeNull();
    expect(storeUserPreferences).not.toHaveBeenCalled();
  });

  it('stores nothing for a follow-up that went unanswered, whatever this turn says', async () => {
    const lapsed = { id: 'coach-media-3', content: "try the video 'X'", outcome: 'unanswered' };
    expect(await recordFollowUpAnswer('u1', lapsed, 'that was great, thanks')).toBeNull();
    expect(storeUserPreferences).not.toHaveBeenCalled();
  });

  it('counts an answer once, whichever path hears it first', async () => {
    // The coachingPick feedback action got there first.
    expect(await recordHelped('u1', '4', { outcome: 'done', helped: 'yes' }, 'short ones')).toBe(
      true
    );
    const answer = { id: 'coach-media-4', content: "try the video 'X'", outcome: 'done' };
    expect(await recordFollowUpAnswer('u1', answer, 'it really helped')).toBeNull();
    expect(await recordHelped('u1', '4', { outcome: 'done', helped: 'no' }, 'again')).toBe(false);
    expect(storeUserPreferences).toHaveBeenCalledTimes(1);
  });

  it('asks and records nothing about coaching picks while COACH_MEDIA is off', async () => {
    vi.stubEnv('COACH_MEDIA', 'off');
    const answer = { id: 'coach-media-1', content: "try the video 'X'", outcome: 'done' };
    expect(await recordFollowUpAnswer('u1', answer, 'it helped a lot')).toBeNull();
    await recordFollowUpAsked('u1', 'coach-media-1', '2026-10-14T00:00:00Z');
    expect(claimAnswer).not.toHaveBeenCalled();
    expect(markAsked).not.toHaveBeenCalled();
    expect(storeUserPreferences).not.toHaveBeenCalled();
  });
});
