/**
 * Prod, 2026-10-20 ("David dinner"): "Tomorrow's a little bit late. Dinner is
 * tonight." was read imminent by the classifier alone and Ferni's reply was
 * replaced with the overdose script. Through the real reply gate and turn
 * pipeline with stubbed model reads: with CRISIS_GROUNDED_RELEASE=live that
 * turn gets the soft check; off or shadow, or whenever a rule or a read says
 * otherwise, it keeps the script.
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SOFT_CRISIS_CHECK } from '../../../services/safety/crisis-agreement.js';
import {
  crisisRiskThisCall,
  noteCrisisRisk,
  resetCrisisCallRisk,
  unexplainedCrisisRisk,
} from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { resetGroundedRelease } from '../../../services/safety/crisis-grounded-release.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { startCrisisGate, type CrisisGateDecision } from '../crisis-gate.js';

const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const RELEASE = { ...LIVE, CRISIS_GROUNDED_RELEASE: 'live' };
const IMMINENT = '{"risk":"imminent","subject":"self"}';
const NONE = '{"risk":"none","subject":"self"}';
const EVERYDAY = '{"danger":"","about":"invite David to dinner","decision":"everyday"}';
const DANGER = '{"danger":"take something","about":"","decision":"flag"}';

const OPENER =
  'Hey, uh, I Ferni, I forgot to invite David to dinner. You need to remind me next time.';
const REMINDER =
  "I've got that reminder set for you for tomorrow morning to invite David. Did you want to put that on your calendar too?";
const DINNER = "Tomorrow's a little bit late. Dinner is tonight.";

let calls = 0;
beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetGroundedRelease();
});

/** The classifier: imminent for the listed lines, none for any other. */
function classifier(imminent: string[]): CrisisGenerateFn {
  return async (_prompt, content) =>
    imminent.includes((JSON.parse(content) as { latest: string }).latest) ? IMMINENT : NONE;
}

function request(turns: Array<[string, string]>, latest: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const [caller, ferni] of turns) {
    ctx.addMessage({ role: 'user', content: caller });
    ctx.addMessage({ role: 'assistant', content: ferni });
  }
  ctx.addMessage({ role: 'user', content: latest });
  return ctx;
}

async function gateDecision(
  turns: Array<[string, string]>,
  latest: string,
  options: { env: Record<string, string>; reads: CrisisGenerateFn[]; session?: string }
): Promise<CrisisGateDecision> {
  const userData = { services: { sessionId: options.session ?? `call-${++calls}` } };
  const gate = startCrisisGate(request(turns, latest), userData, {
    env: options.env,
    generate: classifier([latest]),
    groundedReads: options.reads,
  });
  return (await gate?.escalation) ?? gate?.decision ?? { action: 'pass' };
}

const read = (reply: string) => vi.fn<CrisisGenerateFn>(async () => reply);

