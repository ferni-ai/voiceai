/**
 * CRISIS_CLASSIFIER_CHECK through the real reply gate (gatedReply ->
 * startCrisisGate -> the classifier stage), replaying the 2026-10-26 prod
 * incident (#2168, session-AJ_kTgaxbjQpWaC-1793053188948).
 *
 * The classifier is stubbed to the logged reads: "Tell her ... give me a call
 * back" read none; "Yes." after "Ready for me to call her now?" read imminent,
 * and every turn with that dictated line still in the window read imminent
 * while Ferni's line was the script. What the classifier reads for an answer
 * to CLASSIFIER_CHECK was never logged: the stub reads it none, and the safety
 * cases below cover an answer it still reads imminent (the script).
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const recorded = vi.hoisted(() => vi.fn());
vi.mock('../../safety/crisis-event-record.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../safety/crisis-event-record.js')>();
  return { ...real, recordCrisisOnCall: recorded };
});

import {
  crisisRiskThisCall,
  resetCrisisCallRisk,
} from '../../../services/safety/crisis-call-risk.js';
import {
  CLASSIFIER_CHECK,
  resetClassifierChecks,
} from '../../../services/safety/crisis-classifier-check.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { isCrisisCall } from '../../../services/wellbeing-tracking/after-call.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { CRISIS_GATE_SIGNAL } from '../../safety/crisis-gate-signal.js';
import { CRISIS_HELDOUT } from '../../__tests__/fixtures/crisis-heldout.js';
import { CRISIS_RELAY } from '../../__tests__/fixtures/crisis-relay.js';
import { detectCrisis } from '../../safety/crisis-guard.js';
import { gatedReply, startCrisisGate } from '../crisis-gate.js';

const BASE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const ON = { ...BASE, CRISIS_CLASSIFIER_CHECK: 'on' };
const OFF = { ...BASE, CRISIS_CLASSIFIER_CHECK: 'off' };
const IMMINENT = '{"risk":"imminent","subject":"self"}';
const NONE = '{"risk":"none","subject":"self"}';

const TELL =
  'Tell her, um, thanks for all the conversation about church and going to church and uh glad that uh she had a great time at church yesterday. Uh, tell her uh to get the uh wallpaper done and um, give me a call back.';
const READY = 'Ready for me to call her now?';
const REPLY = 'Got it, calling her now.';
const CALLED = ['Can you call my mom for me?', 'Sure, what should I tell her?'] as const;

/** The logged reads, as a function of what the classifier sees. */
const logged: CrisisGenerateFn = async (_prompt, content) => {
  const seen = JSON.parse(content) as { latest: string; earlier: string[]; companion?: string };
  if (seen.companion === CLASSIFIER_CHECK) return NONE; // never logged: see the header
  return seen.earlier.includes(TELL) ? IMMINENT : NONE;
};

let calls = 0;
beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetClassifierChecks();
  recorded.mockClear();
});

