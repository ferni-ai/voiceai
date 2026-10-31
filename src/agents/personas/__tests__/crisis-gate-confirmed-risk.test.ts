/**
 * CRISIS_CONFIRMED_CALL_RISK through the real reply gate and turn pipeline, call by
 * call (synthetic calls; the classifier is stubbed). After a decision only the
 * classifier made, a later lone read whose after-check read finds no risk is eased;
 * real risk said late, a disclosure after a denial, a pattern, a minor, a missing
 * read and the alarm turn itself keep main's response.
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  parseClassifierReply,
  resetCrisisClassifierCache,
  startCrisisClassifier,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import {
  AFTER_CHECK_GUIDANCE,
  AFTER_CHECK_PROMPT,
  afterCheckLoneRead,
  resetConfirmedCallRisk,
} from '../../../services/safety/crisis-confirmed-risk.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { detectCrisis } from '../../../services/safety/crisis-guard.js';
import { statesUnder18 } from '../../../utils/minor-care.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { startCrisisGate, type CrisisGateDecision } from '../crisis-gate.js';

const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
/** The flag needs the agreement gate: only then are a turn's reads kept per call. */
const ON = { ...LIVE, CRISIS_AGREEMENT_GATE: 'on', CRISIS_CONFIRMED_CALL_RISK: 'on' };
const SHADOW = { ...LIVE, CRISIS_AGREEMENT_GATE: 'on', CRISIS_CONFIRMED_CALL_RISK: 'shadow' };
const NO_AGREEMENT_GATE = { ...LIVE, CRISIS_CONFIRMED_CALL_RISK: 'on' };
const NONE = '{"risk":"none","subject":"self"}';
const CRISIS = '{"risk":"crisis","subject":"self"}';
const IMMINENT = '{"risk":"imminent","subject":"self"}';

/** An after-check reply that depends on the Ferni line the caller answered. */
type ByFerni = (companion: string | undefined) => string;

/** The classifier's read per caller line, and the after-check read's, counted. */
function stub(
  reads: Record<string, string>,
  after: Record<string, string | Error | ByFerni> = {}
): CrisisGenerateFn & { afterCalls: string[] } {
  const afterCalls: string[] = [];
  const fn = async (prompt: string, content: string): Promise<string> => {
    const { latest, companion } = JSON.parse(content) as { latest: string; companion?: string };
    if (prompt === AFTER_CHECK_PROMPT) {
      afterCalls.push(latest);
      const rule = after[latest] ?? CRISIS;
      const out = typeof rule === 'function' ? rule(companion) : rule;
      if (out instanceof Error) throw out;
      return out;
    }
    return reads[latest] ?? NONE;
  };
  return Object.assign(fn, { afterCalls });
}

const FERNI: Record<CrisisGateDecision['action'], string> = {
  pass: 'Oh nice, tell me more.',
  guide: 'That sounds heavy. Are you safe right now? You can call or text 988 any time.',
  replace: 'If you are in danger, please call 911 or 988 now.',
};

let calls = 0;
beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetConfirmedCallRisk();
});

/** Each caller line through the gate in turn; Ferni's next line follows the gate's decision. */
async function call(
  lines: string[],
  generate: CrisisGenerateFn,
  env: Record<string, string> = ON,
  session: string | null = `call-${++calls}`
): Promise<CrisisGateDecision[]> {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  const userData = session ? { services: { sessionId: session } } : {};
  const out: CrisisGateDecision[] = [];
  for (const line of lines) {
    ctx.addMessage({ role: 'user', content: line });
    const gate = startCrisisGate(ctx.copy(), userData, { env, generate });
    const decision = (await gate?.escalation) ?? gate?.decision ?? { action: 'pass' };
    out.push(decision);
    ctx.addMessage({ role: 'assistant', content: FERNI[decision.action] });
  }
  return out;
}

const guidance = (d: CrisisGateDecision): string => (d.action === 'guide' ? d.guidance : d.action);
const found = (line: string): boolean => {
  const d = detectCrisis(line);
  return d.isCrisis || d.severity !== 0 || d.indicators.length > 0;
};

const ALARM = 'Dinner is tonight at six.';
const PROTEST = "What? I'm fine, it's not a crisis.";
const BENIGN = ['I made pasta today.', 'My sister is coming over.', ALARM];

