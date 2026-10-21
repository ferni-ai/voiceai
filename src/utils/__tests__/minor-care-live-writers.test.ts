/**
 * MINOR_CARE=on: the per-turn "better than human" writers in
 * live-superhuman-injections.ts and the daily check-in store nothing for a
 * caller who said they're under 18 and isn't a verified owner. Each case runs
 * the real writer through the real per-turn builder with only storage faked
 * (Firestore, the data-layer indexers and the outreach publisher), and checks
 * the same writer still stores for a verified owner and with the flag off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => [] as string[]);

/** A fake Firestore that records every write path (src/tests/setup.ts mocks both getFirestoreDb paths). */
const fakeDb = vi.hoisted(() => {
  const empty = {
    exists: false,
    empty: true,
    docs: [],
    size: 0,
    data: () => undefined,
    forEach: () => undefined,
  };
  const write = (path: string) => async () => {
    stored.push(path);
    return { id: 'stored-1' };
  };
  const ref = (path: string): Record<string, unknown> =>
    new Proxy(
      {
        path,
        id: path.split('/').at(-1),
        collection: (name: string) => ref(`${path}/${name}`),
        doc: (id = 'auto') => ref(`${path}/${id}`),
        get: async () => empty,
        set: write(path),
        add: write(path),
        update: write(path),
        create: write(path),
        delete: write(path),
      } as Record<string | symbol, unknown>,
      { get: (t, k) => (k in t ? t[k] : k === 'then' ? undefined : () => ref(path)) }
    );
  const tx = (r: { path: string }) => void stored.push(r.path);
  return Object.assign(ref(''), {
    runTransaction: async (fn: (t: unknown) => unknown) =>
      fn({ get: async () => empty, set: tx, update: tx, create: tx, delete: tx }),
    batch: () => ({ set: tx, update: tx, create: tx, delete: tx, commit: async () => undefined }),
  });
});
vi.mock('../../services/data-layer/integrations/index.js', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return Object.fromEntries(
    Object.entries(real).map(([name, v]) => [
      name,
      typeof v === 'function' && name.startsWith('index')
        ? async () => void stored.push(`index:${name}`)
        : v,
    ])
  );
});
const published = vi.hoisted(() => vi.fn(async () => ({ success: true, triggerId: 't1' })));
vi.mock('../../services/outreach/trigger-publisher.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  publishOutreachTrigger: published,
}));
const recordWeather = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../services/engagement/engagement-store.js', () => ({
  getEngagementStore: async () => ({ recordWeather }),
}));
const recordCompletionAsync = vi.hoisted(() => vi.fn(async () => ({ streak: 1 })));
vi.mock('../../services/daily-rituals.js', () => ({
  getDailyRitualsService: () => ({ recordCompletionAsync }),
}));
vi.mock('../../config/gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isGeminiConfigured: () => false,
}));

import { buildLiveSuperhumanInjections } from '../../agents/processors/live-superhuman-injections.js';
import { processDailyCheckIn } from '../../agents/voice-agent/daily-checkin-handler.js';
import { getFirestoreDb } from '../firestore-utils.js';
import { getFirestoreDb as superhumanDb } from '../../services/superhuman/firestore-utils.js';
import { noteCallerWords, resetMinorCare, setVerifiedOwnerCheck } from '../minor-care.js';
// The builder imports each writer lazily: load them first so a turn's writes land within the wait.
import '../../services/superhuman/values-alignment.js';
import '../../services/superhuman/capacity-guardian.js';
import '../../services/superhuman/relationship-network.js';
import '../../services/superhuman/dream-keeper.js';
import '../../services/superhuman/life-narrative.js';
import '../../services/outreach/pattern-outreach-integration.js';

type Case = 'held' | 'owner' | 'off';
let n = 0;

/** A session in the given state: held (flag on, said 16), a verified owner who said 16, or flag off. */
function sessionFor(c: Case): string {
  const sessionId = `live-${c}-${++n}`;
  vi.stubEnv('MINOR_CARE', c === 'off' ? 'off' : 'on');
  if (c === 'owner') setVerifiedOwnerCheck((id) => id === sessionId);
  noteCallerWords(sessionId, "I'm 16 years old and kind of bored");
  return sessionId;
}

/** Run one turn of the real builder and let its fire-and-forget writes land. */
async function turn(sessionId: string, userText: string, intensity = 0.3): Promise<void> {
  await buildLiveSuperhumanInjections({
    userId: `user-${sessionId}`,
    sessionId,
    userText,
    emotionalState: { primary: 'neutral', intensity, distressLevel: 0.1, trajectory: 'stable' },
    analysis: { topics: { detected: [] } } as never,
    turnCount: 3,
  });
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 150);
  });
}

beforeEach(() => {
  vi.mocked(getFirestoreDb).mockReturnValue(fakeDb as never);
  vi.mocked(superhumanDb).mockReturnValue(fakeDb as never);
  stored.length = 0;
  published.mockClear();
  recordWeather.mockClear();
  recordCompletionAsync.mockClear();
});
afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
});

const WRITERS: Array<[string, string, RegExp, number?]> = [
  ['recordValueMention (values)', 'Honestly, I value my freedom more than anything.', /values/i],
  [
    'recordEnergyReading (capacity)',
    "I'm so exhausted, I can't keep up with anything.",
    /energy|capacity/i,
  ],
  [
    'recordMention (relationship network)',
    'I talked to my mom Sarah about it yesterday.',
    /relationship|people|person/i,
  ],
  ['recordDreamMention (dreams)', "I've always wanted to open a little bakery.", /dream/i],
  [
    'createOrUpdateChapter (life narrative)',
    'I quit my job at the store last week.',
    /chapter|narrative/i,
  ],
];

describe.each<[Case, boolean]>([
  ['held', false],
  ['owner', true],
  ['off', true],
])('%s: stores = %s', (c, stores) => {
  it.each(WRITERS)('%s', async (_name, said, where) => {
    const sessionId = sessionFor(c);
    await turn(sessionId, said);
    if (stores) expect(stored.some((p) => where.test(p))).toBe(true);
    else expect(stored).toEqual([]);
  });

  it('schedulePatternOutreachAsync: no outreach to the caller is scheduled', async () => {
    const sessionId = sessionFor(c);
    await turn(sessionId, 'I have a huge deadline and a presentation tomorrow.', 0.9);
    expect(published).toHaveBeenCalledTimes(stores ? 1 : 0);
  });

  it('processDailyCheckIn: no emotional weather or ritual recorded', async () => {
    const sessionId = sessionFor(c);
    await processDailyCheckIn("sky check: I'm feeling happy and great today", {
      sessionId,
      userId: `user-${sessionId}`,
      turnCount: 1,
      recentTranscripts: [],
    });
    expect(recordWeather).toHaveBeenCalledTimes(stores ? 1 : 0);
    expect(recordCompletionAsync).toHaveBeenCalledTimes(stores ? 1 : 0);
  });
});
