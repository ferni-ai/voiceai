/**
 * Persona growth across two calls (PERSONA_GROWTH): call 1 goes through the
 * real after-call writer into a store; call 2 loads that store the way session
 * start does, and its first recall note (the real createMemoryRecall) offers
 * the growth once. Only the database and the model are fakes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRecall } from '../memory-recall-hook.js';
import {
  guardGrowthReading,
  parseGrowthReading,
  recordGrowthAfterCall,
  type GrowthStore,
} from '../../personas/persona-growth-after-call.js';
import { GROWTH_SPACING_MS, growthToOffer } from '../../personas/persona-growth-recall.js';
import {
  clearAllUserGrowth,
  loadPersonaGrowthProfile,
  type PersonaGrowthProfile,
  type PersonaGrowthRecord,
} from '../../../services/trust-systems/persona-growth.js';

const emptyRecall = { facts: async () => [], summaries: async () => [] };
const emptyLedger = { save: async () => undefined, recent: async () => [] };
const HEADER = '[SOMETHING THEY CHANGED IN YOU]';
const QUOTE = 'the way I see it you rest before you are tired not after';

const CALL_1 = [
  { role: 'user', content: 'Long week. I took Thursday afternoon off before it got bad.' },
  { role: 'assistant', content: 'Smart. I usually think rest is what you earn after the push.' },
  { role: 'user', content: 'Honestly, the way I see it you rest before you are tired, not after.' },
  { role: 'assistant', content: "Huh. That flips how I'd put it." },
  { role: 'user', content: 'Yeah, it has saved me a few times.' },
];
const READING = JSON.stringify({
  growth: {
    type: 'learned_from_user',
    topic: 'rest',
    quote: QUOTE,
    after: 'rest is something to take early, before the crash',
  },
});

function memoryStore(): GrowthStore & { saved: () => PersonaGrowthProfile | null } {
  let kept: PersonaGrowthProfile | null = null;
  return {
    load: async () => kept,
    save: async (_u, _p, profile) => {
      kept = JSON.parse(JSON.stringify(profile)) as PersonaGrowthProfile;
    },
    saved: () => kept,
  };
}

/** A new call in a new process: memory is empty until session start loads the store. */
async function callTwo(store: GrowthStore) {
  clearAllUserGrowth('u1');
  const stored = await store.load('u1', 'ferni');
  if (stored) loadPersonaGrowthProfile('u1', 'ferni', stored);
  await new Promise((r) => setTimeout(r, 5)); // call 2 starts after call 1's record
  const recall = createMemoryRecall({
    userId: 'u1',
    userName: 'Sam',
    store: emptyRecall,
    ledgerStore: emptyLedger,
  });
  await recall.ready;
  return recall;
}

beforeEach(() => clearAllUserGrowth('u1'));
afterEach(() => vi.unstubAllEnvs());

describe("persona growth in call 2's first recall note", () => {
  it('offers the growth from call 1 once, in their words, and never again', async () => {
    vi.stubEnv('PERSONA_GROWTH', 'on');
    const store = memoryStore();
    const kept = await recordGrowthAfterCall(
      { userId: 'u1', turns: CALL_1 },
      { store, read: async () => READING }
    );
    expect(kept?.triggerQuote).toBe(QUOTE);
    expect(store.saved()?.growthRecords).toHaveLength(1);

    const recall = await callTwo(store);
    const first = recall.noteFor('hey ferni, it is me again') ?? '';
    expect(first).toContain(HEADER);
    expect(first).toContain(`"${QUOTE}"`);
    expect(first.split(HEADER)).toHaveLength(2); // once in the note
    expect(first).not.toMatch(/celebrat|congrat|!/i); // a friend noticing, not a banner
    recall.newTurn();
    expect(recall.noteFor('anyway, work was a lot again') ?? '').not.toContain(HEADER);

    // Shared means shared: the next recall (a handoff back, or the next call) has none.
    const again = createMemoryRecall({
      userId: 'u1',
      store: emptyRecall,
      ledgerStore: emptyLedger,
    });
    await again.ready;
    expect(again.noteFor('hey again') ?? '').not.toContain(HEADER);
  });

  it('is absent with the flag off, even when a growth is stored and loaded', async () => {
    const store = memoryStore();
    await recordGrowthAfterCall(
      { userId: 'u1', turns: CALL_1 },
      { store, read: async () => READING, env: { PERSONA_GROWTH: 'on' } }
    );
    expect(store.saved()?.growthRecords).toHaveLength(1);
    const recall = await callTwo(store);
    expect(recall.noteFor('hey ferni, it is me again') ?? '').not.toContain(HEADER);
  });

  it('says nothing with the flag on and no growth kept', async () => {
    vi.stubEnv('PERSONA_GROWTH', 'on');
    const recall = await callTwo(memoryStore());
    expect(recall.noteFor('hey ferni, it is me again') ?? '').not.toContain(HEADER);
  });
});

