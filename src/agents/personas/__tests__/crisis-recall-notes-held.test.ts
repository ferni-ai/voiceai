/**
 * CRISIS_NO_MEMORY_RECALL and recall's own notes: with the flag on, no recall note is built for
 * a crisis line, and a recall note already in the chat (from an earlier ordinary turn) never
 * reaches a crisis-guided reply or any reply on a call with risk noted. Off, nothing changes.
 * The real recall hook, the real sendRecall, a real chat context and the real gatedReply; the
 * fact store, the models and the network are fakes. Invented caller: Sam, whose dog is Biscuit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { llm, voice } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { createMemoryRecall, type MemoryRecall } from '../../multi-agent/memory-recall-hook.js';
import type { RecallAgent } from '../../multi-agent/memory-recall-hook.js';
import { attachMindNote } from '../../multi-agent/mind-note-hook.js';
import { updateTheoryOfMindAfterCall } from '../../../intelligence/theory-of-mind/after-call.js';
import { memoryMindStore } from '../../../intelligence/theory-of-mind/store.js';
import { CALL_1, READING_1, T0 } from '../../../intelligence/theory-of-mind/__tests__/fixtures.js';
import { RECALL_NOTE_ID_PREFIX } from '../../multi-agent/turn-context-header.js';
import { sendRecall } from '../context-packet/turn-packet.js';
import { gatedReply } from '../crisis-gate.js';
import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import { resetCrisisClassifierCache } from '../../../services/safety/crisis-classifier.js';

const BISCUIT = 'Biscuit';
const CALM = 'how is Biscuit doing these days?';
const LATER_CALM = 'anyway, what should I cook tonight?';
/** Crisis words the patterns read, with no fact words in them. */
const CRISIS = "I hope I don't wake up tomorrow";
/** The same crisis words with a fact's entity in them: what recall would pick up. */
const CRISIS_WITH_FACT = "I hope I don't wake up tomorrow, and nobody would look after Biscuit";

const FLAG = 'CRISIS_NO_MEMORY_RECALL';
const GATE_ENV = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };

let calls = 0;
const newCall = (): string => `s-recall-held-${++calls}`;

