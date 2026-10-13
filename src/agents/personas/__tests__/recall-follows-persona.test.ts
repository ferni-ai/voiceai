/**
 * Memory recall follows the persona on the call: a teammate is told its own
 * life, never Ferni's. Before this, recall always loaded Ferni's told facts and
 * "since you last talked" updates and told whoever was speaking "This is your
 * life", while teammates' own told facts were saved and never read back.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRecall } from '../../multi-agent/memory-recall-hook.js';
import { CANONICAL_IDS } from '../../../personas/persona-ids.js';
import {
  createLedgerRecorder,
  personaDisplayName,
  type LedgerFact,
  type LedgerStore,
} from '../life-ledger.js';
import { loadLifeUpdates, type LifeUpdate, type LifeUpdateStore } from '../life-updates.js';

const MAYA = CANONICAL_IDS.BUDGETER;
const PETER = CANONICAL_IDS.RESEARCHER;
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const ferniFact: LedgerFact = {
  personaId: CANONICAL_IDS.COACH,
  fact: "Ferni's neighbor's goat got out again",
  saidAt: ago(3),
};
const mayaFact: LedgerFact = {
  personaId: MAYA,
  fact: 'Maya has been planning a trip to Lisbon',
  saidAt: ago(3),
};

/** Filters by persona the way firestoreLedgerStore.recent does. */
const ledgerStore: LedgerStore = {
  save: async () => undefined,
  recent: async (_u, personaId, limit) =>
    [ferniFact, mayaFact].filter((f) => f.personaId === personaId).slice(0, limit),
};

const updates: LifeUpdate[] = [
  { personaId: CANONICAL_IDS.COACH, update: 'The goat is fenced in now.', createdAt: ago(1) },
  { personaId: MAYA, update: 'You booked the Lisbon flights.', createdAt: ago(1) },
];
const updateStore: LifeUpdateStore = {
  save: async () => undefined,
  recent: async (_u, personaId, limit) =>
    updates.filter((u) => u.personaId === personaId).slice(0, limit),
};

const noUserMemory = { facts: async () => [], summaries: async () => [] };

async function firstNote(personaId?: string): Promise<string | null> {
  const recall = createMemoryRecall({
    userId: 'u1',
    userName: 'Sam',
    ...(personaId && { personaId }),
    store: noUserMemory,
    ledgerStore,
    lifeUpdates: { store: updateStore, write: async () => [] },
    semantic: false,
  });
  await recall.ready;
  return recall.noteFor('hey, how have you been');
}

describe('recall follows the persona', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("on a Maya call, carries Maya's told life and not Ferni's", async () => {
    const note = await firstNote(MAYA);
    expect(note).toContain('Maya has been planning a trip to Lisbon');
    expect(note).not.toContain("Ferni's neighbor's goat");
  });

  it('leaves a Ferni call unchanged, explicit or by default', async () => {
    for (const note of [await firstNote(CANONICAL_IDS.COACH), await firstNote()]) {
      expect(note).toContain("Ferni's neighbor's goat got out again");
      expect(note).not.toContain('Lisbon');
    }
  });

  it("brings Maya's own updates since last time, never Ferni's", async () => {
    vi.stubEnv('LIFE_MOVES_ON', 'on');
    const maya = await firstNote(MAYA);
    expect(maya).toContain('[SINCE YOU LAST TALKED]\n- You booked the Lisbon flights.');
    expect(maya).not.toContain('fenced');

    const ferni = await firstNote(CANONICAL_IDS.COACH);
    expect(ferni).toContain('- The goat is fenced in now.');
    expect(ferni).not.toContain('Lisbon');
  });

  it('a persona with nothing told gets no told-life note at all', async () => {
    expect(await firstNote(CANONICAL_IDS.PLANNER)).toBeNull();
  });
});

describe('persona display names', () => {
  it('uses the name the persona goes by, not the id prefix', () => {
    expect(personaDisplayName(PETER)).toBe('Peter');
    expect(personaDisplayName(MAYA)).toBe('Maya');
    expect(personaDisplayName(CANONICAL_IDS.COACH)).toBe('Ferni');
    expect(personaDisplayName(CANONICAL_IDS.JOHN_BOGLE)).toBe('John Bogle');
    // An id the registry doesn't know still reads as a name.
    expect(personaDisplayName('zoe-quinn')).toBe('Zoe');
  });

  it('extracts what Peter said about himself under "Peter"', async () => {
    const extract = vi.fn(async () => []);
    const rec = createLedgerRecorder('u1', {
      store: ledgerStore,
      extract,
      env: {},
    });
    rec.add(PETER, 'I spent the weekend restoring an old canoe.');
    await rec.flush();
    expect(extract).toHaveBeenCalledWith('Peter', ['I spent the weekend restoring an old canoe.'], {
      subject: 'he',
      object: 'him',
      possessive: 'his',
    });
  });

  it('writes what happened since in Peter\'s name', async () => {
    const write = vi.fn(async () => ['You finished sanding the canoe.']);
    const told: LedgerFact[] = [
      { personaId: PETER, fact: 'Peter is restoring an old canoe', saidAt: ago(4) },
    ];
    const saved: LifeUpdate[] = [];
    const out = await loadLifeUpdates('u1', told, PETER, {
      env: { LIFE_MOVES_ON: 'on' },
      write,
      store: { save: async (_u, u) => void saved.push(...u), recent: async () => [] },
    });
    expect(write).toHaveBeenCalledWith('Peter', expect.any(Array));
    expect(out).toEqual([expect.objectContaining({ personaId: PETER })]);
    expect(saved[0]?.personaId).toBe(PETER);
  });
});
