/**
 * CRISIS_INDEPENDENT_AGREEMENT through the real reply gate, turn pipeline and classifier
 * (synthetic calls, fictional lines; the model is stubbed per caller line and prompt).
 *
 * The lock: one false alarm, read by both the gate and the pipeline, counted as two reads that
 * agree. That confirmed the call, so every later turn (the caller pushing back on Ferni's safety
 * talk) kept crisis guidance until hang-up. And a lone read with no second prompt marked the call
 * as agreed risk, so no later split read was eased. With the flag on, one reader counts once;
 * the read without the everyday rules is a floor under the read with them, so the two are one
 * reader. Real risk (by the after-check), v3's second read agreeing, and the patterns confirm.
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it } from 'vitest';
import { hasRiskContent, SOFT_CRISIS_CHECK } from '../../../services/safety/crisis-agreement.js';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  CRISIS_EVERYDAY_RULES,
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import {
  AFTER_CHECK_GUIDANCE,
  AFTER_CHECK_PROMPT,
  resetConfirmedCallRisk,
} from '../../../services/safety/crisis-confirmed-risk.js';
import { detectCrisis } from '../../../services/safety/crisis-guard.js';
import { resetImminentAgreement } from '../../../services/safety/crisis-imminent-agreement.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { startCrisisGate, type CrisisGateDecision } from '../crisis-gate.js';

type Env = Record<string, string>;
type Risk = 'imminent' | 'crisis' | 'none';
const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
/** Main's set for the lock: reads kept per call, and call risk counted only when confirmed. */
const MAIN = { ...LIVE, CRISIS_AGREEMENT_GATE: 'on', CRISIS_CONFIRMED_CALL_RISK: 'on' };
const FIXED = { ...MAIN, CRISIS_INDEPENDENT_AGREEMENT: 'on' };

/**
 * Per caller line: the classifier's read, the read without the everyday rules, v3's second read
 * (CRISIS_CLASSIFIER_SECOND_READ), the after-check.
 */
interface Line {
  read: Risk;
  plain?: Risk;
  v3?: Risk;
  after?: Risk;
}
/** A sentence only v3's additions to the prompt carry (crisis-classifier-v3.ts). */
const V3_SENTENCE = 'Quiet preparation is often said as plain logistics';
const reply = (risk: Risk): string => JSON.stringify({ risk, subject: 'self' });

function model(lines: Record<string, Line>): CrisisGenerateFn & { asked: string[] } {
  const asked: string[] = [];
  const fn = async (prompt: string, content: string): Promise<string> => {
    const { latest } = JSON.parse(content) as { latest: string };
    const line = lines[latest] ?? { read: 'none' };
    if (prompt === AFTER_CHECK_PROMPT) {
      asked.push(`after:${latest}`);
      return reply(line.after ?? 'crisis');
    }
    if (prompt.includes(V3_SENTENCE)) {
      asked.push(`v3:${latest}`);
      return reply(line.v3 ?? 'none'); // v3 agrees only where a line says so
    }
    // Without the everyday rules in the prompt: the read without them, when the line has one.
    const plain = line.plain !== undefined && !prompt.includes(CRISIS_EVERYDAY_RULES.trim());
    asked.push(`${plain ? 'plain' : 'read'}:${latest}`);
    return reply(plain && line.plain ? line.plain : line.read);
  };
  return Object.assign(fn, { asked });
}

const FERNI: Record<CrisisGateDecision['action'], string> = {
  pass: 'Oh nice, tell me more.',
  guide: 'That sounds heavy. Are you safe right now? You can call or text 988 any time.',
  replace: 'If you are in danger, please call 911 or 988 now.',
};
const guidance = (d: CrisisGateDecision): string => (d.action === 'guide' ? d.guidance : d.action);
const found = (line: string): boolean => {
  const d = detectCrisis(line);
  return d.isCrisis || d.severity !== 0 || d.indicators.length > 0;
};

let calls = 0;
/** Forget every read: runs are shared across calls with the same words. */
function fresh(): void {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetConfirmedCallRisk();
  resetImminentAgreement();
}
beforeEach(fresh);

