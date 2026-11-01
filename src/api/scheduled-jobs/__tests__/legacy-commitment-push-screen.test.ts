/**
 * The legacy commitment push (better-than-human outreach job, COACH_FOLLOW_THROUGH
 * off, which is how the UI server runs it): with OWNER_OUTREACH_STORED_TEXT_SCREEN
 * on, a stored commitment description that carries a phone number is not pushed to
 * the owner; off, it is pushed as before. Firestore and the push are stubbed at the
 * edge. All data is fictional.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PHISH = 'call 212 555 0198 about your bank account';
const pushed = vi.fn(async (..._a: unknown[]) => ({ id: 'push-1' }));
let descriptions: string[] = [];

const emptyQuery = { where: () => emptyQuery, limit: () => emptyQuery, get: async () => ({ docs: [] }) }; // prettier-ignore
const commitmentsQuery = {
  where: () => commitmentsQuery,
  limit: () => commitmentsQuery,
  get: async () => ({
    docs: descriptions.map((description, i) => ({
      id: `c${i}`,
      data: () => ({ description, status: 'active' }),
      ref: { parent: { parent: { id: 'owner-uid' } } },
    })),
  }),
};
vi.mock('../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({ collectionGroup: () => commitmentsQuery, collection: () => emptyQuery }),
}));
vi.mock('../../../tasks/scheduled/wellbeing-jobs.js', () => ({
  runThinkingOfYouOutreach: async () => ({ usersProcessed: 0, outreachSent: 0, errors: 0 }),
}));
vi.mock('../../../services/outreach/outreach-orchestrator.js', () => ({
  getOutreachOrchestrator: () => ({ sendPushNotification: pushed }),
}));
vi.mock('../../../services/superhuman/proactive-milestone-detector.js', () => ({}));

const { handleBetterThanHumanOutreach } = await import('../superhuman-jobs.js');

async function runJob(): Promise<string[]> {
  pushed.mockClear();
  const res = { writeHead: () => res, setHeader: () => undefined, end: () => undefined };
  await handleBetterThanHumanOutreach(res as never);
  return pushed.mock.calls.map((c) => String(c[1]));
}

beforeEach(() => {
  descriptions = [PHISH, 'stretch every morning'];
});
afterEach(() => vi.unstubAllEnvs());

describe('legacy commitment push with the stored-text screen', () => {
  it('on: the description carrying a phone number is not pushed; the ordinary one is', async () => {
    vi.stubEnv('OWNER_OUTREACH_STORED_TEXT_SCREEN', 'on');
    const sent = await runJob();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('stretch every morning');
  });

  it('off: both are pushed as before', async () => {
    const sent = await runJob();
    expect(sent).toHaveLength(2);
    expect(sent[0]).toContain('212 555 0198');
  });
});
