/**
 * The pondered opener is held back when it is about a topic the caller asked
 * Ferni to forget, and when their forgotten topics can't be read (fails
 * closed); otherwise it opens. The topics are read through the memory
 * module's forgotten-store adapter (memory_state/forgotten).
 */
import { describe, expect, it, vi } from 'vitest';
import { pathFirestore } from '../../../services/outreach/proactive-channels/__tests__/path-firestore.js';

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => state.db,
}));
vi.mock('../pondering-reader.js', () => ({
  readPonderingForGreeting: vi.fn(async () => ({
    followUp: { text: 'How did the Willow Creek audition go?', basis: 's1' },
  })),
}));
const { ponderingForOpener } = await import('../pondering-opener.js');

const ON = { now: new Date('2026-10-18T15:00:00Z'), env: { PONDERING: 'on' } };
const FORGOTTEN = 'bogle_users/u1/memory_state/forgotten';

function dbWith(forgotten?: Record<string, unknown>) {
  const docs = new Map<string, Record<string, unknown>>();
  if (forgotten) docs.set(FORGOTTEN, forgotten);
  state.db = pathFirestore(docs);
  return state.db as never;
}

describe('pondered opener and forgotten topics', () => {
  it('opens when nothing is forgotten', async () => {
    expect((await ponderingForOpener(dbWith(), 'u1', ON))?.text).toBe(
      'How did the Willow Creek audition go?'
    );
  });

  it('is held back when it is about a forgotten topic', async () => {
    const db = dbWith({ topics: ['audition'], generation: 1 });
    expect(await ponderingForOpener(db, 'u1', ON)).toBeUndefined();
  });

  it('opens when the forgotten topic is about something else', async () => {
    const db = dbWith({ topics: ['biopsy'], generation: 1 });
    expect(await ponderingForOpener(db, 'u1', ON)).toBeDefined();
  });

  it('is held back when the topics are unreadable', async () => {
    const db = dbWith({ topics: 'audition' });
    expect(await ponderingForOpener(db, 'u1', ON)).toBeUndefined();
  });
});