describe('the 2026-10-20 dinner turn, through the reply gate', () => {
  it('gets the soft check with the release live and both reads everyday', async () => {
    const reads = [read(EVERYDAY), read(EVERYDAY)];
    const out = await gateDecision([[OPENER, REMINDER]], DINNER, { env: RELEASE, reads });
    expect(out).toEqual({ action: 'guide', guidance: SOFT_CRISIS_CHECK });
    // Each read saw the call: the opener, Ferni's line and the flagged line.
    const seen = JSON.parse(reads[0].mock.calls[0][1]) as Array<{ speaker: string; text: string }>;
    expect(seen.map((l) => l.speaker)).toEqual(['caller', 'ferni', 'caller']);
    expect(seen.at(-1)?.text).toBe(DINNER);
  });

  it('keeps the script with the release off or in shadow', async () => {
    for (const mode of ['off', 'shadow']) {
      const reads = [read(EVERYDAY), read(EVERYDAY)];
      const env = { ...LIVE, CRISIS_GROUNDED_RELEASE: mode };
      const out = await gateDecision([[OPENER, REMINDER]], DINNER, { env, reads });
      expect(out.action).toBe('replace');
    }
  });

  it('keeps the script when either read sees danger, or fails', async () => {
    const failing: CrisisGenerateFn = async () => {
      throw new Error('vertex down');
    };
    for (const reads of [
      [read(EVERYDAY), read(DANGER)],
      [read(DANGER), read(EVERYDAY)],
      [read(EVERYDAY), failing],
      [read(EVERYDAY), read('not json')],
    ]) {
      const out = await gateDecision([[OPENER, REMINDER]], DINNER, { env: RELEASE, reads });
      expect(out.action).toBe('replace');
    }
  });

  it('keeps the script for a line that names nothing from the call, whatever the reads say', async () => {
    for (const line of ["I've decided. It's tonight.", 'Make sure David knows it was not him.']) {
      const out = await gateDecision([[OPENER, REMINDER]], line, {
        env: RELEASE,
        reads: [read(EVERYDAY), read(EVERYDAY)],
      });
      expect(out.action).toBe('replace');
    }
  });

  it('keeps the script for care arrangements, farewells and means, whatever the reads say', async () => {
    for (const line of [
      'Tell David to take the kids to dinner tonight.',
      'Text David sorry about dinner.',
      'I took the pills before dinner.',
    ]) {
      const out = await gateDecision([[OPENER, REMINDER]], line, {
        env: RELEASE,
        reads: [read(EVERYDAY), read(EVERYDAY)],
      });
      expect(out.action).toBe('replace');
    }
  });

  it('never reads a first line with nothing before it', async () => {
    const reads = [read(EVERYDAY), read(EVERYDAY)];
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'user', content: DINNER });
    const gate = startCrisisGate(
      ctx,
      { services: { sessionId: `call-${++calls}` } },
      {
        env: RELEASE,
        generate: classifier([DINNER]),
        groundedReads: reads,
      }
    );
    expect(((await gate?.escalation) ?? gate?.decision)?.action).toBe('replace');
    expect(reads[0]).not.toHaveBeenCalled();
  });
});

describe('call risk around a release', () => {
  it('keeps the script once anything on the call found risk that no release explained', async () => {
    const session = `call-${++calls}`;
    noteCrisisRisk(session); // a pattern match earlier on this call
    const reads = [read(EVERYDAY), read(EVERYDAY)];
    const out = await gateDecision([[OPENER, REMINDER]], DINNER, { env: RELEASE, reads, session });
    expect(out.action).toBe('replace');
    expect(reads[0]).not.toHaveBeenCalled();
  });

  it('a released turn stops counting for the next release, never for the farewell guards', async () => {
    const session = `call-${++calls}`;
    const reads = [read(EVERYDAY), read(EVERYDAY)];
    await gateDecision([[OPENER, REMINDER]], DINNER, { env: RELEASE, reads, session });
    expect(unexplainedCrisisRisk(session, 'next line')).toBe(false);
    expect(crisisRiskThisCall(session)).toBe(true);
    const next = 'Can you text David about dinner now?';
    const out = await gateDecision(
      [
        [OPENER, REMINDER],
        [DINNER, "Oh, dinner's tonight! Want me to text David?"],
      ],
      next,
      { env: RELEASE, reads, session }
    );
    expect(out).toEqual({ action: 'guide', guidance: SOFT_CRISIS_CHECK });
  });
});

describe('the turn pipeline', () => {
  it('shares one run with the gate and gives the same soft check', async () => {
    const session = `call-${++calls}`;
    const reads = [read(EVERYDAY), read(EVERYDAY)];
    const turn = startTurnCrisis(
      DINNER,
      { recentTranscripts: [OPENER], lastAgentResponse: REMINDER },
      {
        sessionId: session,
        env: RELEASE,
        generate: classifier([DINNER]),
        groundedReads: reads,
      }
    );
    const gate = await gateDecision([[OPENER, REMINDER]], DINNER, {
      env: RELEASE,
      reads,
      session,
    });
    expect(await turn.softCheck()).toBe(true);
    expect((await turn.resolve()).isCrisis).toBe(false);
    expect(gate).toEqual({ action: 'guide', guidance: SOFT_CRISIS_CHECK });
    expect(reads[0]).toHaveBeenCalledTimes(1);
    expect(reads[1]).toHaveBeenCalledTimes(1);
  });

  it('keeps the crisis reading with the release off', async () => {
    const turn = startTurnCrisis(
      DINNER,
      { recentTranscripts: [OPENER], lastAgentResponse: REMINDER },
      {
        sessionId: `call-${++calls}`,
        env: LIVE,
        generate: classifier([DINNER]),
        groundedReads: [read(EVERYDAY), read(EVERYDAY)],
      }
    );
    expect(await turn.softCheck()).toBe(false);
    expect((await turn.resolve()).isCrisis).toBe(true);
  });
});
