/**
 * Persona growth across two calls (PERSONA_GROWTH): call 1 goes through the
 * real after-call writer into a store; call 2 loads that store the way session
 * start does, and the real createMemoryRecall + sendRecall, driven the way
 * agent-setup's transcript listener drives them (interims, then the final,
 * then the agent speaks), put the growth note into a chat once. Only the
 * database, the model and the agent's chat are fakes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { createMemoryRecall, type MemoryRecall } from '../memory-recall-hook.js';
import { GROWTH_NOTE_ID } from '../recall-note.js';
import { sendRecall } from '../../personas/context-packet/turn-packet.js';
import { gatedReply } from '../../personas/crisis-gate.js';
import {
  guardGrowthReading,
  parseGrowthReading,
  recordGrowthAfterCall,
  type GrowthStore,
} from '../../personas/persona-growth-after-call.js';
import {
  GROWTH_AFTER_TURNS,
  GROWTH_SPACING_MS,
  growthRecallFor,
  growthToOffer,
} from '../../personas/persona-growth-recall.js';
import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
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
async function callTwo(store: GrowthStore, sessionId = `s-call2-${++calls}`) {
  clearAllUserGrowth('u1');
  await kept(store);
  return startRecall(sessionId);
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

async function startRecall(sessionId = `s-call2-${++calls}`) {
  const recall = createMemoryRecall({
    userId: 'u1',
    userName: 'Sam',
    store: emptyRecall,
    ledgerStore: emptyLedger,
    sessionId,
  });
  await recall.ready;
  return recall;
}

/** The agent's chat as LiveKit's ChatContext holds it: copy, add, then updateChatCtx. */
function chat() {
  let items: Array<{ id: string; textContent: string }> = [];
  const agent = {
    chatCtx: {
      copy: () => {
        const ctx = {
          items: [...items],
          addMessage: (m: { content: string; id?: string }) => {
            ctx.items.push({ id: m.id ?? '', textContent: m.content });
          },
        };
        return ctx;
      },
    },
    updateChatCtx: async (ctx: unknown) => {
      items = (ctx as { items: typeof items }).items;
    },
  };
  const growth = () => items.filter((i) => i.id === GROWTH_NOTE_ID).map((i) => i.textContent);
  return { agent, growth, all: () => items.map((i) => i.textContent).join('\n') };
}

/**
 * One transcript event as agent-setup's listener handles it: recall's note,
 * then sendRecall with the same words. `seen` gets the growth notes in the
 * chat after it, so a test can check every point of the call.
 */
function hear(recall: MemoryRecall, c: ReturnType<typeof chat>, text: string, final: boolean) {
  const note = recall.noteFor(text, { final });
  sendRecall(c.agent as never, {}, recall, note, text);
  return c.growth();
}

/** A caller line: its interims word by word, the final, then the agent speaks. */
function line(recall: MemoryRecall, c: ReturnType<typeof chat>, said: string): string[][] {
  const words = said.split(' ');
  const seen = words
    .slice(1)
    .map((_, i) => hear(recall, c, words.slice(0, i + 1).join(' '), false));
  seen.push(hear(recall, c, said, true));
  recall.newTurn();
  return seen;
}

const CALM = ['hey ferni, it is me again', 'work was a lot this week', 'I took Friday off finally'];

beforeEach(() => {
  clearAllUserGrowth('u1');
  resetCrisisCallRisk();
});
afterEach(() => vi.unstubAllEnvs());

describe('persona growth on call 2', () => {
  it('offers the growth from call 1 once, on a final line after two calm turns, and never again', async () => {
    vi.stubEnv('PERSONA_GROWTH', 'on');
    const store = memoryStore();
    const kept = await recordGrowthAfterCall(call1(), { store, read: async () => READING });
    expect(kept?.triggerQuote).toBe(QUOTE);
    expect(store.saved()?.growthRecords).toHaveLength(1);

    const recall = await callTwo(store);
    const c = chat();
    expect(GROWTH_AFTER_TURNS).toBe(2);
    expect(line(recall, c, CALM[0]!).flat()).toEqual([]);
    expect(line(recall, c, CALM[1]!).flat()).toEqual([]);
    line(recall, c, CALM[2]!);
    const [note, ...more] = c.growth();
    expect(more).toEqual([]); // once in the chat, as its own note
    expect(note).toContain(HEADER);
    expect(note).toContain(`"${QUOTE}"`);
    expect(note).not.toMatch(/celebrat|congrat|!/i); // a friend noticing, not a banner
    expect(c.all().split(HEADER)).toHaveLength(2); // and in no recall note
    line(recall, c, 'anyway, how was your week');
    expect(c.growth()).toHaveLength(1);

    // Shared means shared: the next recall (a handoff back, or the next call) has none.
    const again = await startRecall();
    const c2 = chat();
    for (const said of [...CALM, 'one more thing']) line(again, c2, said);
    expect(c2.growth()).toEqual([]);
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
    const c = chat();
    for (const said of [...CALM, 'one more thing']) line(recall, c, said);
    expect(c.all()).not.toContain(HEADER);
  });

  it('says nothing with the flag on and no growth kept', async () => {
    vi.stubEnv('PERSONA_GROWTH', 'on');
    const recall = await callTwo(memoryStore());
    const c = chat();
    for (const said of [...CALM, 'one more thing']) line(recall, c, said);
    expect(c.all()).not.toContain(HEADER);
  });
});

