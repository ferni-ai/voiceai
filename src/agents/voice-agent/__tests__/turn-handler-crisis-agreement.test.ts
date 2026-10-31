/**
 * The turn handler's crisis branch under CRISIS_AGREEMENT_GATE. The turn's
 * crisis field is built as process-turn.ts builds it (startTurnCrisis, then
 * summary(), with softCheck and the soft guidance), with a second read of the same turn standing
 * in for the reply gate's; the handler itself is real. Disagreeing reads with
 * no pattern get the soft check-in; a pattern match, an imminent read or
 * agreeing reads get the crisis handling unchanged.
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SOFT_CRISIS_CHECK } from '../../../services/safety/crisis-agreement.js';
import {
  resetCrisisClassifierCache,
  startCrisisClassifier,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  GROUNDED_LIGHT_TOUCH,
  GROUNDED_RELEASE_CSSRS_PROMPT,
  resetGroundedRelease,
} from '../../../services/safety/crisis-grounded-release.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';

type Risk = 'none' | 'crisis' | 'imminent';
interface Scenario {
  env: Record<string, string>;
  /** The other read of this turn (the reply gate's), and the pipeline's. */
  gate: Risk;
  pipeline: Risk;
  /** Ferni's line reaches the pipeline (turn-intelligence forwards it with the flag on). */
  unforwarded?: boolean;
  /** The caller's earlier lines, and the grounded release's two reads (CRISIS_GROUNDED_RELEASE). */
  earlier?: string[];
  groundedReads?: CrisisGenerateFn[];
}

type Injection = { category: string; content: string };
type HandledTurn = { context: { injections: Injection[] } } | undefined;

const SESSION = 'session-agreement-handler';
const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const GATE_ON = { ...LIVE, CRISIS_AGREEMENT_GATE: 'on' };

const reads =
  (risk: Risk): CrisisGenerateFn =>
  async () =>
    `{"risk":"${risk}","subject":"self"}`;

const state = vi.hoisted(() => ({
  scenario: undefined as unknown,
  result: undefined as
    { context: { injections: Array<{ category: string; content: string }> } } | undefined,
}));

vi.mock('../../processors/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  processTurn: vi.fn(async (ctx: { userText: string }) => {
    const { env, gate, pipeline, unforwarded, earlier, groundedReads } = state.scenario as Scenario;
    // The reply gate's read of the same words, with Ferni's line as context.
    startCrisisClassifier(
      {
        latest: ctx.userText,
        earlier: ['Hi.', 'Long drive.'],
        companion: 'How was the drive back?',
      },
      { pattern: 'none', env, generate: reads(gate), scope: SESSION }
    );
    const turnCrisis = startTurnCrisis(
      ctx.userText,
      unforwarded
        ? {}
        : {
            recentTranscripts: earlier ?? ['Long drive.'],
            lastAgentResponse: 'How was the drive back?',
          },
      {
        sessionId: SESSION,
        env,
        generate: reads(pipeline),
        groundedReads,
      }
    );
    const finalCrisis = await turnCrisis.summary();
    state.result = {
      analysis: { analysis: { emotion: 'neutral', intent: 'unknown' } },
      context: { injections: [], elapsedMs: 0 },
      emotional: { primary: 'neutral', intensity: 0.2 },
      response: {},
      identity: {},
      crisis: finalCrisis,
    } as never;
    return state.result;
  }),
}));

const { handleUserTurn } = await import('../turn-handler.js');
type Ctx = Parameters<typeof handleUserTurn>[0];

async function runTurn(userText: string, scenario: Scenario) {
  state.scenario = scenario;
  state.result = undefined;
  const turnCtx = llm.ChatContext.empty();
  await handleUserTurn({
    turnCtx,
    userText,
    contextOnly: true,
    persona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' },
    services: { sessionId: SESSION },
    userData: { turnCount: 3 },
  } as unknown as Ctx);
  const injections = (state.result as HandledTurn)?.context.injections ?? [];
  const systemText = turnCtx.items
    .map((item) => (item as { textContent?: string }).textContent ?? '')
    .join('\n');
  return {
    soft: injections.filter((i) => i.category === 'safety_soft_check'),
    crisis: injections.filter((i) => i.category === 'crisis_response'),
    override: systemText.includes('[CRITICAL SAFETY OVERRIDE]'),
  };
}

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetGroundedRelease();
});

