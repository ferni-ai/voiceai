/**
 * CRISIS_OWN_SCRIPT_NOT_EVIDENCE (crisis-own-reply.ts) through the real reply gate, reply
 * recorder, turn pipeline and classifier input: off, the classifier reads Ferni's last line as on
 * main; on, when that line is Ferni's own crisis reply (noted by the gate or turn handler and
 * recorded uninterrupted, and asked nothing) and the caller only signs off, it reads a fixed marker
 * and one rule instead. A line that offered no crisis help or asked a question, a reply that is not
 * a plain sign-off, one with risk words of its own or agreeing with Ferni, and any error read as
 * off; the caller's own words always reach the classifier unchanged. The marker reaches nothing but
 * the classifier's request.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[]);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const spy = <T extends object>(logger: T): T =>
    new Proxy(logger, {
      get: (target, prop, receiver) => {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          logged.push(args);
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
  return {
    ...real,
    createLogger: (...args: Parameters<typeof real.createLogger>) =>
      spy(real.createLogger(...args)),
  };
});
const riskThrows = vi.hoisted(() => ({ on: false }));
vi.mock('../crisis-agreement.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../crisis-agreement.js')>();
  return {
    ...real,
    hasRiskContent: (text: string) => {
      if (riskThrows.on) throw new Error('risk words unreadable');
      return real.hasRiskContent(text);
    },
  };
});
vi.mock('../../../conversation/advanced-humanization-integration.js', () => ({
  recordAgentResponse: vi.fn(),
  recordAdviceGiven: vi.fn(),
}));

import { gatedReply } from '../../../agents/personas/crisis-gate.js';
import { startTurnCrisis } from '../../../agents/processors/turn-processor/turn-crisis.js';
import { noteTurnCrisisHelp } from '../../../agents/safety/crisis-own-reply-notes.js';
import type { UserData } from '../../../agents/shared/types.js';
import { recordCommittedAgentReply } from '../../../agents/voice-agent/agent-reply-recorder.js';
import { SOFT_CRISIS_CHECK } from '../crisis-agreement.js';
import { resetCrisisCallRisk } from '../crisis-call-risk.js';
import {
  CRISIS_CLASSIFIER_PROMPT,
  normalizeInput,
  resetCrisisClassifierCache,
  startCrisisClassifier,
  type CrisisGenerateFn,
} from '../crisis-classifier.js';
import { resetCallRiskSnapshots } from '../crisis-lone-imminent.js';
import {
  commitCrisisHelp,
  isSignOff,
  noteCrisisHelp,
  OWN_CRISIS_REPLY_MARKER,
  OWN_CRISIS_REPLY_RULE,
  ownCrisisReply,
  ownReplyRead,
  type OwnCrisisReplyState,
} from '../crisis-own-reply.js';

const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const OFF = { ...LIVE, CRISIS_OWN_SCRIPT_NOT_EVIDENCE: 'off' };
const ON = { ...LIVE, CRISIS_OWN_SCRIPT_NOT_EVIDENCE: 'on' };
const PATTERNS_ON = { ...ON, CRISIS_CLASSIFIER_MODE: 'off' };

const FIRST = "I hope I don't wake up tomorrow";
const GUIDED_REPLY =
  "I'm really glad you told me, Sam. You can call or text 988 any time. I'm right here with you.";
/** The same crisis reply ending in a production safety question (getSafetyCheckQuestion). */
const ASKING_REPLY =
  "I'm really glad you told me, Sam. You can call or text 988 any time. Do you have access to anything you could use to hurt yourself?";
const ORDINARY_REPLY = 'A big pot of chili sounds perfect for tonight. Want a quick recipe?';
const SIGN_OFF = 'Thanks, talk later.';

/** Every classifier request the model got: the prompt and what it read. */
type Read = { prompt: string; seen: { latest: string; earlier: string[]; companion?: string } };
function spyGenerate(): { generate: CrisisGenerateFn; reads: Read[] } {
  const reads: Read[] = [];
  const generate: CrisisGenerateFn = async (prompt, content) => {
    if (prompt.startsWith(CRISIS_CLASSIFIER_PROMPT.slice(0, 40))) {
      reads.push({ prompt, seen: JSON.parse(content) as Read['seen'] });
    }
    return '{"risk":"none","subject":"self"}';
  };
  return { generate, reads };
}

