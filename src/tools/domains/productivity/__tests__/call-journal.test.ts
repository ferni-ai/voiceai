/**
 * CALL_JOURNAL: what someone keeps in a call lands in their journal.
 *
 * Journal audit 2026-10-13, section 3: the voice `journal` tool saved nothing,
 * saveNote reflections went to the agent's RAM, and addGratitude was never
 * registered, so a call never reached the Chronicle. Each test here runs the
 * real registered tool and reads back through the Chronicle's own read path
 * (JournalService.getAllEntries with JOURNAL_ONE_STORE on), against one
 * in-memory Firestore.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeFirestore,
  newFakeFirestoreState,
  resetFakeFirestore,
} from '../../../../tests/helpers/fake-firestore.js';

const h = vi.hoisted(() => ({
  state: undefined as unknown as ReturnType<typeof newFakeFirestoreState>,
  productivityWrites: [] as unknown[],
}));
h.state = newFakeFirestoreState();
// The tools module loads (and builds the registry list) while the flag is on, as it
// would in a process whose first call's caller had it on through a cohort.
process.env.CALL_JOURNAL = 'on';
process.env.JOURNAL_ONE_STORE = 'on';
const db = createFakeFirestore(h.state)()!;

vi.mock('../../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getFirestoreDb: () => (h.state.up ? db : null),
}));
vi.mock('../../../../services/custom-agent/custom-agent-persistence-service.js', () => ({
  listCustomAgents: vi.fn(async () => []),
}));
vi.mock('../../../../services/stores/productivity-store.js', () => ({
  getProductivityStore: () => ({
    loadUserData: async () => undefined,
    getUserNotes: () => [],
    getUserJournals: () => [],
    getUserJournalEntries: () => [],
    setNote: (_uid: string, note: unknown) => h.productivityWrites.push(note),
    setJournal: (_uid: string, entry: unknown) => h.productivityWrites.push(entry),
    setJournalEntry: (_uid: string, entry: unknown) => h.productivityWrites.push(entry),
  }),
}));

const { definitions: registry, getNotesToolDefinitions } = await import('../index.js');
const { getJournalService } = await import('../../../../services/journal/index.js');
// What the agent process loads to wire the store (gce/job-executor.ts imports it).
await import('../../../../agents/journal-store-register.js');

type RunnableTool = {
  parameters: { parse: (args: unknown) => Record<string, unknown>; shape: object };
  execute: (args: Record<string, unknown>, opts: unknown) => Promise<unknown>;
};

let n = 0;
let uid = '';

/** A tool as the call registers it, run the way the model calls it: args through the schema. */
async function runTool(id: string, args: Record<string, unknown>, caller = uid) {
  const def = getNotesToolDefinitions().find((d) => d.id === id);
  if (!def) throw new Error(`${id} is not registered`);
  const tool = def.create({} as never) as RunnableTool;
  const ctx = { userData: { userId: caller, services: { sessionId: `session-${n}` } } };
  return String(await tool.execute(tool.parameters.parse(args), { ctx, toolCallId: 't1' }));
}

const registered = () => getNotesToolDefinitions().map((d) => d.id);
const journalWrites = () => h.state.writes.filter((w) => w.path.includes('/journal/'));
const chronicle = async (owner = uid) => getJournalService().getAllEntries(owner);

beforeEach(() => {
  resetFakeFirestore(h.state);
  h.productivityWrites.length = 0;
  n++;
  uid = `caller-${n}`; // fresh uid per test: the JournalService cache is per uid
  vi.stubEnv('JOURNAL_ONE_STORE', 'on');
  vi.stubEnv('CALL_JOURNAL', 'on');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('CALL_JOURNAL on', () => {
  it('a journal write in a call shows up in the Chronicle, tagged as from this call', async () => {
    const reply = await runTool('journal', {
      action: 'write',
      entry: 'Finally told my brother I was proud of him.',
    });

    expect(reply).toMatch(/^Saved to their journal/);
    const entries = await chronicle();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      content: 'Finally told my brother I was proud of him.',
      source: 'call',
      conversationId: `session-${n}`,
      momentType: 'journal',
    });
  });

  it("saves under the session's caller, never a uid passed in the tool args", async () => {
    await runTool('journal', { action: 'write', entry: 'Mine.', userId: 'someone-else' });

    expect(journalWrites().map((w) => w.path)).toEqual([
      expect.stringMatching(`^bogle_users/${uid}/journal/`),
    ]);
    expect(await chronicle('someone-else')).toEqual([]);
  });

  it('an unidentified caller gets nothing saved and an honest reply', async () => {
    const reply = await runTool('journal', { action: 'write', entry: 'Hello.' }, 'anonymous');

    expect(journalWrites()).toEqual([]);
    expect(reply).toMatch(/^Not saved/);
  });

  it('a store failure is reported as not saved', async () => {
    h.state.up = false;
    const reply = await runTool('journal', { action: 'write', entry: 'Rough day.' });
    h.state.up = true;

    expect(reply).toMatch(/^Not saved/);
    expect(await chronicle()).toEqual([]);
  });

  it('saveNote reflection and gratitude go to the journal, not the RAM store', async () => {
    await runTool('saveNote', { content: 'I handled the meeting calmly.', type: 'reflection' });
    await runTool('saveNote', { content: 'My neighbor brought soup.', type: 'gratitude' });

    const kept = (await chronicle()).map((e) => [e.momentType, e.content]);
    expect(kept).toEqual(
      expect.arrayContaining([
        ['reflection', 'I handled the meeting calmly.'],
        ['gratitude', 'My neighbor brought soup.'],
      ])
    );
    expect(h.productivityWrites).toEqual([]);
  });

  it('a quick note stays a note and stays out of the journal', async () => {
    await runTool('saveNote', { content: 'Buy stamps.', type: 'quick' });

    expect(journalWrites()).toEqual([]);
    expect(h.productivityWrites).toHaveLength(1);
  });

  it('addGratitude is registered and saves their words as one entry', async () => {
    expect(registered()).toContain('addGratitude');
    await runTool('addGratitude', { gratitudes: ['my sister', 'a quiet morning'] });

    const entries = await chronicle();
    expect(entries.map((e) => e.content)).toEqual(['my sister\na quiet morning']);
    expect(entries[0].momentType).toBe('gratitude');
  });

  it("history reads back the caller's own entries only", async () => {
    await runTool('journal', { action: 'write', entry: 'Walked by the river.' });
    await runTool('journal', { action: 'write', entry: 'Not mine.' }, `other-${n}`);

    const reply = await runTool('journal', { action: 'history' });
    expect(reply).toContain('Walked by the river.');
    expect(reply).not.toContain('Not mine.');
  });
});

