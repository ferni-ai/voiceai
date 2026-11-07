/**
 * The per-turn "better than human" writers (live-superhuman-writes.ts) still
 * store through the real per-turn builder after the move out of
 * live-superhuman-injections.ts. Only storage is faked (Firestore, the
 * data-layer indexers, the outreach publisher and the commitment stores).
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
/** The commitment path's stores: the trust moment, and the E2E commitment and progress keepers. */
const commitments = vi.hoisted(() => ({
  trust: vi.fn(),
  made: vi.fn(async () => null),
  progress: vi.fn(async () => null),
}));
vi.mock('../../../services/trust-systems/unified-recorder.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recordTrustMoment: commitments.trust,
}));
vi.mock('../../../services/superhuman/commitment-keeper-e2e.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  detectCommitmentE2E: commitments.made,
  checkProgressE2E: commitments.progress,
}));

import { buildLiveSuperhumanInjections } from '../live-superhuman-injections.js';
import * as writes from '../live-superhuman-writes.js';
import { detectCrisis } from '../../../services/safety/crisis-guard.js';
import { notePatternRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
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
  Object.values(commitments).forEach((fn) => fn.mockClear());
  // Each call has its own session (the hold is per call), so no hold state carries over.
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

// K1e: the person hurting the caller may read a check-in sent to their phone, so a call with an
// abuse disclosure stores and schedules nothing mid-call. A call with only suicidal risk stores and
// schedules as on main. A turn read still in flight is waited on (abuse-outreach-hold.test.ts,
// turn-crisis-abuse-hold.test.ts). Every line is invented.
describe('live superhuman writers hold on a call with an abuse disclosure', () => {
  const ABUSE = 'My husband hits me.';
  const PERSON = 'I talked to my mom Sarah about it yesterday.';
  const BUSY = 'I have a huge deadline and a presentation tomorrow.';
  const COMMITMENT = "I'll call the landlord tomorrow about the lease.";
  /** One everyday line per writer, each of which stores or schedules on an everyday call. */
  const EVERYDAY: Array<[string, string, number]> = [
    ['value', 'Honestly, I value my freedom more than anything.', 0.3],
    ['energy', "I'm so exhausted, I can't keep up with anything.", 0.3],
    ['person', PERSON, 0.3],
    ['dream', "I've always wanted to open a little bakery.", 0.3],
    ['chapter', 'I quit my job at the store last week.', 0.3],
    ['pattern outreach', BUSY, 0.9],
    ['commitment', COMMITMENT, 0.3],
  ];
  const wrote = () =>
    stored.length +
    published.mock.calls.length +
    commitments.trust.mock.calls.length +
    commitments.made.mock.calls.length;

  it.each(EVERYDAY)('everyday %s turn writes (the control)', async (_w, said, intensity) => {
    await turn(said, intensity);
    expect(wrote()).toBeGreaterThan(0);
  });

  it.each(EVERYDAY)('%s: an abuse call writes nothing, that turn or later', async (_w, said, i) => {
    const sessionId = await turn(`${ABUSE} ${said}`, i);
    await turn(said, i, sessionId);
    expect(wrote()).toBe(0);
    // The commitment progress check (completion memory, celebration text) is held too.
    expect(commitments.progress).not.toHaveBeenCalled();
  });

  it.each(EVERYDAY)('%s: a suicidal-only call writes as on main', async (_w, said, i) => {
    const sessionId = await turn('I want to end my life.', i);
    await turn(said, i, sessionId);
    expect(wrote()).toBeGreaterThan(0);
  });

  it('the hold is per call: an abuse disclosure on another call does not hold this one', async () => {
    await turn(ABUSE, 0.3, 'writes-other-call');
    await turn(PERSON);
    await turn(BUSY, 0.9);
    expect(stored.some((p) => /relationship|people|person/i.test(p))).toBe(true);
    expect(published).toHaveBeenCalledTimes(1);
  });

  it('the twin still stores and schedules: "my brother hits me at video games"', async () => {
    await turn(`My brother hits me at video games. ${PERSON}`);
    expect(stored.some((p) => /relationship|people|person/i.test(p))).toBe(true);
    await turn(`My brother hits me at video games, and ${BUSY.toLowerCase()}`, 0.9);
    expect(published).toHaveBeenCalledTimes(1);
  });
});

// Every writer the module exports, called directly: a new writer must be listed here, and each
// one must write for an everyday call and write nothing for a call with an abuse disclosure.
describe('every exported writer asks the one hold check', () => {
  const ctx = (sessionId: string, userText: string) => ({
    userId: `user-${sessionId}`,
    sessionId,
    userText,
    emotionalState: { primary: 'neutral' },
  });
  const WRITERS: Record<string, (sessionId: string) => Promise<void>> = {
    persistValue: (s) => writes.persistValue(ctx(s, 'Honestly, I value my freedom.')),
    persistEnergy: (s) =>
      writes.persistEnergy(ctx(s, "I'm so exhausted."), { level: 'high', signals: ['tired'] }),
    persistPerson: (s) => writes.persistPerson(ctx(s, 'I talked to my mom Sarah yesterday.')),
    persistDream: (s) => writes.persistDream(ctx(s, "I've always wanted to open a bakery.")),
    persistChapter: (s) => writes.persistChapter(ctx(s, 'I quit my job at the store last week.')),
    schedulePatternOutreachAsync: (s) =>
      writes.schedulePatternOutreachAsync(
        {
          pattern: 'Sunday evening anxiety',
          patternDescription: 'Sunday evenings feel heavy',
          tendency: 'dreads Mondays',
          suggestedOutreach: 'How did Monday go?',
          actionable: 'check in Monday',
        },
        { userId: `user-${s}`, sessionId: s },
        'Sundays always feel heavy.'
      ),
  };
  const settleWrites = () =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });

  it('lists every writer the module exports', () => {
    const exported = Object.entries(writes)
      .filter(([name, v]) => typeof v === 'function' && name !== 'turnWritesHeld')
      .map(([name]) => name);
    expect(Object.keys(WRITERS).sort()).toEqual(exported.sort());
  });

  it.each(Object.entries(WRITERS))('%s writes for an everyday call', async (name, write) => {
    await write(`writer-everyday-${name}`);
    await settleWrites();
    expect(stored.length + published.mock.calls.length).toBeGreaterThan(0);
  });

  it.each(Object.entries(WRITERS))('%s writes nothing on an abuse call', async (name, write) => {
    const sessionId = `writer-abuse-${name}`;
    notePatternRisk(sessionId, detectCrisis('My husband hits me.'));
    await write(sessionId);
    await settleWrites();
    expect(stored.length + published.mock.calls.length).toBe(0);
  });
});