function request(...turns: Array<['user' | 'assistant', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const [role, content] of turns) ctx.addMessage({ role, content });
  return ctx;
}

const streamOf = (text: string): ReadableStream<unknown> =>
  new ReadableStream<unknown>({
    start(controller) {
      controller.enqueue(text);
      controller.close();
    },
  });
const opener = { wrap: (s: ReadableStream<unknown>) => s };

async function said(stream: ReadableStream<unknown> | null): Promise<string> {
  const out: unknown[] = [];
  if (stream) for await (const c of stream as unknown as AsyncIterable<unknown>) out.push(c);
  return out.map(String).join('');
}

let n = 0;
/** A call: Ferni answers `first` with `reply` through the real gate, and the recorder commits it. */
async function callAfter(
  first: string,
  reply: string,
  interrupted = false,
  turn: { before?: string[]; env?: Record<string, string>; generate?: CrisisGenerateFn } = {}
) {
  const sessionId = `own-reply-${++n}`;
  // A call with earlier turns has a scope, so the gate can see it was quiet before.
  const scope = turn.before ? { services: { sessionId } } : {};
  const userData = { userName: 'Sam', ...scope } as unknown as UserData;
  const session = { userData };
  const model = vi.fn(async (_ctx: llm.ChatContext) => streamOf(reply));
  const before = (turn.before ?? []).flatMap((line): Array<['user' | 'assistant', string]> => [
    ['user', line],
    ['assistant', 'Mm, got it.'],
  ]);
  const { env = PATTERNS_ON, generate } = turn;
  const spoken = await said(
    await gatedReply(
      request(...before, ['user', first]),
      session,
      model as never,
      opener as never,
      {
        env,
        generate,
      }
    )
  );
  const message = llm.ChatMessage.create({ role: 'assistant', content: spoken, interrupted });
  await recordCommittedAgentReply({ sessionId, userData }, message);
  /** The caller's next turn through the gate: what was spoken and what the model was sent. */
  const next = async (latest: string, env: Record<string, string>, generate: CrisisGenerateFn) => {
    const asked = vi.fn(async (_ctx: llm.ChatContext) => streamOf('Okay, talk soon, Sam.'));
    const ctx = request(['user', first], ['assistant', spoken], ['user', latest]);
    const out = await said(
      await gatedReply(ctx, session, asked as never, opener as never, { env, generate })
    );
    return { out, sent: asked.mock.calls.map(([c]) => JSON.stringify(c.toJSON())) };
  };
  const sent = () => model.mock.calls.map(([c]) => JSON.stringify(c.toJSON()));
  return { userData, session, sessionId, spoken, sent, next };
}

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  riskThrows.on = false;
  logged.length = 0;
});