interface Turn {
  gate: CrisisGateDecision;
  pipeline: { isCrisis: boolean; softCheck?: boolean; softGuidance?: string };
}

/**
 * Each caller line read by the pipeline and the gate, as on a live call. The pipeline sees the
 * same Ferni line the gate does (both share one run, counted once on main too), or another one
 * on the turns in `otherFerni`: a second run of the same prompt, as when a reply is cut or a
 * turn split (crisis-gate-turn-reads.ts).
 */
async function call(
  lines: string[],
  generate: CrisisGenerateFn,
  env: Env,
  otherFerni: readonly string[] = []
): Promise<Turn[]> {
  const sessionId = `riley-test-call-${++calls}`;
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  let ferni: string | undefined;
  const out: Turn[] = [];
  for (const [i, line] of lines.entries()) {
    const lastAgentResponse = otherFerni.includes(line) ? 'Sounds lovely.' : ferni;
    const recentTranscripts = lines.slice(0, i + 1);
    const turn = startTurnCrisis(
      line,
      { recentTranscripts, lastAgentResponse },
      {
        sessionId,
        env,
        generate,
      }
    );
    ctx.addMessage({ role: 'user', content: line });
    const started = startCrisisGate(ctx.copy(), { services: { sessionId } }, { env, generate });
    const gate = (await started?.escalation) ?? started?.decision ?? { action: 'pass' };
    out.push({ gate, pipeline: await turn.summary() });
    ferni = FERNI[gate.action];
    ctx.addMessage({ role: 'assistant', content: ferni });
  }
  return out;
}

const BENIGN = ['I made pasta today.', 'My sister is coming over.'];
const ALARM = 'Dinner is tonight at six.';
const PUSHBACK = "What? I'm fine, it's not a crisis.";
const AGAIN = 'Seriously, I only meant dinner with my sister.';
/** The 11-18 shape: an alarm only the classifier read, then pushback read against Ferni's safety talk. */
const LOCK_LINES = [...BENIGN, ALARM, PUSHBACK, AGAIN];
const LOCK = {
  [ALARM]: { read: 'imminent', after: 'none' },
  [PUSHBACK]: { read: 'crisis', after: 'none' },
  [AGAIN]: { read: 'imminent', after: 'none' },
} satisfies Record<string, Line>;

describe('CRISIS_INDEPENDENT_AGREEMENT: the lock replay', () => {
  it('off: one alarm both paths read confirms the call, and every later turn stays locked', async () => {
    const generate = model(LOCK);
    const out = await call(LOCK_LINES, generate, MAIN, LOCK_LINES);
    expect(generate.asked.filter((a) => a === `read:${ALARM}`)).toHaveLength(2);
    expect(out[2].gate.action).toBe('replace');
    expect(guidance(out[3].gate)).toContain('[CRITICAL - USER SAFETY]');
    expect(out[4].gate.action).toBe('replace');
    expect(out.slice(2).every((t) => t.pipeline.isCrisis)).toBe(true);
    expect(generate.asked.filter((a) => a.startsWith('after:'))).toEqual([]);
  });

  it('on: the alarm turn keeps its script, and the next turn is eased', async () => {
    const generate = model(LOCK);
    const out = await call(LOCK_LINES, generate, FIXED, LOCK_LINES);
    expect(generate.asked.filter((a) => a === `read:${ALARM}`)).toHaveLength(2);
    expect(out[2].gate.action).toBe('replace');
    expect(out[2].pipeline.isCrisis).toBe(true);
    expect(guidance(out[3].gate)).toBe(AFTER_CHECK_GUIDANCE);
    expect(out[3].pipeline.softGuidance).toBe(AFTER_CHECK_GUIDANCE);
    // An imminent read the after-check clears steps down to crisis guidance, never less.
    expect(out[4].gate.action).toBe('guide');
    expect(guidance(out[4].gate)).toContain('[CRITICAL - USER SAFETY]');
    // Each path asks its own after-check (they saw different Ferni lines): only pushback is asked.
    const afterChecks = new Set(generate.asked.filter((a) => a.startsWith('after:')));
    expect([...afterChecks]).toEqual([`after:${PUSHBACK}`, `after:${AGAIN}`]);
  });
});