describe('CRISIS_CONFIRMED_CALL_RISK: protest after a lone alarm', () => {
  const reads = { [ALARM]: IMMINENT, [PROTEST]: CRISIS };

  it('off: the protest gets full crisis guidance, as on main', async () => {
    const generate = stub(reads, { [PROTEST]: NONE });
    const out = await call([...BENIGN, PROTEST], generate, LIVE);
    expect(out[2].action).toBe('replace');
    expect(out[3].action).toBe('guide');
    expect(guidance(out[3])).toContain('[CRITICAL - USER SAFETY]');
    expect(generate.afterCalls).toEqual([]);
  });

  it('on: the protest gets the after-check guidance, which keeps 988 for any disclosure', async () => {
    const generate = stub(reads, { [PROTEST]: NONE });
    const out = await call([...BENIGN, PROTEST], generate);
    expect(out[2].action).toBe('replace'); // the alarm turn itself is never eased
    expect(guidance(out[3])).toBe(AFTER_CHECK_GUIDANCE);
    expect(AFTER_CHECK_GUIDANCE).toContain('988');
    expect(generate.afterCalls).toEqual([PROTEST]);
  });

  it('on: a later imminent read the after-check clears steps down to crisis guidance, not the script', async () => {
    const BYE = 'Okay. Bye.';
    const generate = stub({ ...reads, [BYE]: IMMINENT }, { [BYE]: NONE });
    const off = await call([...BENIGN, BYE], generate, LIVE);
    const on = await call([...BENIGN, BYE], generate);
    expect(off[3].action).toBe('replace');
    expect(on[3].action).toBe('guide');
    expect(guidance(on[3])).toContain('[CRITICAL - USER SAFETY]');
  });

  it('shadow: reads but changes nothing', async () => {
    const generate = stub(reads, { [PROTEST]: NONE });
    const out = await call([...BENIGN, PROTEST], generate, SHADOW);
    expect(guidance(out[3])).toContain('[CRITICAL - USER SAFETY]');
    await new Promise<void>((r) => {
      setTimeout(r, 0);
    });
    expect(generate.afterCalls).toEqual([PROTEST]);
  });
});

