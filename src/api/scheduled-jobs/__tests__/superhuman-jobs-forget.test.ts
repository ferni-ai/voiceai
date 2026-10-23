/**
 * The better-than-human job's own pushes and a forgotten topic. With
 * COACH_FOLLOW_THROUGH off it quotes a stored commitment ("Just thinking about
 * your commitment: "<it>"") and it celebrates a tracked milestone by its
 * label. A commitment about a forgotten topic is never quoted (the rule every
 * commitment reader follows, commitment-forget.ts), and under
 * FORGET_EVERY_READER a milestone about one is never celebrated. The real
 * handler; the store, the orchestrator and the other jobs are stubs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  pushes: [] as Array<{ userId: string; message: string }>,
  topics: ['mindy'] as string[] | null,
}));

const snap = (docs: Array<{ id: string; userId: string; data: Record<string, unknown> }>) => ({
  docs: docs.map((d) => ({
    id: d.id,
    data: () => d.data,
    ref: { parent: { parent: { id: d.userId } } },
  })),
});
const query = (result: unknown) => {
  const q = { where: () => q, limit: () => q, orderBy: () => q, get: async () => result };
  return q;
};

vi.mock('../../../tasks/scheduled/wellbeing-jobs.js', () => ({
  runThinkingOfYouOutreach: async () => ({ usersProcessed: 0, outreachSent: 0, errors: 0 }),
}));
vi.mock('../../../services/superhuman/commitment-follow-up.js', () => ({
  coachFollowThroughMode: () => false,
}));
vi.mock('../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collectionGroup: () =>
      query(
        snap([
          { id: 'c1', userId: 'member-bth', data: { description: 'call Mindy about the lease' } },
          { id: 'c2', userId: 'member-bth', data: { description: 'run 5k on Saturday' } },
        ])
      ),
    collection: () => query(snap([{ id: 'member-bth', userId: '', data: {} }])),
  }),
}));
vi.mock('../../../services/outreach/outreach-orchestrator.js', () => ({
  getOutreachOrchestrator: () => ({
    sendPushNotification: async (userId: string, message: string) => {
      state.pushes.push({ userId, message });
      return { id: 'sent' };
    },
    triggerGrowthReflection: async () => false,
  }),
}));
vi.mock('../../../services/superhuman/proactive-milestone-detector.js', () => ({
  getMilestonesToCelebrate: async () => [
    { label: 'A year since Mindy moved out', celebrationSuggestion: 'Proud of you.', type: 'x' },
  ],
  acknowledgeMilestone: async () => undefined,
}));
vi.mock('../../../memory/recall/forget.js', async (original) => ({
  ...(await original<typeof import('../../../memory/recall/forget.js')>()),
  forgottenTopicsOrNull: async () => state.topics,
}));

const { handleBetterThanHumanOutreach } = await import('../superhuman-jobs.js');
const { resetForgetTopicsSource } = await import('../../../memory/recall/forget-topics-source.js');

const res = () => ({
  writeHead: () => undefined,
  setHeader: () => undefined,
  end: () => undefined,
});
const messages = () => state.pushes.map((p) => p.message);

beforeEach(() => {
  state.pushes = [];
  state.topics = ['mindy'];
  resetForgetTopicsSource();
});
afterEach(() => vi.unstubAllEnvs());

describe('better-than-human pushes and a forgotten topic', () => {
  it('never quotes a commitment about a forgotten topic; the others still go', async () => {
    await handleBetterThanHumanOutreach(res() as never);
    const commitmentPushes = messages().filter((m) => m.includes('your commitment'));
    expect(commitmentPushes).toEqual([
      'Hey! Just thinking about your commitment: "run 5k on Saturday". How\'s it going?',
    ]);
  });

  it('quotes no commitment when the forget list cannot be read', async () => {
    state.topics = null;
    await handleBetterThanHumanOutreach(res() as never);
    expect(messages().filter((m) => m.includes('your commitment'))).toEqual([]);
  });

  it('on: never celebrates a milestone about a forgotten topic', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    await handleBetterThanHumanOutreach(res() as never);
    expect(messages().some((m) => m.toLowerCase().includes('mindy'))).toBe(false);
  });

  it('on: a milestone about anything else is still celebrated', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    state.topics = ['the lease'];
    await handleBetterThanHumanOutreach(res() as never);
    expect(messages()).toContain('A year since Mindy moved out! Proud of you.');
  });

  it('off: the milestone push is unchanged', async () => {
    await handleBetterThanHumanOutreach(res() as never);
    expect(messages()).toContain('A year since Mindy moved out! Proud of you.');
  });
});
