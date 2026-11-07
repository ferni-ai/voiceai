/**
 * A minor's abuse disclosure keeps 988 when the crisis classifier cannot read the turn: the
 * owner's ruling, "if the risk can't be read, the lifeline stays". With MINOR_ABUSE_DISCLOSURE
 * on, a turn the minor's read flagged got the child-safety care without 988 whenever the
 * classifier was off, threw or timed out, because a missing read was taken as no risk; with
 * ABUSE_DISCLOSURE_PATTERNS on too, the minor's guidance (first) hid the abuse read's 988.
 *
 * Each turn runs through the real crisis path (startTurnCrisis, then summary(), as
 * process-turn.ts builds the turn's crisis field) and the real voice turn handler, which adds
 * the crisis_response injection. A read the classifier made is unchanged, and so is every turn
 * with both flags off. All lines fictional.
 */
import { readFileSync } from 'node:fs';
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { disclosureGuidance } from '../../../services/safety/abuse-disclosure-turn.js';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
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
import { buildCrisisGuidance } from '../../safety/crisis-guard.js';

type Env = Record<string, string>;
interface Scenario {
  env: Env;
  generate: CrisisGenerateFn;
}
interface Turn {
  crisis: Record<string, unknown> & { indicators: string[] };
  guidance: string[];
}

const BASE: Env = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
  CRISIS_CLASSIFIER_TIMEOUT_MS: '25',
  SEXUAL_TOPIC_BOUNDARY: 'on',
};
const FLAGS: Record<string, Env> = {
  both: { ABUSE_DISCLOSURE_PATTERNS: 'on', MINOR_ABUSE_DISCLOSURE: 'on' },
  abuse: { ABUSE_DISCLOSURE_PATTERNS: 'on', MINOR_ABUSE_DISCLOSURE: 'off' },
  minor: { ABUSE_DISCLOSURE_PATTERNS: 'off', MINOR_ABUSE_DISCLOSURE: 'on' },
  off: { ABUSE_DISCLOSURE_PATTERNS: 'off', MINOR_ABUSE_DISCLOSURE: 'off' },
};

const read = (risk: string): CrisisGenerateFn =>
  (async () => `{"risk":"${risk}","subject":"self"}`) as CrisisGenerateFn;
/** The three ways the classifier gives no read: off (no run at all), an error, no answer in time. */
const UNREAD: Record<string, { env: Env; generate: CrisisGenerateFn }> = {
  missing: { env: { CRISIS_CLASSIFIER_MODE: 'off' }, generate: read('crisis') },
  throws: {
    env: {},
    generate: (async () => {
      throw new Error('classifier unavailable');
    }) as CrisisGenerateFn,
  },
  'times out': {
    env: {},
    // Never answers: the classifier's own timeout (CRISIS_CLASSIFIER_TIMEOUT_MS) ends the read.
    generate: (() =>
      new Promise<never>(() => {
        /* never settles */
      })) as unknown as CrisisGenerateFn,
  },
};
const READ: Record<string, CrisisGenerateFn> = { none: read('none'), crisis: read('crisis') };

/** Both reads flag it: a 14-year-old, hitting (abuse) and touching (the minor's read). */
const MINOR_LINE = "I'm 14 and my stepdad hits me and touches me at night.";
/** Hitting, not sexual harm: with both flags on, the abuse read answers it (the minor's defers). */
const HITS_LINE = "I'm 14 and my stepdad hits me.";

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
      { sessionId: `minor-abuse-988-${++state.n}`, env, generate }
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

const { handleUserTurn } = await import('../../voice-agent/turn-handler.js');
type Ctx = Parameters<typeof handleUserTurn>[0];

/** One first turn through the real handler: the turn's crisis field and its crisis guidance. */
async function runTurn(userText: string, scenario: Scenario): Promise<Turn> {
  resetCall();
  state.scenario = scenario;
  state.result = undefined;
  await handleUserTurn({
    turnCtx: llm.ChatContext.empty(),
    userText,
    contextOnly: true,
    persona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' },
    services: { sessionId: 'minor-abuse-988' },
    userData: { turnCount: 1 },
  } as unknown as Ctx);
  const result = state.result as {
    crisis: Turn['crisis'];
    context: { injections: Array<{ category: string; content: string }> };
  };
  const guidance = result.context.injections
    .filter((i) => i.category === 'crisis_response')
    .map((i) => i.content);
  return { crisis: result.crisis, guidance };
}

