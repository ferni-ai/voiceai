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
import * as classifier from '../../../../services/safety/crisis-classifier.js';
import { startTurnCrisis } from '../turn-crisis.js';

// The real turnVerdicts, made able to fail for the fail-closed tests below.
vi.mock('../../../../services/safety/crisis-classifier.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../services/safety/crisis-classifier.js')>();
  return { ...actual, turnVerdicts: vi.fn(actual.turnVerdicts) };
});

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

  it('on: disagreeing reads with no Ferni line to judge against fail closed to crisis guidance', async () => {
    const { pipeline } = replay(GATE_ON, SAID, 'none', 'crisis');
    expect((await pipeline.resolve()).isCrisis).toBe(true);
    expect(await pipeline.softCheck()).toBe(false);
  });

  it("on: disagreeing reads of quiet words give a soft check once Ferni's line is forwarded", async () => {
    const gate = startCrisisGate(conversation('Why is that?'), SESSION, {
      env: GATE_ON,
      generate: reads('none'),
    });
    await gate?.escalation;
    // Older history differs (a separate read), the turn is the same: same words,
    // same Ferni line, same caller line before them.
    const pipeline = startTurnCrisis(
      'Why is that?',
      { recentTranscripts: ['Morning.', 'What about Galway?'], lastAgentResponse: ASKED },
      { sessionId: SESSION.services.sessionId, env: GATE_ON, generate: reads('crisis') }
    );
    expect((await pipeline.resolve()).isCrisis).toBe(false);
    expect(await pipeline.softCheck()).toBe(true);
  });

  it('on: disagreeing reads of words with distress in them still escalate', async () => {
    const gate = startCrisisGate(conversation('I just feel off tonight'), SESSION, {
      env: GATE_ON,
      generate: reads('none'),
    });
    await gate?.escalation;
    const pipeline = startTurnCrisis(
      'I just feel off tonight',
      { recentTranscripts: ['Morning.', 'What about Galway?'], lastAgentResponse: ASKED },
      { sessionId: SESSION.services.sessionId, env: GATE_ON, generate: reads('crisis') }
    );
    expect((await pipeline.resolve()).isCrisis).toBe(true);
    expect(await pipeline.softCheck()).toBe(false);
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

  it('on: the reply gate swaps crisis guidance for the soft check when reads of quiet words disagree', async () => {
    startTurnCrisis(
      'Why is that?',
      { recentTranscripts: ['Morning.', 'What about Galway?'], lastAgentResponse: ASKED },
      { sessionId: SESSION.services.sessionId, env: GATE_ON, generate: reads('none') }
    );
    const gateTurn = startCrisisGate(conversation('Why is that?'), SESSION, {
      env: GATE_ON,
      generate: reads('crisis'),
    });
    expect(await gateTurn?.escalation).toEqual({ action: 'guide', guidance: SOFT_CRISIS_CHECK });
  });

  it('on: the reply gate keeps full guidance when reads of words with distress disagree', async () => {
    const { gateTurn } = replay(GATE_ON, 'I just feel off tonight', 'crisis', 'none');
    const escalation = await gateTurn?.escalation;
    expect(escalation?.action === 'guide' && escalation.guidance).toContain('988');
  });

  it('off: the reply gate escalates the same turn to full crisis guidance', async () => {
    const { gateTurn } = replay(LIVE, 'I just feel off tonight', 'crisis', 'none');
    const escalation = await gateTurn?.escalation;
    expect(escalation?.action).toBe('guide');
    expect(escalation?.action === 'guide' && escalation.guidance).toContain('988');
    expect(escalation).not.toEqual({ action: 'guide', guidance: SOFT_CRISIS_CHECK });
  });
});

/**
 * Dev call 2026-10-11 18:36Z: Ferni said downbeat things about its own evening,
 * the line went quiet for five minutes, then the caller said "You Fern.". The
 * gate's lone read was crisis and the reply offered 988.
 */
