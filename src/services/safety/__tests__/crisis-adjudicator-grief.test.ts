/**
 * CRISIS_ADJUDICATOR_GRIEF (off by default): a grief/overwhelm rule in the
 * adjudicator's prompt and a first-turn read when Ferni has spoken.
 *
 * - Off: the prompt is the 2026-10-17 replay baseline plus exactly one always-on
 *   rule-2 addition (arranging care for children, pets or belongings), and the
 *   request is otherwise unchanged.
 * - On: the prompt carries the grief rule and keeps every other line; a caller's
 *   first line is read when there is a Ferni line.
 * - Live stays held back: with the flag on, what the reply model is told is
 *   unchanged (this file never lifts the hold).
 *
 * Stub models only. The model's verdicts can't be measured offline, so these
 * tests check what the model is SENT for each case of the 2026-10-20 eval set
 * (synthetic lines), never what it would answer.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { startCrisisGate } from '../../../agents/personas/crisis-gate.js';
import { startTurnCrisis } from '../../../agents/processors/turn-processor/turn-crisis.js';
import { FLAG_MANIFEST, type FlagSpec } from '../../../config/flag-manifest.js';
import {
  buildAdjudicatorRequest,
  CRISIS_ADJUDICATOR_PROMPT,
  resetCrisisAdjudicatorCache,
  startCrisisAdjudicator,
  transcriptFrom,
  type AdjudicatorLine,
} from '../crisis-adjudicator.js';
import { SOFT_CRISIS_CHECK } from '../crisis-agreement.js';
import { resetCrisisClassifierCache, type CrisisGenerateFn } from '../crisis-classifier.js';

/** sha256 of the adjudicator prompt on origin/main 25c054ef3 (the replay baseline). */
const MAIN_PROMPT_SHA256 = '2d27e3923f6460c64192dca05448ca2d22c28c1ce71f497ebc95d055e8c522ae';
/** Always on, flag or not: rule 2's one addition (the 2026-10-20 replay's softened positives). */
const RULE2_ADDITION =
  ' arranging care for children, pets or belongings, especially tonight or "just in case";';
/** sha256 of the flag-off prompt: main's plus RULE2_ADDITION. */
const BASELINE_PROMPT_SHA256 = 'c8b94d2827e9863e37553c5508d80273c0a2ff8880042cfbb23ade54db914759';
const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
/** The grief rule's own line in the flag-on prompt. */
const GRIEF_RULE = /^4a\. .*grief/im;

const CHECKIN = '{"caller_risk":"","decision":"checkin","confidence":"high"}';
const CLASSIFIER_CRISIS = '{"risk":"crisis","subject":"self"}';
const LIVE_CLASSIFIER = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const SHADOW = { CRISIS_ADJUDICATOR: 'shadow' };
const GRIEF = { CRISIS_ADJUDICATOR_GRIEF: 'on' };
const CRISIS_READ = [{ risk: 'crisis' as const, subject: 'self' as const }];

interface Sent {
  system: string;
  lines: AdjudicatorLine[];
}
/** A stub model that records what it was sent and answers checkin. */
function recorder(): { sent: Sent[]; generate: CrisisGenerateFn } {
  const sent: Sent[] = [];
  return {
    sent,
    generate: async (system, user) => {
      sent.push({ system, lines: JSON.parse(user) as AdjudicatorLine[] });
      return CHECKIN;
    },
  };
}
const reply =
  (text: string): CrisisGenerateFn =>
  async () =>
    text;

interface EvalCase {
  id: string;
  expect: 'offer' | 'offer_or_checkin' | 'no_offer';
  label: 'block' | 'crisis' | 'none';
  kind: string;
  earlier: string[];
  companion: string;
  text: string;
}
const CASES = JSON.parse(
  readFileSync(
    join(__dirname, '../../../agents/__tests__/fixtures/crisis-grief-2026-10-20.json'),
    'utf8'
  )
) as EvalCase[];
const linesOf = (c: EvalCase): AdjudicatorLine[] =>
  transcriptFrom({ latest: c.text, earlier: c.earlier, companion: c.companion });
const byId = (id: string): EvalCase => {
  const c = CASES.find((x) => x.id === id);
  if (!c) throw new Error(`no case ${id}`);
  return c;
};

/** Run the shadow adjudicator on a case and return what the model was sent, if anything. */
async function sentFor(c: EvalCase, env: Record<string, string>): Promise<Sent | undefined> {
  const { sent, generate } = recorder();
  const run = startCrisisAdjudicator(linesOf(c), {
    pattern: 'none',
    verdicts: CRISIS_READ,
    env,
    generate,
    source: 'pipeline',
    scope: `call-${c.id}`,
  });
  await run?.result;
  return sent[0];
}

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisAdjudicatorCache();
});