/** Each turn is a fresh call: no read cached from another turn, no risk carried over. */
function resetCall(): void {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetGroundedRelease();
  resetMinorCare();
  resetSexualTopicHold();
}

beforeEach(resetCall);

/** The child-safety care a minor's disclosure brings (minor-abuse-disclosure.ts). */
function expectChildSafety(turn: Turn, why: string): void {
  expect(turn.guidance, why).toHaveLength(1);
  const [g] = turn.guidance;
  expect(g, why).toContain('[CRITICAL - CHILD SAFETY]');
  expect(g, why).toContain('tell a safe adult they trust');
  expect(g, why).toContain('1-800-422-4453');
  expect(g, why).toContain('call 911');
}

/** 988 in the turn's one crisis guidance, at crisis level. */
function expect988(turn: Turn, why: string): void {
  expect(turn.guidance, why).toHaveLength(1);
  expect(turn.guidance[0], why).toMatch(/\b988\b/);
  expect(turn.crisis.isCrisis, why).toBe(true);
  expect(turn.crisis.severity, why).toBeGreaterThanOrEqual(SEVERITY.crisis);
}

async function unreadTurn(line: string, flags: Env, how: string): Promise<Turn> {
  const { env, generate } = UNREAD[how];
  return runTurn(line, { env: { ...BASE, ...flags, ...env }, generate });
}

describe("no classifier read of a minor's abuse disclosure keeps 988", () => {
  for (const how of Object.keys(UNREAD)) {
    it(`both flags on, the classifier ${how}: 988 and the child-safety care`, async () => {
      const turn = await unreadTurn(MINOR_LINE, FLAGS.both, how);
      expect988(turn, how);
      expectChildSafety(turn, how);
      // Minor first: main's crisis guidance (988) leads, the child-safety care follows it.
      expect(turn.guidance[0].indexOf('988')).toBeLessThan(
        turn.guidance[0].indexOf('[CRITICAL - CHILD SAFETY]')
      );
      expect(turn.crisis.indicators).toEqual(
        expect.arrayContaining([
          'minor_abuse_disclosure',
          'minor_abuse_disclosure_self_harm',
          'abuse_disclosure',
          'abuse_disclosure_child',
        ])
      );
    });

    it(`both flags on, the classifier ${how}: a hitting-only disclosure keeps 988`, async () => {
      const turn = await unreadTurn(HITS_LINE, FLAGS.both, how);
      expect988(turn, how);
      expect(turn.guidance[0]).toContain('The caller is telling you that someone is hurting them');
      expect(turn.guidance[0]).toContain('tell a safe adult they trust');
    });

    it(`only ABUSE_DISCLOSURE_PATTERNS on, the classifier ${how}: 988`, async () => {
      for (const line of [MINOR_LINE, HITS_LINE])
        expect988(await unreadTurn(line, FLAGS.abuse, how), `${how}: ${line}`);
    });

    it(`only MINOR_ABUSE_DISCLOSURE on, the classifier ${how}: 988 and the child-safety care`, async () => {
      const turn = await unreadTurn(MINOR_LINE, FLAGS.minor, how);
      expect988(turn, how);
      expectChildSafety(turn, how);
      expect(turn.crisis.indicators).toContain('minor_abuse_disclosure_self_harm');
    });
  }
});

/** What main read on each turn the classifier read (origin/main 6d67de17e2, these same runs). */
const MINOR = ['minor_abuse_disclosure'];
const MINOR_RISK = ['classifier_crisis', ...MINOR, 'minor_abuse_disclosure_self_harm'];
const ABUSE = ['abuse_disclosure', 'abuse_disclosure_child'];
const ABUSE_RISK = ['classifier_crisis', ...ABUSE, 'abuse_disclosure_self_harm'];
const MAIN_READ: Record<string, string[]> = {
  [`${MINOR_LINE}|both|none`]: [...MINOR, ...ABUSE],
  [`${MINOR_LINE}|both|crisis`]: [...MINOR_RISK, ...ABUSE, 'abuse_disclosure_self_harm'],
  [`${MINOR_LINE}|abuse|none`]: ABUSE,
  [`${MINOR_LINE}|abuse|crisis`]: ABUSE_RISK,
  [`${MINOR_LINE}|minor|none`]: MINOR,
  [`${MINOR_LINE}|minor|crisis`]: MINOR_RISK,
  [`${HITS_LINE}|both|none`]: ABUSE,
  [`${HITS_LINE}|both|crisis`]: ABUSE_RISK,
  [`${HITS_LINE}|abuse|none`]: ABUSE,
  [`${HITS_LINE}|abuse|crisis`]: ABUSE_RISK,
  // Changed (owner decision 2026-11-02): the minor's read hears hitting now. Main read [] and
  // ['classifier_crisis'] here, with no child-safety care at all.
  [`${HITS_LINE}|minor|none`]: MINOR,
  [`${HITS_LINE}|minor|crisis`]: MINOR_RISK,
};

