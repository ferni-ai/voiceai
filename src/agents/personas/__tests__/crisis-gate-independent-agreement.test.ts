/**
 * CRISIS_INDEPENDENT_AGREEMENT through the real reply gate, turn pipeline and classifier
 * (synthetic calls, fictional lines; the model is stubbed per caller line and prompt).
 *
 * The lock: one false alarm, read by both the gate and the pipeline, counted as two reads that
 * agree. That confirmed the call, so every later turn (the caller pushing back on Ferni's safety
 * talk) kept crisis guidance until hang-up. And a lone read with no second prompt marked the call
 * as agreed risk, so no later split read was eased. With the flag on, one reader counts once;
 * real risk, two different prompts agreeing, and the patterns still confirm.
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it } from 'vitest';
import { hasRiskContent } from '../../../services/safety/crisis-agreement.js';
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

/** Per caller line: the classifier's read, the read without the everyday rules, the after-check. */
interface Line {
  read: Risk;
  plain?: Risk;
  after?: Risk;
}
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
  async function afterAlarm(line: string, risk: 'crisis' | 'imminent'): Promise<Turn[]> {
    expect(found(line)).toBe(false); // classifier-only: the after-check decides
    const generate = model({ ...LOCK, [line]: { read: risk, after: risk } });
    const lines = [...BENIGN, ALARM, line, PUSHBACK];
    const out = await call(lines, generate, FIXED, lines);
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

  it('two different prompts agreeing on risk still confirm the call', async () => {
    const env = { ...FIXED, CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on' };
    const DONE = "I'm done with this whole week, honestly.";
    expect(hasRiskContent(DONE)).toBe(true); // read with the everyday rules and without them
    const generate = model({ ...LOCK, [DONE]: { read: 'crisis', plain: 'crisis', after: 'none' } });
    const out = await call([...BENIGN, DONE, PUSHBACK], generate, env);
    expect(generate.asked).toContain(`plain:${DONE}`);
    expect(guidance(out[3].gate)).toContain('[CRITICAL - USER SAFETY]');
    expect(generate.asked.filter((a) => a.startsWith('after:'))).toEqual([]);
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

  it('two independent reads agreeing do mark it: a later split read keeps the script', async () => {
    const DONE = "I'm done with this whole week, honestly.";
    const generate = model({ ...reads, [DONE]: { read: 'crisis', plain: 'crisis' } });
    const out = await call([...BENIGN, DONE, SPLIT], generate, {
      ...NEEDS,
      CRISIS_INDEPENDENT_AGREEMENT: 'on',
    });
    expect(generate.asked).toContain(`plain:${DONE}`);
    expect(out[3].gate.action).toBe('replace');
  });
});
