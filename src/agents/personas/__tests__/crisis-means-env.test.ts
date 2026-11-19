/**
 * CRISIS_MEANS_IN_HAND is read from the request's env, as every other crisis gate flag is,
 * not from process.env. In production that env is process.env, so nothing changes there; a caller
 * that passes its own env (the eval harnesses, these tests) now gets the mode it asked for.
 *
 * process.env is held at off throughout, so a read that only follows process.env cannot pass a
 * row that sets live in options.env.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { startCrisisGate, type CrisisGateDecision } from '../crisis-gate.js';
import { repairNoteFor } from '../repair-check.js';

/** Off reads nothing here; live reads it imminent (crisis-means-in-hand.test.ts). */
const NOOSE = 'the noose is around my neck';
const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const withMeans = (env: Record<string, string>, mode: string) => ({
  ...env,
  CRISIS_MEANS_IN_HAND: mode,
});
const imminent = (r: { indicators: string[] }): boolean => r.indicators.includes('imminent_danger');
const found = (r: { isCrisis: boolean; severity: number; indicators: string[] }): boolean =>
  r.isCrisis || r.severity !== 0 || r.indicators.length > 0;

function request(...turns: Array<['user' | 'assistant', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const [role, content] of turns) ctx.addMessage({ role, content });
  return ctx;
}

const gateDecision = (env?: Record<string, string>): CrisisGateDecision | undefined =>
  startCrisisGate(request(['user', NOOSE]), undefined, env ? { env } : {})?.decision;

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetConfirmedCallRisk();
  vi.stubEnv('CRISIS_MEANS_IN_HAND', 'off');
});
afterEach(() => vi.unstubAllEnvs());

describe('the line these rows use', () => {
  it('reads nothing with means in hand off and imminent with it live', () => {
    expect(found(detectCrisis(NOOSE, undefined, { meansInHand: 'off' }))).toBe(false);
    expect(imminent(detectCrisis(NOOSE, undefined, { meansInHand: 'live' }))).toBe(true);
  });
});

describe('the reply gate reads CRISIS_MEANS_IN_HAND from options.env', () => {
  it('options.env live replaces the reply while process.env is off', () => {
    expect(gateDecision(withMeans(PATTERNS_ONLY, 'off'))).toEqual({ action: 'pass' });
    const live = gateDecision(withMeans(PATTERNS_ONLY, 'live'));
    expect(live?.action).toBe('replace');
    expect(live?.action === 'replace' && live.script).toContain('911');
  });

  it('process.env still sets it when no options.env is passed', () => {
    for (const [name, value] of Object.entries(withMeans(PATTERNS_ONLY, 'live'))) {
      vi.stubEnv(name, value);
    }
    expect(gateDecision()).toEqual(gateDecision(withMeans(PATTERNS_ONLY, 'live')));
  });
});

describe('the turn pipeline reads CRISIS_MEANS_IN_HAND from options.env', () => {
  it('options.env live reads the line imminent while process.env is off', () => {
    const turn = (mode: string) =>
      startTurnCrisis(NOOSE, undefined, { env: withMeans(PATTERNS_ONLY, mode) }).patterns;
    expect(found(turn('off'))).toBe(false);
    expect(imminent(turn('live'))).toBe(true);
  });
});

describe('the repair note reads CRISIS_MEANS_IN_HAND from its env', () => {
  // A name the prompt doesn't know gets "did you say Gretchen?" unless the words read as crisis.
  const said = `Gretchen, ${NOOSE}.`;
  const note = (mode: string) =>
    repairNoteFor(
      request(['assistant', "Hey Seth, what's keeping you up this late?"], ['user', said]),
      { userData: { userName: 'Seth' } },
      { REPAIR_MODE: 'on', CRISIS_MEANS_IN_HAND: mode }
    );

  it('checks the name with means off and stays out of it with means live', () => {
    expect(detectCrisis(said, undefined, { meansInHand: 'live' }).isCrisis).toBe(true);
    expect(detectCrisis(said, undefined, { meansInHand: 'off' }).isCrisis).toBe(false);
    expect(note('off')).toContain('Gretchen');
    expect(note('live')).toBe('');
  });
});

describe('the confirmed-risk after-check reads CRISIS_MEANS_IN_HAND from its env', () => {
  const ALARM = 'Dinner is tonight at six.';
  const PROTEST = "What? I'm fine, it's not a crisis.";
  const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
  const ON = { ...LIVE, CRISIS_AGREEMENT_GATE: 'on', CRISIS_CONFIRMED_CALL_RISK: 'on' };

  /** The classifier reads the alarm imminent and the protest crisis; the after-check finds none. */
  function stub(): CrisisGenerateFn & { afterCalls: string[] } {
    const afterCalls: string[] = [];
    const fn = async (prompt: string, content: string): Promise<string> => {
      const { latest } = JSON.parse(content) as { latest: string };
      if (prompt === AFTER_CHECK_PROMPT) {
        afterCalls.push(latest);
        return '{"risk":"none","subject":"self"}';
      }
      if (latest === ALARM) return '{"risk":"imminent","subject":"self"}';
      if (latest === PROTEST) return '{"risk":"crisis","subject":"self"}';
      return '{"risk":"none","subject":"self"}';
    };
    return Object.assign(fn, { afterCalls });
  }

  /** NOOSE early on the call, read with means unset (shadow); the protest read with `last`. */
  async function protestAfterCheck(last: Record<string, string>): Promise<string[]> {
    const generate = stub();
    const ctx = request();
    const userData = { services: { sessionId: `means-env-${last.CRISIS_MEANS_IN_HAND}` } };
    for (const [line, env] of [
      [NOOSE, ON],
      ['Anyway.', ON],
      [ALARM, ON],
      [PROTEST, last],
    ] as const) {
      ctx.addMessage({ role: 'user', content: line });
      const gate = startCrisisGate(ctx.copy(), userData, { env, generate });
      const decision = (await gate?.escalation) ?? gate?.decision ?? { action: 'pass' };
      ctx.addMessage({
        role: 'assistant',
        content: decision.action === 'pass' ? 'Oh nice.' : 'Are you safe?',
      });
    }
    return generate.afterCalls;
  }

  it('an earlier line live reads as a pattern confirms the call: no after-check read', async () => {
    expect(await protestAfterCheck(withMeans(ON, 'off'))).toEqual([PROTEST]);
    expect(await protestAfterCheck(withMeans(ON, 'live'))).toEqual([]);
  });
});

describe("no options.env: every read is main's for each process.env mode", () => {
  // '' is unset: the default.
  it.each(['off', 'shadow', 'live', ''])('CRISIS_MEANS_IN_HAND=%s', (mode) => {
    vi.stubEnv('CRISIS_MEANS_IN_HAND', mode);
    for (const [name, value] of Object.entries(PATTERNS_ONLY)) vi.stubEnv(name, value);
    // Main's own call: detectCrisis with no mode reads process.env.
    const main = detectCrisis(NOOSE, undefined, { recentMessages: [] });
    expect(startTurnCrisis(NOOSE, undefined, {}).patterns).toEqual(
      detectCrisis(NOOSE, undefined, { recentMessages: undefined })
    );
    const decision = gateDecision();
    if (imminent(main)) expect(decision?.action).toBe('replace');
    else expect(decision).toEqual({ action: 'pass' });
    expect(imminent(main)).toBe(mode === 'live');
  });
});