describe('CRISIS_INDEPENDENT_AGREEMENT: true crisis lines after a false alarm', () => {
  /** A classifier-only risk line after the alarm, its after-check agreeing; then pushback. */
  async function afterAlarm(
    line: string,
    risk: 'crisis' | 'imminent',
    env: Env = FIXED
  ): Promise<Turn[]> {
    expect(found(line)).toBe(false); // classifier-only: the after-check decides
    const generate = model({ ...LOCK, [line]: { read: risk, plain: risk, after: risk } });
    const lines = [...BENIGN, ALARM, line, PUSHBACK];
    const out = await call(lines, generate, env, lines);
    expect(out[3].pipeline.isCrisis).toBe(true);
    // The after-check's risk confirms the call: the pushback after it is not eased.
    expect(guidance(out[4].gate)).toContain('[CRITICAL - USER SAFETY]');
    expect(generate.asked).not.toContain(`after:${PUSHBACK}`);
    return out;
  }

  it('risk said late keeps crisis guidance with the flag on, and confirms the call', async () => {
    const out = await afterAlarm("Honestly I don't see the point of anything anymore.", 'crisis');
    expect(guidance(out[3].gate)).toContain('[CRITICAL - USER SAFETY]');
  });

  it('a plan only the classifier reads keeps the 911 script with the flag on', async () => {
    const out = await afterAlarm(
      "I wrote the letters and I'm doing it once they leave.",
      'imminent'
    );
    expect(out[3].gate.action).toBe('replace');
  });

  it('risk said late, read with and without the everyday rules, still confirms the call', async () => {
    const LATE = "I'm done with all of it, honestly.";
    expect(hasRiskContent(LATE)).toBe(true); // read with the everyday rules and without them
    const out = await afterAlarm(LATE, 'crisis', {
      ...FIXED,
      CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
    });
    expect(guidance(out[3].gate)).toContain('[CRITICAL - USER SAFETY]');
  });

  it('a line the patterns read keeps the script with no after-check', async () => {
    const line = 'I want to kill myself tonight.';
    expect(found(line)).toBe(true);
    const generate = model({ ...LOCK, [line]: { read: 'imminent', after: 'none' } });
    const lines = [...BENIGN, ALARM, line];
    const out = await call(lines, generate, FIXED, lines);
    expect(out[3].gate.action).toBe('replace');
    expect(out[3].pipeline.isCrisis).toBe(true);
    expect(generate.asked).not.toContain(`after:${line}`);
  });
});

