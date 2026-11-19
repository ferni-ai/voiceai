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
import { resetConfirmedCallRisk } from '../../../services/safety/crisis-confirmed-risk.js';
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
