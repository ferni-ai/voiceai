/**
 * Replays the prod false alarms behind CRISIS_IMMINENT_SOFT_CHECK through the
 * real reply gate (startCrisisGate, gatedReply) and turn pipeline
 * (startTurnCrisis): 10-15 19:25:52, "I'm not online, we're talking
 * directly" read imminent and got the 911 script; 10-14, "If you call my
 * mom," read crisis and got a 988 line. With the flag on each gets one
 * check-in, and the caller's next turn decides deterministically.
 */
import { llm } from '@livekit/agents';
import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../../services/safety/crisis-classifier.js';
import {
  CHECK_IN_CLEARED,
  CHECK_IN_LINE,
  CHECK_IN_REPEAT,
  CHECK_IN_RESOURCES,
  CHECK_IN_RESOURCES_NOTE,
  resetCrisisSoftCheck,
} from '../../../../services/safety/crisis-soft-check.js';
import { gatedReply, startCrisisGate } from '../../../personas/crisis-gate.js';
import { applyClassifierVerdict, detectCrisis } from '../../../safety/crisis-guard.js';
import { crisisSummary, startTurnCrisis } from '../turn-crisis.js';

const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const SOFT = { ...LIVE, CRISIS_IMMINENT_SOFT_CHECK: 'on' };
const BOTH = { ...SOFT, CRISIS_AGREEMENT_GATE: 'on' };

const ONLINE = "I'm not online, we're talking directly.";
const DIALING = "I'm dialing her now. I'll call you right back on this line.";
const MOM = 'If you call my mom,';
const FRIEND = 'Really. Through every one of our talks, I have been right here with you.';

let n = 0;
let session = { services: { sessionId: 'soft-0' } };
beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisSoftCheck();
  session = { services: { sessionId: `soft-${++n}` } };
});

const reads =
  (risk: 'none' | 'crisis' | 'imminent', subject = 'self'): CrisisGenerateFn =>
  async () =>
    `{"risk":"${risk}","subject":"${subject}"}`;