describe('CRISIS_CONFIRMED_CALL_RISK: real risk keeps main', () => {
  const LATE = "Honestly I don't see the point of anything anymore.";
  const DENY_THEN = 'I said I was fine but I have been thinking about not waking up.';

  it('risk said late after an alarm and a protest: guidance, and the call is confirmed', async () => {
    const reads = { [ALARM]: IMMINENT, [PROTEST]: CRISIS, [LATE]: CRISIS, 'Just tired.': CRISIS };
    const generate = stub(reads, { [PROTEST]: NONE, [LATE]: CRISIS, 'Just tired.': NONE });
    const out = await call([...BENIGN, PROTEST, LATE, 'Just tired.'], generate);
    expect(guidance(out[3])).toBe(AFTER_CHECK_GUIDANCE);
    expect(guidance(out[4])).toContain('[CRITICAL - USER SAFETY]');
    // Confirmed by two agreeing reads: nothing on this call is eased again, and no read is asked.
    expect(guidance(out[5])).toContain('[CRITICAL - USER SAFETY]');
    expect(generate.afterCalls).toEqual([PROTEST, LATE]);
  });

  it('deny then disclose: the disclosure keeps guidance', async () => {
    const reads = { [ALARM]: IMMINENT, [PROTEST]: CRISIS, [DENY_THEN]: CRISIS };
    const generate = stub(reads, { [PROTEST]: NONE, [DENY_THEN]: CRISIS });
    const out = await call([...BENIGN, PROTEST, DENY_THEN], generate);
    expect(out[4].action).not.toBe('pass');
    expect(guidance(out[4])).not.toBe(AFTER_CHECK_GUIDANCE);
  });

  it('two distinct reads of the alarm turn agreeing on risk confirm the call (agreement gate on)', async () => {
    const env = { ...ON, CRISIS_AGREEMENT_GATE: 'on' };
    const reads = { [ALARM]: CRISIS, [PROTEST]: CRISIS };
    const generate = stub(reads, { [PROTEST]: NONE });
    const session = `call-${++calls}`;
    const userData = { services: { sessionId: session } };
    const ctx = llm.ChatContext.empty();
    for (const line of BENIGN.slice(0, 2)) {
      ctx.addMessage({ role: 'user', content: line });
      ctx.addMessage({ role: 'assistant', content: FERNI.pass });
    }
    // The pipeline reads the alarm turn against another Ferni line: a second, separate read.
    const other = { recentTranscripts: BENIGN, lastAgentResponse: 'Sounds lovely.' };
    const pipeline = startTurnCrisis(ALARM, other, { sessionId: session, env, generate });
    ctx.addMessage({ role: 'user', content: ALARM });
    const alarm = startCrisisGate(ctx.copy(), userData, { env, generate });
    expect(guidance((await alarm?.escalation) ?? { action: 'pass' })).toContain('[CRITICAL');
    await pipeline.summary();
    ctx.addMessage({ role: 'assistant', content: FERNI.guide });
    ctx.addMessage({ role: 'user', content: PROTEST });
    const protest = startCrisisGate(ctx.copy(), userData, { env, generate });
    expect(guidance((await protest?.escalation) ?? { action: 'pass' })).toContain('[CRITICAL');
    expect(generate.afterCalls).toEqual([]);
  });

  it('a missing after-check read keeps main', async () => {
    const reads = { [ALARM]: IMMINENT, [PROTEST]: CRISIS };
    const generate = stub(reads, { [PROTEST]: new Error('timeout') });
    const out = await call([...BENIGN, PROTEST], generate);
    expect(guidance(out[3])).toContain('[CRITICAL - USER SAFETY]');
    expect(generate.afterCalls).toEqual([PROTEST]);
  });

  it('a pattern earlier on the call confirms it: no after-check read', async () => {
    const PATTERN = 'Sometimes I think about killing myself.';
    expect(detectCrisis(PATTERN).isCrisis).toBe(true);
    const reads = { [ALARM]: IMMINENT, [PROTEST]: CRISIS };
    const generate = stub(reads, { [PROTEST]: NONE });
    const out = await call([PATTERN, 'Anyway.', ALARM, PROTEST], generate);
    expect(guidance(out[3])).not.toBe(AFTER_CHECK_GUIDANCE);
    expect(generate.afterCalls).toEqual([]);
  });

  it('a caller who said they are under 18 is never eased', async () => {
    const MINOR = "I'm 15 btw.";
    expect(statesUnder18(MINOR)).toBe(true);
    const reads = { [ALARM]: IMMINENT, [PROTEST]: CRISIS };
    const generate = stub(reads, { [PROTEST]: NONE });
    const out = await call([MINOR, ...BENIGN, PROTEST], generate);
    expect(guidance(out[4])).toContain('[CRITICAL - USER SAFETY]');
    expect(generate.afterCalls).toEqual([]);
  });

  it('an unknown call is never eased', async () => {
    const reads = { [ALARM]: IMMINENT, [PROTEST]: CRISIS };
    const generate = stub(reads, { [PROTEST]: NONE });
    const out = await call([...BENIGN, PROTEST], generate, ON, null);
    expect(guidance(out[3])).toContain('[CRITICAL - USER SAFETY]');
    expect(generate.afterCalls).toEqual([]);
  });
});

