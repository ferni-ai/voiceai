/**
 * The live follow-up builder hands each settled answer to coach-media, which
 * stores a coaching pick's "it helped" as a preference (coach-media/feedback.ts).
 */
import { describe, expect, it, vi } from 'vitest';

let build: ((input: unknown) => Promise<unknown>) | undefined;
vi.mock('../../index.js', () => ({
  registerContextBuilder: (b: { build: typeof build }) => {
    build = b.build;
  },
  createStandardInjection: (id: string, content: string) => ({ id, content }),
  createHighInjection: (id: string, content: string) => ({ id, content }),
}));
const answer = { id: 'coach-media-1', content: "try the video 'Shin Rehab'", outcome: 'done' };
vi.mock('../../../../services/trust-systems/commitment-tracking.js', () => ({
  processCommitments: async () => ({
    newCommitments: [],
    progressUpdates: [],
    followUpsDue: [],
    answers: [answer],
  }),
  generateFollowUpPhrase: () => '',
}));
const recordFollowUpAnswer = vi.fn(async () => 'yes');
vi.mock('../../../../services/coach-media/feedback.js', () => ({ recordFollowUpAnswer }));

await import('../commitment-follow-up.js');

describe('commitment-follow-up builder', () => {
  it("passes each settled answer and the user's words to coach-media", async () => {
    await build!({
      userText: 'it really helped',
      userData: { turnCount: 0 },
      services: { userId: 'u1' },
    });
    expect(recordFollowUpAnswer).toHaveBeenCalledWith('u1', answer, 'it really helped');
  });
});
