/**
 * exits-held.ts through the real turn builder and the real reply gate: no note
 * that sends the caller off or bars a question rides a reply with crisis
 * guidance, or any turn of a call with crisis risk noted. The same notes still
 * reach an ordinary goodbye. Synthetic phrases only.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it, vi } from 'vitest';

const riskCheck = vi.hoisted(() => ({ throws: false }));
vi.mock('../../../services/safety/crisis-call-risk.js', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('../../../services/safety/crisis-call-risk.js')>();
  return {
    ...real,
    crisisRiskNoted: (...args: Parameters<typeof real.crisisRiskNoted>) => {
      if (riskCheck.throws) throw new Error('risk store unavailable');
      return real.crisisRiskNoted(...args);
    },
  };
});

import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import { resetCrisisClassifierCache } from '../../../services/safety/crisis-classifier.js';
import { buildCrisisGuidance, detectCrisis } from '../../safety/crisis-guard.js';
import { gatedReply } from '../crisis-gate.js';
import { setDirector } from '../director-notes.js';
import { exitsHeld } from '../exits-held.js';
import { FIRST_CALL_NOTE, FIRST_GOODBYE_NOTE } from '../first-call-rapport.js';
import { SHORT_GOODBYE_NOTE } from '../happy-exits.js';
import { withTurnReminder } from '../turn-request.js';
import { QUESTION_LINE } from '../turn-shape.js';
import { setWrapUp } from '../wrap-up.js';

const CRISIS_GOODBYE = "I should go, I can't do this anymore";
const PATTERN_GOODBYE = "I should go, I hope I don't wake up tomorrow";
const GUIDANCE_MARK = '[CRITICAL - USER SAFETY]';
const PLAIN_GOODBYE = 'ok gotta run, bye!';
const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const crisisRead = async () => '{"risk":"crisis","subject":"self"}';
const HAPPY_EXIT_MARK = 'No question of any kind';
const ATTUNE_MARK = '[Meet them where they are:';
const WRAP_MARK = '[Wrapping up: synthetic loop]';
const HARD_RULE = '[The director has had to say this twice: no question: a short reaction only.]';

const FLAGS = [
  'FIRST_CALL_RAPPORT',
  'HAPPY_EXITS',
  'SHORT_GOODBYE',
  'ATTUNE',
  'LISTEN_FIRST',
] as const;
afterEach(() => {
  for (const flag of FLAGS) delete process.env[flag];
  vi.restoreAllMocks();
  riskCheck.throws = false;
  resetCrisisCallRisk();
  resetCrisisClassifierCache();
});

/** A known account on its first call, on its own call id. */
const firstCall = (sessionId: string) => ({
  userData: { userId: 'u_synthetic_1', isReturningUser: false, services: { sessionId } },
});

function chat(said: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  ctx.addMessage({ role: 'assistant', content: 'Hey, good to meet you.' });
  ctx.addMessage({ role: 'user', content: 'Hi. Long day, had a work thing.' });
  ctx.addMessage({ role: 'assistant', content: 'Oh yeah? What kind of work thing?' });
  ctx.addMessage({ role: 'user', content: said });
  return ctx;
}

const lastText = (ctx: llm.ChatContext): string =>
  (ctx.items.at(-1) as { textContent?: string }).textContent ?? '';

const reminder = (said: string, session: object, crisis = false): string =>
  lastText(withTurnReminder(chat(said), session, crisis ? { shape: false, closeLoop: false } : {}));

/** Every request the reply gate sends the model for these words, in order. */
async function gatedRequests(
  said: string,
  session: { userData: unknown },
  options: Parameters<typeof gatedReply>[4] = { env: PATTERNS_ONLY }
): Promise<string[]> {
  const sent: string[] = [];
  const model = async (ctx: llm.ChatContext) => {
    sent.push(lastText(ctx));
    return new ReadableStream({ start: (c) => c.close() });
  };
  const opener = { wrap: (s: ReadableStream<unknown>) => s };
  const out = await gatedReply(chat(said), session, model as never, opener as never, options);
  for await (const _ of (out ?? []) as AsyncIterable<unknown>) void _; // let a held reply settle
  return sent;
}

