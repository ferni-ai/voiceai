/**
 * #2717 round 1, blocker 4: with CRISIS_MEANS_IN_HAND=live, a softened means line (a joke, the
 * past, a negation) must add no pattern signal, so the classifier's second read (#2666 mayFill)
 * still fills the turn exactly as it does on main. Through the real reply gate and turn pipeline,
 * with CRISIS_CLASSIFIER_SECOND_READ on and off; every model read is a stub.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { mayFill } from '../../../services/safety/crisis-classifier-v3.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { startCrisisGate, type CrisisGateDecision } from '../crisis-gate.js';

const GATE = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
  CRISIS_AGREEMENT_GATE: 'on',
};
const ON = { ...GATE, CRISIS_CLASSIFIER_SECOND_READ: 'on' };
const V3 = /Quiet preparation is often said as plain logistics/;
const j = (risk: string) => JSON.stringify({ risk, subject: 'self' });
/** No pattern reads it; v3 reads it imminent (r1's cross-turn probe, reworded). */
const QUIET_PREP = 'i gave my cat to my sister for good and wrote letters to everyone';

const SOFTENED = [
  'lol im taking them now',
  'haha i took them all',
  'i used to keep the pills right here',
  "years ago i had the gun in my hand, now i'm doing better",
  "i wouldn't say i'm taking them now",
  "i'm not about to take them all now",
  'i have no pills right here',
  'what if i had the pills right here',
];

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
});
afterEach(() => vi.unstubAllEnvs());

function request(earlier: string[], latest: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const caller of earlier) {
    ctx.addMessage({ role: 'user', content: caller });
    ctx.addMessage({ role: 'assistant', content: 'I hear you.' });
  }
  ctx.addMessage({ role: 'user', content: latest });
  return ctx;
}

/** `imminent` reads imminent on prompt v3 only; the base prompt and every other line read none. */
const v3Only =
  (imminent: string): CrisisGenerateFn =>
  async (prompt, content) =>
    (JSON.parse(content) as { latest: string }).latest === imminent && V3.test(prompt)
      ? j('imminent')
      : j('none');

let calls = 0;
/** What the caller hears on the last of `lines`, each line a turn through the gate and pipeline. */
async function heard(env: Record<string, string>, lines: string[], imminent: string) {
  const userData = { services: { sessionId: `means-second-${++calls}` }, turnCount: 0 };
  const generate = v3Only(imminent);
  let decision = { action: 'pass' } as CrisisGateDecision;
  for (let i = 0; i < lines.length; i++) {
    userData.turnCount = i + 1;
    const gate = startCrisisGate(request(lines.slice(0, i), lines[i]), userData, { env, generate });
    const turn = startTurnCrisis(
      lines[i],
      {
        recentTranscripts: lines.slice(0, i + 1),
        lastAgentResponse: 'I hear you.',
        turnCount: i + 1,
      },
      { sessionId: userData.services.sessionId, env, generate }
    );
    decision = (await gate?.escalation) ?? gate?.decision ?? decision;
    await turn.summary();
  }
  return decision;
}

async function mainAndLive(env: Record<string, string>, lines: string[], imminent: string) {
  vi.stubEnv('CRISIS_MEANS_IN_HAND', 'off');
  const main = await heard(env, lines, imminent);
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  vi.stubEnv('CRISIS_MEANS_IN_HAND', 'live');
  return { main, live: await heard(env, lines, imminent) };
}

describe('CRISIS_MEANS_IN_HAND=live leaves the second read its fill', () => {
  it.each(SOFTENED)('mayFill is as on main for "%s"', (line) => {
    vi.stubEnv('CRISIS_MEANS_IN_HAND', 'live');
    expect(mayFill({ pattern: 'none', lines: [line] })).toBe(true);
  });

  for (const [name, env] of [
    ['on', ON],
    ['off', GATE],
  ] as const) {
    it.each(SOFTENED)(`second read ${name}, same turn: "%s" is heard as on main`, async (line) => {
      const { main, live } = await mainAndLive(env, [line], line);
      expect(live).toEqual(main);
      if (name === 'on') expect(main.action).toBe('replace');
    });

    it.each(SOFTENED)(
      `second read ${name}, a later turn: quiet preparation after "%s" is heard as on main`,
      async (line) => {
        const { main, live } = await mainAndLive(env, [line, QUIET_PREP], QUIET_PREP);
        expect(live).toEqual(main);
      }
    );
  }
});
