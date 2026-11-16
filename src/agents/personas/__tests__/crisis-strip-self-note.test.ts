/**
 * FERNI_SELF_RECALL's note (what Ferni told about his own life) is held on a crisis exactly
 * where PERSONA_GROWTH's note is: never offered on crisis words or a call with risk noted, taken
 * back out of the chat when a crisis shows, and kept from a crisis-guided reply by the real
 * gatedReply. Only the ledger, the models and the agent's chat are fakes; the network is
 * guarded and every model the gate can ask is a counted stub.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { createMemoryRecall, type MemoryRecall } from '../../multi-agent/memory-recall-hook.js';
import { GROWTH_NOTE_ID, SELF_NOTE_ID_PREFIX } from '../../multi-agent/recall-note.js';
import { sendRecall } from '../context-packet/turn-packet.js';
import { gatedReply } from '../crisis-gate.js';
import type { LedgerFact } from '../life-ledger.js';
import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';

const ABOUT_YOU = '[ABOUT YOU:';
const GROWTH = '[SOMETHING THEY CHANGED IN YOU]';
const ASKS_HIS_BOOK = "How's your book going?";
/** Invented: crisis words and a question about his life in the same turn. */
const RISK_AND_BOOK = "I hope I don't wake up tomorrow. How's your book going?";
const TOLD: LedgerFact[] = [
  {
    personaId: 'ferni',
    fact: 'Ferni finished a book of essays and started a new collection of short stories.',
    saidAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
  },
];

let calls = 0;
const newCall = (): string => `s-self-note-${++calls}`;

