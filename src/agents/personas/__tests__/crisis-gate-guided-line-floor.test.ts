/**
 * CRISIS_GUIDED_LINE_FLOOR through the real gatedReply: a reply the gate guided for a crisis read
 * names its line, said by code when the model leaves it out, on the first reply and on the reply
 * asked again after a classifier escalation. Every other reply reads exactly as with the flag off.
 * All lines are fictional.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import {
  FOR_THEM_988,
  TALK_TO_988,
  TALK_TO_988_ES,
} from '../../../services/safety/crisis-guard-replies.js';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import { detectCrisis } from '../../../services/safety/crisis-guard.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { decisionFor, gatedReply } from '../crisis-gate.js';

const BASE = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_CLASSIFIER_TIMEOUT_MS: '40',
};
const ON = { ...BASE, CRISIS_GUIDED_LINE_FLOOR: 'on' };
const OFF = { ...BASE, CRISIS_GUIDED_LINE_FLOOR: 'off' };

const ANSWER = {
  none: async () => '{"risk":"none","subject":"self"}',
  crisis: async () => '{"risk":"crisis","subject":"self"}',
  throws: async (): Promise<string> => {
    throw new Error('provider down');
  },
} satisfies Record<string, CrisisGenerateFn>;

const PILLS = 'i have a bottle of pills and i want to take them all';
const FRIEND = 'my friend told me she wants to kill herself';
const UNSAFE = 'i feel unsafe with myself tonight';
// A check-in line the patterns read as nothing (#3789 guides UNSAFE).
const SCARED = "i'm scared of what i might do tonight";
const ORDINARY = 'what should I cook tonight?';
const CHAT = 'Sounds good.';

const streamOf = (text: string): ReadableStream<unknown> =>
  new ReadableStream<unknown>({
    start(controller) {
      if (text) controller.enqueue(text);
      controller.close();
    },
  });

async function turn(
  said: string,
  env: Record<string, string>,
  generate: CrisisGenerateFn,
  modelSays: () => string | ReadableStream<unknown> = () => CHAT
): Promise<{ spoken: string; asks: number }> {
  resetCrisisClassifierCache();
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.42); // same style picks every turn
  const model = vi.fn(async () => {
    const says = modelSays();
    return typeof says === 'string' ? streamOf(says) : says;
  });
  const opener = { wrap: (stream: ReadableStream<unknown>) => stream };
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  ctx.addMessage({ role: 'user', content: said });
  const reply = await gatedReply(ctx, { userData: undefined }, model as never, opener as never, {
    env,
    generate,
  });
  let spoken = '';
  try {
    if (reply) for await (const chunk of reply as unknown as AsyncIterable<string>) spoken += chunk;
  } finally {
    random.mockRestore();
  }
  return { spoken, asks: model.mock.calls.length };
}

beforeEach(() => resetCrisisClassifierCache());

describe('CRISIS_GUIDED_LINE_FLOOR: a crisis guide reply names its line', () => {
  it('a classifier escalation: the reply asked again gets 988 when the model leaves it out', async () => {
    const off = await turn(PILLS, OFF, ANSWER.crisis);
    const on = await turn(PILLS, ON, ANSWER.crisis);
    expect(off.asks).toBe(2); // the held reply dropped, the model asked again with the guidance
    expect(off.spoken).toBe(CHAT); // main today: no 988 reaches the caller
    expect(on.asks).toBe(2);
    expect(on.spoken).toBe(`${CHAT} ${TALK_TO_988}`);
  });

  it('a pattern guide on the first reply: a friend at risk gets the for-them 988 line', async () => {
    const off = await turn(FRIEND, OFF, ANSWER.none);
    const on = await turn(FRIEND, ON, ANSWER.none);
    expect(off.spoken).toBe(CHAT);
    expect(on.spoken).toBe(`${CHAT} ${FOR_THEM_988}`);
  });

  it('the first reply holds the line with no read at all (the classifier throws)', async () => {
    expect((await turn(FRIEND, ON, ANSWER.throws)).spoken).toBe(`${CHAT} ${FOR_THEM_988}`);
  });

  it('a reply that already says 988 is never added to', async () => {
    const says988 = () => 'You can call or text 988 any time.';
    for (const [line, generate] of [
      [PILLS, ANSWER.crisis],
      [FRIEND, ANSWER.none],
    ] as const) {
      const off = await turn(line, OFF, generate, says988);
      expect((await turn(line, ON, generate, says988)).spoken, line).toBe(off.spoken);
    }
  });

  it('a model stream that fails part-way: the caller hears the partial, then the line', async () => {
    const PARTIAL = 'I hear you,';
    // One chunk per read, then the failure (error() in start() would empty the queue unread).
    // readBeforeError: chunks the reader had taken when it failed (pull runs on an empty queue).
    let readBeforeError: number | null = null;
    const failing = () => {
      let sent = false;
      readBeforeError = null;
      return new ReadableStream<unknown>({
        pull(controller) {
          if (!sent) {
            sent = true;
            controller.enqueue(PARTIAL);
            return;
          }
          if (controller.desiredSize === 1) readBeforeError = 1;
          controller.error(new Error('model stream broke'));
        },
      });
    };
    const on = await turn(FRIEND, ON, ANSWER.none, failing);
    expect(readBeforeError).toBe(1); // the partial was read, then the failure
    expect(on.spoken).toBe(`${PARTIAL} ${FOR_THEM_988}`);
    // Off, as on main: the failure reaches LiveKit, which speaks the partial and then nothing
    await expect(turn(FRIEND, OFF, ANSWER.none, failing)).rejects.toThrow('model stream broke');
    expect(readBeforeError).toBe(1);
  });

  it('a classifier-only crisis read of a Spanish line: the line in Spanish, from the caller words', async () => {
    const SPANISH = 'no estoy a salvo esta noche';
    // Preconditions: no pattern reads it, so the read sets no language; only the classifier acts.
    expect(decisionFor(detectCrisis(SPANISH))).toEqual({ action: 'pass' });
    expect(detectCrisis(SPANISH).language).toBeUndefined();

    expect((await turn(SPANISH, OFF, ANSWER.crisis)).spoken).toBe(CHAT);
    const on = await turn(SPANISH, ON, ANSWER.crisis);
    expect(on.spoken).toBe(`${CHAT} ${TALK_TO_988_ES}`);
    expect(on.spoken).not.toContain(TALK_TO_988);
    // Control: the same classifier read of an English line is answered in English.
    expect((await turn(ORDINARY, ON, ANSWER.crisis)).spoken).toBe(`${CHAT} ${TALK_TO_988}`);
  });

  it('an empty reply gets the line alone', async () => {
    const silent = () => '';
    expect((await turn(PILLS, ON, ANSWER.crisis, silent)).spoken).toBe(TALK_TO_988);
    expect((await turn(FRIEND, ON, ANSWER.none, silent)).spoken).toBe(FOR_THEM_988);
  });
});

describe('CRISIS_GUIDED_LINE_FLOOR: every reply without a crisis guide is unchanged', () => {
  it('an ordinary turn the classifier reads as nothing, or cannot read', async () => {
    for (const generate of [ANSWER.none, ANSWER.throws]) {
      const off = await turn(ORDINARY, OFF, generate);
      expect(off.spoken).toBe(CHAT);
      expect((await turn(ORDINARY, ON, generate)).spoken).toBe(off.spoken);
    }
  });

  it('an ordinary line the classifier reads as crisis is a crisis guide: it gets 988', async () => {
    expect((await turn(ORDINARY, OFF, ANSWER.crisis)).spoken).toBe(CHAT);
    expect((await turn(ORDINARY, ON, ANSWER.crisis)).spoken).toBe(`${CHAT} ${TALK_TO_988}`);
  });

  it('the timeout check-in keeps its own ending: the floor adds nothing to it', async () => {
    const checkin = { CRISIS_TIMEOUT_CHECKIN: 'on' };
    const off = await turn(SCARED, { ...OFF, ...checkin }, ANSWER.throws);
    const on = await turn(SCARED, { ...ON, ...checkin }, ANSWER.throws);
    expect(off.spoken).toContain('988'); // the check-in's own 988, said once
    expect(on.spoken).toBe(off.spoken);
  });

  it('a guided line whose read failed (#3789): the floor and the check-in ending say 988 once', async () => {
    const checkin = { CRISIS_TIMEOUT_CHECKIN: 'on' };
    for (const env of [OFF, ON]) {
      const { spoken } = await turn(UNSAFE, { ...env, ...checkin }, ANSWER.throws);
      expect(spoken.match(/988/g)).toHaveLength(1);
      expect(spoken.match(/safe right now\?/g)).toHaveLength(1);
    }
  });

  it('a turn the patterns replace with a script is the script, flag on or off', async () => {
    const plain = 'i want to kill myself';
    const off = await turn(plain, OFF, ANSWER.none);
    expect(off.asks).toBe(0);
    expect((await turn(plain, ON, ANSWER.none)).spoken).toBe(off.spoken);
  });
});

describe('CRISIS_GUIDED_LINE_FLOOR with CRISIS_GATE_TURN_READS: the path once both are promoted', () => {
  // No pattern reads this line; only a classifier could. The gate's own read calls it none,
  // the pipeline's read of the whole turn calls it a crisis.
  const EVERYDAY = 'Okay, I should head to bed soon';
  const EARLIER = ['Hey Ferni.', 'Not much, a long week at work.'];
  const FERNI = 'That sounds like a lot. What has been the hardest part?';
  const NIGHT = 'Sleep well.';
  let n = 0;

  async function bothTurn(env: Record<string, string>): Promise<{ spoken: string; asks: number }> {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    resetCrisisClassifierCache();
    resetCrisisCallRisk();
    const call = `floor-turn-reads-${++n}`;
    startTurnCrisis(
      EVERYDAY.toLowerCase(),
      { recentTranscripts: [...EARLIER, EVERYDAY.toLowerCase()], lastAgentResponse: FERNI },
      { sessionId: call, env, generate: ANSWER.crisis }
    );
    const model = vi.fn(async () => streamOf(NIGHT));
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
    for (const line of EARLIER) ctx.addMessage({ role: 'user', content: line });
    ctx.addMessage({ role: 'assistant', content: FERNI });
    ctx.addMessage({ role: 'user', content: EVERYDAY });
    const opener = { wrap: (stream: ReadableStream<unknown>) => stream };
    const reply = await gatedReply(
      ctx,
      { userData: { services: { sessionId: call } } } as never,
      model as never,
      opener as never,
      { env, generate: ANSWER.none }
    );
    let spoken = '';
    try {
      if (reply)
        for await (const chunk of reply as unknown as AsyncIterable<string>) spoken += chunk;
    } finally {
      vi.unstubAllEnvs();
    }
    return { spoken, asks: model.mock.calls.length };
  }

  it('gate none, pipeline crisis: turn reads escalate, and the reply asked again ends naming 988', async () => {
    expect(detectCrisis(EVERYDAY).isCrisis).toBe(false); // only a classifier reads it
    const reads = { ...BASE, CRISIS_GATE_TURN_READS: 'on' };

    const both = await bothTurn({ ...reads, CRISIS_GUIDED_LINE_FLOOR: 'on' });
    expect(both.asks).toBe(2); // the first reply held, then asked again for the escalated guide
    expect(both.spoken.startsWith(NIGHT)).toBe(true);
    expect(both.spoken.trimEnd().endsWith(TALK_TO_988)).toBe(true);

    // The floor is what names 988: off, the same escalation, and the reply has none.
    const floorOff = await bothTurn({ ...reads, CRISIS_GUIDED_LINE_FLOOR: 'off' });
    expect(floorOff.asks).toBe(2);
    expect(floorOff.spoken).toBe(NIGHT);

    // Turn reads are what escalate: off, the gate's own none stands and the reply passes.
    const readsOff = await bothTurn({
      ...BASE,
      CRISIS_GATE_TURN_READS: 'off',
      CRISIS_GUIDED_LINE_FLOOR: 'on',
    });
    expect(readsOff.asks).toBe(1);
    expect(readsOff.spoken).toBe(NIGHT);
  });
});

describe('decisionFor: which crisis guides carry a line', () => {
  const lineOf = (said: string) => {
    const decision = decisionFor(detectCrisis(said));
    return decision.action === 'guide' ? decision.line : decision.action;
  };

  it("the caller's own crisis read, and a friend at risk", () => {
    expect(lineOf('i have the pills right here')).toBe('pass'); // no read: no guide at all
    expect(lineOf(FRIEND)).toEqual({ who: 'them', urgent: false, lang: 'en' });
  });

  it("the kernel's own abuse read keeps 988 beside the abuse line, so its guide has the line", () => {
    const read = detectCrisis('my husband hits me');
    const decision = decisionFor(read);
    expect(decision.action).toBe('guide');
    const guidance = decision.action === 'guide' ? decision.guidance : '';
    const line = decision.action === 'guide' ? decision.line : undefined;
    // The line exactly where the guidance asks for 988.
    expect(/\b988\b/.test(guidance)).toBe(line !== undefined);
  });

  it('an abuse-only read (no self-risk) has no line: its own care is the abuse line', () => {
    const read = detectCrisis('my husband hits me');
    const abuseOnly = {
      ...read,
      indicators: read.indicators.filter((i) => !i.endsWith('_self_harm')),
    };
    const decision = decisionFor(abuseOnly);
    expect(decision.action).toBe('guide');
    const guidance = decision.action === 'guide' ? decision.guidance : '';
    expect(guidance).not.toMatch(/\b988\b/); // main asks for no 988 here either
    expect(decision.action === 'guide' ? decision.line : 'x').toBeUndefined();
  });
});