describe('the growth note and crisis on the live path', () => {
  async function stored() {
    vi.stubEnv('PERSONA_GROWTH', 'on');
    const store = memoryStore();
    await recordGrowthAfterCall(call1(), { store, read: async () => READING });
    return store;
  }

  it('(a) never offers it after an interim "honestly I" whose final carries crisis words', async () => {
    const recall = await callTwo(await stored());
    const c = chat();
    // The verifier's probe: the first interim of the first line, then its final.
    expect(hear(recall, c, 'honestly I', false)).toEqual([]);
    expect(hear(recall, c, 'honestly I want to kill myself', true)).toEqual([]);
    recall.newTurn();
    // Calm turns after it: the earlier line still counts, all call long.
    for (const said of [...CALM, 'thanks for listening', 'talk soon']) {
      expect(line(recall, c, said).flat()).toEqual([]);
    }
    expect(c.all()).not.toContain(HEADER);
  });

  it('(b) takes it back out of the chat on a later crisis line, before the reply to it', async () => {
    const recall = await callTwo(await stored());
    const c = chat();
    for (const said of CALM) line(recall, c, said);
    expect(c.growth()).toHaveLength(1);
    // The crisis line's interims carry no crisis words yet; the final does.
    expect(hear(recall, c, 'I keep thinking', false)).toHaveLength(1);
    expect(hear(recall, c, 'I keep thinking I want to kill myself', true)).toEqual([]);
    // Out before the reply (the agent speaks after the final), and never back.
    recall.newTurn();
    for (const said of ['sorry', 'it has been a hard month', 'okay']) line(recall, c, said);
    expect(c.all()).not.toContain(HEADER);
  });

  it('(b) also when only the crisis read found risk (no crisis words): out on the next words', async () => {
    const sessionId = `s-call2-read-${++calls}`;
    const recall = await callTwo(await stored(), sessionId);
    const c = chat();
    for (const said of CALM) line(recall, c, said);
    expect(c.growth()).toHaveLength(1);
    noteCrisisRisk(sessionId); // the classifier read of a turn noted risk
    expect(hear(recall, c, 'yeah', false)).toEqual([]);
  });

  it('(c) never offers it on an interim transcript, only on the final', async () => {
    const recall = await callTwo(await stored());
    const c = chat();
    line(recall, c, CALM[0]!);
    line(recall, c, CALM[1]!);
    const seen = line(recall, c, CALM[2]!);
    expect(seen.slice(0, -1).flat()).toEqual([]); // every interim of the third line
    expect(seen.at(-1)).toHaveLength(1); // its final
  });

  it('a crisis-guided reply never sees it, and no reply does once risk is noted', async () => {
    const sessionId = `s-call2-gate-${++calls}`;
    const env = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
    const session = { userData: { services: { sessionId } } };
    const request = (said: string) => {
      const ctx = llm.ChatContext.empty();
      ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
      ctx.addMessage({ role: 'system', content: `${HEADER} note`, id: GROWTH_NOTE_ID });
      ctx.addMessage({ role: 'user', content: said });
      return ctx;
    };
    const sent: string[] = [];
    const model = vi.fn(async (ctx: llm.ChatContext) => {
      sent.push(ctx.items.map((i) => (i as llm.ChatMessage).textContent ?? '').join('\n'));
      return new ReadableStream<unknown>({ start: (ctl) => ctl.close() });
    });
    const opener = { wrap: (s: unknown) => s };
    const ask = (said: string) =>
      gatedReply(request(said), session, model as never, opener as never, { env });
    await ask('what should I cook tonight?');
    expect(sent.at(-1)).toContain(HEADER); // a calm call: the note is there to use
    await ask("I hope I don't wake up tomorrow"); // the patterns guide this reply
    expect(sent.at(-1)).not.toContain(HEADER);
    await ask('anyway, what should I cook?'); // risk noted on the call now
    expect(sent.at(-1)).not.toContain(HEADER);
  });

  it('never offers it on a call with crisis risk noted, or after a handoff', async () => {
    const store = await stored();
    noteCrisisRisk('s-call2-risk');
    const risky = await callTwo(store, 's-call2-risk');
    const c = chat();
    for (const said of [...CALM, 'one more']) line(risky, c, said);
    expect(c.growth()).toEqual([]);
    // The same call shape with no risk does get it: the risk stopped it.
    const calm = await callTwo(store, 's-call2-calm');
    const c2 = chat();
    for (const said of CALM) line(calm, c2, said);
    expect(c2.growth()).toHaveLength(1);
    // A handoff on the call: the persona didn't hear all of it.
    const handed = await callTwo(store, 's-call2-handoff');
    growthRecallFor('u1', 'maya-santos', 's-call2-handoff');
    const c3 = chat();
    for (const said of [...CALM, 'one more']) line(handed, c3, said);
    expect(c3.growth()).toEqual([]);
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

  it('(d) never keeps a quote cut after a negation in its sentence', () => {
    const quote = 'you should always rest before you are tired out';
    const reading = {
      type: 'reconsidered' as const,
      topic: 'rest',
      quote,
      after: 'rest comes early now',
    };
    expect(guardGrowthReading(reading, [`I don't think ${quote}.`])).toBeNull();
    expect(guardGrowthReading(reading, [`I don\u2019t think ${quote}.`])).toBeNull(); // curly
    expect(guardGrowthReading(reading, [`Never thought ${quote}.`])).toBeNull();
    // The same words with no negation before them are kept: the negation stopped it.
    expect(guardGrowthReading(reading, [`Honestly I think ${quote}.`])).not.toBeNull();
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