const counts = { fetch: 0, generate: 0, adjudicate: 0, grounded: 0 };
beforeEach(() => {
  resetCrisisCallRisk();
  resetCrisisClassifierCache();
  Object.assign(counts, { fetch: 0, generate: 0, adjudicate: 0, grounded: 0 });
  vi.stubGlobal('fetch', async () => {
    counts.fetch++;
    throw new Error('no network in this test');
  });
  vi.spyOn(Math, 'random').mockReturnValue(0.42); // the turn reminder's style picks
});
afterEach(() => {
  expect(counts.fetch).toBe(0);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function startRecall(sessionId: string): Promise<MemoryRecall> {
  const recall = createMemoryRecall({
    userId: 'u-self-note',
    userName: 'Sam',
    sessionId,
    selfRecall: true,
    store: { facts: async () => [], summaries: async () => [] },
    ledgerStore: { save: async () => undefined, recent: async () => TOLD },
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
  const self = () => items.filter((i) => i.id.startsWith(SELF_NOTE_ID_PREFIX));
  return { agent, self, items: () => items };
}

/** A final transcript as agent-setup's listener handles it, then the agent speaks. */
function hear(recall: MemoryRecall, c: ReturnType<typeof chat>, said: string): void {
  sendRecall(c.agent as never, {}, recall, recall.noteFor(said, { final: true }), said);
  recall.newTurn();
}

describe('the self note goes in on its own', () => {
  it('after recall’s note, as its own item, and nowhere else in the chat', async () => {
    const c = chat();
    hear(await startRecall(newCall()), c, ASKS_HIS_BOOK);
    expect(c.self()).toHaveLength(1);
    expect(c.self()[0]!.textContent.startsWith(ABOUT_YOU)).toBe(true);
    expect(c.self()[0]!.textContent).toContain('book of essays');
    const elsewhere = c.items().filter((i) => !i.id.startsWith(SELF_NOTE_ID_PREFIX));
    expect(elsewhere.some((i) => i.textContent.includes(ABOUT_YOU))).toBe(false);
    expect(c.items().at(-1)!.id.startsWith(SELF_NOTE_ID_PREFIX)).toBe(true);
  });
});

describe('the self note is held where the growth note is', () => {
  it('is never offered on a turn with crisis words, and takes an earlier one back out', async () => {
    const recall = await startRecall(newCall());
    const c = chat();
    hear(recall, c, ASKS_HIS_BOOK);
    expect(c.self()).toHaveLength(1); // a calm turn: the note is there to use
    hear(recall, c, RISK_AND_BOOK);
    expect(c.self()).toEqual([]);
  });

  it('is never offered on a call with crisis risk noted; the same call without risk gets it', async () => {
    const risky = newCall();
    noteCrisisRisk(risky);
    const c = chat();
    hear(await startRecall(risky), c, ASKS_HIS_BOOK);
    expect(c.self()).toEqual([]);

    const calm = chat();
    hear(await startRecall(newCall()), calm, ASKS_HIS_BOOK);
    expect(calm.self()).toHaveLength(1);
  });
});

/** The classifier stubs: a read of crisis for `risky` lines, none for the rest. */
function stubs(risky: (said: string) => boolean) {
  const generate: CrisisGenerateFn = async (_prompt, content) => {
    counts.generate++;
    const crisis = risky(String(content));
    return JSON.stringify({ risk: crisis ? 'crisis' : 'none', subject: 'self' });
  };
  const adjudicate: CrisisGenerateFn = async () => {
    counts.adjudicate++;
    return '{"caller_risk":"","decision":"escalate","confidence":"high"}';
  };
  const grounded: CrisisGenerateFn = async () => {
    counts.grounded++;
    return '{"explained":false}';
  };
  return { generate, adjudicate, groundedReads: [grounded, grounded] };
}

const GATE_ENVS: Record<string, Record<string, string>> = {
  'patterns only': { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' },
  'classifier live, agreement gate on, adjudicator in shadow': {
    CRISIS_GUARD_MODE: 'live',
    CRISIS_CLASSIFIER_MODE: 'live',
    CRISIS_AGREEMENT_GATE: 'on',
    CRISIS_ADJUDICATOR: 'shadow',
  },
};

/** The text of a chat context, item by item. */
const textOf = (ctx: llm.ChatContext): string =>
  ctx.items.map((i) => (i as llm.ChatMessage).textContent ?? '').join('\n');

/**
 * Ask the real gate about `said` with both notes in the chat. `before` is the request as the
 * gate got it; `sent` is the text of every request the gate sent the model, in order.
 */
async function ask(
  env: Record<string, string>,
  sessionId: string,
  said: string,
  risky = (_line: string) => false
) {
  const request = llm.ChatContext.empty();
  request.addMessage({ role: 'system', content: 'You are Ferni.' });
  request.addMessage({ role: 'system', content: `${GROWTH} note`, id: GROWTH_NOTE_ID });
  request.addMessage({
    role: 'system',
    content: `${ABOUT_YOU} You told them: you finished a book of essays.]`,
    id: `${SELF_NOTE_ID_PREFIX}1`,
  });
  request.addMessage({ role: 'user', content: said });
  const before = textOf(request);
  const sent: string[] = [];
  const model = async (ctx: llm.ChatContext) => {
    sent.push(textOf(ctx));
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
    env,
    ...stubs(risky),
  });
  if (reply) for await (const chunk of reply as unknown as AsyncIterable<unknown>) void chunk;
  return { before, sent };
}

describe.each(Object.entries(GATE_ENVS))('the real gatedReply, %s', (_name, env) => {
  it('keeps it on a calm turn, takes it from a crisis-guided reply, and from every reply after', async () => {
    const call = newCall();
    const calm = await ask(env, call, 'what should I cook tonight?');
    expect(calm.sent.at(-1)).toContain(ABOUT_YOU);

    const guided = await ask(env, call, "I hope I don't wake up tomorrow");
    expect(guided.before).toContain(ABOUT_YOU); // in the chat before the gate
    expect(guided.sent.length).toBeGreaterThan(0);
    for (const sent of guided.sent) {
      expect(sent).not.toContain(ABOUT_YOU);
      expect(sent).not.toContain(GROWTH);
    }

    const after = await ask(env, call, 'anyway, what should I cook?'); // risk noted on the call
    expect(after.sent.at(-1)).not.toContain(ABOUT_YOU);

    const fresh = await ask(env, newCall(), 'what should I cook tonight?');
    expect(fresh.sent.at(-1)).toContain(ABOUT_YOU);
  });
});

describe('a reply held for the classifier', () => {
  const env = GATE_ENVS['classifier live, agreement gate on, adjudicator in shadow']!;

  it('is spoken with the note only when the read clears it; a read of risk re-asks without it', async () => {
    const call = newCall();
    const cleared = await ask(env, call, 'what should I cook tonight?');
    expect(cleared.sent).toHaveLength(1); // held, then released as it was
    expect(cleared.sent[0]).toContain(ABOUT_YOU);

    // Invented: no crisis words the patterns know, read as risk by the classifier stub.
    const escalated = await ask(env, call, 'I just want all of it to stop for good', () => true);
    expect(counts.generate).toBeGreaterThan(0);
    expect(escalated.sent.length).toBeGreaterThanOrEqual(2); // the held reply, then the guided one
    expect(escalated.sent.at(-1)).not.toContain(ABOUT_YOU);
  });
});
