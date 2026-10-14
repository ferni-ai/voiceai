/**
 * Common ground across two calls: call 1 goes through the real after-call
 * writer into a store, call 2's first recall note carries it. Only the
 * database and the model are fakes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRecall } from '../memory-recall-hook.js';
import { EMPTY_GROUND, type CommonGround } from '../../personas/common-ground.js';
import { updateCommonGroundAfterCall, type GroundStore } from '../../personas/common-ground-after-call.js';

const emptyRecall = { facts: async () => [], summaries: async () => [] };
const emptyLedger = { save: async () => undefined, recent: async () => [] };

function memoryGround(): GroundStore {
  let ground: CommonGround = EMPTY_GROUND;
  return {
    load: async () => ground,
    save: async (_u, g) => {
      ground = g;
    },
  };
}

const CALL_1 = [
  { role: 'user', content: "My boss reorganized every spreadsheet again. He's a spreadsheet goblin." },
  { role: 'assistant', content: 'The spreadsheet goblin strikes again! What did he do?' },
  { role: 'user', content: 'Renamed every tab. The spreadsheet goblin never sleeps.' },
  { role: 'assistant', content: "I'd keep a two-minute log each morning of what changed, so it never ambushes you." },
];
const READING = JSON.stringify({
  told: [{ kind: 'advice', text: "Ferni suggested a two-minute log each morning of what changed" }],
  references: [{ phrase: 'the spreadsheet goblin', meaning: 'their boss, who reorganizes spreadsheets' }],
});

afterEach(() => vi.unstubAllEnvs());

async function callTwo(groundStore: GroundStore) {
  const recall = createMemoryRecall({ userId: 'u1', userName: 'Sam', store: emptyRecall, ledgerStore: emptyLedger, groundStore });
  await recall.ready;
  return recall;
}

describe("common ground in call 2's first recall note", () => {
  it('carries the shorthand and the advice from call 1, once', async () => {
    vi.stubEnv('COMMON_GROUND', 'on');
    const groundStore = memoryGround();
    await updateCommonGroundAfterCall({ userId: 'u1', turns: CALL_1 }, { store: groundStore, read: async () => READING });

    const recall = await callTwo(groundStore);
    const first = recall.noteFor('hey ferni, it is me again') ?? '';
    expect(first).toContain('"the spreadsheet goblin" = their boss');
    expect(first).toContain('advice: Ferni suggested a two-minute log');
    expect(first.length).toBeLessThan(800);
    recall.newTurn();
    expect(recall.noteFor('so anyway, work was rough') ?? '').not.toContain('spreadsheet goblin');
  });

  it('is absent with the flag off, even when the ground is stored', async () => {
    const groundStore = memoryGround();
    await updateCommonGroundAfterCall(
      { userId: 'u1', turns: CALL_1 },
      { store: groundStore, read: async () => READING, env: { COMMON_GROUND: 'on' } }
    );
    const load = vi.spyOn(groundStore, 'load');
    const recall = await callTwo(groundStore);
    expect(recall.noteFor('hey ferni, it is me again')).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('never waits on a slow store: the turn goes on without it', async () => {
    vi.stubEnv('COMMON_GROUND', 'on');
    const hung: GroundStore = { load: () => new Promise(() => undefined), save: async () => undefined };
    const story = { personaId: 'ferni', fact: 'Ferni is reading a book about the silk road', saidAt: '2026-10-09T18:00:00Z' };
    const ledgerStore = { save: async () => undefined, recent: async () => [story] };
    const recall = createMemoryRecall({ userId: 'u1', store: emptyRecall, ledgerStore, groundStore: hung });
    await new Promise((r) => setTimeout(r, 20)); // the snapshot loads; the ground never does
    const started = performance.now();
    const note = recall.noteFor('hey ferni, it is me again') ?? '';
    expect(performance.now() - started).toBeLessThan(20);
    expect(note).toContain('silk road'); // the rest of recall isn't held up
    expect(note).not.toContain('COMMON GROUND');
  });
});