describe('CRISIS_CONFIRMED_CALL_RISK: reads of one turn that agree on risk', () => {
  const AGREE = 'It has been a really rough week.';
  const LATER = 'Anyway, what were we saying?';
  const AGREED = { ...ON, CRISIS_AGREEMENT_GATE: 'on' };

  it('confirm the call before any after-check: neither that turn nor a later one is eased', async () => {
    const reads = { [ALARM]: IMMINENT, [AGREE]: CRISIS, [LATER]: CRISIS };
    const generate = stub(reads, { [AGREE]: NONE, [LATER]: NONE });
    const session = `call-${++calls}`;
    const userData = { services: { sessionId: session } };
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
    const gateTurn = async (line: string): Promise<CrisisGateDecision> => {
      ctx.addMessage({ role: 'user', content: line });
      const gate = startCrisisGate(ctx.copy(), userData, { env: AGREED, generate });
      const decision = (await gate?.escalation) ?? gate?.decision ?? { action: 'pass' };
      ctx.addMessage({ role: 'assistant', content: FERNI[decision.action] });
      return decision;
    };
    for (const line of BENIGN) await gateTurn(line); // a lone alarm: one read only
    // The pipeline reads the turn against another Ferni line: a second, separate read.
    const other = { recentTranscripts: [...BENIGN, AGREE], lastAgentResponse: 'Sounds lovely.' };
    const pipeline = startTurnCrisis(AGREE, other, { sessionId: session, env: AGREED, generate });
    const agreeTurn = await gateTurn(AGREE);
    const summary = await pipeline.summary();
    const later = await gateTurn(LATER);
    expect(guidance(agreeTurn)).toContain('[CRITICAL - USER SAFETY]');
    expect(summary.softCheck).not.toBe(true);
    expect(summary.isCrisis).toBe(true);
    expect(guidance(later)).toContain('[CRITICAL - USER SAFETY]');
    expect(generate.afterCalls).toEqual([]);
  });

  it('the pipeline confirms the call on its own agreeing reads', async () => {
    const generate = stub({ [ALARM]: IMMINENT, [AGREE]: CRISIS }, { [AGREE]: NONE });
    const session = `call-${++calls}`;
    await call(BENIGN, generate, AGREED, session); // a lone alarm
    // Another read of the turn, then the pipeline's own: two reads agree, no gate on this turn.
    const opts = { pattern: 'none', generate, env: LIVE, scope: session } as const;
    const other = { latest: AGREE, earlier: BENIGN, companion: 'Sounds lovely.' };
    await startCrisisClassifier(other, opts)?.verdict;
    const turn = startTurnCrisis(
      AGREE,
      { recentTranscripts: [...BENIGN, AGREE], lastAgentResponse: FERNI.replace },
      { sessionId: session, env: AGREED, generate }
    );
    const summary = await turn.summary();
    expect(summary.softCheck).not.toBe(true);
    expect(summary.isCrisis).toBe(true);
    expect(generate.afterCalls).toEqual([]);
  });

  it('agreement gate off: inert, main on every turn (reads cannot confirm the call)', async () => {
    const reads = { [ALARM]: IMMINENT, [AGREE]: CRISIS, [LATER]: CRISIS };
    const run = async (env: Record<string, string>) => {
      const generate = stub(reads, { [AGREE]: NONE, [LATER]: NONE });
      const session = `call-${++calls}`;
      const before = await call(BENIGN, generate, env, session);
      const other = { recentTranscripts: [...BENIGN, AGREE], lastAgentResponse: 'Sounds lovely.' };
      const pipeline = startTurnCrisis(AGREE, other, { sessionId: session, env, generate });
      const userData = { services: { sessionId: session } };
      const ctx = llm.ChatContext.empty();
      const decisions: CrisisGateDecision[] = [...before];
      for (const line of [...BENIGN, AGREE, LATER]) {
        ctx.addMessage({ role: 'user', content: line });
        if (line === AGREE || line === LATER) {
          const gate = startCrisisGate(ctx.copy(), userData, { env, generate });
          decisions.push((await gate?.escalation) ?? gate?.decision ?? { action: 'pass' });
        }
        ctx.addMessage({ role: 'assistant', content: FERNI[decisions.at(-1)?.action ?? 'pass'] });
      }
      return { decisions, summary: await pipeline.summary(), after: generate.afterCalls };
    };
    const main = await run(LIVE);
    const on = await run(NO_AGREEMENT_GATE);
    expect(on.decisions).toEqual(main.decisions);
    expect(guidance(on.decisions[3])).toContain('[CRITICAL - USER SAFETY]');
    expect(guidance(on.decisions[4])).toContain('[CRITICAL - USER SAFETY]');
    expect(on.summary).toEqual(main.summary);
    expect(on.after).toEqual([]);
  });

  it('are seen by the after-check itself, whichever path noted them first', async () => {
    const generate = stub({ [AGREE]: CRISIS }, { [AGREE]: NONE });
    const call = `call-${++calls}`;
    const lone = (latest: string, reply: string) =>
      ({
        call,
        input: { latest, earlier: [], companion: 'Sounds lovely.' },
        verdict: parseClassifierReply(reply),
        detection: detectCrisis(latest),
        pattern: 'none',
        source: 'gate',
        env: ON,
        generate,
      }) as const;
    expect(await afterCheckLoneRead(lone(ALARM, IMMINENT))).toBeNull(); // the alarm
    // Two separate reads of the turn, with no gate or pipeline to note their agreement.
    const opts = { pattern: 'none', generate, env: LIVE, scope: call } as const;
    for (const companion of ['Sounds lovely.', 'Oh, tell me more.']) {
      await startCrisisClassifier({ latest: AGREE, earlier: [], companion }, opts)?.verdict;
    }
    expect(await afterCheckLoneRead(lone(AGREE, CRISIS))).toBeNull();
    expect(generate.afterCalls).toEqual([]);
  });
});

