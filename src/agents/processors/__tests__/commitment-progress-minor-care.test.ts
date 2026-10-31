/**
 * MINOR_CARE=on: a member caller (not a verified owner) who says "I'm 15" and then "I finally
 * ran the 5k". The progress check marks the commitment done and stores a "Completed commitment"
 * memory (checkProgressE2E → createCelebrationMemory → storeMemory). Verify of #2784 caught it
 * still running on a held call, so the live builder holds it like the detection above it. The
 * commitment tools also stop promising to remember a plan that wasn't saved.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const progress = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../../services/superhuman/commitment-keeper-e2e.js', () => ({
  checkProgressE2E: vi.fn(async () => {
    progress.calls++;
    return { progressDetected: false, shouldCelebrate: false };
  }),
  detectCommitmentE2E: vi.fn(async () => null),
}));
vi.mock('../live-superhuman-reads.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  startLiveSuperhumanReads: () => ({}),
}));

const { buildLiveSuperhumanInjections } = await import('../live-superhuman-injections.js');
const minorCare = await import('../../../utils/minor-care.js');

type Case = 'held' | 'owner' | 'off';
let n = 0;

function turnAfterAge(c: Case) {
  n++;
  const sessionId = `session-AJ_progress${n}-1792867440000`;
  const userId = `Rk2pXy7LmN4qTs9Wd3Fb8Hc${String(n).padStart(5, '0')}`; // a member uid
  vi.stubEnv('MINOR_CARE', c === 'off' ? 'off' : 'on');
  if (c === 'owner') minorCare.setVerifiedOwnerCheck((id) => id === sessionId);
  minorCare.bindSessionUser(sessionId, userId);
  minorCare.heldAfter(sessionId, "I'm 15 and I've been training a lot.", { userId });
  expect(minorCare.memoryHeld(sessionId)).toBe(c === 'held'); // the precondition each case rests on
  return {
    userId,
    sessionId,
    userText: 'I finally ran the 5k race this morning!',
    emotionalState: { primary: 'joy', intensity: 0.8, valence: 0.7, distressLevel: 0 },
    analysis: { intent: 'statement', emotion: 'joy', confidence: 0.9, topics: [] },
    turnCount: 4,
    totalConversations: 2,
  } as unknown as Parameters<typeof buildLiveSuperhumanInjections>[0];
}

afterEach(() => {
  progress.calls = 0;
  minorCare.resetMinorCare();
  vi.unstubAllEnvs();
});

describe('MINOR_CARE: commitment progress for a member who said "I\'m 15."', () => {
  it.each(['held', 'owner', 'off'] as Case[])('no progress check when held (%s)', async (c) => {
    await buildLiveSuperhumanInjections(turnAfterAge(c));
    expect(progress.calls).toBe(c === 'held' ? 0 : 1);
  });

  it('the not-saved tool reply never promises to remember', () => {
    expect(minorCare.MINOR_CARE_NOT_SAVED).toMatch(/^Not saved/);
    expect(minorCare.MINOR_CARE_NOT_SAVED).toMatch(/don't say you'll remember/);
    expect(minorCare.MINOR_CARE_NOT_SAVED).not.toMatch(/I'll remember/);
  });
});
