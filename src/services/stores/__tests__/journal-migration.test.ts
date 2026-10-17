/**
 * The JOURNAL_ONE_STORE migration copies the twins' journal arrays into
 * bogle_users/{uid}/journal, keeping ids, skipping placeholders, writing
 * nothing on a dry run and nothing twice.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeFirestore,
  newFakeFirestoreState,
  resetFakeFirestore,
} from '../../../tests/helpers/fake-firestore.js';

const h = vi.hoisted(() => ({
  state: undefined as unknown as ReturnType<typeof newFakeFirestoreState>,
}));
h.state = newFakeFirestoreState();
const db = createFakeFirestore(h.state)()!;

vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getFirestoreDb: () => db,
}));
vi.mock('../../custom-agent/custom-agent-persistence-service.js', () => ({
  listCustomAgents: vi.fn(async () => []),
}));

const { planJournalMigration, runJournalMigration } = await import('../journal-migration.js');
const { firestoreJournalStore } = await import('../journal-store.js');

const twin = (uid: string, agentId: string, journalEntries: object[]) => ({
  uid,
  agentId,
  data: { id: agentId, type: 'twin', memories: { journalEntries } },
});
const spring = {
  id: 'mem_1',
  content: 'From last spring.',
  mood: 'calm',
  createdAt: new Date('2026-04-01'),
};
const agents = [
  twin('uid-a', 'twin-a', [
    spring,
    { id: 'mem_2', content: '[Transcription unavailable]' },
    { content: 'no id, nothing to dedupe on' },
  ]),
  twin('uid-b', 'twin-b', [
    { id: 'mem_3', content: 'B walked the dog.', createdAt: new Date('2026-05-01') },
  ]),
];
const journalWrites = () => h.state.writes.filter((w) => w.path.includes('/journal/'));

beforeEach(() => resetFakeFirestore(h.state));

describe('journal migration', () => {
  it('plans only real words with an id, into the owner’s own store, tagged with the agent', () => {
    const plan = planJournalMigration(agents);
    expect(plan.map((p) => [p.uid, p.entryId])).toEqual([
      ['uid-a', 'mem_1'],
      ['uid-b', 'mem_3'],
    ]);
    expect(plan[0].doc).toMatchObject({
      content: 'From last spring.',
      agentId: 'twin-a',
      mood: 'calm',
    });
  });

  it('a dry run writes nothing', async () => {
    expect(await runJournalMigration(db, agents, false)).toEqual({
      agents: 2,
      planned: 2,
      alreadyThere: 0,
      written: 0,
    });
    expect(journalWrites()).toEqual([]);
  });

  it('apply copies each entry once to its owner, keeping its id, and a rerun writes nothing', async () => {
    expect(await runJournalMigration(db, agents, true)).toMatchObject({ written: 2 });
    expect(journalWrites().map((w) => w.path)).toEqual([
      'bogle_users/uid-a/journal/mem_1',
      'bogle_users/uid-b/journal/mem_3',
    ]);

    expect(await runJournalMigration(db, agents, true)).toMatchObject({
      alreadyThere: 2,
      written: 0,
    });
    expect(journalWrites()).toHaveLength(2);
  });

  it('after the migration the twin still lists each entry once', async () => {
    await runJournalMigration(db, agents, true);
    const agent = { id: 'twin-a', type: 'twin', memories: agents[0].data.memories } as never;
    const listed = await firestoreJournalStore.listForAgent('uid-a', agent);
    expect(listed.filter((e) => e.content === 'From last spring.')).toHaveLength(1);
    expect(listed.map((e) => e.content)).not.toContain('B walked the dog.');
  });
});