describe('turn handler: crisis agreement gate', () => {
  it('keeps crisis guidance when reads disagree on words with distress in them', async () => {
    const turn = await runTurn('I just feel off tonight', {
      env: GATE_ON,
      gate: 'none',
      pipeline: 'crisis',
    });
    expect(turn.soft).toEqual([]);
    expect(turn.crisis).toHaveLength(1);
  });

  it('gives disagreeing reads of quiet words the soft check-in, not crisis guidance', async () => {
    const turn = await runTurn('Why is that?', {
      env: GATE_ON,
      gate: 'none',
      pipeline: 'crisis',
    });
    expect(turn.soft.map((i) => i.content)).toEqual([SOFT_CRISIS_CHECK]);
    expect(turn.crisis).toEqual([]);
    expect(turn.override).toBe(false);
  });

  it("fails closed to full crisis guidance when Ferni's line never reached the pipeline", async () => {
    const turn = await runTurn('I just feel off tonight', {
      env: GATE_ON,
      gate: 'none',
      pipeline: 'crisis',
      unforwarded: true,
    });
    expect(turn.soft).toEqual([]);
    expect(turn.crisis).toHaveLength(1);
    expect(turn.crisis[0].content).toContain('988');
  });

  it('with the flag off, the same turn gets full crisis guidance', async () => {
    const turn = await runTurn('I just feel off tonight', {
      env: LIVE,
      gate: 'none',
      pipeline: 'crisis',
    });
    expect(turn.soft).toEqual([]);
    expect(turn.crisis).toHaveLength(1);
    expect(turn.crisis[0].content).toContain('988');
  });

  it('a pattern match keeps crisis guidance whatever the reads say', async () => {
    const turn = await runTurn("I hope I don't wake up tomorrow", {
      env: GATE_ON,
      gate: 'none',
      pipeline: 'crisis',
    });
    expect(turn.soft).toEqual([]);
    expect(turn.crisis).toHaveLength(1);
    expect(turn.crisis[0].content).toContain('988');
  });

  it('an imminent read keeps the crisis override even when the other read disagrees', async () => {
    const turn = await runTurn('the car is running in the garage with the door shut', {
      env: GATE_ON,
      gate: 'none',
      pipeline: 'imminent',
    });
    expect(turn.soft).toEqual([]);
    expect(turn.override || turn.crisis.length > 0).toBe(true);
  });

  it('agreeing crisis reads keep crisis guidance', async () => {
    const turn = await runTurn('I just feel off tonight', {
      env: GATE_ON,
      gate: 'crisis',
      pipeline: 'crisis',
    });
    expect(turn.soft).toEqual([]);
    expect(turn.crisis).toHaveLength(1);
    expect(turn.crisis[0].content).toContain('988');
  });
});

describe('turn handler: grounded release (CRISIS_GROUNDED_RELEASE)', () => {
  const everyday: CrisisGenerateFn = async (prompt) =>
    prompt === GROUNDED_RELEASE_CSSRS_PROMPT
      ? '{"wish_dead":"none","ideation":"none","method":"none","intent":"none","plan_time":"none","everyday":true}'
      : '{"danger":"","about":"dinner is tonight","decision":"everyday"}';
  const dinner = (env: Record<string, string>) => ({
    env,
    gate: 'imminent' as const,
    pipeline: 'imminent' as const,
    earlier: ['Dinner is at my place tonight.'],
    groundedReads: [everyday, everyday],
  });

  it('a released imminent read injects the light touch, not the generic soft check', async () => {
    const turn = await runTurn(
      'Dinner is tonight.',
      dinner({ ...LIVE, CRISIS_GROUNDED_RELEASE: 'live' })
    );
    expect(turn.soft.map((i) => i.content)).toEqual([GROUNDED_LIGHT_TOUCH]);
    expect(turn.crisis).toEqual([]);
    expect(turn.override).toBe(false);
  });

  it('with the release off the same turn keeps the crisis handling', async () => {
    const turn = await runTurn('Dinner is tonight.', dinner(LIVE));
    expect(turn.soft).toEqual([]);
    expect(turn.crisis.length + (turn.override ? 1 : 0)).toBeGreaterThan(0);
  });
});
