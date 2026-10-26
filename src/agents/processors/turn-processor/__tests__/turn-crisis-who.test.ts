/**
 * THIRD_PARTY_SELF_HARM through the real turn pipeline (startTurnCrisis) with
 * the classifier live: off and shadow equal main, live reroutes only a
 * third-party read, and shadow logs no caller text (issue #2635).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const info = vi.hoisted(() => vi.fn());
vi.mock('../../../../utils/safe-logger.js', () => {
  const logger = { info, warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn() };
  return { createLogger: () => logger, default: logger, logger };
});

import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../../services/safety/crisis-classifier.js';
import { WHO_PROMPT, resetWhoReads, type WhoKind } from '../../../../services/safety/crisis-who.js';
import { buildCrisisGuidance, type CrisisDetectionResult } from '../../../safety/crisis-guard.js';
import { startTurnCrisis } from '../turn-crisis.js';

const SENTINEL = 'zq-sentinel-4410';

interface Case {
  name: string;
  latest: string;
  earlier: string[];
  verdict: string;
  who: WhoKind;
}

const CASES: Case[] = [
  {
    name: 'bereaved, classifier third-party',
    latest: "my brother said he would kill himself and now he's gone",
    earlier: [],
    verdict: '{"risk":"crisis","subject":"third_party"}',
    who: 'bereaved',
  },
  {
    name: 'bereaved, patterns third-party',
    latest: "my brother wants to kill himself and now he's gone",
    earlier: [],
    verdict: '{"risk":"crisis","subject":"third_party"}',
    who: 'bereaved',
  },
  {
    name: "the caller's own risk beside a third-party clause",
    latest: "he said he'd kill himself and i bought a gun to end it",
    earlier: [],
    verdict: '{"risk":"crisis","subject":"third_party"}',
    who: 'self',
  },
  {
    name: '#2648 round-1 session lowering case',
    latest: 'soon none of this will matter',
    earlier: ["he said he'd kill himself and i would never kill myself", "i can't do this anymore"],
    verdict: '{"risk":"none","subject":"self"}',
    who: 'bereaved',
  },
  {
    name: '#2648 round-2 session lowering case',
    latest: "he said he'd kill himself and i would never kill myself",
    earlier: ["i can't do this anymore", 'i feel like such a burden to everyone'],
    verdict: '{"risk":"crisis","subject":"third_party"}',
    who: 'bereaved',
  },
  {
    name: "own imminent risk, the classifier's subject flipped to third-party",
    latest: "i have the pills right here and i'm taking them now and he said he'd kill himself",
    earlier: [],
    verdict: '{"risk":"imminent","subject":"third_party"}',
    who: 'self',
  },
  {
    name: 'own risk earlier in the session, bereavement now',
    latest: "my brother said he would kill himself and now he's gone",
    earlier: ["i can't do this anymore", 'i feel like such a burden to everyone'],
    verdict: '{"risk":"crisis","subject":"third_party"}',
    who: 'bereaved',
  },
  {
    name: 'third-party risk a veto used to drop',
    latest: "lol he says he'll kill himself, i'm worried",
    earlier: [],
    verdict: '{"risk":"crisis","subject":"third_party"}',
    who: 'third_party',
  },
];

function generateFor(c: Case): CrisisGenerateFn {
  return async (system) => (system === WHO_PROMPT ? JSON.stringify({ who: c.who }) : c.verdict);
}

async function run(c: Case, mode: string | undefined, sessionId = 'call-1') {
  resetCrisisClassifierCache();
  resetWhoReads();
  const env: Record<string, string | undefined> = { CRISIS_CLASSIFIER_MODE: 'live' };
  if (mode) env.THIRD_PARTY_SELF_HARM = mode;
  const turn = startTurnCrisis(
    c.latest,
    { recentTranscripts: c.earlier },
    { env, generate: generateFor(c), sessionId }
  );
  const [summary, crisis, bypass] = await Promise.all([
    turn.summary(),
    turn.resolve(),
    turn.bypassAllowed(),
  ]);
  return { summary, crisis, bypass };
}

const severityOf = (c: CrisisDetectionResult) => [c.isCrisis, c.severity] as const;

beforeEach(() => info.mockClear());

describe('THIRD_PARTY_SELF_HARM in the turn pipeline', () => {
  it.each(CASES)('off and shadow equal main: $name', async (c) => {
    const main = await run(c, undefined);
    expect(await run(c, 'off')).toEqual(main);
    expect(await run(c, 'shadow')).toEqual(main);
  });

  it.each(CASES)('live never lowers: $name', async (c) => {
    const main = await run(c, undefined);
    const live = await run(c, 'live');
    expect(live.crisis.severity).toBeGreaterThanOrEqual(main.crisis.severity);
    if (main.crisis.isCrisis) expect(live.crisis.isCrisis).toBe(true);
    if (main.crisis.subject === 'self') expect(live.crisis.subject).toBe('self');
    for (const indicator of main.crisis.indicators)
      expect(live.crisis.indicators).toContain(indicator);
    expect(live.bypass).toBe(main.bypass);
  });

  it('live: a bereaved caller gets grief guidance, not "988 for them"', async () => {
    for (const c of CASES.slice(0, 2)) {
      const main = await run(c, undefined);
      const live = await run(c, 'live');
      expect(main.summary.subject).toBe('third_party');
      expect(buildCrisisGuidance(main.crisis)).toMatch(/on the person's behalf/);
      expect(live.summary.subject).toBe('bereaved');
      expect(severityOf(live.crisis)).toEqual(severityOf(main.crisis));
      expect(buildCrisisGuidance(live.crisis)).toMatch(/grieving/);
      expect(buildCrisisGuidance(live.crisis)).not.toMatch(/on the person's behalf/);
    }
  });

  it("live: the caller's own risk wins, and the other person keeps their 988 line", async () => {
    const live = await run(CASES[2], 'live');
    expect(live.summary.subject).toBe('self');
    expect(buildCrisisGuidance(live.crisis)).toMatch(/988[\s\S]*for the user themselves/);
    expect(buildCrisisGuidance(live.crisis)).toMatch(/on their behalf/);
  });

  it("live: an own-imminent line gets main's self-imminent script", async () => {
    const c = CASES[5];
    const asSelf = { ...c, verdict: '{"risk":"imminent","subject":"self"}' };
    const main = await run(asSelf, undefined);
    const live = await run(c, 'live');
    expect(main.summary.shouldOverrideLLM).toBe(true);
    expect(live.summary.shouldOverrideLLM).toBe(true);
    expect(live.summary.subject).toBe('self');
    expect(live.summary.suggestedResponse).toBe(main.summary.suggestedResponse);
    expect(live.summary.indicators).toContain('imminent_danger');
  });

  it("live: the session's own earlier risk keeps the self guidance over grief", async () => {
    const c = CASES[6];
    const main = await run(c, undefined);
    expect(main.summary.subject).toBe('third_party');
    const live = await run(c, 'live');
    expect(live.summary.subject).toBe('self');
    expect(buildCrisisGuidance(live.crisis)).toMatch(/Acknowledge their pain/);
    expect(buildCrisisGuidance(live.crisis)).not.toMatch(/grieving someone who has died/);
  });

  it('live: session escalation is kept whatever the who read says', async () => {
    for (const c of CASES.slice(3, 5)) {
      const live = await run(c, 'live');
      expect([live.summary.subject, live.summary.isCrisis]).toEqual(['self', true]);
      expect(live.summary.indicators).toContain('session_escalation');
    }
  });

  it('shadow logs the kind and booleans only, never caller text', async () => {
    const c = { ...CASES[1], latest: `${CASES[1].latest} ${SENTINEL}` };
    await run(c, 'shadow');
    await vi.waitFor(() =>
      expect(info.mock.calls.some(([, msg]) => msg === 'THIRD_PARTY_WHO')).toBe(true)
    );
    const logs = info.mock.calls.filter(([, msg]) => msg === 'THIRD_PARTY_WHO');
    expect(logs).toEqual([[{ kind: 'bereaved', changed: true, eager: true }, 'THIRD_PARTY_WHO']]);
    expect(JSON.stringify(info.mock.calls)).not.toContain(SENTINEL);
  });
});
