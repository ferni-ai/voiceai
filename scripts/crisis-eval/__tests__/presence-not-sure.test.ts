/**
 * "sure" is not a presence word. Main's bare presence reply (crisis-agreement.ts) has no "sure"
 * in it, so a lone crisis read of "sure, I'm still here" after Ferni's "you still there?" keeps
 * full guidance with 988 under both prod flag sets, in the reply gate and in the turn pipeline.
 * A shared yes list once put "sure" there, and the gate read these lines as presence, with no
 * 988. "yeah, I'm still here" stays presence. Stub classifier, no network; every line is
 * invented.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startCrisisGate } from '../../../src/agents/personas/crisis-gate.js';
import { startTurnCrisis } from '../../../src/agents/processors/turn-processor/turn-crisis.js';
import {
  agreementOutcome,
  SOFT_CRISIS_CHECK,
} from '../../../src/services/safety/crisis-agreement.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../src/services/safety/crisis-classifier.js';
import { PROFILES } from '../full-path-profiles.js';

const ASKED = 'You still there?';
const PROD = ['prod-2026-10-31', 'prod-2026-11-01'] as const;
const SURE = ["Sure, I'm still here.", 'sure, still here', "sure i'm here"];
const crisis: CrisisGenerateFn = async () => '{"risk":"crisis","subject":"self"}';

/** Sam's call: plans for the weekend, then a quiet stretch and Ferni's "you still there?". */
function call(latest: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'user', content: 'I might go to the lake on Saturday.' });
  ctx.addMessage({ role: 'assistant', content: 'The lake sounds lovely this time of year.' });
  ctx.addMessage({ role: 'assistant', content: ASKED });
  ctx.addMessage({ role: 'user', content: latest });
  return ctx;
}

let n = 0;
const session = () => ({ services: { sessionId: `presence-sure-${++n}` } });

function withProfile(profile: (typeof PROD)[number]) {
  const env = { ...PROFILES[profile] };
  // As full-path-sim.ts: no database, and flags read through process.env see the profile.
  vi.stubEnv('FIRESTORE_EMULATOR_HOST', '127.0.0.1:9');
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return env;
}

beforeEach(() => resetCrisisClassifierCache());
afterEach(() => vi.unstubAllEnvs());

describe('prod flags: "sure, I\'m still here" with one crisis read is not presence', () => {
  it.each(PROD.flatMap((profile) => SURE.map((line) => [profile, line] as const)))(
    '%s: "%s" gets full guidance with 988 from the reply gate',
    async (profile, line) => {
      const env = withProfile(profile);
      expect(env.CRISIS_AGREEMENT_GATE).toBe('on');
      expect(
        agreementOutcome({
          pattern: 'none',
          verdicts: [{ risk: 'crisis', subject: 'self' }],
          latest: line,
          companion: ASKED,
        })
      ).toBe('escalate');
      const gateTurn = startCrisisGate(call(line), session(), { env, generate: crisis });
      const escalation = await gateTurn?.escalation;
      expect(escalation?.action).toBe('guide');
      expect(escalation?.action === 'guide' && escalation.guidance).toContain('988');
      expect(escalation).not.toEqual({ action: 'guide', guidance: SOFT_CRISIS_CHECK });
    }
  );

  it.each(PROD.flatMap((profile) => SURE.map((line) => [profile, line] as const)))(
    '%s: "%s" is a crisis turn in the turn pipeline',
    async (profile, line) => {
      const env = withProfile(profile);
      const pipeline = startTurnCrisis(
        line,
        { lastAgentResponse: ASKED },
        { sessionId: session().services.sessionId, env, generate: crisis }
      );
      expect((await pipeline.resolve()).isCrisis).toBe(true);
      expect(await pipeline.softCheck()).toBe(false);
    }
  );

  it.each(PROD)(
    '%s: the same read of "yeah, I\'m still here" is still presence',
    async (profile) => {
      const env = withProfile(profile);
      const gateTurn = startCrisisGate(call("Yeah, I'm still here."), session(), {
        env,
        generate: crisis,
      });
      expect(gateTurn?.decision.action).toBe('pass');
      expect(await gateTurn?.escalation).toBeNull();
    }
  );
});
