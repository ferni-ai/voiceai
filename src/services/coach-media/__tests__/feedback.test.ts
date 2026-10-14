import { beforeEach, describe, expect, it, vi } from 'vitest';

const storeUserPreferences = vi.fn(async (_userId: string, _prefs: unknown[]) => undefined);
vi.mock('../../user-preferences-store.js', () => ({ storeUserPreferences }));

const { classifyHelpfulness, recordFollowUpAnswer } = await import('../feedback.js');
const { classifyFollowUpAnswer } = await import('../../trust-systems/commitment-follow-through.js');

beforeEach(() => storeUserPreferences.mockClear());

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

  it('falls back to the generic outcome and ignores other commitments', async () => {
    const coaching = { id: 'coach-media-2', content: "try the book 'X'", outcome: 'done' };
    expect(await recordFollowUpAnswer('u1', coaching, 'yep I did it')).toBe('yes');
    const other = { id: 'commitment_9', content: 'call mom', outcome: 'done' };
    expect(await recordFollowUpAnswer('u1', other, 'it helped')).toBeNull();
    expect(storeUserPreferences).toHaveBeenCalledTimes(1);
  });

  it('stores nothing for a follow-up that went unanswered, whatever this turn says', async () => {
    const lapsed = { id: 'coach-media-3', content: "try the video 'X'", outcome: 'unanswered' };
    expect(await recordFollowUpAnswer('u1', lapsed, 'that was great, thanks')).toBeNull();
    expect(storeUserPreferences).not.toHaveBeenCalled();
  });
});
