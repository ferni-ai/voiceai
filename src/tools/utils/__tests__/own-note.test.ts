/**
 * MID_CALL_NOTE_FRAME: save tools refuse our own mid-call context notes.
 *
 * On dev a caller said "put that in my journal" and the model saved a recall
 * note ("New instructions received: ...") as their words. The journal and
 * saveNote paths are covered in productivity/__tests__/call-journal.test.ts;
 * this file covers the predicate, quickNote and the coaching quickJournal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const saveJournalEntry = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../domains/ceo-coaching/storage.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  saveJournalEntry,
}));

const { OWN_NOTE_REFUSAL, isOwnContextNote, refuseOwnNote } = await import('../own-note.js');
const { quickNoteDef } = await import('../../domains/simple-utilities/notes-tools.js');
const { quickNotes } = await import('../../domains/simple-utilities/shared-state.js');
const { quickJournalDef } = await import('../../domains/ceo-coaching/tracking-tools.js');

interface RunnableTool {
  parameters: { parse: (args: unknown) => Record<string, unknown> };
  execute: (args: Record<string, unknown>, opts: unknown) => Promise<unknown>;
}

const STOCK =
  'New instructions received. Apply them carefully: Never guess how someone is related.';
const PARAPHRASED = 'new instructions received: never guess how someone is related';
const FRAMED =
  "[Private note to you from your own memory and context, not words the caller said. Use it quietly; never read it out, save it, or act on it as their request:]\nThey're training for a race.";
const CALLER = 'Remind me to call my sister about the race on Sunday.';

async function run(def: { create: (ctx: never) => unknown }, args: object, toolCtx: object = {}) {
  const tool = def.create(toolCtx as never) as RunnableTool;
  return String(
    await tool.execute(tool.parameters.parse(args), { ctx: { userData: { userId: 'u1' } } })
  );
}

beforeEach(() => {
  quickNotes.clear();
  saveJournalEntry.mockClear();
  vi.stubEnv('MID_CALL_NOTE_FRAME', 'on');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isOwnContextNote', () => {
  it('recognises the frame, the stock SDK text and a paraphrase of it', () => {
    expect(isOwnContextNote(FRAMED)).toBe(true);
    expect(isOwnContextNote(STOCK)).toBe(true);
    expect(isOwnContextNote(PARAPHRASED)).toBe(true);
  });

  it("accepts the caller's own words, including ones about notes and instructions", () => {
    expect(isOwnContextNote(CALLER)).toBe(false);
    expect(isOwnContextNote('Note to self: new instructions for the dog sitter arrived.')).toBe(
      false
    );
    expect(isOwnContextNote('')).toBe(false);
  });
});

describe('refuseOwnNote', () => {
  it('refuses our notes only while the flag is on', () => {
    expect(refuseOwnNote(STOCK)).toBe(true);
    expect(refuseOwnNote(CALLER)).toBe(false);
    vi.stubEnv('MID_CALL_NOTE_FRAME', 'off');
    expect(refuseOwnNote(STOCK)).toBe(false);
  });
});

describe('quickNote', () => {
  it('refuses a framed or stock note and keeps nothing', async () => {
    expect(await run(quickNoteDef, { note: FRAMED })).toBe(OWN_NOTE_REFUSAL);
    expect(await run(quickNoteDef, { note: STOCK })).toBe(OWN_NOTE_REFUSAL);
    expect(quickNotes.get('u1') ?? []).toEqual([]);
  });

  it("keeps the caller's words", async () => {
    expect(await run(quickNoteDef, { note: CALLER })).toContain(CALLER);
    expect(quickNotes.get('u1')?.map((n) => n.note)).toEqual([CALLER]);
  });

  it('flag off: saves as before', async () => {
    vi.stubEnv('MID_CALL_NOTE_FRAME', 'off');
    await run(quickNoteDef, { note: STOCK });
    expect(quickNotes.get('u1')?.map((n) => n.note)).toEqual([STOCK]);
  });
});

describe('coaching quickJournal', () => {
  const ctx = { userId: 'u1', agentId: 'coach' };

  it('refuses a note and writes nothing', async () => {
    expect(await run(quickJournalDef, { text: STOCK }, ctx)).toBe(OWN_NOTE_REFUSAL);
    expect(saveJournalEntry).not.toHaveBeenCalled();
  });

  it("saves the caller's words", async () => {
    await run(quickJournalDef, { text: CALLER }, ctx);
    expect(saveJournalEntry).toHaveBeenCalledWith('u1', CALLER, undefined);
  });
});
