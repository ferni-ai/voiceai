/**
 * The check-in writer is told how many conversations someone has had with
 * Ferni. The daily scheduler used to hard-code 0, so every check-in was
 * written as if a long-time friend were a stranger. It now passes the
 * profile's own counter, and says nothing when the record has none.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = { id: string; data: Record<string, unknown> };
let users: Doc[] = [];

/** Enough of Firestore for the scheduler's bogle_users paging. */
function fakeDb() {
  const query = (after?: string, n = Infinity) => ({
    orderBy: () => query(after, n),
    limit: (k: number) => query(after, k),
    startAfter: (id: string) => query(id, n),
    get: async () => {
      const sorted = [...users].sort((a, b) => (a.id < b.id ? -1 : 1));
      const docs = sorted
        .filter((u) => after === undefined || u.id > after)
        .slice(0, n)
        .map((u) => ({ id: u.id, data: () => u.data }));
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  });
  return {
    collection: () => ({
      ...query(),
      doc: (id: string) => ({
        get: async () => {
          const u = users.find((x) => x.id === id);
          return { exists: !!u, data: () => u?.data };
        },
        set: async () => undefined,
        update: async () => undefined,
      }),
    }),
  };
}

const generateContent = vi.fn();

vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => fakeDb() }));
vi.mock('../unified-delivery.js', () => ({
  deliver: vi.fn(async () => ({ success: true, channel: 'in_app' })),
  getChannelStatus: vi.fn(async () => ({
    email: { available: false },
    sms: { available: false },
    voice_call: { available: false },
    push: { available: false },
    in_app: { available: true },
  })),
}));
vi.mock('../engagement-tracking.js', () => ({
  getOptimalOutreachTime: vi.fn(),
  getPreferredChannel: vi.fn(async () => null),
}));
vi.mock('../intelligent-onboarding-arc.js', () => ({
  getOnboardingState: vi.fn(async () => null),
  getPendingCheckIns: vi.fn(async () => []),
}));
// The real content generator runs; only the model call at its edge is faked.
vi.mock('../../../config/gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../config/gemini-config.js')>()),
  getGeminiClient: async () => ({ models: { generateContent } }),
}));

const { runDailyOutreach } = await import('../automated-scheduler.js');
const { generatePersonalizedContent } = await import('../llm-content-generator.js');
type OutreachType = Parameters<typeof generatePersonalizedContent>[1];

const DAY = 24 * 3600 * 1000;
/** Signed up two months ago, last talked five days ago: a momentum_check. */
const friend = (id: string, extra: Record<string, unknown> = {}): Doc => ({
  id,
  data: {
    createdAt: new Date(Date.now() - 60 * DAY).toISOString(),
    lastContact: new Date(Date.now() - 5 * DAY).toISOString(),
    displayName: 'Ann',
    ...extra,
  },
});

function promptSent(): string {
  expect(generateContent).toHaveBeenCalledTimes(1);
  return generateContent.mock.calls[0][0].contents[0].parts[0].text as string;
}

beforeEach(() => {
  users = [];
  generateContent.mockReset().mockResolvedValue({ text: 'Hey Ann, how is the garden?' });
  process.env.OUTREACH_GROUNDED_CHECKINS = 'off'; // reach the generic check-in writer
});
afterEach(() => {
  delete process.env.OUTREACH_GROUNDED_CHECKINS;
});

describe('daily check-in prompt carries the real conversation count', () => {
  it('tells the writer how many conversations a long-time friend has had', async () => {
    users = [friend('ann-1', { totalConversations: 37 })];

    const result = await runDailyOutreach({ respectQuietHours: false });

    expect(result.details[0]).toMatchObject({ status: 'sent', outreachType: 'momentum_check' });
    const prompt = promptSent();
    expect(prompt).toContain('Conversations: 37');
    expect(prompt).not.toMatch(/Conversations: 0\b/);
  });

  it('states no number when the record has no counter', async () => {
    users = [friend('ann-2')];

    await runDailyOutreach({ respectQuietHours: false });

    const prompt = promptSent();
    expect(prompt).not.toMatch(/Conversations:/);
    expect(prompt).not.toMatch(/\b0 conversation/);
  });

  it('ignores a counter that is not a count', async () => {
    users = [friend('ann-3', { totalConversations: 'lots' })];

    await runDailyOutreach({ respectQuietHours: false });

    expect(promptSent()).not.toMatch(/Conversations:/);
  });
});

describe('check-in seeds with an unknown count', () => {
  const types: OutreachType[] = [
    'next_day_check',
    'first_week_reflection',
    'momentum_check',
    'two_week_celebration',
    'win_celebration',
    'reengagement_gentle',
  ];

  it.each(types)('%s states no conversation count and no placeholder', async (type) => {
    await generatePersonalizedContent(
      { userId: 'u1', name: 'Ann', daysSinceSignup: 40, engagementLevel: 'medium' },
      type,
      'in_app'
    );
    const prompt = promptSent();
    expect(prompt).not.toMatch(/\d+ conversation|conversations?[^\n]*:\s*\d/i);
    expect(prompt).not.toContain('undefined');
  });

  it.each(types)('%s states a known count', async (type) => {
    await generatePersonalizedContent(
      {
        userId: 'u1',
        name: 'Ann',
        daysSinceSignup: 40,
        conversationCount: 12,
        engagementLevel: 'medium',
      },
      type,
      'in_app'
    );
    expect(promptSent()).toMatch(/\b12 conversation|conversations[^\n]*:\s*12\b/i);
  });
});