beforeEach(() => {
  resetCrisisCallRisk();
  resetCrisisClassifierCache();
  vi.stubGlobal('fetch', async () => {
    throw new Error('no network in this test');
  });
  vi.spyOn(Math, 'random').mockReturnValue(0.42); // the turn reminder's style picks
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function startRecall(sessionId: string): Promise<MemoryRecall> {
  const recall = createMemoryRecall({
    userId: 'u-recall-held',
    userName: 'Sam',
    sessionId,
    store: {
      facts: async () => [{ entityName: BISCUIT, key: 'breed', value: 'golden retriever' }],
      summaries: async () => [],
    },
    ledgerStore: { save: async () => undefined, recent: async () => [] },
    lifeUpdates: { env: {} },
    checkIns: async () => [],
    semantic: false,
    people: false,
    opener: false,
    bridge: false,
    episodes: false,
    summaries: false,
  });
  await recall.ready;
  return recall;
}

/** The agent's chat: a real ChatContext, replaced by updateChatCtx as LiveKit does. */
function chat() {
  const agent = {
    chatCtx: llm.ChatContext.empty(),
    updateChatCtx: async (ctx: unknown) => {
      agent.chatCtx = ctx as llm.ChatContext;
    },
  };
  const recallItems = () =>
    agent.chatCtx.items.filter((i) => i.id.startsWith(RECALL_NOTE_ID_PREFIX)) as llm.ChatMessage[];
  return { agent, recallItems };
}

/** A final transcript as agent-setup's listener handles it. Returns what the hook offered. */
function hear(recall: MemoryRecall, c: ReturnType<typeof chat>, said: string): string | null {
  const note = recall.noteFor(said, { final: true });
  sendRecall(c.agent as never, {}, recall, note, said);
  recall.newTurn();
  return note;
}

/** Ask the real gate about `said` over the chat as it stands; the text of every request it sent. */
async function ask(c: { agent: { chatCtx: llm.ChatContext } }, sessionId: string, said: string, env: object) {
  const request = c.agent.chatCtx.copy();
  request.addMessage({ role: 'user', content: said });
  const sent: string[] = [];
  const model = async (ctx: llm.ChatContext) => {
    sent.push(ctx.items.map((i) => (i as llm.ChatMessage).textContent ?? '').join('\n'));
    return new ReadableStream<unknown>({
      start(controller) {
        controller.enqueue('Sounds good.');
        controller.close();
      },
    });
  };
  const session = { userData: { services: { sessionId } } };
  const opener = { wrap: (s: unknown) => s } as never;
  const reply = await gatedReply(request, session, model as never, opener, {
    env: env as never,
  });
  if (reply) for await (const chunk of reply as unknown as AsyncIterable<unknown>) void chunk;
  return sent;
}

const flagEnv = (on: boolean) => (on ? { ...GATE_ENV, [FLAG]: 'on' } : GATE_ENV);

describe.each([true, false])('recall notes, %s = CRISIS_NO_MEMORY_RECALL on', (on) => {
  beforeEach(() => {
    if (on) vi.stubEnv(FLAG, 'on');
    else vi.stubEnv(FLAG, '');
  });

  it(`${on ? 'takes' : 'does not take'} an earlier turn's recall note out of a crisis-guided reply`, async () => {
    const call = newCall();
    const c = chat();
    const recall = await startRecall(call);
    expect(hear(recall, c, CALM)).toContain(BISCUIT);
    expect(c.recallItems().some((i) => i.textContent?.includes(BISCUIT))).toBe(true);

    const sent = await ask(c, call, CRISIS, flagEnv(on));
    expect(sent.length).toBeGreaterThan(0);
    for (const text of sent) expect(text.includes(BISCUIT)).toBe(!on);
  });

  it(`${on ? 'builds' : 'still builds'} ${on ? 'no' : 'a'} recall note for a crisis line that touches a fact`, async () => {
    const c = chat();
    const note = hear(await startRecall(newCall()), c, CRISIS_WITH_FACT);
    if (on) {
      expect(note).toBeNull();
      expect(c.recallItems()).toEqual([]);
    } else {
      expect(note).toContain(BISCUIT);
      expect(c.recallItems()).toHaveLength(1);
    }
  });
});

describe('with the flag on', () => {
  beforeEach(() => vi.stubEnv(FLAG, 'on'));

  it('a normal line still gets its recall note, and a calm reply still sees it', async () => {
    const call = newCall();
    const c = chat();
    expect(hear(await startRecall(call), c, CALM)).toContain(BISCUIT);
    expect(c.recallItems()).toHaveLength(1);
    const sent = await ask(c, call, LATER_CALM, flagEnv(true));
    expect(sent.at(-1)).toContain(BISCUIT);
  });

  it('a call with no risk noted keeps its notes across turns', async () => {
    const call = newCall();
    const c = chat();
    const recall = await startRecall(call);
    hear(recall, c, CALM);
    hear(recall, c, LATER_CALM);
    const sent = await ask(c, call, 'and then what?', flagEnv(true));
    expect(sent.at(-1)).toContain(BISCUIT);
  });

  it('a call with risk noted gets no new note and its earlier notes stay out of every reply', async () => {
    const call = newCall();
    const c = chat();
    const recall = await startRecall(call);
    hear(recall, c, CALM);
    noteCrisisRisk(call);
    expect(hear(recall, c, 'tell me about Biscuit again')).toBeNull();
    const sent = await ask(c, call, LATER_CALM, flagEnv(true));
    expect(sent.length).toBeGreaterThan(0);
    for (const text of sent) expect(text).not.toContain(BISCUIT);
  });
});

describe('flag off is main', () => {
  /** The chat's recall items, as ids and texts, and whether any carries an `extra`. */
  async function run(on: boolean) {
    vi.stubEnv(FLAG, on ? 'on' : '');
    const call = newCall();
    const c = chat();
    const recall = await startRecall(call);
    hear(recall, c, CALM);
    const items = c.recallItems();
    const sent = await ask(c, call, LATER_CALM, flagEnv(on));
    return {
      ids: items.map((i) => i.id.replace(/\d+$/, 'N')),
      texts: items.map((i) => i.textContent),
      extras: items.map((i) => i.extra),
      sent,
    };
  }

  it('adds the same notes, unmarked, and sends the same request on an ordinary turn', async () => {
    const off = await run(false);
    const on = await run(true);
    expect(off.texts.length).toBeGreaterThan(0);
    expect(off.extras.every((e) => !e || Object.keys(e).length === 0)).toBe(true);
    expect(on.ids).toEqual(off.ids);
    expect(on.texts).toEqual(off.texts);
    expect(on.sent).toEqual(off.sent);
  });
});

describe.each([true, false])('the mind note, %s = CRISIS_NO_MEMORY_RECALL on', (on) => {
  /** An agent that has heard its first words on a call after one the mind model learned from. */
  async function afterFirstWords() {
    const store = memoryMindStore();
    await updateTheoryOfMindAfterCall(
      { userId: 'u1', sessionId: 'call-1', turns: CALL_1, summary: null },
      { store, llm: async () => READING_1, env: { THEORY_OF_MIND: 'on' }, now: () => T0 }
    );
    const session = new EventEmitter();
    const agent = new voice.Agent({ instructions: 'You are Ferni.' });
    const mind = attachMindNote(session, agent as unknown as RecallAgent, {
      userId: 'u1',
      store,
      now: () => new Date(T0.getTime() + 86_400_000),
    });
    await mind.ready;
    session.emit('user_input_transcribed', { transcript: 'Hey, ugh, my car died this morning.' });
    return { agent };
  }
  const MIND = 'Stripe interview on Monday';

  it(`${on ? 'is taken out of' : 'stays in'} a crisis-guided reply`, async () => {
    vi.stubEnv(FLAG, on ? 'on' : '');
    const c = await afterFirstWords();
    const text = c.agent.chatCtx.items.map((i) => (i as llm.ChatMessage).textContent).join('\n');
    expect(text).toContain(MIND); // precondition: the note is in the chat
    const sent = await ask(c, newCall(), CRISIS, flagEnv(on));
    expect(sent.length).toBeGreaterThan(0);
    for (const request of sent) expect(request.includes(MIND)).toBe(!on);
  });
});