describe('flag', () => {
  it('is in the manifest: off by default, an experiment owned by safety', () => {
    const spec = (FLAG_MANIFEST as Record<string, FlagSpec>).CRISIS_ADJUDICATOR_GRIEF;
    expect(spec).toEqual({ default: 'off', owner: 'safety', kind: 'experiment' });
  });
});

describe("flag off: main's prompt plus exactly the rule-2 addition", () => {
  it('the exported prompt differs from main only by the rule-2 addition, inside rule 2', () => {
    expect(CRISIS_ADJUDICATOR_PROMPT.split(RULE2_ADDITION)).toHaveLength(2);
    const rule2 = CRISIS_ADJUDICATOR_PROMPT.split('\n').find((l) => l.includes(RULE2_ADDITION));
    expect(rule2).toMatch(/^2\. Caller risk, anywhere in the call, includes: /);
    expect(rule2).toContain(`look after a pet, child or belongings;${RULE2_ADDITION} funeral`);
    expect(sha256(CRISIS_ADJUDICATOR_PROMPT.replace(RULE2_ADDITION, ''))).toBe(MAIN_PROMPT_SHA256);
    expect(sha256(CRISIS_ADJUDICATOR_PROMPT)).toBe(BASELINE_PROMPT_SHA256);
  });

  const offValues: Array<Record<string, string>> = [
    {},
    { CRISIS_ADJUDICATOR_GRIEF: 'off' },
    { CRISIS_ADJUDICATOR_GRIEF: 'banana' },
  ];
  it.each(offValues)(
    'the model is sent the baseline prompt and the same transcript (%o)',
    async (flag) => {
      const c = byId('not-01');
      const sent = await sentFor(c, { ...SHADOW, ...flag });
      expect(sha256(sent?.system ?? '')).toBe(BASELINE_PROMPT_SHA256);
      expect(sent?.lines).toEqual(linesOf(c));
    }
  );

  it('a first caller line still escalates for no context, without a model call', async () => {
    const { sent, generate } = recorder();
    const run = startCrisisAdjudicator(linesOf(byId('not-07')), {
      pattern: 'none',
      verdicts: CRISIS_READ,
      env: SHADOW,
      generate,
      source: 'gate',
    });
    expect(await run?.result).toEqual({ decision: 'escalate', why: 'no_context' });
    expect(sent).toHaveLength(0);
  });
});

describe('flag on: the grief rule', () => {
  it('adds one rule before rule 5 and keeps every other line of the prompt', async () => {
    const system = (await sentFor(byId('not-01'), { ...SHADOW, ...GRIEF }))?.system ?? '';
    expect(system).toMatch(GRIEF_RULE);
    const lines = system.split('\n');
    const at = lines.findIndex((l) => GRIEF_RULE.test(l));
    expect(lines[at - 1]).toMatch(/^4\. "checkin" only when/);
    expect(lines[at + 1]).toMatch(/^5\. When you are unsure, escalate/);
    lines.splice(at, 1);
    expect(sha256(lines.join('\n'))).toBe(BASELINE_PROMPT_SHA256);
  });

  it('names grief without risk as a check-in and keeps risky grief as escalate', () => {
    const rule = buildAdjudicatorRequest(linesOf(byId('not-01')), true)?.prompt.match(GRIEF_RULE);
    const text = rule?.input?.split('\n').find((l) => GRIEF_RULE.test(l)) ?? '';
    const checkin = text.slice(0, text.indexOf('escalate'));
    for (const shape of ['loss', 'shock', 'sadness', 'numb', 'overwhelm']) {
      expect(checkin).toContain(shape);
    }
    expect(checkin).toContain("don't know what to do with myself");
    expect(checkin).toContain("can't stop crying");
    const risky = text.slice(text.indexOf('escalate'));
    for (const shape of [
      'join or be with the person who died',
      'no point now',
      'giving their own things away',
      'plan',
      'means',
      "can't go on",
      'not wanting to wake up',
    ]) {
      expect(risky).toContain(shape);
    }
  });
});

describe('flag on: the first caller line is read when Ferni has spoken', () => {
  it('a first-turn "Yeah." reaches the model with Ferni\'s line', async () => {
    const c = byId('not-07');
    const sent = await sentFor(c, { ...SHADOW, ...GRIEF });
    expect(sent?.lines).toEqual([
      { speaker: 'ferni', text: c.companion },
      { speaker: 'caller', text: c.text },
    ]);
  });

  it("still escalates without a Ferni line, or when the last line is not the caller's", () => {
    expect(buildAdjudicatorRequest([{ speaker: 'caller', text: 'Yeah.' }], true)).toBeNull();
    const ferniLast: AdjudicatorLine[] = [
      { speaker: 'caller', text: 'Hey.' },
      { speaker: 'ferni', text: 'Hey you.' },
    ];
    expect(buildAdjudicatorRequest(ferniLast, true)).toBeNull();
  });
});

