/**
 * The per-turn "better than human" writers (live-superhuman-writes.ts) still
 * store through the real per-turn builder after the move out of
 * live-superhuman-injections.ts. Only storage is faked (Firestore, the
 * data-layer indexers and the outreach publisher).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => [] as string[]);
/** Each write's path and data, for checking what a writer stored. */
const written = vi.hoisted(() => [] as Array<{ path: string; data: unknown }>);

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
  const write = (path: string) => async (data?: unknown) => {
    stored.push(path);
    written.push({ path, data });
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
  const tx = (r: { path: string }, data?: unknown) => {
    stored.push(r.path);
    written.push({ path: r.path, data });
  };
  return Object.assign(ref(''), {
    runTransaction: async (fn: (t: unknown) => unknown) =>
      fn({ get: async () => empty, set: tx, update: tx, create: tx, delete: tx }),
    batch: () => ({ set: tx, update: tx, create: tx, delete: tx, commit: async () => undefined }),
  });
});
vi.mock('../../../services/data-layer/integrations/index.js', async (importOriginal) => {
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
vi.mock('../../../services/outreach/trigger-publisher.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  publishOutreachTrigger: published,
}));
vi.mock('../../../config/gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isGeminiConfigured: () => false,
}));

import { buildLiveSuperhumanInjections } from '../live-superhuman-injections.js';
import { detectCrisis } from '../../../services/safety/crisis-guard.js';
import {
  crisisRiskThisCall,
  notePatternRisk,
  resetCrisisCallRisk,
} from '../../../services/safety/crisis-call-risk.js';
import { getFirestoreDb } from '../../../utils/firestore-utils.js';
import { getFirestoreDb as superhumanDb } from '../../../services/superhuman/firestore-utils.js';
// The writers import each store lazily: load them first so a turn's writes land within the wait.
import '../../../services/superhuman/values-alignment.js';
import '../../../services/superhuman/capacity-guardian.js';
import '../../../services/superhuman/relationship-network.js';
import '../../../services/superhuman/dream-keeper.js';
import '../../../services/superhuman/life-narrative.js';
import '../../../services/outreach/pattern-outreach-integration.js';

let n = 0;

/** The turn's analysis: no topics, so only the writers under test run. */
const NO_TOPICS = { topics: { detected: [] } };

/** Run one turn of the real builder and let its fire-and-forget writes land. */
async function turn(
  userText: string,
  intensity = 0.3,
  sessionId = `writes-${++n}`
): Promise<string> {
  // The turn's kernel read is noted first, as startTurnCrisis notes it before the injections run.
  const read = detectCrisis(userText);
  if (read.isCrisis) notePatternRisk(sessionId, read);
  await buildLiveSuperhumanInjections({
    userId: `user-${sessionId}`,
    sessionId,
    userText,
    emotionalState: { primary: 'neutral', intensity, distressLevel: 0.1, trajectory: 'stable' },
    analysis: NO_TOPICS as never,
    turnCount: 3,
  });
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 150);
  });
  return sessionId;
}

beforeEach(() => {
  vi.mocked(getFirestoreDb).mockReturnValue(fakeDb as never);
  vi.mocked(superhumanDb).mockReturnValue(fakeDb as never);
  stored.length = 0;
  written.length = 0;
  published.mockClear();
  resetCrisisCallRisk();
});

describe('live superhuman writers store through the per-turn builder', () => {
  it.each<[string, string, RegExp]>([
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
  ])('%s', async (_name, said, where) => {
    expect(stored).toEqual([]);
    await turn(said);
    expect(stored.some((p) => where.test(p))).toBe(true);
  });

  it('the life chapter is keyed by the session, so one chat counts once', async () => {
    const sessionId = await turn('I quit my job at the store last week.');
    const chapters = written.filter((w) => /chapter|narrative/i.test(w.path));
    expect(chapters.length).toBeGreaterThan(0);
    // conversationIds, not just the path: the userId contains the session id too
    const ids = chapters.map((w) => (w.data as { conversationIds?: string[] }).conversationIds);
    expect(ids).toContainEqual([sessionId]);
  });

  it('schedulePatternOutreachAsync: outreach is scheduled', async () => {
    await turn('I have a huge deadline and a presentation tomorrow.', 0.9);
    expect(published).toHaveBeenCalledTimes(1);
  });
});

// K1e: the person hurting the caller may read a check-in sent to their phone, so a call with
// crisis risk (a read of someone hurting them included) stores and schedules nothing mid-call.
// Every line is invented.
describe('live superhuman writers hold on a call with crisis risk', () => {
  const PERSON = 'I talked to my mom Sarah about it yesterday.';
  const BUSY = 'I have a huge deadline and a presentation tomorrow.';

  it('a turn that tells of someone hurting the caller stores no person', async () => {
    const sessionId = await turn(`My husband hits me. ${PERSON}`);
    expect(crisisRiskThisCall(sessionId)).toBe(true);
    expect(stored).toEqual([]);
  });

  it('a turn that tells of someone hurting the caller schedules no outreach', async () => {
    await turn(`My husband hits me, and ${BUSY.toLowerCase()}`, 0.9);
    expect(published).not.toHaveBeenCalled();
  });

  it('an earlier disclosure on the call holds a later everyday turn', async () => {
    const sessionId = await turn("I'm not safe at home.");
    stored.length = 0;
    await turn(BUSY, 0.9, sessionId);
    await turn(PERSON, 0.3, sessionId);
    expect(published).not.toHaveBeenCalled();
    expect(stored).toEqual([]);
  });

  it('the twin still stores and schedules: "my brother hits me at video games"', async () => {
    await turn(`My brother hits me at video games. ${PERSON}`);
    expect(stored.some((p) => /relationship|people|person/i.test(p))).toBe(true);
    await turn(`My brother hits me at video games, and ${BUSY.toLowerCase()}`, 0.9);
    expect(published).toHaveBeenCalledTimes(1);
  });
});
