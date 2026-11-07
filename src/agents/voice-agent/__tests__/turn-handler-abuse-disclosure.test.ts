/**
 * ABUSE_DISCLOSURE_PATTERNS through the real voice turn handler (turn-handler.ts). The turn's
 * crisis field is built as process-turn.ts builds it (startTurnCrisis, then summary()); the
 * handler is real, and each test reads the injections it adds.
 *
 * - A disclosure whose classifier read the provider blocked (CRISIS_CLASSIFIER_BLOCKED_SIGNAL on)
 *   takes the abuse path: the crisis_response injection with the abuse guidance (988 kept, since a
 *   blocked read is no read), never the blocked read's soft check-in.
 * - A turn both MINOR_ABUSE_DISCLOSURE and this flag read keeps the minor's guidance, as on main
 *   with only the minor flag on.
 *
 * All lines fictional.
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  BLOCKED_REPLY,
  BLOCKED_SAFETY_CHECK,
  resetClassifierBlocked,
} from '../../../services/safety/crisis-classifier-blocked.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { resetGroundedRelease } from '../../../services/safety/crisis-grounded-release.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { SEVERITY } from '../../../services/safety/crisis-severity.js';
import { resetMinorCare } from '../../../utils/minor-care.js';
import { resetSexualTopicHold } from '../../../utils/sexual-topic-hold.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';

interface Scenario {
  env: Record<string, string>;
  generate: CrisisGenerateFn;
}
interface Crisis {
  isCrisis: boolean;
  severity: number;
  indicators: string[];
  softCheck?: boolean;
}

const BASE = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_AGREEMENT_GATE: 'on',
  CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
  CRISIS_CLASSIFIER_BLOCKED_SIGNAL: 'on',
};
const ABUSE_OFF = { ...BASE, ABUSE_DISCLOSURE_PATTERNS: 'off' };
const ABUSE_ON = { ...BASE, ABUSE_DISCLOSURE_PATTERNS: 'on' };
const blocked: CrisisGenerateFn = async () => BLOCKED_REPLY;
const none: CrisisGenerateFn = async () => '{"risk":"none","subject":"self"}';

const state = vi.hoisted(() => ({
  scenario: undefined as unknown,
  result: undefined as unknown,
  n: 0,
}));

vi.mock('../../processors/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  processTurn: vi.fn(async (ctx: { userText: string }) => {
    const { env, generate } = state.scenario as Scenario;
    const turnCrisis = startTurnCrisis(
      ctx.userText,
      { recentTranscripts: [ctx.userText], turnCount: 1 },
      { sessionId: `abuse-handler-${++state.n}`, env, generate }
    );
    state.result = {
      analysis: { analysis: { emotion: 'neutral', intent: 'unknown' } },
      context: { injections: [], elapsedMs: 0 },
      emotional: { primary: 'neutral', intensity: 0.2 },
      response: {},
      identity: {},
      crisis: await turnCrisis.summary(),
    };
    return state.result;
  }),
}));

const { handleUserTurn } = await import('../turn-handler.js');
type Ctx = Parameters<typeof handleUserTurn>[0];

/** One first turn through the real handler: the turn's crisis field and the safety injections. */
async function runTurn(userText: string, scenario: Scenario) {
  state.scenario = scenario;
  state.result = undefined;
  await handleUserTurn({
    turnCtx: llm.ChatContext.empty(),
    userText,
    contextOnly: true,
    persona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' },
    services: { sessionId: 'abuse-handler' },
    userData: { turnCount: 1 },
  } as unknown as Ctx);
  const result = state.result as {
    crisis: Crisis;
    context: { injections: Array<{ category: string; content: string }> };
  };
  const of = (category: string) =>
    result.context.injections.filter((i) => i.category === category).map((i) => i.content);
  return { crisis: result.crisis, guidance: of('crisis_response'), soft: of('safety_soft_check') };
}

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetClassifierBlocked();
  resetGroundedRelease();
  resetMinorCare();
  resetSexualTopicHold();
});

// Each line with the resources its abuse guidance must carry beside 911 and 988.
const BLOCKED_LINES: Array<[string, string[]]> = [
  ['My dad hits me.', ['1-800-422-4453', 'tell a safe adult they trust']],
  ['My boyfriend hits me.', ['1-800-799-7233', 'someone they trust they could be with tonight']],
  [
    "He won't stop hitting me.",
    [
      '1-800-422-4453',
      'tell a safe adult they trust',
      '1-800-799-7233',
      'someone they trust they could be with tonight',
    ],
  ],
];

describe('turn handler: a blocked classifier read of an abuse disclosure', () => {
  // Changed (K1e): main gave the blocked soft check-in here; the kernel now reads the abuse.
  it("takes the kernel's abuse read with the flag off: the line, 911 and 988, never the soft check", async () => {
    for (const [line, resources] of BLOCKED_LINES) {
      const turn = await runTurn(line, { env: ABUSE_OFF, generate: blocked });
      expect(turn.soft, line).toEqual([]);
      expect(turn.soft, line).not.toContain(BLOCKED_SAFETY_CHECK);
      expect(turn.guidance, line).toHaveLength(1);
      expect(turn.guidance[0], line).toContain('call 911');
      expect(turn.guidance[0], line).toMatch(/\b988\b/);
      for (const resource of resources) expect(turn.guidance[0], line).toContain(resource);
    }
  });

  it('takes the abuse path with the flag on: 988, 911, the line and the nudge, never the soft check', async () => {
    for (const [line, resources] of BLOCKED_LINES) {
      const turn = await runTurn(line, { env: ABUSE_ON, generate: blocked });
      expect(turn.soft, line).toEqual([]);
      expect(turn.guidance, line).toHaveLength(1);
      const [g] = turn.guidance;
      expect(g, line).toContain('The caller is telling you that someone is hurting them');
      expect(g, line).toContain('Ask whether they are safe right now');
      expect(g, line).toContain('call 911');
      // A blocked read is no read, so 988 stays.
      expect(g, line).toContain('include the 988 Suicide & Crisis Lifeline');
      for (const want of resources) expect(g, line).toContain(want);
      expect(turn.crisis.isCrisis, line).toBe(true);
      expect(turn.crisis.softCheck, line).toBeUndefined();
      expect(turn.crisis.severity, line).toBeGreaterThanOrEqual(SEVERITY.crisis);
      expect(turn.crisis.indicators, line).toContain('abuse_disclosure_self_harm');
    }
  });
});

describe('turn handler: a turn MINOR_ABUSE_DISCLOSURE also reads', () => {
  it("keeps the minor's child-safety guidance, exactly as with this flag off", async () => {
    const line = "I'm 14 and my stepdad hits me and touches me at night.";
    const minor = { ...BASE, MINOR_ABUSE_DISCLOSURE: 'on', SEXUAL_TOPIC_BOUNDARY: 'on' };
    const off = await runTurn(line, {
      env: { ...minor, ABUSE_DISCLOSURE_PATTERNS: 'off' },
      generate: none,
    });
    const on = await runTurn(line, {
      env: { ...minor, ABUSE_DISCLOSURE_PATTERNS: 'on' },
      generate: none,
    });
    expect(on.crisis.indicators).toEqual(
      expect.arrayContaining([
        'minor_abuse_disclosure',
        'abuse_disclosure',
        'abuse_disclosure_child',
      ])
    );
    expect(off.guidance).toHaveLength(1);
    expect(off.guidance[0]).toContain('[CRITICAL - CHILD SAFETY]');
    expect(on.guidance).toEqual(off.guidance);
    expect(on.crisis.severity).toBeGreaterThanOrEqual(off.crisis.severity);
  });
});