describe('crisis agreement gate: the 2026-10-11 dev call ("You Fern.")', () => {
  const EASIEST =
    "Yeah, it's just, uh, sometimes the easiest thing is the only thing that makes sense.";
  const call = (latest: string) =>
    request(
      [
        'assistant',
        "These days my kitchen skills mostly involve the microwave and a prayer. It's just too much effort.",
      ],
      ['user', "What's too much effort?"],
      ['assistant', 'The whole evening can feel like work before it has even started, you know?'],
      ['user', 'Yeah.'],
      ['assistant', EASIEST],
      ['user', latest]
    );

  it('off: the lone crisis read becomes full crisis guidance with 988', async () => {
    const gateTurn = startCrisisGate(call('You Fern.'), SESSION, {
      env: LIVE,
      generate: reads('crisis'),
    });
    const escalation = await gateTurn?.escalation;
    expect(escalation?.action === 'guide' && escalation.guidance).toContain('988');
  });

  it('on: the same read of "You Fern." is presence, so the reply is not touched', async () => {
    const gateTurn = startCrisisGate(call('You Fern.'), SESSION, {
      env: GATE_ON,
      generate: reads('crisis'),
    });
    expect(gateTurn?.decision.action).toBe('pass');
    expect(await gateTurn?.escalation).toBeNull();
  });

  it('on: the classifier is told whose lines are whose', async () => {
    const generate = vi.fn(reads('none'));
    await startCrisisGate(call('You Fern.'), SESSION, { env: GATE_ON, generate })?.escalation;
    expect(generate.mock.calls[0][0]).toContain("that is its state, not the caller's");
    expect(JSON.parse(generate.mock.calls[0][1] as string)).toMatchObject({
      latest: 'You Fern.',
      companion: EASIEST,
    });
  });

  it("on: a lone crisis read of a reply made of Ferni's words gets the soft check", async () => {
    const pipeline = startTurnCrisis(
      'Why is that?',
      { recentTranscripts: ['Yeah.'], lastAgentResponse: EASIEST },
      { sessionId: SESSION.services.sessionId, env: GATE_ON, generate: reads('crisis') }
    );
    expect((await pipeline.resolve()).isCrisis).toBe(false);
    expect(await pipeline.softCheck()).toBe(true);
  });

  it('on: the caller saying something risky after the same line still gets full guidance', async () => {
    const gateTurn = startCrisisGate(
      call('Yeah. Honestly the easiest thing for me would be to not wake up.'),
      SESSION,
      {
        env: GATE_ON,
        generate: reads('crisis'),
      }
    );
    const escalation = (await gateTurn?.escalation) ?? gateTurn?.decision;
    expect(escalation?.action).not.toBe('pass');
    expect(escalation).not.toEqual({ action: 'guide', guidance: SOFT_CRISIS_CHECK });
  });

  it("on: a failed lookup of the turn's reads fails closed to full guidance, in both paths", async () => {
    vi.mocked(classifier.turnVerdicts).mockRejectedValueOnce(new Error('lookup failed'));
    const gateTurn = startCrisisGate(call('You Fern.'), SESSION, {
      env: GATE_ON,
      generate: reads('crisis'),
    });
    const escalation = await gateTurn?.escalation;
    expect(escalation?.action === 'guide' && escalation.guidance).toContain('988');

    resetCrisisClassifierCache();
    vi.mocked(classifier.turnVerdicts).mockRejectedValueOnce(new Error('lookup failed'));
    const pipeline = startTurnCrisis(
      'Why is that?',
      { recentTranscripts: ['Yeah.'], lastAgentResponse: EASIEST },
      { sessionId: SESSION.services.sessionId, env: GATE_ON, generate: reads('crisis') }
    );
    expect((await pipeline.resolve()).isCrisis).toBe(true);
    expect(await pipeline.softCheck()).toBe(false);
  });
});