describe('the 2026-10-20 eval set: what the model is sent per case', () => {
  it('has the 63 synthetic cases, 33 that must be offered and 30 that must not', () => {
    expect(CASES).toHaveLength(63);
    expect(CASES.filter((c) => c.expect === 'no_offer')).toHaveLength(30);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(63);
  });

  it.each(CASES.map((c) => [c.id, c] as const))(
    "%s: flag on sends the grief rule, every earlier line, Ferni's line and the latest",
    async (_id, c) => {
      const sent = await sentFor(c, { ...SHADOW, ...GRIEF });
      expect(sent?.system).toMatch(GRIEF_RULE);
      expect(sent?.lines).toEqual([
        ...c.earlier.map((text) => ({ speaker: 'caller', text })),
        { speaker: 'ferni', text: c.companion },
        { speaker: 'caller', text: c.text },
      ]);
    }
  );

  it.each(CASES.map((c) => [c.id, c] as const))(
    '%s: flag off sends the baseline request, or nothing on a first turn',
    async (_id, c) => {
      const sent = await sentFor(c, SHADOW);
      if (c.earlier.length === 0) {
        expect(sent).toBeUndefined();
        return;
      }
      expect(sha256(sent?.system ?? '')).toBe(BASELINE_PROMPT_SHA256);
      expect(sent?.lines).toEqual(linesOf(c));
    }
  );
});

describe('live stays held: with the flag on, the reply model is told the same', () => {
  function chat(c: EvalCase): llm.ChatContext {
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
    for (const line of c.earlier) ctx.addMessage({ role: 'user', content: line });
    ctx.addMessage({ role: 'assistant', content: c.companion });
    ctx.addMessage({ role: 'user', content: c.text });
    return ctx;
  }
  const AGREE = { CRISIS_AGREEMENT_GATE: 'on' };

  /** The flag-off reply gate's decision for a case: today's behaviour. */
  async function gateWithoutFlag(c: EvalCase, env: Record<string, string>, session: string) {
    const turn = startCrisisGate(
      chat(c),
      { services: { sessionId: session } },
      {
        env: { ...LIVE_CLASSIFIER, CRISIS_ADJUDICATOR: 'live', ...env },
        generate: reply(CLASSIFIER_CRISIS),
        adjudicate: reply(CHECKIN),
      }
    );
    return turn?.escalation;
  }

  it.each([
    ['not-01', {}],
    ['not-07', {}],
    ['not-01', AGREE],
    ['not-07', AGREE],
  ] as const)('reply gate, %s %o: crisis guidance, never the soft check', async (id, extra) => {
    const c = byId(id);
    const off = await gateWithoutFlag(c, { ...extra }, `off-${id}-${JSON.stringify(extra)}`);
    resetCrisisClassifierCache();
    resetCrisisAdjudicatorCache();
    const { sent, generate } = recorder();
    const turn = startCrisisGate(
      chat(c),
      { services: { sessionId: `on-${id}-${JSON.stringify(extra)}` } },
      {
        env: { ...LIVE_CLASSIFIER, CRISIS_ADJUDICATOR: 'live', ...GRIEF, ...extra },
        generate: reply(CLASSIFIER_CRISIS),
        adjudicate: generate,
      }
    );
    const on = await turn?.escalation;
    expect(on?.action).toBe('guide');
    expect(on?.action === 'guide' && on.guidance).not.toBe(SOFT_CRISIS_CHECK);
    expect(on).toEqual(off);
    // Not vacuous: the shadow adjudicator did read the turn, with the grief rule, and said checkin.
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].system).toMatch(GRIEF_RULE);
  });

  it.each([{}, AGREE])('turn pipeline %o: still a crisis, no soft check', async (extra) => {
    const c = byId('not-07');
    const { sent, generate } = recorder();
    const t = startTurnCrisis(
      c.text,
      { recentTranscripts: c.earlier, lastAgentResponse: c.companion },
      {
        sessionId: `pipe-${JSON.stringify(extra)}`,
        env: { ...LIVE_CLASSIFIER, CRISIS_ADJUDICATOR: 'live', ...GRIEF, ...extra },
        generate: reply(CLASSIFIER_CRISIS),
        adjudicate: generate,
      }
    );
    expect(await t.softCheck()).toBe(false);
    expect((await t.resolve()).isCrisis).toBe(true);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].system).toMatch(GRIEF_RULE);
  });
});
