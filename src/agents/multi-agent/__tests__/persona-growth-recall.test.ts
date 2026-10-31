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
import {
  GROWTH_SPACING_MS,
  growthRecallFor,
  growthToOffer,
} from '../../personas/persona-growth-recall.js';
import { noteCrisisRisk } from '../../../services/safety/crisis-call-risk.js';
import { bindSessionUser, noteCallerWords, resetMinorCare } from '../../../utils/minor-care.js';
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

let calls = 0;
/** Call 1 as the after-call task sees it; its personas noted the way each persona's recall does. */
function call1(personas: string[] = ['ferni'], turns = CALL_1, userId = 'u1') {
  const sessionId = `s-call1-${++calls}`;
  for (const p of personas) growthRecallFor(userId, p, sessionId);
  return { userId, sessionId, turns };
}

/** A new call in a new process: memory is empty until session start loads the store. */
async function callTwo(store: GrowthStore) {
  clearAllUserGrowth('u1');
  await kept(store);
  return startRecall();
}

/** Session start: load what call 1 kept into memory. */
async function kept(store: GrowthStore) {
  clearAllUserGrowth('u1');
  const stored = await store.load('u1', 'ferni');
  if (stored) loadPersonaGrowthProfile('u1', 'ferni', stored);
  await new Promise<void>((r) => {
    setTimeout(r, 5); // call 2 starts after call 1's record
  });
}

async function startRecall() {
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
    const kept = await recordGrowthAfterCall(call1(), { store, read: async () => READING });
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
    await recordGrowthAfterCall(call1(), {
      store,
      read: async () => READING,
      env: { PERSONA_GROWTH: 'on' },
    });
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
    expect(await recordGrowthAfterCall(call1(), { store, read: async () => invented })).toBeNull();
    expect(store.saved()).toBeNull();

    vi.stubEnv('PERSONA_GROWTH', 'off');
    const read = vi.fn(async () => READING);
    expect(await recordGrowthAfterCall(call1(), { store, read })).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("skips another persona's call", async () => {
    vi.stubEnv('PERSONA_GROWTH', 'on');
    const read = vi.fn(async () => READING);
    const kept = await recordGrowthAfterCall({ ...call1(), personaId: 'maya-santos' }, { read });
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

describe('crisis, identity, persona and quote gates', () => {
  it('stores nothing from a call that gave a crisis line or noted risk, before any model read', async () => {
    vi.stubEnv('PERSONA_GROWTH', 'on');
    const store = memoryStore();
    const read = vi.fn(async () => READING);
    const line988 = [
      ...CALL_1,
      { role: 'assistant', content: 'If it gets heavy, you can call or text 988.' },
    ];
    expect(await recordGrowthAfterCall(call1(['ferni'], line988), { store, read })).toBeNull();
    const risk = { store, read, crisisRisk: () => true };
    expect(await recordGrowthAfterCall(call1(), risk)).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(store.saved()).toBeNull();
    // The same call without the signal is kept: the gate, not the call, stopped it.
    expect(
      await recordGrowthAfterCall(call1(), { store, read, crisisRisk: () => false })
    ).not.toBeNull();
  });

  it('never offers the note on a call with a crisis signal', async () => {
    vi.stubEnv('PERSONA_GROWTH', 'on');
    const store = memoryStore();
    await recordGrowthAfterCall(call1(), { store, read: async () => READING });
    // Crisis words in the turn: nothing, and nothing later on the same call either.
    const recall = await callTwo(store);
    expect(recall.noteFor('honestly I want to kill myself') ?? '').not.toContain(HEADER);
    recall.newTurn();
    expect(recall.noteFor('anyway, work was a lot') ?? '').not.toContain(HEADER);
    // Risk the crisis read noted on this call (the hook passes the call's session id).
    noteCrisisRisk('s-call2-risk');
    expect(growthRecallFor('u1', 'ferni', 's-call2-risk').note('hey ferni')).toBeNull();
    expect(growthRecallFor('u1', 'ferni', 's-call2-calm').note('hey ferni')).toContain(HEADER);
  });

  it('never stores a quote under a placeholder or shared id', async () => {
    vi.stubEnv('PERSONA_GROWTH', 'on');
    const read = vi.fn(async () => READING);
    for (const id of ['anonymous', 'unknown', 'default', 'shared', '']) {
      expect(
        await recordGrowthAfterCall(call1(['ferni'], CALL_1, id), { store: memoryStore(), read })
      ).toBeNull();
    }
    expect(read).not.toHaveBeenCalled();
  });

  it('never stores a quote for a held caller (MINOR_CARE)', async () => {
    vi.stubEnv('PERSONA_GROWTH', 'on');
    vi.stubEnv('MINOR_CARE', 'on');
    resetMinorCare();
    bindSessionUser('earlier-call', 'u1');
    noteCallerWords('earlier-call', "I'm 15.");
    const read = vi.fn(async () => READING);
    expect(await recordGrowthAfterCall(call1(), { store: memoryStore(), read })).toBeNull();
    expect(read).not.toHaveBeenCalled();
    resetMinorCare(); // the same call, not held, is kept: the hold stopped it
    expect(await recordGrowthAfterCall(call1(), { store: memoryStore(), read })).not.toBeNull();
  });

  it("skips a call with a handoff, or one whose persona is unknown, instead of calling it Ferni's", async () => {
    vi.stubEnv('PERSONA_GROWTH', 'on');
    const read = vi.fn(async () => READING);
    expect(await recordGrowthAfterCall(call1(['ferni', 'maya-santos']), { read })).toBeNull();
    expect(await recordGrowthAfterCall(call1([]), { read })).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it('keeps a quote only when it ends a sentence of their line', () => {
    const reading = {
      type: 'learned_from_user' as const,
      topic: 'rest',
      quote: QUOTE,
      after: 'rest is taken early now',
    };
    const line = 'Honestly, the way I see it you rest before you are tired, not after. It works.';
    expect(guardGrowthReading(reading, [line])).not.toBeNull();
    // Cut before ", not after": the words are theirs, the meaning isn't.
    const cut = { ...reading, quote: 'the way I see it you rest before you are tired' };
    expect(guardGrowthReading(cut, [line])).toBeNull();
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
