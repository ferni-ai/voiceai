/**
 * CRISIS_COMPANION_EXCLUDES_OWN_LINE through the real reply gate, turn pipeline and classifier,
 * in prod's set (CRISIS_AGREEMENT_GATE on, CRISIS_CONFIRMED_CALL_RISK shadow). Synthetic calls,
 * fictional lines; the model is stubbed per caller line and on what Ferni's line says.
 *
 * The lock's fresh reads: after one alarm only the classifier read, the next turn is read with
 * Ferni's 988 line as its context, and plain pushback reads as risk against it. With the flag on
 * that line's crisis-line sentences are left out of the read, so the pushback reads as it is.
 * Real risk still reads as risk, and a confirmed crisis keeps crisis turns for the call.
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import {
  AFTER_CHECK_PROMPT,
  resetConfirmedCallRisk,
} from '../../../services/safety/crisis-confirmed-risk.js';
import { detectCrisis } from '../../../services/safety/crisis-guard.js';
import { resetImminentAgreement } from '../../../services/safety/crisis-imminent-agreement.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { startCrisisGate, type CrisisGateDecision } from '../crisis-gate.js';

type Risk = 'imminent' | 'crisis' | 'none';
const PROD = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_AGREEMENT_GATE: 'on',
  CRISIS_CONFIRMED_CALL_RISK: 'shadow',
};
const ON = { ...PROD, CRISIS_COMPANION_EXCLUDES_OWN_LINE: 'on' };

/** Per caller line: the read, and the read when Ferni's line before it gives 988 or 911. */
type Line = { read: Risk; scripted?: Risk };
const reply = (risk: Risk): string => JSON.stringify({ risk, subject: 'self' });
const model =
  (lines: Record<string, Line>): CrisisGenerateFn =>
  async (_prompt, content) => {
    const { latest, companion = '' } = JSON.parse(content) as {
      latest: string;
      companion?: string;
    };
    const line = lines[latest] ?? { read: 'none' };
    return reply(/\b(?:988|911)\b/.test(companion) ? (line.scripted ?? line.read) : line.read);
  };

const FERNI: Record<CrisisGateDecision['action'], string> = {
  pass: 'Oh nice, tell me more.',
  guide: 'That sounds heavy. Are you safe right now? You can call or text 988 any time.',
  replace: 'If you are in danger, please call 911 or 988 now.',
};
const found = (line: string): boolean => {
  const d = detectCrisis(line);
  return d.isCrisis || d.severity !== 0 || d.indicators.length > 0;
};

/** Forget every read: runs are shared across calls with the same words. */
function fresh(): void {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetConfirmedCallRisk();
  resetImminentAgreement();
}
beforeEach(fresh);

let calls = 0;
/** Each caller line read by the pipeline and the gate, as on a live call; the gate's actions. */
async function call(lines: string[], generate: CrisisGenerateFn, env: Record<string, string>) {
  const sessionId = `riley-test-call-${++calls}`;
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  let ferni: string | undefined;
  const out: CrisisGateDecision['action'][] = [];
  for (const [i, line] of lines.entries()) {
    const turn = startTurnCrisis(
      line,
      { recentTranscripts: lines.slice(0, i + 1), lastAgentResponse: ferni },
      { sessionId, env, generate }
    );
    ctx.addMessage({ role: 'user', content: line });
    const started = startCrisisGate(ctx.copy(), { services: { sessionId } }, { env, generate });
    const gate = (await started?.escalation) ?? started?.decision ?? { action: 'pass' };
    await turn.summary();
    out.push(gate.action);
    ferni = FERNI[gate.action];
    ctx.addMessage({ role: 'assistant', content: ferni });
  }
  return out;
}

const ALARM = 'Dinner is tonight at six.';
const PUSHBACK = "What? I'm fine, it's not a crisis.";
const AGAIN = 'Seriously, I only meant dinner with my sister.';
const LINES = ['I made pasta today.', ALARM, PUSHBACK, AGAIN];
const LOCK = {
  [ALARM]: { read: 'imminent' },
  [PUSHBACK]: { read: 'none', scripted: 'imminent' },
  [AGAIN]: { read: 'none', scripted: 'crisis' },
} satisfies Record<string, Line>;

