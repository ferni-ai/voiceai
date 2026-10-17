/**
 * CRISIS_IMMINENT_SOFT_CHECK against every labelled crisis corpus the
 * classifier and the agreement gate were measured on: dev/heldout, blind,
 * contextual, red-team, the 2026-10-11 gloomy-Ferni set, the BTH set and 38
 * short risky probes with no lexicon word (fixtures/crisis-short-probes-2026-10-17.json).
 * Each case goes through the real reply gate with a forced imminent read and
 * a forced crisis read, the patterns as they are, flag off and on (and with
 * CRISIS_AGREEMENT_GATE on, as prod runs).
 *
 * A real positive is any case whose outcome is an escalation with a pattern
 * match or risk content (crisis-agreement.ts hasRiskContent) in the caller's
 * words, earlier words or Ferni's line: none may change. Every labelled
 * positive is held to the same bar.
 */
import { llm } from '@livekit/agents';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { CRISIS_CONTEXTUAL } from '../../../__tests__/fixtures/crisis-contextual.js';
import { CRISIS_HELDOUT } from '../../../__tests__/fixtures/crisis-heldout.js';
import { CRISIS_TEST_BLIND } from '../../../__tests__/fixtures/crisis-test-blind.js';
import { hasRiskContent } from '../../../../services/safety/crisis-agreement.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../../services/safety/crisis-classifier.js';
import {
  checkInEligible,
  resetCrisisSoftCheck,
} from '../../../../services/safety/crisis-soft-check.js';
import { CRISIS_TEST_CASES } from '../../../../services/superhuman/validation/crisis-test-cases.js';
import { decisionFor, startCrisisGate } from '../../../personas/crisis-gate.js';
import { detectCrisis } from '../../../safety/crisis-guard.js';

interface Case {
  set: string;
  text: string;
  positive: boolean;
  earlier: string[];
  companion?: string;
}

type Labelled = { text: string; label: string; earlier?: string[]; companion?: string };
const json = (file: string): Labelled[] =>
  JSON.parse(
    readFileSync(new URL(`../../../../../scripts/crisis-eval/${file}`, import.meta.url), 'utf8')
  ) as Labelled[];
const labelled = (set: string, cases: readonly Labelled[]): Case[] =>
  cases.map((c) => ({
    set,
    text: c.text,
    positive: c.label !== 'none',
    earlier: c.earlier ?? [],
    companion: c.companion,
  }));

const CASES: Case[] = [
  ...labelled('heldout', CRISIS_HELDOUT),
  ...labelled('blind', CRISIS_TEST_BLIND),
  ...labelled('contextual', CRISIS_CONTEXTUAL),
  ...labelled('redteam', json('redteam-2026-10-05.json')),
  ...labelled('gloomy', json('gloomy-ferni-2026-10-11.json')),
  ...labelled(
    'short',
    JSON.parse(
      readFileSync(
        new URL('../../../__tests__/fixtures/crisis-short-probes-2026-10-17.json', import.meta.url),
        'utf8'
      )
    ) as Labelled[]
  ),
  ...CRISIS_TEST_CASES.filter((c) => c.expectedResult.expectedValue !== 'maybe').map((c) => ({
    set: 'bth',
    text: c.input,
    positive: c.expectedResult.shouldDetect,
    earlier: [],
    companion: undefined,
  })),
];

const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const ENVS = {
  off: LIVE,
  on: { ...LIVE, CRISIS_IMMINENT_SOFT_CHECK: 'on' },
  agreementOff: { ...LIVE, CRISIS_AGREEMENT_GATE: 'on' },
  agreementOn: { ...LIVE, CRISIS_AGREEMENT_GATE: 'on', CRISIS_IMMINENT_SOFT_CHECK: 'on' },
};

const reads =
  (risk: 'imminent' | 'crisis'): CrisisGenerateFn =>
  async () =>
    `{"risk":"${risk}","subject":"self"}`;

let n = 0;
/** The reply's final crisis handling for one case, one read, one environment. */
async function outcome(c: Case, risk: 'imminent' | 'crisis', env: Record<string, string>) {
  resetCrisisClassifierCache();
  resetCrisisSoftCheck();
  const ctx = llm.ChatContext.empty();
  for (const line of c.earlier) ctx.addMessage({ role: 'user', content: line });
  if (c.companion) ctx.addMessage({ role: 'assistant', content: c.companion });
  ctx.addMessage({ role: 'user', content: c.text });
  const userData = { services: { sessionId: `corpus-${++n}` } };
  const turn = startCrisisGate(ctx, userData, { env, generate: reads(risk) });
  return JSON.stringify((await turn?.escalation) ?? turn?.decision);
}

/** Escalated on main with a pattern or risk content: must never change. */
function realPositive(c: Case): boolean {
  const patterns = decisionFor(detectCrisis(c.text, undefined, { recentMessages: c.earlier }));
  const texts =
    c.companion === undefined ? [c.text, ...c.earlier] : [c.text, ...c.earlier, c.companion];
  return patterns.action !== 'pass' || texts.some(hasRiskContent);
}

beforeEach(() => resetCrisisSoftCheck());

describe('CRISIS_IMMINENT_SOFT_CHECK replay over every crisis corpus', () => {
  it('changes no real positive and no labelled positive; softens only classifier-only false alarms', async () => {
    expect(CASES.length).toBeGreaterThan(450);
    const changed: string[] = [];
    const softened: Record<string, number> = {};
    const reads2 = ['imminent', 'crisis'] as const;
    for (const c of CASES) {
      for (const risk of reads2) {
        for (const [off, on] of [
          ['off', 'on'],
          ['agreementOff', 'agreementOn'],
        ] as const) {
          const before = await outcome(c, risk, ENVS[off]);
          const after = await outcome(c, risk, ENVS[on]);
          if (before === after) continue;
          if (c.positive || realPositive(c)) changed.push(`${c.set}: ${c.text} (${risk}, ${on})`);
          else softened[`${on}/${risk}`] = (softened[`${on}/${risk}`] ?? 0) + 1;
        }
      }
    }
    expect(changed).toEqual([]);
    expect({
      cases: CASES.length,
      positives: CASES.filter((c) => c.positive).length,
      realPositives: CASES.filter((c) => c.positive || realPositive(c)).length,
    }).toEqual({ cases: 490, positives: 307, realPositives: 427 });
    // Of the 63 classifier-only false alarms, those about the call in a call that was only
    // about the call get the check-in (most corpus cases have earlier lines of their own).
    expect(softened).toEqual({ 'on/imminent': 1, 'on/crisis': 1, 'agreementOn/imminent': 1 });
  }, 120_000);

  it('no real positive is ever eligible, for any read combination the gate can see', () => {
    const imminent = { risk: 'imminent', subject: 'self' } as const;
    const crisis = { risk: 'crisis', subject: 'self' } as const;
    const none = { risk: 'none', subject: 'self' } as const;
    const combos = [[imminent], [crisis], [imminent, none], [crisis, none], [crisis, crisis]];
    const taken = CASES.filter((c) => c.positive || realPositive(c)).flatMap((c) =>
      combos
        .filter((verdicts) =>
          checkInEligible(
            {
              pattern: 'none',
              verdicts,
              latest: c.text,
              earlier: c.earlier,
              companion: c.companion,
            },
            detectCrisis(c.text)
          )
        )
        .map((v) => `${c.set}: ${c.text} (${v.map((r) => r.risk).join('+')})`)
    );
    expect(taken).toEqual([]);
  });
});