describe('CALL_JOURNAL per caller (cohort-flags.ts)', () => {
  it('the registry, built once per process, never decides: each call’s tools follow its flags', () => {
    // As the process registered them, whatever the flag was then.
    const journalDef = registry.find((d) => d.id === 'journal');
    expect(registry.map((d) => d.id)).not.toContain('addGratitude');

    vi.stubEnv('CALL_JOURNAL', 'off');
    const offCall = journalDef?.create({} as never) as RunnableTool;
    expect(Object.keys(offCall.parameters.shape)).toEqual(['type']);

    vi.stubEnv('CALL_JOURNAL', 'on'); // the next caller's cohort turned it on
    const onCall = journalDef?.create({} as never) as RunnableTool;
    expect(Object.keys(onCall.parameters.shape)).toContain('action');
  });
});

describe('agent process wiring', () => {
  it('the module that runs every call (gce/job-executor.ts) loads the journal store wiring', () => {
    const executor = new URL('../../../../agents/gce/job-executor.ts', import.meta.url);
    expect(readFileSync(executor, 'utf8')).toContain("import '../journal-store-register.js';");
  });
});

describe('CALL_JOURNAL off', () => {
  beforeEach(() => vi.stubEnv('CALL_JOURNAL', 'off'));

  it('registers the tools exactly as before: no addGratitude, no write action', () => {
    expect(registered()).not.toContain('addGratitude');
    const def = getNotesToolDefinitions().find((d) => d.id === 'journal');
    const tool = def?.create({} as never) as RunnableTool;
    expect(Object.keys(tool.parameters.shape)).toEqual(['type']);
  });

  it('stays off while JOURNAL_ONE_STORE is off, since the Chronicle would not read the store', () => {
    vi.stubEnv('CALL_JOURNAL', 'on');
    vi.stubEnv('JOURNAL_ONE_STORE', 'off');

    expect(registered()).not.toContain('addGratitude');
  });

  it('writes nothing to the journal from a call', async () => {
    await runTool('journal', { action: 'write', entry: 'Should not save.' });
    await runTool('saveNote', { content: 'A reflection.', type: 'reflection' });

    expect(journalWrites()).toEqual([]);
    expect(await chronicle()).toEqual([]);
  });
});

describe('MID_CALL_NOTE_FRAME: our own context notes are never saved as their words', () => {
  // What the model copied on dev, and what the framed note opens with.
  const STOCK = 'New instructions received: Never guess how someone is related to them.';
  const FRAMED =
    '[Private note to you from your own memory and context, not words the caller said.] Never guess.';

  beforeEach(() => vi.stubEnv('MID_CALL_NOTE_FRAME', 'on'));

  it('journal write refuses a framed or stock note and saves nothing', async () => {
    for (const entry of [STOCK, FRAMED]) {
      expect(await runTool('journal', { action: 'write', entry })).toMatch(
        /^Not saved: that text was your own/
      );
    }
    expect(await chronicle()).toEqual([]);
    expect(journalWrites()).toEqual([]);
  });

  it('addGratitude refuses a note among the items', async () => {
    const reply = await runTool('addGratitude', { gratitudes: ['my sister', STOCK] });

    expect(reply).toMatch(/^Not saved: that text was your own/);
    expect(await chronicle()).toEqual([]);
  });

  it('saveNote (journal or legacy store) refuses a note', async () => {
    expect(await runTool('saveNote', { content: STOCK, type: 'reflection' })).toMatch(/^Not saved/);
    vi.stubEnv('CALL_JOURNAL', 'off');
    expect(await runTool('saveNote', { content: FRAMED, type: 'quick' })).toMatch(/^Not saved/);

    expect(await chronicle()).toEqual([]);
    expect(h.productivityWrites).toEqual([]);
  });

  it("the caller's own words still save with the flag on", async () => {
    const reply = await runTool('journal', {
      action: 'write',
      entry: 'Talked to my sister today.',
    });

    expect(reply).toMatch(/^Saved to their journal/);
    expect((await chronicle()).map((e) => e.content)).toEqual(['Talked to my sister today.']);
  });

  it('flag off: the same text saves as before', async () => {
    vi.stubEnv('MID_CALL_NOTE_FRAME', 'off');
    const reply = await runTool('journal', { action: 'write', entry: STOCK });

    expect(reply).toMatch(/^Saved to their journal/);
    expect(await chronicle()).toHaveLength(1);
  });
});