describe('which line is Ferni own crisis reply (structured state)', () => {
  it('the gate notes a guided reply and the recorder keeps it for that line', async () => {
    const call = await callAfter(FIRST, GUIDED_REPLY);
    expect(call.spoken).toBe(GUIDED_REPLY);
    expect(call.userData.lastAgentResponse).toBe(GUIDED_REPLY);
    expect(call.userData.lastAgentResponseCrisisHelp).toBe(true);
    expect(call.userData.crisisHelpInReply).toBeUndefined();
  });

  it('an ordinary turn, or a guided reply cut off, is not Ferni own crisis reply', async () => {
    expect((await callAfter('what should I cook tonight?', ORDINARY_REPLY)).userData).toMatchObject(
      { lastAgentResponse: ORDINARY_REPLY, lastAgentResponseCrisisHelp: false }
    );
    expect((await callAfter(FIRST, GUIDED_REPLY, true)).userData.lastAgentResponseCrisisHelp).toBe(
      false
    );
  });

  it('a soft check-in is not Ferni own crisis reply', async () => {
    // A plain goodbye the classifier alone reads as imminent, on a quiet call: the soft check.
    const quiet = [
      'I went hiking this morning.',
      'Up the ridge trail with Alex.',
      'The views were amazing.',
    ];
    const imminent: CrisisGenerateFn = async () => '{"risk":"imminent","subject":"self"}';
    const call = await callAfter('Bye.', ORDINARY_REPLY, false, {
      before: quiet,
      env: ON,
      generate: imminent,
    });
    const soft = SOFT_CRISIS_CHECK.split('\n')[0];
    expect(call.sent().some((c) => c.includes(soft))).toBe(true); // the gate took the soft path
    expect(call.userData.lastAgentResponse).toBe(ORDINARY_REPLY);
    expect(call.userData.lastAgentResponseCrisisHelp).toBe(false);
  });

  it('either writer may note it; an acknowledgement-only commit keeps the line it follows', () => {
    const state: OwnCrisisReplyState = {};
    noteCrisisHelp(state, 'gate', false);
    noteCrisisHelp(state, 'turn', true);
    commitCrisisHelp(state, true, false);
    expect(state.lastAgentResponseCrisisHelp).toBe(true);
    noteCrisisHelp(state, 'gate', false);
    commitCrisisHelp(state, false, false); // "mm-hm": not recorded, the guided line stays last
    expect(state).toEqual({ lastAgentResponseCrisisHelp: true, crisisHelpInReply: undefined });
    commitCrisisHelp(state, true, false); // a recorded reply no writer noted
    expect(state.lastAgentResponseCrisisHelp).toBe(false);
  });

  it('the turn handler notes its crisis script and its crisis guidance, nothing else', () => {
    const noted = (crisis?: Parameters<typeof noteTurnCrisisHelp>[1]): boolean | undefined => {
      const state: OwnCrisisReplyState = {};
      noteTurnCrisisHelp(state, crisis);
      return state.crisisHelpInReply?.turn;
    };
    const script = 'Please call or text 988 now.';
    expect(noted({ shouldOverrideLLM: true, suggestedResponse: script })).toBe(true);
    expect(noted({ isCrisis: true })).toBe(true); // guidance, no script
    expect(noted({ shouldOverrideLLM: true })).toBe(false); // nothing to say: no override
    expect(noted({ isCrisis: false })).toBe(false);
    expect(noted(undefined)).toBe(false);
  });

  it('is never read from the text: the same words with no note are not it', () => {
    const state = { lastAgentResponse: GUIDED_REPLY };
    expect(ownCrisisReply(state, GUIDED_REPLY, ON)).toBe(false);
    expect(ownCrisisReply({ ...state, lastAgentResponseCrisisHelp: true }, GUIDED_REPLY, ON)).toBe(
      true
    );
    // Not the recorded line (a later model line in the chat context): not it.
    const other = { ...state, lastAgentResponseCrisisHelp: true };
    expect(ownCrisisReply(other, 'Something else entirely.', ON)).toBe(false);
  });
});

describe('the classifier input through the real gate', () => {
  it('off: the companion line and prompt are as on main, byte for byte', async () => {
    const call = await callAfter(FIRST, GUIDED_REPLY);
    const { generate, reads } = spyGenerate();
    await call.next(SIGN_OFF, OFF, generate);
    expect(reads.length).toBeGreaterThan(0);
    const main = normalizeInput({ latest: SIGN_OFF, earlier: [FIRST], companion: GUIDED_REPLY });
    for (const read of reads) {
      expect(read.seen).toEqual(main);
      expect(read.prompt).not.toContain(OWN_CRISIS_REPLY_MARKER);
    }
  });

  it('on: Ferni own crisis reply is read as the marker, with the rule', async () => {
    const call = await callAfter(FIRST, GUIDED_REPLY);
    const { generate, reads } = spyGenerate();
    await call.next(SIGN_OFF, ON, generate);
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) {
      expect(read.seen.companion).toBe(OWN_CRISIS_REPLY_MARKER);
      expect(read.prompt).toContain(OWN_CRISIS_REPLY_RULE);
      expect(read.prompt.indexOf(OWN_CRISIS_REPLY_RULE)).toBeLessThan(
        read.prompt.indexOf('Return JSON only')
      );
    }
  });

  it('on: the marker says crisis resources were offered, not a neutral line', () => {
    expect(OWN_CRISIS_REPLY_MARKER).toMatch(/crisis resources/);
    expect(OWN_CRISIS_REPLY_MARKER).toMatch(/988/);
    expect(OWN_CRISIS_REPLY_MARKER).toMatch(/911/);
    expect(OWN_CRISIS_REPLY_RULE).toContain(`"${OWN_CRISIS_REPLY_MARKER}"`);
  });

  it('on: a reply after an ordinary turn reads its companion line unchanged', async () => {
    const call = await callAfter('what should I cook tonight?', ORDINARY_REPLY);
    const { generate, reads } = spyGenerate();
    await call.next(SIGN_OFF, ON, generate);
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) {
      expect(read.seen.companion).toBe(ORDINARY_REPLY);
      expect(read.prompt).not.toContain(OWN_CRISIS_REPLY_RULE);
    }
  });

  it.each([
    ['risk words of its own', "Okay. It's still tonight."],
    ['agreeing with Ferni', 'Thanks. I already have them right here.'],
  ])('on: a reply with %s reads the full line, as off', async (_why, latest) => {
    const call = await callAfter(FIRST, GUIDED_REPLY);
    const { generate, reads } = spyGenerate();
    await call.next(latest, ON, generate);
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) {
      expect(read.seen.companion).toBe(GUIDED_REPLY);
      expect(read.prompt).not.toContain(OWN_CRISIS_REPLY_RULE);
    }
  });
});