describe('FIRST_GOODBYE_NOTE beside crisis guidance (the 2026-10-31 finding)', () => {
  it('classifier-guided: "I should go, I can\'t do this anymore" gets guidance, no goodbye note', async () => {
    process.env.FIRST_CALL_RAPPORT = 'on';
    const sent = await gatedRequests(CRISIS_GOODBYE, firstCall('first-call-crisis'), {
      env: LIVE,
      generate: crisisRead,
    });
    expect(sent).toHaveLength(2); // the held reply, then the one asked with guidance
    const guided = sent[1]!;
    expect(guided).toContain(GUIDANCE_MARK);
    expect(guided).not.toContain(FIRST_GOODBYE_NOTE);
    expect(guided).not.toContain("They're heading off");
  });

  it('pattern-guided: a first-call goodbye with passive ideation gets guidance, no goodbye note', async () => {
    process.env.FIRST_CALL_RAPPORT = 'on';
    const guidance = buildCrisisGuidance(detectCrisis(PATTERN_GOODBYE));
    const [sent] = await gatedRequests(PATTERN_GOODBYE, firstCall('first-call-pattern'));
    expect(sent).toContain(guidance);
    expect(sent).not.toContain(FIRST_GOODBYE_NOTE);
  });

  it('a plain first-call goodbye still gets the goodbye note, and no guidance', async () => {
    process.env.FIRST_CALL_RAPPORT = 'on';
    const [sent] = await gatedRequests(PLAIN_GOODBYE, firstCall('first-call-plain'));
    expect(sent).toContain(FIRST_GOODBYE_NOTE);
    expect(sent).not.toContain(GUIDANCE_MARK);
  });

  it('a later goodbye on a first call with crisis risk noted gets no goodbye note', () => {
    process.env.FIRST_CALL_RAPPORT = 'on';
    expect(reminder(PLAIN_GOODBYE, firstCall('risky'))).toContain(FIRST_GOODBYE_NOTE);
    noteCrisisRisk('risky');
    expect(reminder(PLAIN_GOODBYE, firstCall('risky'))).not.toContain(FIRST_GOODBYE_NOTE);
    expect(reminder(PLAIN_GOODBYE, firstCall('calm'))).toContain(FIRST_GOODBYE_NOTE);
  });
});

describe('HAPPY_EXITS and SHORT_GOODBYE', () => {
  const session = (id: string) => ({ userData: { services: { sessionId: id } } });

  it('HAPPY_EXITS: a calm goodbye gets the note; crisis guidance or risk on the call, none', () => {
    process.env.HAPPY_EXITS = 'on';
    expect(reminder(PLAIN_GOODBYE, session('calm'))).toContain(HAPPY_EXIT_MARK);
    expect(reminder(PLAIN_GOODBYE, session('guided'), true)).not.toContain(HAPPY_EXIT_MARK);
    noteCrisisRisk('risky');
    expect(reminder(PLAIN_GOODBYE, session('risky'))).not.toContain(HAPPY_EXIT_MARK);
  });

  it('SHORT_GOODBYE: a calm goodbye gets the note; risk on the call, none', () => {
    process.env.SHORT_GOODBYE = 'on';
    expect(reminder(PLAIN_GOODBYE, session('calm'))).toContain(SHORT_GOODBYE_NOTE);
    noteCrisisRisk('risky');
    expect(reminder(PLAIN_GOODBYE, session('risky'))).not.toContain(SHORT_GOODBYE_NOTE);
  });
});

describe('WRAP_UP, DIRECTOR_ESCALATE and ATTUNE on a call with crisis risk', () => {
  const session = (id: string) => ({ userData: { services: { sessionId: id } } });

  it('WRAP_UP: the close-the-loop goodbye only on a call without risk', () => {
    const calm = session('calm');
    const risky = session('risky');
    for (const s of [calm, risky]) setWrapUp(s, { noteFor: () => WRAP_MARK } as never);
    noteCrisisRisk('risky');
    expect(reminder(PLAIN_GOODBYE, calm)).toContain(WRAP_MARK);
    expect(reminder(PLAIN_GOODBYE, risky)).not.toContain(WRAP_MARK);
  });

  it('DIRECTOR_ESCALATE: a "no question" hard rule only on a call without risk', () => {
    const director = { current: () => [], told: () => '', hardRule: () => HARD_RULE };
    const calm = session('calm');
    const risky = session('risky');
    for (const s of [calm, risky]) setDirector(s, director as never);
    noteCrisisRisk('risky');
    expect(reminder('Fine I guess.', calm)).toContain(HARD_RULE);
    expect(reminder('Fine I guess.', risky)).not.toContain(HARD_RULE);
  });

  it('ATTUNE: "short on time, no question" only on a call without risk', () => {
    process.env.ATTUNE = 'all';
    const hurried = 'gotta run, meeting in five minutes';
    expect(reminder(hurried, session('calm'))).toContain(ATTUNE_MARK);
    noteCrisisRisk('risky');
    expect(reminder(hurried, session('risky'))).not.toContain(ATTUNE_MARK);
  });
});

describe('call risk that cannot be read holds the notes (fails closed)', () => {
  const firstCallNoId = { userData: { userId: 'u_synthetic_1', isReturningUser: false } };

  it('a risk check that throws: no goodbye, wrap-up or no-question note', () => {
    process.env.FIRST_CALL_RAPPORT = 'on';
    process.env.HAPPY_EXITS = 'on';
    const calm = firstCall('calm');
    setWrapUp(calm, { noteFor: () => WRAP_MARK } as never);
    const before = reminder(PLAIN_GOODBYE, calm);
    expect(before).toContain(FIRST_GOODBYE_NOTE);
    expect(before).toContain(HAPPY_EXIT_MARK);
    expect(before).toContain(WRAP_MARK);
    riskCheck.throws = true;
    const after = reminder(PLAIN_GOODBYE, calm);
    expect(after).not.toContain(FIRST_GOODBYE_NOTE);
    expect(after).not.toContain(HAPPY_EXIT_MARK);
    expect(after).not.toContain(WRAP_MARK);
    setWrapUp(calm, null);
  });

  it('no call id to read risk by: no goodbye or no-question note', () => {
    process.env.FIRST_CALL_RAPPORT = 'on';
    process.env.HAPPY_EXITS = 'on';
    const asked = reminder(PLAIN_GOODBYE, firstCallNoId);
    expect(asked).not.toContain(FIRST_GOODBYE_NOTE);
    expect(asked).not.toContain(HAPPY_EXIT_MARK);
  });
});

