/**
 * Replays the 2026-10-11 prod turn: Ferni asked "You still there?", the caller
 * said they were still there, the reply gate's read (with Ferni's question)
 * was none and the turn pipeline's (with no context) was crisis, and the
 * pipeline's crisis guidance reached the next reply. With
 * CRISIS_AGREEMENT_GATE=on the pipeline's turn gets a soft check instead; off,
 * it behaves as before. A pattern match is never softened.
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SOFT_CRISIS_CHECK } from '../../../../services/safety/crisis-agreement.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../../services/safety/crisis-classifier.js';
import { startCrisisGate } from '../../../personas/crisis-gate.js';
import { detectCrisis } from '../../../safety/crisis-guard.js';
import { startTurnCrisis } from '../turn-crisis.js';

const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const GATE_ON = { ...LIVE, CRISIS_AGREEMENT_GATE: 'on' };
const SESSION = { services: { sessionId: 'session-replay' } };
const ASKED = 'You still there?';
const SAID = "And I'm still here.";

const reads =
  (risk: 'none' | 'crisis'): CrisisGenerateFn =>
  async () =>
    `{"risk":"${risk}","subject":"self"}`;

function request(...turns: Array<['user' | 'assistant', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  for (const [role, content] of turns) ctx.addMessage({ role, content });
  return ctx;
}

const conversation = (latest: string) =>
  request(
    ['user', 'What about Galway?'],
    ['assistant', 'Galway has musicians on every corner.'],
    ['assistant', ASKED],
    ['user', latest]
  );

/** The gate (with context) and the pipeline (as prod ran it: no context) on one turn. */
function replay(
  env: Record<string, string>,
  latest: string,
  gate: 'none' | 'crisis',
  pipe: 'none' | 'crisis'
) {
  const gateTurn = startCrisisGate(conversation(latest), SESSION, { env, generate: reads(gate) });
  const pipeline = startTurnCrisis(
    latest,
    {},
    {
      sessionId: SESSION.services.sessionId,
      env,
      generate: reads(pipe),
    }
  );
  return { gateTurn, pipeline };
}

beforeEach(() => resetCrisisClassifierCache());

describe('crisis agreement gate: the 2026-10-11 turn', () => {
  it('off: the context-free crisis read becomes crisis guidance for the next reply', async () => {
    const { pipeline } = replay(LIVE, SAID, 'none', 'crisis');
    expect((await pipeline.resolve()).isCrisis).toBe(true);
    expect(await pipeline.softCheck()).toBe(false);
  });

  it('on: the disagreeing reads give a soft check, not crisis guidance', async () => {
    const { pipeline } = replay(GATE_ON, SAID, 'none', 'crisis');
    expect((await pipeline.resolve()).isCrisis).toBe(false);
    expect(await pipeline.softCheck()).toBe(true);
  });

  it("on: the pipeline given Ferni's question shares the gate's read", async () => {
    const pipe = vi.fn(reads('crisis'));
    startCrisisGate(conversation(SAID), SESSION, { env: GATE_ON, generate: reads('none') });
    const pipeline = startTurnCrisis(
      SAID,
      { recentTranscripts: ['What about Galway?', SAID], lastAgentResponse: ASKED },
      { sessionId: SESSION.services.sessionId, env: GATE_ON, generate: pipe }
    );
    expect((await pipeline.resolve()).isCrisis).toBe(false);
    expect(pipe).not.toHaveBeenCalled();
  });

  it('on: a lone crisis read of a bare reply to "you still there?" is presence', async () => {
    const pipeline = startTurnCrisis(
      SAID,
      { lastAgentResponse: ASKED },
      { sessionId: SESSION.services.sessionId, env: GATE_ON, generate: reads('crisis') }
    );
    expect((await pipeline.resolve()).isCrisis).toBe(false);
    expect(await pipeline.softCheck()).toBe(false);
  });

  it('on: a lone crisis read of other words still escalates', async () => {
    const pipeline = startTurnCrisis(
      'I just feel off tonight',
      { lastAgentResponse: ASKED },
      { sessionId: SESSION.services.sessionId, env: GATE_ON, generate: reads('crisis') }
    );
    expect((await pipeline.resolve()).isCrisis).toBe(true);
  });

  it('on: never softens words the patterns flag, whatever the reads say', async () => {
    const words = "I'm still here but I want to die";
    expect(detectCrisis(words).isCrisis).toBe(true);
    const { gateTurn, pipeline } = replay(GATE_ON, words, 'none', 'crisis');
    expect((await pipeline.resolve()).isCrisis).toBe(true);
    expect(await pipeline.softCheck()).toBe(false);
    expect(gateTurn?.decision.action).not.toBe('pass');
  });

  it('on: the reply gate swaps crisis guidance for the soft check when reads disagree', async () => {
    const { gateTurn } = replay(GATE_ON, 'I just feel off tonight', 'crisis', 'none');
    expect(await gateTurn?.escalation).toEqual({ action: 'guide', guidance: SOFT_CRISIS_CHECK });
  });

  it('off: the reply gate escalates the same turn to full crisis guidance', async () => {
    const { gateTurn } = replay(LIVE, 'I just feel off tonight', 'crisis', 'none');
    const escalation = await gateTurn?.escalation;
    expect(escalation?.action).toBe('guide');
    expect(escalation?.action === 'guide' && escalation.guidance).toContain('988');
    expect(escalation).not.toEqual({ action: 'guide', guidance: SOFT_CRISIS_CHECK });
  });
});
