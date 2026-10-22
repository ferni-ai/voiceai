/**
 * The taste loop end to end, through the tool functions with the network,
 * Gemini and Firestore faked: a pick is offered and logged, sent, its
 * follow-up answered "it really helped", and the next ask on another topic
 * ranks the same creator's short video first and says why.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, unknown>;
const store = new Map<string, Doc>();
function col(path: string) {
  const query = (field: string) => ({
    limit: (n: number) => ({
      get: async () => ({
        docs: [...store.entries()]
          .filter(([k]) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/'))
          .map(([, v]) => v)
          .sort((a, b) => String(b[field]).localeCompare(String(a[field])))
          .slice(0, n)
          .map((v) => ({ data: () => v })),
      }),
    }),
  });
  return { doc: (id: string) => docRef(`${path}/${id}`), orderBy: query };
}
function docRef(path: string) {
  return {
    collection: (name: string) => col(`${path}/${name}`),
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    set: async (data: Doc, opts?: { merge?: boolean }) =>
      void store.set(path, opts?.merge ? { ...store.get(path), ...data } : data),
  };
}
const db = {
  collection: (name: string) => col(name),
  runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
    fn({
      get: async (r: ReturnType<typeof docRef>) => r.get(),
      set: (r: ReturnType<typeof docRef>, d: Doc, o?: { merge?: boolean }) => void r.set(d, o),
    }),
};
vi.mock('../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => db }));

const generateContent = vi.fn();
vi.mock('../../config/gemini-config.js', () => ({
  getGeminiClient: async () => ({ models: { generateContent } }),
}));
const VIDEOS: Record<string, { channelTitle: string; channelId: string; durationSeconds: number }> =
  {
    vidPatShort: { channelTitle: 'Physio Pat', channelId: 'UC-pat', durationSeconds: 420 },
    vidLecture1: { channelTitle: 'Lecture Hall', channelId: 'UC-lecture', durationSeconds: 3600 },
    vidPatCalf1: { channelTitle: 'Physio Pat', channelId: 'UC-pat', durationSeconds: 360 },
    vidFakePat1: { channelTitle: 'Physio Pat', channelId: 'UC-impostor', durationSeconds: 3600 },
  };
vi.mock('../../services/video/youtube-search.js', () => ({
  searchVideos: vi.fn(async () => ({ found: false, videos: [] })),
  getVideoDetails: async (id: string) => ({
    found: true,
    video: { id, title: `Title ${id}`, privacyStatus: 'public', embeddable: true, ...VIDEOS[id] },
  }),
}));
vi.mock('../../services/user-preferences-store.js', () => ({
  getUserPreferences: async () => null,
  storeUserPreferences: vi.fn(async () => undefined),
}));
const saveCommitment = vi.fn(async (_c: { id: string; content: string }) => undefined);
vi.mock('../../services/trust-systems/commitment-tracking.js', () => ({ saveCommitment }));
// The guarded sender's STOP and gap checks have their own tests (pick-delivery-guard.test.ts).
vi.mock('../../services/outreach/guarded-text.js', () => ({
  sendGuardedText: vi.fn(async () => ({ sent: true })),
}));
vi.mock('../../services/outreach/user-reach.js', () => ({
  userReach: async () => ({ phone: '+14155550134' }),
}));
vi.mock('../../services/outreach/unified-delivery.js', () => ({
  saveInAppMessage: vi.fn(async () => ({ success: true })),
}));

const { runFindCoachingResources, runCoachingPick } =
  await import('../../tools/domains/learning/coaching-resources-tool.js');
const { recordFollowUpAnswer } = await import('../../services/coach-media/feedback.js');
const { outreachConfirmListeners } =
  await import('../../tools/domains/communication/outreach/outreach-confirm.js');

/** Grounding returns these YouTube ids; every check says fits, quality 4. */
function webFinds(...ids: string[]) {
  generateContent.mockImplementation(async (req: { config?: { tools?: unknown } }) =>
    req.config?.tools
      ? {
          text: 'Videos.',
          candidates: [
            {
              groundingMetadata: {
                groundingChunks: ids.map((id) => ({
                  web: { uri: `https://www.youtube.com/watch?v=${id}` },
                })),
              },
            },
          ],
        }
      : {
          text: '{"fits":true,"safe":true,"quality":4,"evidence":"solid","why":"Clear and gentle."}',
        }
  );
}

afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.stubEnv('COACH_MEDIA', 'on');
  vi.stubEnv('APPROVALS_PAGE', 'on');
  store.clear();
  generateContent.mockReset();
});

describe('taste loop', () => {
  it('learns from "it really helped" and prefers the same creator next time, saying why', async () => {
    const call1 = { session: {}, userData: {} };
    outreachConfirmListeners(call1.session, () => true); // the owner, as a live call registers it
    webFinds('vidPatShort');
    await runFindCoachingResources({ topic: 'shin splints', format: 'video' }, call1, 'u1');
    const logged = [...store.entries()].filter(([k]) => k.includes('/coach_media_picks/'));
    expect(logged).toHaveLength(1);
    expect(logged[0][1]).toMatchObject({
      by: 'Physio Pat',
      creatorId: 'UC-pat',
      lengthSeconds: 420,
      firstInCall: true,
    });
    expect(typeof logged[0][1].latencyMs).toBe('number');

    expect(await runCoachingPick({ action: 'send_text' }, call1, 'u1', 'ferni')).toContain(
      'Texted'
    );
    const commitment = saveCommitment.mock.calls[0][0];
    expect(store.get(logged[0][0])?.sentVia).toBe('text');
    // The text links an answer card written through the real card store.
    const cards = [...store.entries()].filter(([k]) => k.startsWith('answer_cards/'));
    expect(cards).toHaveLength(1);
    expect(cards[0][1]).toMatchObject({
      userId: 'u1',
      kind: 'recommendation',
      pick: { by: 'Physio Pat' },
    });

    await recordFollowUpAnswer('u1', { ...commitment, outcome: 'done' }, 'it really helped');
    expect(store.get(logged[0][0])).toMatchObject({
      outcome: 'done',
      helped: 'yes',
      answeredAt: expect.any(String),
    });

    // Another day, another topic: equal quality, the liked creator's short video wins.
    webFinds('vidLecture1', 'vidPatCalf1');
    const out = await runFindCoachingResources(
      { topic: 'calf stretches', format: 'video' },
      { session: {}, userData: {} },
      'u1'
    );
    expect(out).toContain('Title vidPatCalf1');
    expect(out).toContain('last time they liked picks from Physio Pat and short ones');

    // A look-alike channel with the same name earns no "you liked" line.
    webFinds('vidFakePat1');
    const fake = await runFindCoachingResources(
      { topic: 'hip stretches', format: 'video' },
      { session: {}, userData: {} },
      'u1'
    );
    expect(fake).toContain('Title vidFakePat1');
    expect(fake).not.toContain('picks from Physio Pat');
    const check = JSON.stringify(
      generateContent.mock.calls
        .filter((c) => !(c[0] as { config?: { tools?: unknown } }).config?.tools)
        .at(-1)
    );
    expect(check).toContain('liked videos, short ones');
  });

  it('without answers ranks by quality alone and claims no taste', async () => {
    webFinds('vidLecture1', 'vidPatCalf1');
    const out = await runFindCoachingResources(
      { topic: 'calf stretches', format: 'video' },
      { session: {}, userData: {} },
      'u2'
    );
    expect(out).toContain('Title vidLecture1');
    expect(out).not.toContain('last time they liked');
  });
});