describe('the turn pipeline (recorded reply as companion)', () => {
  const turn = async (userData: OwnCrisisReplyState, env: Record<string, string>) => {
    const { generate, reads } = spyGenerate();
    const data = { ...userData, recentTranscripts: [FIRST, SIGN_OFF], turnCount: 2 };
    await startTurnCrisis(SIGN_OFF, data, {
      sessionId: `own-turn-${++n}`,
      env,
      generate,
    }).summary();
    return reads;
  };
  const guided = { lastAgentResponse: GUIDED_REPLY, lastAgentResponseCrisisHelp: true };

  it('reads the marker on, and the line itself off or with no note', async () => {
    const on = await turn(guided, ON);
    expect(on.length).toBeGreaterThan(0);
    expect(on.every((r) => r.seen.companion === OWN_CRISIS_REPLY_MARKER)).toBe(true);
    const off = await turn(guided, OFF);
    expect(off.length).toBeGreaterThan(0);
    expect(off.every((r) => r.seen.companion === GUIDED_REPLY)).toBe(true);
    const unnoted = await turn({ lastAgentResponse: GUIDED_REPLY }, ON);
    expect(unnoted.every((r) => r.seen.companion === GUIDED_REPLY)).toBe(true);
  });

  it('reads the marker for a crisis script in paragraphs, by the gate and the pipeline', async () => {
    // Real scripts have line breaks; the classifier input folds them (stripSSML).
    const script = `I'm really glad you told me, Sam.\n\nYou can call or text 988 any time.\n\nI'm right here with you.`;
    const piped = await turn({ lastAgentResponse: script, lastAgentResponseCrisisHelp: true }, ON);
    expect(piped.length).toBeGreaterThan(0);
    expect(piped.every((r) => r.seen.companion === OWN_CRISIS_REPLY_MARKER)).toBe(true);
    resetCrisisClassifierCache(); // the same words: the gate must read, not reuse the run
    const call = await callAfter(FIRST, script);
    expect(call.userData.lastAgentResponseCrisisHelp).toBe(true);
    const { generate, reads } = spyGenerate();
    await call.next(SIGN_OFF, ON, generate);
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((r) => r.seen.companion === OWN_CRISIS_REPLY_MARKER)).toBe(true);
  });
});