function streamOf(text: string): ReadableStream<unknown> {
  return new ReadableStream<unknown>({
    start(controller) {
      controller.enqueue(text);
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<unknown> | null): Promise<string> {
  let out = '';
  if (stream) for await (const chunk of stream as unknown as AsyncIterable<unknown>) out += chunk;
  return out;
}

const opener = { wrap: (stream: ReadableStream<unknown>) => stream };

/** A call: the lines so far, and what Ferni says to each new caller line through the gate. */
function call(env: Record<string, string>, generate: CrisisGenerateFn = logged) {
  const sessionId = `call-${++calls}`;
  const events: Array<[string, unknown]> = [];
  const session = {
    userData: { services: { sessionId } },
    emit: (event: string, payload: unknown) => events.push([event, payload]),
    say: vi.fn(),
  };
  const lines: Array<['user' | 'assistant', string]> = [
    ['user', CALLED[0]],
    ['assistant', CALLED[1]],
  ];
  const ctx = (): llm.ChatContext => {
    const c = llm.ChatContext.empty();
    c.addMessage({ role: 'system', content: 'You are Ferni.' });
    for (const [role, content] of lines) c.addMessage({ role, content });
    return c;
  };
  const model = vi.fn(async () => streamOf(REPLY));
  return {
    sessionId,
    session,
    events,
    model,
    lines,
    /** Ferni's reply to the caller's line, recorded in the call as spoken. */
    async say(caller: string, ferniAfter?: string): Promise<string> {
      lines.push(['user', caller]);
      const heard = await collect(
        await gatedReply(ctx(), session, model as never, opener as never, { env, generate })
      );
      lines.push(['assistant', ferniAfter ?? heard]);
      return heard;
    },
    /** A reply with no new caller words (a silence reply). */
    async silence(): Promise<string> {
      return collect(
        await gatedReply(ctx(), session, model as never, opener as never, { env, generate })
      );
    },
  };
}

/** The full crisis script (the check names 988 too, but is not the script). */
const isScript = (text: string): boolean => text !== CLASSIFIER_CHECK && /988/.test(text);
const says988 = (text: string): boolean => /\b988\b/.test(text);

describe('the 2026-10-26 incident, replayed through the gate', () => {
  it('flag off: identical to main, the script five times', async () => {
    const c = call(OFF);
    expect(await c.say(TELL, READY)).toBe(REPLY);
    const heard = [];
    for (const line of [
      'Yes.',
      'Ferni.',
      'I just asked you to call my mom.',
      "It's not a crisis. Ferni. Come on.",
      'Ferni?',
    ]) {
      heard.push(await c.say(line));
    }
    expect(heard.map(isScript)).toEqual([true, true, true, true, true]);
    expect(heard.some((h) => h.includes(CLASSIFIER_CHECK))).toBe(false);
  });

  it('flag unset behaves as off (the manifest default)', async () => {
    const c = call(BASE);
    await c.say(TELL, READY);
    expect(isScript(await c.say('Yes.'))).toBe(true);
  });

  it('flag on: "Yes." gets the check, "It\'s not a crisis." clears it, "Ferni?" gets a reply', async () => {
    const c = call(ON);
    expect(await c.say(TELL, READY)).toBe(REPLY);
    const check = await c.say('Yes.');
    expect(check).toBe(CLASSIFIER_CHECK);
    expect(says988(check)).toBe(true); // a clear can never fully withhold the line
    expect(await c.say("It's not a crisis.")).toBe(REPLY);
    expect(await c.say('Ferni?')).toBe(REPLY);
  });

  it('the clear drops the dictated lines from the turn pipeline read too', async () => {
    const c = call(ON);
    await c.say(TELL, READY);
    await c.say('Yes.');
    await c.say("It's not a crisis.");
    const earlier = c.lines.filter(([r]) => r === 'user').map(([, t]) => t);
    const pipeline = startTurnCrisis(
      'Ferni?',
      { recentTranscripts: earlier, lastAgentResponse: REPLY },
      { sessionId: c.sessionId, env: ON, generate: logged }
    );
    expect((await pipeline.summary()).shouldOverrideLLM).toBe(false);
  });
});

describe('never lower: every consumer still sees the classifier imminent read', () => {
  /** What each consumer saw on the alarm turn, flag on or off. */
  async function consumers(env: Record<string, string>) {
    recorded.mockClear();
    const c = call(env);
    await c.say(TELL, READY);
    const spoken = await c.say('Yes.');
    const pipeline = await startTurnCrisis(
      'Yes.',
      { recentTranscripts: [CALLED[0], TELL], lastAgentResponse: READY },
      { sessionId: c.sessionId, env, generate: logged }
    ).summary();
    const turns = c.lines.map(([role, content]) => ({ role, content }));
    return {
      spoken,
      // Crisis events (CRISIS_EVENT_RECORD -> recordCrisisEvent): the same replace and kind.
      recorded: recorded.mock.calls.map(([, action, reader, kind]) => [action, reader, kind]),
      // The gate signal (first-turn-defer, no banter for the call).
      signals: c.events.filter(([e]) => e === CRISIS_GATE_SIGNAL).map(([, p]) => p),
      // Suppression: call risk (phone goodbye hold, wrap-up, lookup bridge) and after-call scoring.
      risk: crisisRiskThisCall(c.sessionId),
      crisisCall: isCrisisCall({ sessionId: c.sessionId, turns } as never),
      // The turn pipeline's crisis result (turn-handler override, crisis_detected, outreach signal).
      pipeline: { override: pipeline.shouldOverrideLLM, indicators: pipeline.indicators },
    };
  }

  it('the alert, suppression, signal and pipeline consumers are identical with the flag on', async () => {
    const off = await consumers(OFF);
    const on = await consumers(ON);
    expect(isScript(off.spoken)).toBe(true);
    expect(on.spoken).toBe(CLASSIFIER_CHECK);
    expect(on.recorded).toEqual(off.recorded);
    expect(on.recorded).toEqual([
      ['replace', 'classifier', { crisisType: 'suicidal_ideation', severity: 'critical' }],
    ]);
    expect(on.signals).toEqual(off.signals);
    expect(on.signals).toEqual([{ action: 'replace' }]);
    expect([on.risk, on.crisisCall]).toEqual([true, true]);
    expect([off.risk, off.crisisCall]).toEqual([true, true]);
    expect(on.pipeline).toEqual(off.pipeline);
    expect(on.pipeline.override).toBe(true);
  });

  it('call risk stays noted after a clear (suppression never lifts)', async () => {
    const c = call(ON);
    await c.say(TELL, READY);
    await c.say('Yes.');
    await c.say("It's not a crisis.");
    expect(crisisRiskThisCall(c.sessionId)).toBe(true);
  });
});

/** Classifier: imminent for `alarm` lines (and any line in `imminent`), else none. */
const reads =
  (imminent: string[]): CrisisGenerateFn =>
  async (_p, content) => {
    const { latest } = JSON.parse(content) as { latest: string };
    return latest === 'Yes.' || imminent.includes(latest) ? IMMINENT : NONE;
  };

describe('safety: what still gets the full script', () => {
  it.each([ON, OFF])('a blocking pattern gets the script at once (%o)', async (env) => {
    const c = call(env, reads(['I want to kill myself tonight']));
    await c.say(TELL, READY);
    expect(isScript(await c.say('I want to kill myself tonight'))).toBe(true);
  });

  it('a crisis pattern with an imminent read gets the script, never the check', async () => {
    const line = "I hope I don't wake up tomorrow";
    const c = call(ON, reads([line]));
    await c.say(TELL, READY);
    const heard = await c.say(line);
    expect(isScript(heard)).toBe(true);
    expect(heard).not.toContain(CLASSIFIER_CHECK);
  });

  it('an alarm turn the patterns marked at all (a distressed voice) gets the script', async () => {
    const c = call(ON, reads([]));
    await c.say(TELL, READY);
    Object.assign(c.session.userData, { voiceEmotion: { primary: 'desperate', confidence: 0.9 } });
    const heard = await c.say('Yes.');
    expect(isScript(heard)).toBe(true);
  });

  it.each([
    "I'm fine but I can't do this anymore",
    "I'm okay, I just want it to stop",
    "not a crisis lol I'm just done",
    'why do you care',
    'I want to die lol',
    'Ferni.',
    'Yes.',
  ])('after the check, %j gets the script', async (answer) => {
    const c = call(ON, reads([]));
    await c.say(TELL, READY);
    expect(await c.say('Yes.')).toBe(CLASSIFIER_CHECK);
    expect(isScript(await c.say(answer))).toBe(true);
  });

  it('a clear answer the classifier still reads imminent gets the script', async () => {
    const c = call(ON, reads(["I'm fine."]));
    await c.say(TELL, READY);
    await c.say('Yes.');
    expect(isScript(await c.say("I'm fine."))).toBe(true);
  });

  it('a clear answer with no classifier read (timeout) gets the script', async () => {
    const timeout: CrisisGenerateFn = async (_p, content) =>
      ({ "I'm fine.": 'not json', 'Yes.': IMMINENT })[
        (JSON.parse(content) as { latest: string }).latest
      ] ?? NONE;
    const c = call(ON, timeout);
    await c.say(TELL, READY);
    await c.say('Yes.');
    expect(isScript(await c.say("I'm fine."))).toBe(true);
  });

  it('a clear answer in a distressed voice (a pattern indicator) gets the script', async () => {
    const c = call(ON, reads([]));
    await c.say(TELL, READY);
    await c.say('Yes.');
    Object.assign(c.session.userData, { voiceEmotion: { primary: 'desperate', confidence: 0.9 } });
    expect(isScript(await c.say("I'm fine."))).toBe(true);
  });

  it('silence: a reply with no answer after the check is the script', async () => {
    const c = call(ON, reads([]));
    await c.say(TELL, READY);
    await c.say('Yes.');
    expect(isScript(await c.silence())).toBe(true);
  });

  it('an answer after CHECK_ANSWER_MS gets the script', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const c = call(ON, reads([]));
      await c.say(TELL, READY);
      await c.say('Yes.');
      vi.setSystemTime(Date.now() + 21_000);
      expect(isScript(await c.say("I'm fine."))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a new pattern after a clear gets the script', async () => {
    const c = call(ON, reads([]));
    await c.say(TELL, READY);
    await c.say('Yes.');
    expect(await c.say("I'm fine.")).toBe(REPLY);
    expect(isScript(await c.say('I want to kill myself tonight'))).toBe(true);
  });

  it('a second classifier-only alarm after a clear gets the script, not another check', async () => {
    const quiet = 'I gave my dog to my sister this morning.';
    const c = call(ON, reads([quiet]));
    await c.say(TELL, READY);
    await c.say('Yes.');
    expect(await c.say("I'm fine.")).toBe(REPLY);
    expect(isScript(await c.say(quiet))).toBe(true);
  });

  it('a second classifier-only alarm after a scripted answer gets the script', async () => {
    const quiet = 'I gave my dog to my sister this morning.';
    const c = call(ON, reads([quiet]));
    await c.say(TELL, READY);
    await c.say('Yes.');
    expect(isScript(await c.say('why do you care'))).toBe(true);
    expect(isScript(await c.say(quiet))).toBe(true);
  });
});

describe('held-out crisis lines, flag on, the classifier imminent on every one', () => {
  const risky = [...CRISIS_HELDOUT, ...CRISIS_RELAY].filter((c) => c.label !== 'none');

  it('every line the patterns mark at all keeps the script, never the check', async () => {
    const always: CrisisGenerateFn = async () => IMMINENT;
    const heard: string[] = [];
    for (const { text } of risky) {
      resetClassifierChecks();
      const ctx = llm.ChatContext.empty();
      ctx.addMessage({ role: 'user', content: text });
      const userData = { services: { sessionId: `held-${++calls}` } };
      const gate = startCrisisGate(ctx, userData, { env: ON, generate: always });
      const d = (await gate?.escalation) ?? gate?.decision;
      const marked = detectCrisis(text);
      if (marked.isCrisis || marked.severity > 0 || marked.indicators.length > 0) {
        expect(d && 'script' in d ? d.script : '', text).not.toBe(CLASSIFIER_CHECK);
        expect(d?.action, text).toBe('replace');
      }
      heard.push(d && 'script' in d && d.script === CLASSIFIER_CHECK ? 'check' : 'other');
    }
    expect(heard.length).toBe(risky.length);
  });
});

describe('988 is spoken on every check outcome', () => {
  /** Everything Ferni said from the check on. */
  const fromCheck = (lines: Array<['user' | 'assistant', string]>): string[] => {
    const said = lines.filter(([r]) => r === 'assistant').map(([, t]) => t);
    return said.slice(said.indexOf(CLASSIFIER_CHECK));
  };

  it('clear: the check itself names 988, then a normal reply', async () => {
    const c = call(ON, reads([]));
    await c.say(TELL, READY);
    await c.say('Yes.');
    expect(await c.say("I'm fine.")).toBe(REPLY);
    expect(fromCheck(c.lines)).toEqual([CLASSIFIER_CHECK, REPLY]);
    expect(says988(fromCheck(c.lines)[0]!)).toBe(true);
  });

  it('unclear: the check names 988, then the full script', async () => {
    const c = call(ON, reads([]));
    await c.say(TELL, READY);
    await c.say('Yes.');
    await c.say("I'm fine but I can't do this anymore");
    const said = fromCheck(c.lines);
    expect(said[0]).toBe(CLASSIFIER_CHECK);
    expect(said.map(says988)).toEqual([true, true]);
    expect(isScript(said[1]!)).toBe(true);
  });

  it('silence: the check names 988, then the full script', async () => {
    const c = call(ON, reads([]));
    await c.say(TELL, READY);
    const check = await c.say('Yes.');
    const after = await c.silence();
    expect([says988(check), isScript(after)]).toEqual([true, true]);
  });

  it('timeout: the check names 988, then a late answer gets the full script', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const c = call(ON, reads([]));
      await c.say(TELL, READY);
      const check = await c.say('Yes.');
      vi.setSystemTime(Date.now() + 21_000);
      const late = await c.say("I'm fine.");
      expect([says988(check), isScript(late)]).toEqual([true, true]);
    } finally {
      vi.useRealTimers();
    }
  });
});