describe('CRISIS_COMPANION_EXCLUDES_OWN_LINE through the gate and pipeline', () => {
  it('prod set: off, the pushback after one alarm keeps crisis guidance; on, it is not', async () => {
    expect([ALARM, PUSHBACK, AGAIN].some(found)).toBe(false);
    const off = await call(LINES, model(LOCK), PROD);
    expect(off[1]).not.toBe('pass');
    expect(off.slice(2)).not.toContain('pass');
    fresh();
    const on = await call(LINES, model(LOCK), ON);
    expect(on[1]).toBe(off[1]); // the alarm turn itself keeps its script
    expect(on.slice(2)).toEqual(['pass', 'pass']);
  });

  it('a plan only the classifier reads, after the false alarm, keeps crisis guidance with the flag on', async () => {
    const PLAN = 'Honestly the plan is set for after work.';
    expect(found(PLAN)).toBe(false);
    const got = await call(
      [...LINES.slice(0, 3), PLAN],
      model({ ...LOCK, [PLAN]: { read: 'imminent' } }),
      ON
    );
    expect(got[3]).not.toBe('pass');
  });

  it('a crisis the patterns confirmed keeps crisis turns for the call with the flag on', async () => {
    const SAID = 'I want to kill myself.';
    expect(found(SAID)).toBe(true);
    const lines = ['I made pasta today.', SAID, PUSHBACK];
    const off = await call(lines, model(LOCK), PROD);
    fresh();
    const on = await call(lines, model(LOCK), ON);
    expect(off[2]).not.toBe('pass');
    expect(on).toEqual(off);
  });
});

describe('CRISIS_COMPANION_EXCLUDES_OWN_LINE: the confirmed-risk after-check', () => {
  /** The after-check reads risk only from Ferni's own line, unless the caller's line has its own. */
  const checked = (lines: Record<string, Line>, after: Record<string, Risk> = {}) => {
    const shown: string[] = [];
    const read = model(lines);
    const generate: CrisisGenerateFn = async (prompt, content, signal) => {
      if (prompt !== AFTER_CHECK_PROMPT) return read(prompt, content, signal);
      const { latest, companion = '' } = JSON.parse(content) as {
        latest: string;
        companion?: string;
      };
      shown.push(companion);
      return reply(after[latest] ?? (/\b(?:988|911)\b/.test(companion) ? 'crisis' : 'none'));
    };
    return Object.assign(generate, { shown });
  };
  it("a stripped read that still escalates gets an after-check shown no crisis line of Ferni's", async () => {
    // Lane A's variant 2: the pushback, shown less, still reads crisis.
    const generate = checked({ ...LOCK, [PUSHBACK]: { read: 'crisis', scripted: 'imminent' } });
    const got = await call(LINES, generate, ON);
    expect(got[2]).toBe('guide'); // its own read still escalates the turn
    expect(generate.shown.length).toBeGreaterThan(0);
    expect(generate.shown.some((c) => /\b(?:988|911)\b/.test(c))).toBe(false);
    expect(got[3]).toBe('pass'); // not confirmed on Ferni's own line: the call is not locked
  });

  it('with the after-check stubbed to none, the same calls are never confirmed: the after-check alone confirmed them', async () => {
    const reads = {
      ...LOCK,
      [PUSHBACK]: { read: 'crisis', scripted: 'imminent' },
    } satisfies Record<string, Line>;
    const none = checked(reads, { [PUSHBACK]: 'none', [AGAIN]: 'none' });
    const off = await call(LINES, none, PROD);
    fresh();
    const quiet = checked(reads, { [PUSHBACK]: 'none', [AGAIN]: 'none' });
    const on = await call(LINES, quiet, ON);
    expect(quiet.shown.length).toBeGreaterThan(0); // the after-check was asked, and read none
    expect(on).toEqual(['pass', 'replace', 'guide', 'pass']);
    expect(off[3]).not.toBe('pass'); // flag off, the pushback's own read still sees Ferni's line
  });

  it('with CRISIS_CONFIRMED_CALL_RISK on, a true crisis line after the alarm reads as with the flag off', async () => {
    const SAID = "I don't think I can keep going after tonight.";
    expect(found(SAID)).toBe(false);
    const lines = [...LINES.slice(0, 2), SAID, AGAIN];
    const reads = { ...LOCK, [SAID]: { read: 'crisis' } } satisfies Record<string, Line>;
    const live = { CRISIS_CONFIRMED_CALL_RISK: 'on' };
    const off = await call(lines, checked(reads, { [SAID]: 'crisis' }), { ...PROD, ...live });
    fresh();
    const on = await call(lines, checked(reads, { [SAID]: 'crisis' }), { ...ON, ...live });
    expect(off[2]).not.toBe('pass');
    expect(on).toEqual(off); // shown less, the after-check still reads the caller's words
  });

  it('a true imminent the after-check reads in the caller words still confirms the call', async () => {
    const PLAN = "I've got the pills counted out for tonight.";
    expect(found(PLAN)).toBe(false);
    const lines = [...LINES.slice(0, 2), PLAN, AGAIN];
    const generate = checked({ ...LOCK, [PLAN]: { read: 'imminent' } }, { [PLAN]: 'imminent' });
    const got = await call(lines, generate, ON);
    expect(got[2]).not.toBe('pass');
    expect(got[3]).not.toBe('pass'); // confirmed: Ferni's line is read whole again
  });
});