describe('never lower: only a plain sign-off after a line that asked nothing', () => {
  it('a crisis reply with a question reads in full, even before a sign-off', async () => {
    const call = await callAfter(FIRST, ASKING_REPLY);
    expect(call.userData.lastAgentResponseCrisisHelp).toBe(true); // it is Ferni's own crisis reply
    const { generate, reads } = spyGenerate();
    await call.next(SIGN_OFF, ON, generate);
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) {
      expect(read.seen.companion).toBe(ASKING_REPLY);
      expect(read.prompt).not.toContain(OWN_CRISIS_REPLY_RULE);
    }
  });

  it.each([
    'yes',
    'yeah I do',
    'a few',
    'no',
    'sometimes',
    'sure',
    'goodnight',
    'I guess',
    'Thanks, but I still have them.',
    'thanks?',
    'gracias, adiós',
    'merci, au revoir',
    'tha\u200bnks',
    'thanks\u00a0bye',
  ])('%j after a crisis reply that asked nothing reads the full line', async (latest) => {
    const call = await callAfter(FIRST, GUIDED_REPLY);
    const { generate, reads } = spyGenerate();
    await call.next(latest, ON, generate);
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) {
      expect(read.seen.companion).toBe(GUIDED_REPLY);
      expect(read.prompt).not.toContain(OWN_CRISIS_REPLY_RULE);
    }
  });

  it("the caller's words reach the classifier byte for byte, on as off", async () => {
    const readsIn = async (env: Record<string, string>) => {
      resetCrisisClassifierCache();
      const call = await callAfter(FIRST, GUIDED_REPLY);
      const { generate, reads } = spyGenerate();
      await call.next(SIGN_OFF, env, generate);
      return reads;
    };
    const off = await readsIn(OFF);
    const on = await readsIn(ON);
    expect(on.length).toBeGreaterThan(0);
    expect(on.length).toBe(off.length);
    expect(on.every((r) => r.seen.companion === OWN_CRISIS_REPLY_MARKER)).toBe(true); // it fired
    on.forEach((read, i) => {
      expect(read.seen.latest).toBe(off[i].seen.latest);
      expect(read.seen.earlier).toEqual(off[i].seen.earlier);
    });
    expect(on[0].seen.latest).toBe(SIGN_OFF);
  });

  it('a sign-off is only thanks, okays and goodbyes', () => {
    for (const line of [
      'Thanks, talk later.',
      'ok bye',
      "I'm good, talk later.",
      'Thank you so much!',
      'okay thanks',
      'Got it. See you tomorrow.',
    ]) {
      expect(isSignOff(line), line).toBe(true);
    }
    for (const line of [
      '',
      'yes',
      'no thanks',
      'goodbye',
      'bye everyone',
      'thanks for everything',
      "I'm fine",
      'ok, I still have the pills',
      'okay?',
    ]) {
      expect(isSignOff(line), line).toBe(false);
    }
  });
});

describe('fail closed', () => {
  it('a state that cannot be read is not Ferni own crisis reply', () => {
    const broken = {
      lastAgentResponse: GUIDED_REPLY,
      get lastAgentResponseCrisisHelp(): boolean {
        throw new Error('state unreadable');
      },
    };
    expect(ownCrisisReply(broken, GUIDED_REPLY, ON)).toBe(false);
  });

  it('an error reading the reply leaves the classifier input as off', async () => {
    riskThrows.on = true;
    const read = ownReplyRead(true, SIGN_OFF);
    expect(read.key).toEqual([]);
    const input = { latest: SIGN_OFF, earlier: [FIRST], companion: GUIDED_REPLY };
    expect(read.input(input)).toBe(input);
    const { generate, reads } = spyGenerate();
    const run = startCrisisClassifier(input, {
      pattern: 'none',
      env: ON,
      generate,
      callState: { lastAgentResponse: GUIDED_REPLY, lastAgentResponseCrisisHelp: true },
    });
    await run?.verdict;
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((r) => r.seen.companion === GUIDED_REPLY)).toBe(true);
  });
});

describe('the marker reaches nothing but the classifier request', () => {
  it('not speech, the reply model, the call state, the recorded reply or logs', async () => {
    const call = await callAfter(FIRST, GUIDED_REPLY);
    const { generate, reads } = spyGenerate();
    const { out, sent } = await call.next(SIGN_OFF, ON, generate);
    expect(reads.some((r) => r.seen.companion === OWN_CRISIS_REPLY_MARKER)).toBe(true);
    await recordCommittedAgentReply(
      { sessionId: call.sessionId, userData: call.userData },
      llm.ChatMessage.create({ role: 'assistant', content: out })
    );
    const channels = [out, ...sent, JSON.stringify(call.userData), JSON.stringify(logged)];
    expect(sent.length).toBeGreaterThan(0);
    for (const channel of channels) {
      expect(channel).not.toContain(OWN_CRISIS_REPLY_MARKER);
      expect(channel).not.toContain('own-crisis-reply');
    }
    expect(call.userData.lastAgentResponse).toBe(out);
  });
});