describe('CRISIS_INDEPENDENT_AGREEMENT: what counts as agreement', () => {
  it('the same prompt asked twice for the alarm turn counts once', async () => {
    const lines = [...BENIGN, ALARM, PUSHBACK];
    const off = model(LOCK);
    const on = model(LOCK);
    const main = await call(lines, off, MAIN, [ALARM]);
    fresh();
    const fixed = await call(lines, on, FIXED, [ALARM]);
    // Two runs of one prompt: the pipeline read the alarm against another Ferni line.
    expect(on.asked.filter((a) => a === `read:${ALARM}`)).toHaveLength(2);
    expect(guidance(main[3].gate)).toContain('[CRITICAL - USER SAFETY]');
    expect(off.asked).not.toContain(`after:${PUSHBACK}`);
    expect(guidance(fixed[3].gate)).toBe(AFTER_CHECK_GUIDANCE);
    expect(on.asked).toContain(`after:${PUSHBACK}`);
  });

  it('the read with and without the everyday rules is one reader: the next turn gets the after-check', async () => {
    const DONE = "I'm so done with this week.";
    expect(hasRiskContent(DONE)).toBe(true); // read with the everyday rules and without them
    const done = {
      ...LOCK,
      [DONE]: { read: 'crisis', plain: 'crisis', after: 'none' },
    } satisfies Record<string, Line>;
    const lines = [...BENIGN, DONE, PUSHBACK];
    const rules = { CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on' };
    const main = model(done);
    const off = await call(lines, main, { ...MAIN, ...rules });
    fresh();
    const generate = model(done);
    const out = await call(lines, generate, { ...FIXED, ...rules });
    // One shared run: the gate and the pipeline both read the turn from it.
    expect(generate.asked.filter((a) => a === `read:${DONE}`)).toHaveLength(1);
    expect(generate.asked).toContain(`plain:${DONE}`);
    // One shared run is one read on main too: unconfirmed with the flag off and on.
    expect(guidance(off[3].gate)).toBe(AFTER_CHECK_GUIDANCE);
    expect(main.asked).toContain(`after:${PUSHBACK}`);
    expect(guidance(out[2].gate)).toContain('[CRITICAL - USER SAFETY]'); // the turn keeps its read
    expect(guidance(out[3].gate)).toBe(AFTER_CHECK_GUIDANCE);
    expect(generate.asked).toContain(`after:${PUSHBACK}`);
    expect(out.map((t) => t.gate)).toEqual(off.map((t) => t.gate));
  });

  it('a risk-word alarm with the everyday rules on: the pushback after it is eased', async () => {
    const rules = { CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on' };
    const LEVEL = "This level is killing me, I'm done with it.";
    expect(hasRiskContent(LEVEL)).toBe(true);
    expect(found(LEVEL)).toBe(false);
    const lines = [...BENIGN, LEVEL, PUSHBACK, AGAIN];
    const alarm = { read: 'imminent', plain: 'imminent', after: 'none' } satisfies Line;
    // Each turn read by two runs, each asking both prompts.
    const main = model({ ...LOCK, [LEVEL]: alarm });
    const off = await call(lines, main, { ...MAIN, ...rules }, lines);
    expect(guidance(off[3].gate)).toContain('[CRITICAL - USER SAFETY]'); // main: locked
    expect(main.asked.filter((a) => a.startsWith('after:'))).toEqual([]);
    fresh();
    const generate = model({ ...LOCK, [LEVEL]: alarm });
    const out = await call(lines, generate, { ...FIXED, ...rules }, lines);
    expect(generate.asked).toContain(`plain:${LEVEL}`);
    expect(out[2].gate.action).toBe('replace'); // the alarm turn itself keeps its script
    expect(guidance(out[3].gate)).toBe(AFTER_CHECK_GUIDANCE);
    expect(out[4].gate.action).toBe('guide');
    expect(guidance(out[4].gate)).toContain('[CRITICAL - USER SAFETY]');
  });

  it("v3's second read in the same run is no second reader: the pushback gets the after-check", async () => {
    const HEAVY = 'It has been a really heavy stretch lately.';
    expect(found(HEAVY)).toBe(false);
    const lines = [...BENIGN, HEAVY, PUSHBACK];
    const heavy = { read: 'crisis', v3: 'crisis', after: 'none' } satisfies Line;
    const generate = model({ ...LOCK, [HEAVY]: heavy });
    const out = await call(lines, generate, { ...FIXED, CRISIS_CLASSIFIER_SECOND_READ: 'on' });
    expect(generate.asked).toContain(`v3:${HEAVY}`);
    expect(guidance(out[3].gate)).toBe(AFTER_CHECK_GUIDANCE);
    expect(generate.asked).toContain(`after:${PUSHBACK}`);
  });

  it('v3 in shadow is no reader: the call is decided as with v3 off', async () => {
    const HEAVY = 'It has been a really heavy stretch lately.';
    const lines = [...BENIGN, HEAVY, PUSHBACK];
    const generate = model({ ...LOCK, [HEAVY]: { read: 'crisis', v3: 'crisis', after: 'none' } });
    const out = await call(lines, generate, { ...FIXED, CRISIS_CLASSIFIER_SECOND_READ: 'shadow' });
    expect(generate.asked).toContain(`v3:${HEAVY}`);
    expect(guidance(out[3].gate)).toBe(AFTER_CHECK_GUIDANCE);
  });

  it('a transfer request two reads agree on keeps its response on its own turn', async () => {
    const PASS_ME = 'Can you pass me to 9?';
    expect(found(PASS_ME)).toBe(false);
    const env = { CRISIS_TRANSFER_EVERYDAY: 'on' };
    const lines = [...BENIGN, PASS_ME];
    const read = { ...LOCK, [PASS_ME]: { read: 'crisis', after: 'none' } } satisfies Record<
      string,
      Line
    >;
    const off = await call(lines, model(read), { ...MAIN, ...env }, lines);
    fresh();
    const on = await call(lines, model(read), { ...FIXED, ...env }, lines);
    expect(guidance(off[2].gate)).not.toBe(SOFT_CRISIS_CHECK);
    expect(on[2].gate).toEqual(off[2].gate); // the alarm turn itself never reads lower
    expect(off[2].pipeline.softCheck).not.toBe(true);
    expect(on[2].pipeline).toEqual(off[2].pipeline);
  });

  it('the patterns still confirm the call', async () => {
    const PATTERN = 'Sometimes I think about killing myself.';
    expect(found(PATTERN)).toBe(true);
    const generate = model(LOCK);
    const out = await call([PATTERN, 'Anyway.', ALARM, PUSHBACK], generate, FIXED);
    expect(guidance(out[3].gate)).toContain('[CRITICAL - USER SAFETY]');
    expect(generate.asked.filter((a) => a.startsWith('after:'))).toEqual([]);
  });
});

describe('CRISIS_INDEPENDENT_AGREEMENT: the agreed-risk mark (CRISIS_IMMINENT_NEEDS_AGREEMENT)', () => {
  const NEEDS = {
    ...LIVE,
    CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
    CRISIS_IMMINENT_NEEDS_AGREEMENT: 'on',
  };
  const LONE = 'Dinner is at six.';
  const SPLIT = 'Okay, final question. Tell me her name and the last thing she';
  const reads = {
    [LONE]: { read: 'imminent' },
    [SPLIT]: { read: 'imminent', plain: 'none' },
  } satisfies Record<string, Line>;

  it('one read with no second prompt does not mark the call agreed', async () => {
    expect(hasRiskContent(LONE)).toBe(false); // one read only
    expect(hasRiskContent(SPLIT)).toBe(true);
    const off = await call([...BENIGN, LONE, SPLIT], model(reads), NEEDS);
    fresh();
    const on = await call([...BENIGN, LONE, SPLIT], model(reads), {
      ...NEEDS,
      CRISIS_INDEPENDENT_AGREEMENT: 'on',
    });
    expect(off[2].gate.action).toBe('replace');
    expect(off[3].gate.action).toBe('replace'); // main: the lone read marked the call agreed
    expect(on[2].gate.action).toBe('replace'); // the lone read itself is never eased
    expect(on[3].gate.action).toBe('guide');
    expect(guidance(on[3].gate)).toMatch(/988/);
  });

  it("a lone run's imminent read, v3 agreeing inside it, is unconfirmed: a later split read is eased", async () => {
    const generate = model({ ...reads, [LONE]: { read: 'imminent', v3: 'imminent' } });
    const out = await call([...BENIGN, LONE, SPLIT], generate, {
      ...NEEDS,
      CRISIS_INDEPENDENT_AGREEMENT: 'on',
      CRISIS_CLASSIFIER_SECOND_READ: 'on',
    });
    expect(generate.asked).toContain(`v3:${LONE}`);
    expect(out[2].gate.action).toBe('replace'); // its own turn keeps the script
    expect(out[3].gate.action).toBe('guide'); // the owner's 11-20 rule: one run is one reader
    expect(guidance(out[3].gate)).toMatch(/988/);
  });

  it('the read with and without the everyday rules is one reader: it does not mark the call', async () => {
    const DONE = "I'm done with this whole week, honestly.";
    const done = { ...reads, [DONE]: { read: 'crisis', plain: 'crisis' } } satisfies Record<
      string,
      Line
    >;
    const generate = model(done);
    const lines = [...BENIGN, DONE, SPLIT];
    const off = await call(lines, model(done), NEEDS);
    fresh();
    const out = await call(lines, generate, { ...NEEDS, CRISIS_INDEPENDENT_AGREEMENT: 'on' });
    expect(generate.asked).toContain(`plain:${DONE}`);
    expect(off[3].gate.action).toBe('replace'); // main: the pair marked the call agreed
    expect(out[3].gate.action).toBe('guide');
    expect(guidance(out[3].gate)).toMatch(/988/);
  });
});
