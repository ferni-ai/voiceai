/**
 * FRIEND_REPAIR across calls: call 1's correction goes through the real
 * recorder into a store, the fact it corrects is retired, and call 2's first
 * recall note (the real memory-recall-hook) carries the correction and never
 * the old fact. Only the database is a fake: one map read by both sides.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMemoryRecall } from '../../multi-agent/memory-recall-hook.js';
import { loadRecallSnapshot, type RecallStore } from '../../../memory/recall/session-recall.js';
import { correctionNote, correctionNotesFor } from '../correction-repair.js';
import {
  factCorrection,
  loadRepairRecall,
  recordFriendRepair,
  repairNote,
  type RepairRecord,
  type RepairStore,
} from '../friend-repair.js';
import { REPAIR_SOURCE, toRecord } from '../friend-repair-store.js';

const ON = { FRIEND_REPAIR: 'on' };
/** Em dash, ellipsis character, or three dots: never in what Ferni is asked to say. */
const NOT_SPOKEN = new RegExp(`[${String.fromCharCode(0x2014, 0x2026)}]|[.]{3}`);
const SISTER = 'So your sister in Denver is getting married, that is huge.';
const SAID = "Ha, no, it's my brother in Denver, not my sister.";
const DUBLIN = 'Dublin has that kind of grit to it, with the river right through the middle.';

/** bogle_users/{uid}: dynamic_facts and corrections, in memory. */
function fakeDb() {
  const facts = new Map<string, Record<string, unknown>>([
    [
      'f1',
      {
        entityName: 'sister',
        key: 'lives_in',
        value: 'Denver',
        confidence: 0.9,
        extractedAt: '2026-10-01T10:00:00Z',
      },
    ],
    [
      'f2',
      {
        entityName: 'sister',
        key: 'name',
        value: 'Anna',
        confidence: 0.9,
        extractedAt: '2026-10-01T10:00:00Z',
      },
    ],
  ]);
  const corrections: Array<RepairRecord & { id: string }> = [];
  const repairs: RepairStore = {
    facts: async () =>
      [...facts].map(([id, d]) => ({
        id,
        entityName: String(d.entityName),
        key: String(d.key),
        value: String(d.value),
        ...(typeof d.supersededAt === 'string' && { supersededAt: d.supersededAt }),
      })),
    add: async (_u, record) => {
      corrections.push({ ...record, id: `c${corrections.length + 1}` });
      return `c${corrections.length}`;
    },
    retire: async (_u, ids, by, at) => {
      for (const id of ids) {
        Object.assign(facts.get(id) ?? {}, { supersededAt: at, supersededBy: by, correctedAt: at });
      }
    },
    recent: async () => [...corrections].reverse(),
  };
  const recall: RecallStore = { facts: async () => [...facts.values()], summaries: async () => [] };
  return { facts, corrections, repairs, recall };
}

const emptyLedger = { save: async () => undefined, recent: async () => [] };

afterEach(() => vi.unstubAllEnvs());

describe('factCorrection', () => {
  it.each([
    [SAID, SISTER, { right: 'my brother in Denver', wrong: 'my sister' }],
    ['Galway, not Dublin.', DUBLIN, { right: 'Galway', wrong: 'Dublin' }],
    ['No, not my sister, my brother.', SISTER, { right: 'my brother', wrong: 'my sister' }],
  ])('takes "%s" as correcting a fact', (said, ferni, expected) => {
    expect(factCorrection(said, [ferni])).toEqual(expected);
  });

  it.each([
    ['No, not my sister, my brother.', 'Is your sister the one in Denver?'], // answering a question
    ['No, not really.', SISTER],
    ["That's not what I said.", SISTER], // a mishear of wording, no fact in it
    ["No, it's two.", 'Yeah, five am on a Sunday.'], // a time now, not a fact about them
    ['My boss is the problem, not my sister.', 'Work sounds tough.'], // he never said sister
  ])('does not take "%s" as a fact correction', (said, ferni) => {
    expect(factCorrection(said, [ferni])).toBeNull();
  });
});

