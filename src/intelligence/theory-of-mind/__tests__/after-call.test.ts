import { describe, expect, it, vi } from 'vitest';
import { theoryOfMindMode, updateTheoryOfMindAfterCall } from '../after-call.js';
import { createMindNote, MAX_NOTE_CHARS, renderMindNote } from '../note.js';
import { memoryMindStore } from '../store.js';
import { emptyMindModel } from '../types.js';
import { CALL_1, DAY, READING_1, T0 } from './fixtures.js';

const ON = { THEORY_OF_MIND: 'on' };
const replying = (...replies: string[]) =>
  vi.fn(async (_prompt: string) => replies.shift() ?? '{}');

describe('theory of mind: after-call writer', () => {
  it('is off unless THEORY_OF_MIND=on, and then reads and stores nothing', async () => {
    expect(theoryOfMindMode({})).toBe(false);
    expect(theoryOfMindMode({ THEORY_OF_MIND: 'true' })).toBe(false);
    expect(theoryOfMindMode(ON)).toBe(true);
    const store = memoryMindStore();
    const llm = replying(READING_1);
    const out = await updateTheoryOfMindAfterCall(
      { userId: 'u1', sessionId: 's1', turns: CALL_1, summary: null },
      { store, llm, env: {} }
    );
    expect(out).toBeNull();
    expect(llm).not.toHaveBeenCalled();
    expect(store.models.size).toBe(0);
  });

  it('stores the reading of the call, and never the transcript itself', async () => {
    const store = memoryMindStore();
    expect(await store.load('u1')).toBeNull();
    const llm = replying(READING_1);
    await updateTheoryOfMindAfterCall(
      {
        userId: 'u1',
        sessionId: 's1',
        turns: CALL_1,
        summary: { keyPoints: ['Stripe interview'] },
      },
      { store, llm, env: ON, now: () => T0 }
    );
    expect(llm.mock.calls[0]?.[0]).toContain('Summary: Stripe interview');
    const model = await store.load('u1');
    expect(model?.calls).toBe(1);
    expect(model?.patterns.find((p) => p.key === 'jokes-when-anxious')?.moments).toHaveLength(2);
    const stored = JSON.stringify(store.models.get('u1'));
    expect(stored).not.toContain('fake my own death');
    expect(stored).not.toContain('sympathy thing');
  });

  it('skips a call with too little of the caller, and never throws when the model or store fails', async () => {
    const store = memoryMindStore();
    const llm = replying(READING_1);
    const input = { userId: 'u1', sessionId: 's1', turns: CALL_1, summary: null };
    expect(
      await updateTheoryOfMindAfterCall(
        { ...input, turns: CALL_1.slice(0, 2) },
        { store, llm, env: ON }
      )
    ).toBeNull();
    expect(llm).not.toHaveBeenCalled();

    const down = { load: async () => null, save: async () => Promise.reject(new Error('down')) };
    await expect(
      updateTheoryOfMindAfterCall(input, { store: down, llm: replying(READING_1), env: ON })
    ).resolves.toBeNull();
    await expect(
      updateTheoryOfMindAfterCall(input, { store, llm: async () => 'not json', env: ON })
    ).resolves.toBeNull();
    expect(store.models.size).toBe(0);
  });
});

describe('theory of mind: the note', () => {
  it('says what not to re-ask and which patterns to respect, within ~100 tokens', async () => {
    const store = memoryMindStore();
    await updateTheoryOfMindAfterCall(
      { userId: 'u1', sessionId: 's1', turns: CALL_1, summary: null },
      { store, llm: replying(READING_1), env: ON, now: () => T0 }
    );
    const model = (await store.load('u1'))!;
    const note = renderMindNote(model, new Date(T0.getTime() + DAY))!.note;
    expect(note).toContain('They tend to: jokes when anxious, then wants practical help.');
    expect(note).toContain('Already told you: Stripe interview on Monday');
    expect(note).toContain('Lately: anxious about the Stripe interview.');
    expect(note).toMatch(/never name them/);
    // A one-moment hunch is not acted on.
    expect(note).not.toContain('wants solutions, not sympathy');
    expect(note.length).toBeLessThanOrEqual(MAX_NOTE_CHARS);
  });

  it('drops a pattern once a later call contradicts it, and a mood once it expires', async () => {
    const store = memoryMindStore();
    const call = (sessionId: string, reply: string, at: Date) =>
      updateTheoryOfMindAfterCall(
        { userId: 'u1', sessionId, turns: CALL_1, summary: null },
        { store, llm: replying(reply), env: ON, now: () => at }
      );
    await call('s1', READING_1, T0);
    const later = new Date(T0.getTime() + 8 * DAY);
    await call('s2', JSON.stringify({ contradicted: ['jokes-when-anxious'] }), later);
    const note = renderMindNote((await store.load('u1'))!, later)!.note;
    expect(note).not.toContain('jokes when anxious');
    expect(note).not.toContain('Lately');
    expect(note).toContain('Already told you');
  });

  it('leaves out a mood that expired since the last call', () => {
    const model = emptyMindModel('u1', T0);
    const until = new Date(T0.getTime() + 5 * DAY).toISOString();
    model.current = { state: 'anxious about the Stripe interview', at: T0.toISOString(), until };
    expect(renderMindNote(model, new Date(T0.getTime() + DAY))?.note).toContain('Lately');
    expect(renderMindNote(model, new Date(T0.getTime() + 8 * DAY))).toBeNull();
  });

  it('keeps the most important lines when the budget is tight', () => {
    const model = emptyMindModel('u1', T0);
    model.sensitivities.push({
      topic: 'their ex',
      how: "doesn't want to talk about it",
      at: T0.toISOString(),
    });
    for (let i = 0; i < 30; i++)
      model.toldFerni.push({ topic: `a long story about thing number ${i}`, at: T0.toISOString() });
    const r = renderMindNote(model, T0)!;
    expect(r.note.length).toBeLessThanOrEqual(MAX_NOTE_CHARS);
    expect(r.note).toContain('Go gently around: their ex');
    expect(r.told.length).toBeGreaterThan(0);
    expect(r.told.length).toBeLessThan(30);
    expect(renderMindNote(emptyMindModel('u1', T0), T0)).toBeNull();
  });

  it('reminds once, later in the call, about a told topic the note left out', async () => {
    const store = memoryMindStore();
    const model = emptyMindModel('u1', T0);
    for (let i = 0; i < 30; i++)
      model.toldFerni.push({ topic: `story number ${i}`, at: T0.toISOString() });
    model.toldFerni.push({ topic: "their sister Priya's wedding in Lisbon", at: T0.toISOString() });
    await store.save(model);
    const mind = createMindNote({ userId: 'u1', store, now: () => T0 });
    await mind.ready;
    expect(mind.noteFor('hey')).toContain('Already told you');
    const reminder = mind.noteFor('so the wedding is next week');
    expect(reminder).toContain("their sister Priya's wedding in Lisbon");
    mind.newTurn();
    expect(mind.noteFor('the wedding, ugh')).toBeNull(); // once per topic

    const fresh = createMindNote({ userId: 'u1', store, now: () => T0 });
    await fresh.ready;
    fresh.noteFor('hey');
    expect(fresh.noteFor('weddings are a lot')).toBeNull(); // whole words only
    expect(fresh.noteFor('anyway, the wedding')).toContain('Priya');
  });
});
