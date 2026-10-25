/**
 * A failed insights read never costs the stored insights, and the app's read
 * fails loudly instead of answering an empty list.
 *
 * Before: a write saved this process's whole cached list over the stored one, so
 * a read that errored (or a process that had never read) replaced what the other
 * personas had left for each other. Writes now apply one change to the list as
 * stored at that moment (insight-store.ts); the Firestore emulator test
 * src/api/__tests__/menu-team-insights.emulator.test.ts covers two processes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeEngagementFirestore,
  type FakeEngagementFirestore,
} from '../../engagement/__tests__/fake-engagement-firestore.js';

const firestore: FakeEngagementFirestore = createFakeEngagementFirestore();
type Ref = { get: () => Promise<unknown>; set: (d: object, o?: object) => Promise<void> };
// One transaction at a time is enough here: read, then write what the change returned.
const db = Object.assign(firestore.db, {
  runTransaction: async (fn: (tx: object) => Promise<void>) => {
    const writes: Array<() => Promise<void>> = [];
    await fn({
      get: (ref: Ref) => ref.get(),
      set: (ref: Ref, data: object, opts?: object) => writes.push(() => ref.set(data, opts)),
    });
    for (const write of writes) await write();
  },
});

vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => db,
}));

import {
  addCrossPersonaInsight,
  buildInsightBriefingForHandoff,
  getInsightsForPersona,
  loadInsights,
} from '../cross-persona-insights.js';
import { insightWritesSettled } from '../insight-store.js';

let userSeq = 0;
let user: string;
const docPath = (): string => `bogle_users/${user}/team_insights/data`;

const storedInsight = () => ({
  id: 'insight_stored',
  source: 'peter',
  target: 'maya',
  priority: 'low',
  content: 'Spending spikes after hard work days',
  category: 'stress-spending-pattern',
  createdAt: Date.now() - 60_000,
  expiresAt: Date.now() + 60 * 60 * 1000,
  proactive: false,
  oneTime: false,
});

const addInsight = async (content: string): Promise<void> => {
  addCrossPersonaInsight(user, {
    source: 'maya',
    target: 'jordan',
    priority: 'low',
    content,
    category: `habit-${content}`,
    proactive: false,
    oneTime: false,
  });
  await insightWritesSettled();
};

const storedIds = (): string[] =>
  ((firestore.docs.get(docPath())?.insights ?? []) as Array<{ id: string; content: string }>).map(
    (i) => (i.id === 'insight_stored' ? i.id : i.content)
  );

beforeEach(() => {
  // Module state (the per-process view and its read times) lives for the whole file.
  user = `user-${++userSeq}`;
  firestore.docs.clear();
  firestore.failReads.match = null;
  // A signed-up user: their record exists (a call's session start makes it)
  firestore.docs.set(`bogle_users/${user}`, { id: user });
});

describe('cross-persona insight reads', () => {
  it('a read that throws never costs the stored insights', async () => {
    firestore.docs.set(docPath(), { insights: [storedInsight()], lastScannedAt: 1 });
    firestore.failReads.match = new RegExp(`^${docPath()}$`);

    await loadInsights(user);
    await addInsight('while-down'); // its transaction can't read either: nothing written
    expect(storedIds()).toEqual(['insight_stored']);

    firestore.failReads.match = null;
    await addInsight('after');
    expect(storedIds()).toEqual(['insight_stored', 'after']);
  });

  it('a missing document still saves new insights', async () => {
    await loadInsights(user);
    await addInsight('new');

    expect(storedIds()).toEqual(['new']);
  });

  it('insights that loaded save with the new one added', async () => {
    firestore.docs.set(docPath(), { insights: [storedInsight()], lastScannedAt: 1 });

    await loadInsights(user);
    expect(getInsightsForPersona(user, 'maya').map((i) => i.insight.id)).toEqual([
      'insight_stored',
    ]);
    await addInsight('new');

    expect(storedIds()).toEqual(['insight_stored', 'new']);
  });

  it('a stored insight this process never read survives its write', async () => {
    await loadInsights(user); // read while empty
    firestore.docs.set(docPath(), { insights: [storedInsight()], lastScannedAt: 1 }); // another process

    await addInsight('mine');

    expect(storedIds()).toEqual(['insight_stored', 'mine']);
  });

  it('a stored document whose record is gone (an erasure partway) gets no write', async () => {
    firestore.docs.set(docPath(), { insights: [storedInsight()], lastScannedAt: 1 });
    firestore.docs.delete(`bogle_users/${user}`);

    await loadInsights(user);
    await addInsight('after-erasure-began');

    expect(storedIds()).toEqual(['insight_stored']);
  });

  it("the app's read failing is an error, not an empty list", async () => {
    firestore.failReads.match = new RegExp(`^${docPath()}$`);

    await expect(buildInsightBriefingForHandoff(user, 'ferni', { fresh: true })).rejects.toThrow(
      /DEADLINE_EXCEEDED/
    );
  });
});