describe('the after-call writer keeps only what the call shows', () => {
  it('drops a quote the caller never said, and never runs with the flag off', async () => {
    vi.stubEnv('PERSONA_GROWTH', 'on');
    const store = memoryStore();
    const invented = READING.replace(QUOTE, 'you should always rest before you are tired out');
    expect(
      await recordGrowthAfterCall(
        { userId: 'u1', turns: CALL_1 },
        { store, read: async () => invented }
      )
    ).toBeNull();
    expect(store.saved()).toBeNull();

    vi.stubEnv('PERSONA_GROWTH', 'off');
    const read = vi.fn(async () => READING);
    expect(
      await recordGrowthAfterCall({ userId: 'u1', turns: CALL_1 }, { store, read })
    ).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("skips another persona's call", async () => {
    vi.stubEnv('PERSONA_GROWTH', 'on');
    const read = vi.fn(async () => READING);
    const kept = await recordGrowthAfterCall(
      { userId: 'u1', personaId: 'maya-santos', turns: CALL_1 },
      { read }
    );
    expect(kept).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it('reads none from a null or malformed reply, or a quote too short to be a view', () => {
    expect(parseGrowthReading('{"growth":null}')).toBeNull();
    expect(parseGrowthReading('not json')).toBeNull();
    expect(
      parseGrowthReading('{"growth":{"type":"party","topic":"x","quote":"y","after":"z"}}')
    ).toBeNull();
    const short = {
      type: 'reconsidered' as const,
      topic: 'rest',
      quote: 'rest before',
      after: 'rest comes early now',
    };
    expect(guardGrowthReading(short, ['rest before tired'])).toBeNull();
  });
});

describe('growthToOffer', () => {
  const now = Date.parse('2026-10-31T12:00:00Z');
  const rec = (over: Partial<PersonaGrowthRecord>): PersonaGrowthRecord => ({
    id: 'g1',
    userId: 'u1',
    personaId: 'ferni',
    growthType: 'learned_from_user',
    topic: 'rest',
    beforeThinking: '',
    afterThinking: 'rest early',
    userContribution: QUOTE,
    triggerQuote: QUOTE,
    createdAt: new Date(now - 86_400_000),
    significance: 'moderate',
    relationshipStage: 'familiar',
    ...over,
  });

  it('waits out the spacing after one was shared, and never offers one without their words', () => {
    const shared = rec({
      id: 'g0',
      topic: 'sleep',
      sharedAt: new Date(now - GROWTH_SPACING_MS / 2),
    });
    expect(growthToOffer([shared, rec({})], ['sleep'], now)).toBeNull();
    expect(growthToOffer([rec({ triggerQuote: undefined })], [], now)).toBeNull();
    expect(growthToOffer([rec({ createdAt: new Date(now + 1) })], [], now)).toBeNull(); // this call's own
    const old = rec({ id: 'g0', topic: 'sleep', sharedAt: new Date(now - 2 * GROWTH_SPACING_MS) });
    expect(growthToOffer([old, rec({})], ['sleep'], now)?.id).toBe('g1');
  });
});