describe('exitsHeld', () => {
  it('holds on crisis guidance, on risk noted, with no call id, and when the risk check throws', () => {
    expect(exitsHeld('calm', true)).toBe(true);
    expect(exitsHeld('calm', false)).toBe(false);
    expect(exitsHeld(undefined, false)).toBe(true);
    noteCrisisRisk('risky');
    expect(exitsHeld('risky', false)).toBe(true);
    riskCheck.throws = true;
    expect(exitsHeld('calm', false)).toBe(true);
  });
});

describe('director notes on a held turn: crisis guidance comes only from the crisis path', () => {
  const NOTE = 'Too many questions: stop asking and let them go.';
  const TOLD = '[Already said this call: synthetic told line]';
  const directed = (id: string) => {
    const session = firstCall(id);
    setDirector(session, { current: () => [NOTE], told: () => TOLD, hardRule: () => '' } as never);
    return session;
  };

  it('a crisis-guided request carries no director note; a calm turn keeps them', async () => {
    const calm = reminder(PLAIN_GOODBYE, directed('director-calm'));
    expect(calm).toContain(NOTE);
    expect(calm).toContain(TOLD);
    const sent = await gatedRequests(CRISIS_GOODBYE, directed('director-crisis'), {
      env: LIVE,
      generate: crisisRead,
    });
    const guided = sent[1]!;
    expect(guided).toContain(GUIDANCE_MARK);
    expect(guided).not.toContain(NOTE);
    expect(guided).not.toContain(TOLD);
  });

  it('a turn on a call with crisis risk noted carries no director note', () => {
    const session = directed('director-risky');
    expect(reminder('Fine I guess.', session)).toContain(NOTE);
    noteCrisisRisk('director-risky');
    const held = reminder('Fine I guess.', session);
    expect(held).not.toContain(NOTE);
    expect(held).not.toContain(TOLD);
  });
});

describe('question-barring style lines on a call with crisis risk noted', () => {
  /** One session, its seed fixed, so the same words draw the same turn shape. */
  const seeded = (id: string) => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    return { userData: { services: { sessionId: id } } };
  };

  it('turn shape: "No question this time" on a calm call, none once risk is noted', () => {
    const session = seeded('shape-risky');
    const said = 'Work was fine, I watched a movie after.';
    expect(reminder(said, session)).toContain(QUESTION_LINE.none);
    noteCrisisRisk('shape-risky');
    expect(reminder(said, session)).not.toMatch(/No question this time/);
  });

  it('look-up reply: "No question this time" on a calm call, none once risk is noted', () => {
    const session = seeded('lookup-risky');
    const asked = 'Can you check the weather for tomorrow?';
    const calm = reminder(asked, session);
    expect(calm).toContain('call the tool for it now');
    expect(calm).toContain(QUESTION_LINE.none);
    noteCrisisRisk('lookup-risky');
    expect(reminder(asked, session)).not.toMatch(/No question this time/);
  });

  it('LISTEN_FIRST: its no-question line on a calm call, none once risk is noted', () => {
    process.env.LISTEN_FIRST = 'on';
    const session = seeded('listen-risky');
    const lowEnergy = (): llm.ChatContext => {
      const ctx = llm.ChatContext.empty();
      ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
      ctx.addMessage({ role: 'user', content: 'Hey.' });
      ctx.addMessage({ role: 'assistant', content: 'Hey you. How are you doing?' });
      ctx.addMessage({ role: 'user', content: 'Tired.' });
      ctx.addMessage({ role: 'assistant', content: 'Long day?' });
      ctx.addMessage({ role: 'user', content: 'Yeah.' });
      return ctx;
    };
    const LISTEN_NO_QUESTION = 'No question this time: a short, warm reaction';
    expect(lastText(withTurnReminder(lowEnergy(), session))).toContain(LISTEN_NO_QUESTION);
    noteCrisisRisk('listen-risky');
    expect(lastText(withTurnReminder(lowEnergy(), session))).not.toMatch(/No question this time/);
  });
});

describe('the first-call note on a crisis turn', () => {
  it('a crisis turn drops the whole first-call note; a calm first-call turn keeps it', () => {
    process.env.FIRST_CALL_RAPPORT = 'on';
    const said = 'Hi. Long day, had a work thing.';
    expect(reminder(said, firstCall('first-calm'))).toContain(FIRST_CALL_NOTE);
    expect(reminder(said, firstCall('first-guided'), true)).not.toContain(FIRST_CALL_NOTE);
  });
});