describe('CRISIS_CONFIRMED_CALL_RISK: each after-check read is for its own turn', () => {
  it('a non-Latin disclosure soon after a non-Latin "I\'m fine" is read afresh', async () => {
    const FINE = 'Я в порядке, правда.';
    const DISCLOSE = 'Я больше не хочу жить.';
    expect(found(FINE) || found(DISCLOSE)).toBe(false);
    const reads = { [ALARM]: IMMINENT, [FINE]: CRISIS, [DISCLOSE]: CRISIS };
    const generate = stub(reads, { [FINE]: NONE, [DISCLOSE]: CRISIS });
    const off = await call([...BENIGN, FINE, DISCLOSE], generate, LIVE);
    const on = await call([...BENIGN, FINE, DISCLOSE], generate);
    expect(guidance(on[3])).toBe(AFTER_CHECK_GUIDANCE);
    expect(on[4]).toEqual(off[4]); // main's decision, not the cached easing
    expect(guidance(on[4])).toContain('[CRITICAL - USER SAFETY]');
    expect(generate.afterCalls).toEqual([FINE, DISCLOSE]);
  });

  it('"I don\'t know." answering a risk question is not served the read of an earlier one', async () => {
    const IDK = "I don't know.";
    const ASKED = 'Are you having thoughts of ending your life?';
    const reads = { [ALARM]: IMMINENT, [IDK]: CRISIS };
    const generate = stub(reads, { [IDK]: (ferni) => (ferni === ASKED ? CRISIS : NONE) });
    const session = `call-${++calls}`;
    await call(BENIGN, generate, ON, session);
    const userData = { services: { sessionId: session } };
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
    const out: CrisisGateDecision[] = [];
    for (const ferni of ['What should we cook for her?', ASKED]) {
      ctx.addMessage({ role: 'assistant', content: ferni });
      ctx.addMessage({ role: 'user', content: IDK });
      const gate = startCrisisGate(ctx.copy(), userData, { env: ON, generate });
      out.push((await gate?.escalation) ?? gate?.decision ?? { action: 'pass' });
    }
    expect(guidance(out[0])).toBe(AFTER_CHECK_GUIDANCE);
    expect(guidance(out[1])).toContain('[CRITICAL - USER SAFETY]');
    // The same words read as risk just before agree with it: confirmed, so no after-check.
    expect(generate.afterCalls).toEqual([IDK]);
  });
});

describe('CRISIS_CONFIRMED_CALL_RISK: the turn pipeline', () => {
  it('eases the same protest, sharing one after-check read with the gate', async () => {
    const reads = { [ALARM]: IMMINENT, [PROTEST]: CRISIS };
    const generate = stub(reads, { [PROTEST]: NONE });
    const session = `call-${++calls}`;
    // The gate and the pipeline see the same turn: same lines, same Ferni line before it.
    const gateOut = (await call([...BENIGN, PROTEST], generate, ON, session)).slice(3);
    const turn = startTurnCrisis(
      PROTEST,
      { recentTranscripts: [...BENIGN, PROTEST], lastAgentResponse: FERNI.replace },
      { sessionId: session, env: ON, generate }
    );
    const summary = await turn.summary();
    expect(guidance(gateOut[0])).toBe(AFTER_CHECK_GUIDANCE);
    expect(summary.softCheck).toBe(true);
    expect(summary.softGuidance).toBe(AFTER_CHECK_GUIDANCE);
    expect(summary.isCrisis).toBe(false);
    expect(generate.afterCalls).toEqual([PROTEST]);
  });

  it('never eases the alarm turn itself, even after the gate noted its alarm', async () => {
    const reads = { 'I made pasta today.': NONE, [ALARM]: CRISIS };
    const generate = stub(reads, { [ALARM]: NONE });
    const session = `call-${++calls}`;
    const gateOut = await call(BENIGN, generate, ON, session);
    const turn = startTurnCrisis(
      ALARM,
      { recentTranscripts: BENIGN, lastAgentResponse: FERNI.pass },
      { sessionId: session, env: ON, generate }
    );
    expect(guidance(gateOut[2])).toContain('[CRITICAL - USER SAFETY]');
    expect((await turn.summary()).isCrisis).toBe(true);
    expect(generate.afterCalls).toEqual([]);
  });

  it('off: the pipeline keeps the crisis read', async () => {
    const reads = { [ALARM]: IMMINENT, [PROTEST]: CRISIS };
    const generate = stub(reads, { [PROTEST]: NONE });
    const session = `call-${++calls}`;
    await call(BENIGN, generate, LIVE, session);
    const turn = startTurnCrisis(
      PROTEST,
      { recentTranscripts: [...BENIGN, PROTEST], lastAgentResponse: FERNI.replace },
      { sessionId: session, env: LIVE, generate }
    );
    expect((await turn.summary()).isCrisis).toBe(true);
  });
});
