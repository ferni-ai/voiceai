/**
 * A failed insights read never overwrites the stored insights.
 *
 * Before: the persistence store's non-strict load answered null on a read
 * error, and the catch marked the user loaded ("don't retry"). The next
 * insight a persona recorded was persisted as the user's whole insight list,
 * replacing what the other personas had left for each other.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeEngagementFirestore,
  type FakeEngagementFirestore,
} from '../../engagement/__tests__/fake-engagement-firestore.js';
import type { PersistenceStore } from '../../persistence/index.js';

const fake = vi.hoisted(() => ({ db: null as unknown, store: null as unknown }));

vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));

// The real store, captured so a test can flush one user without waiting for the sync interval.
vi.mock('../../persistence/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../persistence/index.js')>();
  return {
    ...actual,
    createPersistenceStore: (config: Parameters<typeof actual.createPersistenceStore>[0]) =>
      (fake.store = actual.createPersistenceStore(config)),
  };
});

import {
  addCrossPersonaInsight,
  getInsightsForPersona,
  loadInsights,
} from '../cross-persona-insights.js';

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

const addInsight = (content: string): void => {
  addCrossPersonaInsight(user, {
    source: 'maya',
    target: 'jordan',
    priority: 'low',
    content,
    category: `habit-${content}`,
    proactive: false,
    oneTime: false,
  });
};

const flush = async (): Promise<void> => {
  await (fake.store as PersistenceStore<unknown> | null)?.flushUser(user);
};

const storedIds = (): string[] =>
  ((firestore.docs.get(docPath())?.insights ?? []) as Array<{ id: string; content: string }>).map(
    (i) => (i.id === 'insight_stored' ? i.id : i.content)
  );

const firestore: FakeEngagementFirestore = createFakeEngagementFirestore();
fake.db = firestore.db;

beforeEach(() => {
  // Module state (loaded and failed markers, the insight cache) lives for the whole file.
  user = `user-${++userSeq}`;
  firestore.docs.clear();
  firestore.failReads.match = null;
});

describe('cross-persona insight reads', () => {
  it('a read that throws leaves the stored insights unwritten', async () => {
    const stored = { insights: [storedInsight()], lastScannedAt: 1 };
    firestore.docs.set(docPath(), structuredClone(stored));
    firestore.failReads.match = new RegExp(`^${docPath()}$`);

    await loadInsights(user);
    addInsight('new');
    await flush();

    expect(firestore.docs.get(docPath())).toEqual(stored);
  });

  it('a missing document still saves new insights', async () => {
    await loadInsights(user);
    addInsight('new');
    await flush();

    expect(storedIds()).toEqual(['new']);
  });

  it('insights that loaded save with the new one added', async () => {
    firestore.docs.set(docPath(), { insights: [storedInsight()], lastScannedAt: 1 });

    await loadInsights(user);
    expect(getInsightsForPersona(user, 'maya').map((i) => i.insight.id)).toEqual([
      'insight_stored',
    ]);
    addInsight('new');
    await flush();

    expect(storedIds()).toEqual(['insight_stored', 'new']);
  });

  it('a later read that succeeds allows saving again', async () => {
    const stored = { insights: [storedInsight()], lastScannedAt: 1 };
    firestore.docs.set(docPath(), structuredClone(stored));
    firestore.failReads.match = new RegExp(`^${docPath()}$`);
    await loadInsights(user);
    addInsight('lost');
    await flush();
    expect(firestore.docs.get(docPath())).toEqual(stored);

    firestore.failReads.match = null;
    await loadInsights(user);
    addInsight('kept');
    await flush();

    expect(storedIds()).toEqual(['insight_stored', 'kept']);
  });
});