function request(...turns: Array<['user' | 'assistant', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  for (const [role, content] of turns) ctx.addMessage({ role, content });
  return ctx;
}

const online = (...more: Array<['user' | 'assistant', string]>) =>
  request(
    ['user', 'Okay.'],
    ['user', "I'm waiting."],
    ['assistant', DIALING],
    ['user', ONLINE],
    ...more
  );
const mom = (...more: Array<['user' | 'assistant', string]>) =>
  request(
    ['user', 'Are you really my friend?'],
    ['user', 'Really?'],
    ['assistant', FRIEND],
    ['user', MOM],
    ...more
  );

/** The 911 script main speaks for an imminent read of these words. */
const SCRIPT = applyClassifierVerdict(detectCrisis(ONLINE), { risk: 'imminent', subject: 'self' })
  .suggestedResponse as string;

const gate = async (
  ctx: llm.ChatContext,
  generate: CrisisGenerateFn,
  env: Record<string, string> = SOFT
) => {
  const turn = startCrisisGate(ctx, session, { env, generate });
  return { decision: turn?.decision, escalation: await turn?.escalation };
};

/** Ferni has asked the check-in on the 19:25:52 turn. */
async function askedOnline(env: Record<string, string> = SOFT) {
  const asked = await gate(online(), reads('imminent'), env);
  expect(asked.escalation).toEqual({ action: 'replace', script: CHECK_IN_LINE, checkIn: 'ask' });
  return (answer: string, generate = reads('none')) =>
    gate(online(['assistant', CHECK_IN_LINE], ['user', answer]), generate, env);
}

describe('the prod false alarms', () => {
  it('flag off: the imminent read replaces the reply with the 911 script, as on main', async () => {
    const { escalation } = await gate(online(), reads('imminent'), LIVE);
    expect(SCRIPT).toContain('911');
    expect(escalation).toEqual({ action: 'replace', script: SCRIPT });
  });

  it('on: "I\'m not online, we\'re talking directly" gets the check-in, not the script', async () => {
    for (const env of [SOFT, BOTH]) {
      resetCrisisSoftCheck();
      resetCrisisClassifierCache();
      const { escalation } = await gate(online(), reads('imminent'), env);
      expect(escalation).toEqual({ action: 'replace', script: CHECK_IN_LINE, checkIn: 'ask' });
    }
  });

  it('flag off: "If you call my mom," gets crisis guidance with 988', async () => {
    const { escalation } = await gate(mom(), reads('crisis'), LIVE);
    expect(escalation?.action === 'guide' && escalation.guidance).toContain('988');
  });

  it('on: "If you call my mom," gets the check-in, with or without the agreement gate', async () => {
    for (const env of [SOFT, BOTH]) {
      resetCrisisSoftCheck();
      resetCrisisClassifierCache();
      const { escalation } = await gate(mom(), reads('crisis'), env);
      expect(escalation).toEqual({ action: 'replace', script: CHECK_IN_LINE, checkIn: 'ask' });
    }
  });

  const pipelineRun = (env: Record<string, string>) =>
    startTurnCrisis(
      ONLINE,
      { recentTranscripts: ['Okay.', "I'm waiting."], lastAgentResponse: DIALING },
      { sessionId: session.services.sessionId, env, generate: reads('imminent') }
    );

  it('on: the turn pipeline gives soft guidance, not the override, once the gate asked', async () => {
    const off = pipelineRun(LIVE);
    expect(crisisSummary(await off.resolve(), await off.softCheck()).shouldOverrideLLM).toBe(true);
    resetCrisisClassifierCache();
    await gate(online(), reads('imminent'));
    const on = pipelineRun(SOFT);
    expect((await on.resolve()).isCrisis).toBe(false);
    expect(await on.softCheck()).toBe(true);
  });

  it('on: the pipeline alone never softens: no gate check-in, the override as on main', async () => {
    const pipeline = pipelineRun(SOFT);
    expect(await pipeline.softCheck()).toBe(false);
    expect(crisisSummary(await pipeline.resolve()).shouldOverrideLLM).toBe(true);
    // ...and it never takes the call's check-in from the gate.
    const { escalation } = await gate(online(), reads('imminent'));
    expect(escalation).toEqual({ action: 'replace', script: CHECK_IN_LINE, checkIn: 'ask' });
  });
});

describe('what never gets the check-in', () => {
  it('a pattern match keeps the script', async () => {
    const words = "I'm not online, I'm going to kill myself tonight.";
    const ctx = request(['assistant', DIALING], ['user', words]);
    const { decision, escalation } = await gate(ctx, reads('imminent'));
    expect(decision?.action).toBe('replace');
    expect(escalation).toBeNull();
  });

  it('risk content in the caller words, now or earlier, keeps the script', async () => {
    const now = request(['assistant', DIALING], ['user', "I'm not online, I'm on the bridge."]);
    expect((await gate(now, reads('imminent'))).escalation).toMatchObject({ action: 'replace' });
    expect((await gate(now, reads('imminent'))).escalation).not.toMatchObject({ checkIn: 'ask' });
    resetCrisisClassifierCache();
    const earlier = request(
      ['user', 'nobody would miss me'],
      ['assistant', DIALING],
      ['user', ONLINE]
    );
    expect((await gate(earlier, reads('imminent'))).escalation).toEqual({
      action: 'replace',
      script: SCRIPT,
    });
  });

  it('a read about someone else keeps full handling', async () => {
    const { escalation } = await gate(mom(), reads('crisis', 'third_party'));
    expect(escalation?.action).toBe('guide');
    expect(escalation).not.toMatchObject({ checkIn: 'ask' });
  });

  it('a second classifier-only read in the same call escalates as on main', async () => {
    await gate(online(), reads('imminent'));
    resetCrisisClassifierCache();
    const later = request(
      ['assistant', 'Okay, what next?'],
      ['user', 'Are you actually calling my mom?']
    );
    const { escalation } = await gate(later, reads('imminent'));
    expect(escalation?.action).toBe('replace');
    expect(escalation).not.toMatchObject({ checkIn: 'ask' });
  });
});

describe('the caller answers the check-in', () => {
  it('risk words escalate to the full response, without a classifier read', async () => {
    const answer = await askedOnline();
    const { decision } = await answer("I can't do this anymore", reads('none'));
    expect(decision).toEqual({ action: 'replace', script: SCRIPT });
  });

  it('a pattern match escalates to the script', async () => {
    const answer = await askedOnline();
    expect((await answer('I want to kill myself')).decision?.action).toBe('replace');
  });

  it.each(['No.', "I'm not safe.", "I'm scared."])('"%s" escalates at once', async (said) => {
    const answer = await askedOnline();
    expect((await answer(said)).decision).toEqual({ action: 'replace', script: SCRIPT });
  });

  it.each(['What?', 'Why are you asking me that?', 'I guess.'])(
    'an unclear "%s" escalates at once',
    async (said) => {
      const answer = await askedOnline();
      expect((await answer(said)).decision).toEqual({ action: 'replace', script: SCRIPT });
    }
  );

  it.each(["Yeah, I'm fine.", "Yes, I'm safe.", "That's not what I meant."])(
    'a clear "%s" clears it and Ferni carries on',
    async (said) => {
      const answer = await askedOnline();
      const { decision, escalation } = await answer(said);
      expect(decision).toEqual({ action: 'guide', guidance: CHECK_IN_CLEARED });
      expect(escalation).toBeNull();
    }
  );

  it('a clear yes the classifier reads as imminent escalates as on main (once per call)', async () => {
    const answer = await askedOnline();
    const { escalation } = await answer("Yeah, I'm fine.", reads('imminent'));
    expect(escalation?.action).toBe('replace');
    expect(escalation).not.toMatchObject({ checkIn: 'ask' });
  });

  it('the turn pipeline escalates an unclear answer too', async () => {
    await askedOnline();
    const pipeline = startTurnCrisis(
      'What?',
      { recentTranscripts: [ONLINE], lastAgentResponse: CHECK_IN_LINE },
      { sessionId: session.services.sessionId, env: SOFT, generate: reads('none') }
    );
    const crisis = await pipeline.resolve();
    expect(crisisSummary(crisis).shouldOverrideLLM).toBe(true);
    expect(crisis.suggestedResponse).toBe(SCRIPT);
  });

  it('flag off: the same answer after the same line is untouched, as on main', async () => {
    const ctx = online(['assistant', CHECK_IN_LINE], ['user', 'What?']);
    const { decision, escalation } = await gate(ctx, reads('none'), LIVE);
    expect(decision).toEqual({ action: 'pass' });
    expect(escalation).toBeNull();
  });
});

describe('the safety review findings, through the real gate', () => {
  const BOTH_ON = { ...BOTH };

  it('two reads agreeing on imminent never reach the check-in', async () => {
    // The pipeline's read (different earlier lines: a separate classifier call) and the gate's.
    const pipeline = startTurnCrisis(
      ONLINE,
      { recentTranscripts: ["I'm waiting."], lastAgentResponse: DIALING },
      { sessionId: session.services.sessionId, env: BOTH_ON, generate: reads('imminent') }
    );
    const { escalation } = await gate(online(), reads('imminent'), BOTH_ON);
    expect(escalation).toEqual({ action: 'replace', script: SCRIPT });
    expect((await pipeline.resolve()).isCrisis).toBe(true);
  });

  it.each([
    'cancelled therapy, stopped my meds, giving my stuff away Friday',
    "here's her number… I won't be able to be there",
  ])('a warning sign escalates as on main for every read level: %s', async (said) => {
    for (const [env, generate] of [
      [BOTH_ON, reads('crisis')],
      [SOFT, reads('crisis')],
      [SOFT, reads('imminent')],
    ] as const) {
      for (const ctx of [
        request(['assistant', DIALING], ['user', said]),
        request(['user', said], ['assistant', DIALING], ['user', 'Can you call my mom?']),
      ]) {
        resetCrisisClassifierCache();
        resetCrisisSoftCheck();
        const turn = await gate(ctx, generate, env);
        const main = await (async () => {
          resetCrisisClassifierCache();
          return gate(
            ctx,
            generate,
            env === BOTH_ON ? { ...LIVE, CRISIS_AGREEMENT_GATE: 'on' } : LIVE
          );
        })();
        expect(turn, said).toEqual(main);
        expect(JSON.stringify(turn)).not.toContain(CHECK_IN_LINE);
      }
    }
  });

  it.each([
    ['I took them all.', ONLINE],
    ['I took all of them an hour ago', 'Call my dad'],
    ['I wrote everyone a message', 'Can you call my mom'],
    ['she will find me in the morning', 'call my mom'],
    ["I can't breathe", 'Can you hear me'],
  ])('an earlier unvetted turn keeps the script: "%s" then "%s"', async (before, latest) => {
    const ctx = request(['user', before], ['assistant', DIALING], ['user', latest]);
    const { escalation } = await gate(ctx, reads('imminent'));
    expect(escalation?.action).toBe('replace');
    expect(escalation).not.toMatchObject({ checkIn: 'ask' });
  });

  it('a yes after the 988 and 911 line is not a clear yes', async () => {
    await askedOnline();
    const ctx = online(
      ['assistant', CHECK_IN_LINE],
      ['assistant', CHECK_IN_REPEAT],
      ['assistant', CHECK_IN_RESOURCES],
      ['user', 'Yeah.']
    );
    const { decision } = await gate(ctx, reads('none'));
    expect(decision).not.toEqual({ action: 'guide', guidance: CHECK_IN_CLEARED });
  });

  it('a check-in the caller cut off is asked again, never read as safe', async () => {
    await askedOnline();
    const ctx = online();
    ctx.addMessage({ role: 'assistant', content: CHECK_IN_LINE, interrupted: true });
    ctx.addMessage({ role: 'user', content: "I'm fine." });
    const { escalation } = await gate(ctx, reads('none'));
    expect(escalation).toEqual({ action: 'replace', script: CHECK_IN_REPEAT, checkIn: 'repeat' });
  });

  it('a cut-off check-in still escalates when the classifier reads the reply as risky', async () => {
    await askedOnline();
    const ctx = online();
    ctx.addMessage({ role: 'assistant', content: 'Hey, I want', interrupted: true });
    ctx.addMessage({ role: 'user', content: 'Can you call my mom?' });
    const { escalation } = await gate(ctx, reads('imminent'));
    expect(escalation).toMatchObject({ action: 'replace', script: SCRIPT });
  });

  it('after a clear yes, later replies carry the resources note; before, none do', async () => {
    expect(startCrisisGate(online(), session, { env: SOFT, generate: reads('none') })?.note).toBe(
      undefined
    );
    resetCrisisClassifierCache();
    const answer = await askedOnline();
    await answer("Yeah, I'm fine.");
    const later = startCrisisGate(
      online(
        ['assistant', CHECK_IN_LINE],
        ['user', "Yeah, I'm fine."],
        ['assistant', 'Okay, good.'],
        ['user', 'Can you call my dad?']
      ),
      session,
      { env: SOFT, generate: reads('none') }
    );
    expect(later?.note).toBe(CHECK_IN_RESOURCES_NOTE);
  });
});

describe('gatedReply', () => {
  const passThrough = { wrap: (stream: ReadableStream<unknown>) => stream };
  const collect = async (stream: ReadableStream<unknown> | null): Promise<string> => {
    let out = '';
    for await (const chunk of stream as unknown as AsyncIterable<unknown>) out += String(chunk);
    return out;
  };

  it('speaks the check-in instead of the held reply, then follows the silence', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const voice = Object.assign(new EventEmitter(), {
        userData: session,
        say: vi.fn(),
      });
      const model = vi.fn(async () => {
        return new ReadableStream<unknown>({
          start(controller) {
            controller.enqueue('Sure, calling now.');
            controller.close();
          },
        });
      });
      const out = await collect(
        (await gatedReply(online(), voice, model as never, passThrough as never, {
          env: SOFT,
          generate: reads('imminent'),
        })) as never
      );
      expect(out).toBe(CHECK_IN_LINE);
      voice.emit('agent_state_changed', { newState: 'listening' });
      await vi.advanceTimersByTimeAsync(8_000);
      expect(voice.say).toHaveBeenLastCalledWith(CHECK_IN_REPEAT, { allowInterruptions: true });
    } finally {
      vi.useRealTimers();
    }
  });

  const modelSaying = (text: string) =>
    vi.fn(async (_ctx: llm.ChatContext) => {
      return new ReadableStream<unknown>({
        start(controller) {
          controller.enqueue(text);
          controller.close();
        },
      });
    });

  it('asks a cut-off check-in again, then silence gets the numbers, not a third question', async () => {
    await askedOnline();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const voice = Object.assign(new EventEmitter(), { userData: session, say: vi.fn() });
      const ctx = online();
      ctx.addMessage({ role: 'assistant', content: 'Hey, I want', interrupted: true });
      ctx.addMessage({ role: 'user', content: 'Can you call my mom?' });
      const out = await collect(
        (await gatedReply(ctx, voice, modelSaying('Sure.') as never, passThrough as never, {
          env: SOFT,
          generate: reads('none'),
        })) as never
      );
      expect(out).toBe(CHECK_IN_REPEAT);
      voice.emit('agent_state_changed', { newState: 'listening' });
      await vi.advanceTimersByTimeAsync(8_000);
      expect(voice.say).toHaveBeenCalledTimes(1);
      expect(voice.say).toHaveBeenLastCalledWith(CHECK_IN_RESOURCES, { allowInterruptions: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('after a clear yes, the model is asked with the resources note', async () => {
    const answer = await askedOnline();
    await answer("Yeah, I'm fine.");
    const model = modelSaying('Okay.');
    const ctx = online(
      ['assistant', CHECK_IN_LINE],
      ['user', "Yeah, I'm fine."],
      ['assistant', 'Okay, good.'],
      ['user', 'Can you call my dad?']
    );
    await collect(
      (await gatedReply(ctx, { userData: session }, model as never, passThrough as never, {
        env: SOFT,
        generate: reads('none'),
      })) as never
    );
    const sent = model.mock.calls[0]![0].items.map(
      (item) => (item as llm.ChatMessage).textContent ?? ''
    );
    expect(sent.at(-1)).toContain(CHECK_IN_RESOURCES_NOTE);
  });
});