describe('FRIEND_REPAIR, call 1 to call 2', () => {
  it('keeps the correction with provenance and retires only the fact it corrects', async () => {
    const db = fakeDb();
    const now = new Date('2026-10-12T20:00:00Z');
    const id = await recordFriendRepair(
      { userId: 'u1', said: SAID, ferni: ['Hey, good to hear you.', SISTER], callId: 'call-1' },
      db.repairs,
      ON,
      now
    );
    expect(id).toBe('c1');
    expect(db.corrections).toEqual([
      {
        id: 'c1',
        right: 'my brother in Denver',
        wrong: 'my sister',
        said: SAID,
        ferniSaid: SISTER,
        callId: 'call-1',
        at: now.toISOString(),
        supersededFactIds: ['f1'],
      },
    ]);
    // Kept for audit, not deleted; the sister's name was never wrong.
    expect(db.facts.get('f1')).toMatchObject({
      value: 'Denver',
      supersededBy: 'c1',
      correctedAt: now.toISOString(),
    });
    expect(db.facts.get('f2')).not.toHaveProperty('supersededAt');
  });

  it('call 2: the first note carries the correction, recall never the old fact', async () => {
    const db = fakeDb();
    await recordFriendRepair(
      { userId: 'u1', said: SAID, ferni: [SISTER] },
      db.repairs,
      ON,
      new Date(Date.now() - 2 * 86_400_000)
    );
    vi.stubEnv('FRIEND_REPAIR', 'on');

    const snapshot = await loadRecallSnapshot(db.recall, 'u1');
    expect(snapshot.facts.map((f) => f.value)).toEqual(['Anna']);

    const recall = createMemoryRecall({
      userId: 'u1',
      userName: 'Sam',
      store: db.recall,
      ledgerStore: emptyLedger,
      repairStore: db.repairs,
    });
    await recall.ready;
    const first = recall.noteFor('my sister in denver is doing great') ?? '';
    expect(first).toContain('[THEY CORRECTED YOU BEFORE]');
    expect(first).toContain(
      '2 days ago: my brother in Denver, not my sister. Go by my brother in Denver.'
    );
    expect(first).not.toMatch(/sister: lives in = Denver/i);
    recall.newTurn();
    expect(recall.noteFor('anyway, work was rough') ?? '').not.toContain('CORRECTED YOU');
  });

  it('flag off: nothing is kept, nothing retired, and no note', async () => {
    const db = fakeDb();
    const add = vi.spyOn(db.repairs, 'add');
    expect(
      await recordFriendRepair({ userId: 'u1', said: SAID, ferni: [SISTER] }, db.repairs, {})
    ).toBeNull();
    expect(add).not.toHaveBeenCalled();
    expect(db.facts.get('f1')).not.toHaveProperty('supersededAt');

    await recordFriendRepair({ userId: 'u1', said: SAID, ferni: [SISTER] }, db.repairs, ON);
    const recent = vi.spyOn(db.repairs, 'recent');
    const recall = createMemoryRecall({
      userId: 'u1',
      store: db.recall,
      ledgerStore: emptyLedger,
      repairStore: db.repairs,
    });
    await recall.ready;
    expect(recall.noteFor('my sister in denver') ?? '').not.toContain('CORRECTED YOU');
    expect(recent).not.toHaveBeenCalled();
  });

  it('a "No, ..." answer to a question keeps nothing', async () => {
    const db = fakeDb();
    const said = 'No, not my sister, my brother.';
    expect(
      await recordFriendRepair(
        { userId: 'u1', said, ferni: ['Is your sister the one in Denver?'] },
        db.repairs,
        ON
      )
    ).toBeNull();
    expect(db.corrections).toHaveLength(0);
    expect(db.facts.get('f1')).not.toHaveProperty('supersededAt');
  });
});

describe('repairNote', () => {
  const at = (daysAgo: number) =>
    new Date(Date.parse('2026-10-18T12:00:00Z') - daysAgo * 86_400_000).toISOString();
  const rec = (wrong: string, daysAgo: number): RepairRecord => ({
    right: `not-${wrong}`,
    wrong,
    said: '',
    ferniSaid: '',
    at: at(daysAgo),
    supersededFactIds: [],
  });
  const now = Date.parse('2026-10-18T12:00:00Z');

  it('carries the newest three from the last 30 days, one per miss', () => {
    const note =
      repairNote(
        [rec('a', 1), rec('b', 3), rec('a', 5), rec('c', 10), rec('d', 20), rec('e', 31)],
        now
      ) ?? '';
    expect(note.split('\n').filter((l) => l.startsWith('- '))).toEqual([
      '- yesterday: not-a, not a. Go by not-a.',
      '- 3 days ago: not-b, not b. Go by not-b.',
      '- 10 days ago: not-c, not c. Go by not-c.',
    ]);
  });

  it('is null when every correction is older than a month', () => {
    expect(repairNote([rec('e', 31)], now)).toBeNull();
  });

  it('is plain text a voice can follow: no em dashes or ellipses', () => {
    const note = repairNote([rec('a', 1)], now) ?? '';
    expect(note).not.toMatch(NOT_SPOKEN);
  });

  it('a store that fails leaves the note out, logged, never thrown', async () => {
    const recall = loadRepairRecall(
      'u1',
      { recent: async () => Promise.reject(new Error('down')) },
      ON
    );
    await expect(recall.ready).resolves.toBeUndefined();
    expect(recall.note()).toBeNull();
  });
});

describe('owning the miss (REPAIR_MODE line)', () => {
  const call = (...turns: Array<['user' | 'assistant', string]>) => {
    const ctx = llm.ChatContext.empty();
    for (const [role, content] of turns) ctx.addMessage({ role, content });
    return ctx;
  };
  const turns = call(['assistant', SISTER], ['user', SAID]);

  it('with FRIEND_REPAIR on it names what he had wrong, light only if they are', () => {
    const note = correctionNotesFor(turns, {}, { REPAIR_MODE: 'on', FRIEND_REPAIR: 'on' });
    expect(note).toContain('names what you had wrong, light if they are');
    expect(note).not.toMatch(NOT_SPOKEN);
  });

  it('with it off the line is unchanged', () => {
    const note = correctionNotesFor(turns, {}, { REPAIR_MODE: 'on' });
    expect(note).toBe(correctionNote(SAID));
    expect(note).toContain(
      'the way a friend would ("Ah, my mistake."), then go on with what they said.'
    );
  });
});

describe('stored corrections (friend-repair-store.ts)', () => {
  const doc = {
    whatFerniSaid: SISTER,
    whatUserCorrected: SAID,
    correctInformation: 'my brother in Denver',
    category: 'fact',
    timestamp: '2026-10-12T20:00:00.000Z',
    source: REPAIR_SOURCE,
    wrong: 'my sister',
    callId: 'call-1',
    supersededFactIds: ['f1'],
  };

  it('reads back a kept correction with its provenance', () => {
    expect(toRecord(doc)).toEqual({
      right: 'my brother in Denver',
      wrong: 'my sister',
      said: SAID,
      ferniSaid: SISTER,
      callId: 'call-1',
      at: '2026-10-12T20:00:00.000Z',
      supersededFactIds: ['f1'],
    });
  });

  it("skips the loose detector's corrections and incomplete ones", () => {
    expect(toRecord({ ...doc, source: undefined })).toBeNull();
    expect(toRecord({ ...doc, wrong: '' })).toBeNull();
  });
});