/** The turn as main reads it: the read, its level, and the handler's guidance for that read. */
function expectMain(turn: Turn, indicators: string[], why: string): void {
  const isCrisis = indicators.length > 0;
  const severity = indicators.includes('classifier_crisis') ? 0.75 : isCrisis ? 0.7 : 0;
  expect(turn.crisis, why).toMatchObject({ isCrisis, severity, indicators });
  expect(turn.crisis.indicators, why).toEqual(indicators);
  expect(turn.crisis.softCheck, why).toBeUndefined();
  const crisis = turn.crisis as unknown as Parameters<typeof disclosureGuidance>[0];
  expect(turn.guidance, why).toEqual(
    isCrisis ? [disclosureGuidance(crisis) ?? buildCrisisGuidance(crisis)] : []
  );
}

describe('a turn the classifier read is as on main', () => {
  for (const [flags, env] of Object.entries(FLAGS).filter(([f]) => f !== 'off')) {
    for (const [risk, generate] of Object.entries(READ)) {
      it(`${flags} on, the classifier reading ${risk}`, async () => {
        for (const line of [MINOR_LINE, HITS_LINE]) {
          const turn = await runTurn(line, { env: { ...BASE, ...env }, generate });
          expectMain(turn, MAIN_READ[`${line}|${flags}|${risk}`], `${flags} ${risk}: ${line}`);
        }
      });
    }
  }

  it("reading none, a minor's disclosure gets the child-safety care without 988, as on main", async () => {
    const turn = await runTurn(MINOR_LINE, {
      env: { ...BASE, ...FLAGS.both },
      generate: READ.none,
    });
    expectChildSafety(turn, 'none');
    expect(turn.guidance[0]).not.toMatch(/\b988\b/);
  });
});

// Changed (K1e): with both flags off the kernel reads the hitting itself (crisis-guard.ts), with
// the abuse guidance and 988 beside it. Main read [] and ['classifier_crisis'] here.
const KERNEL = [...ABUSE, 'abuse_disclosure_self_harm'];
describe('both flags off: the kernel reads someone hurting the caller', () => {
  for (const line of [MINOR_LINE, HITS_LINE]) {
    it(`no classifier read: the kernel's abuse read (${line})`, async () => {
      for (const how of Object.keys(UNREAD)) {
        const turn = await unreadTurn(line, FLAGS.off, how);
        expectMain(turn, KERNEL, how);
        expect(turn.guidance[0], how).toMatch(/\b988\b/);
        expect(turn.guidance[0], how).toContain('1-800-422-4453');
      }
    });
    it(`the classifier's read beside it (${line})`, async () => {
      const off = { ...BASE, ...FLAGS.off };
      expectMain(await runTurn(line, { env: off, generate: READ.none }), KERNEL, 'none');
      expectMain(
        await runTurn(line, { env: off, generate: READ.crisis }),
        [...KERNEL, 'classifier_crisis'],
        'crisis'
      );
    });
  }
});

describe('the crisis simulator injects the guidance the turn handler does', () => {
  it("full-path-turn.ts: disclosure guidance first, main's crisis guidance otherwise", () => {
    const sim = readFileSync(
      new URL('../../../../scripts/crisis-eval/full-path-turn.ts', import.meta.url),
      'utf8'
    ).replace(/\s+/g, ' ');
    expect(sim).toContain(
      "const turnGuidance = summary.isCrisis && !summary.shouldOverrideLLM ? (disclosureGuidance(summary) ?? buildCrisisGuidance(resolved)) : '';"
    );
  });
});
