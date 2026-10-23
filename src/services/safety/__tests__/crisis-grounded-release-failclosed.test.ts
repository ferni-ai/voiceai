/**
 * A grounded release whose own bookkeeping throws keeps the script (the run's
 * catch returns false), even after both reads said everyday.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../crisis-call-risk.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../crisis-call-risk.js')>()),
  explainCrisisTurn: () => {
    throw new Error('store down');
  },
}));

const { groundedRelease, GROUNDED_RELEASE_CSSRS_PROMPT } =
  await import('../crisis-grounded-release.js');

const CSSRS_EVERYDAY =
  '{"wish_dead":"none","ideation":"none","method":"none","intent":"none","plan_time":"none","everyday":true}';
const EVERYDAY = '{"danger":"","about":"invite David to dinner","decision":"everyday"}';

describe('grounded release fails closed', () => {
  it('keeps the script when recording the release throws', async () => {
    const read = async (prompt: string) =>
      prompt === GROUNDED_RELEASE_CSSRS_PROMPT ? CSSRS_EVERYDAY : EVERYDAY;
    const released = await groundedRelease({
      detection: { severity: 0, indicators: [] } as never,
      verdict: { risk: 'imminent', subject: 'self' },
      input: {
        latest: "Tomorrow's a little bit late. Dinner is tonight.",
        earlier: ['I forgot to invite David to dinner.'],
        companion: 'I set a reminder for tomorrow morning.',
      },
      priorRisk: false,
      call: 'fail-closed-call',
      env: { CRISIS_GROUNDED_RELEASE: 'live', CRISIS_GUARD_MODE: 'live' },
      generates: [read, read],
      source: 'gate',
    });
    expect(released).toBe(false);
  });
});
