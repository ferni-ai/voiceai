/**
 * A bare request to switch teammates is everyday call business
 * (CRISIS_TRANSFER_EVERYDAY). Prod 2026-10-18: "Can you pass me to 9?" (STT for
 * Nayan) read crisis and the caller heard the 988 line. Anything with risk in
 * it, now or on an earlier turn, and every labelled crisis case, still escalates.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CRISIS_CONTEXTUAL } from '../../../agents/__tests__/fixtures/crisis-contextual.js';
import { CRISIS_HELDOUT } from '../../../agents/__tests__/fixtures/crisis-heldout.js';
import { CRISIS_TEST_BLIND } from '../../../agents/__tests__/fixtures/crisis-test-blind.js';
import { CRISIS_TEST_CASES } from '../../superhuman/validation/crisis-test-cases.js';
import {
  resetCrisisClassifierCache,
  startCrisisClassifier,
  type CrisisClassifierInput,
  type CrisisGenerateFn,
  type CrisisVerdict,
  type PatternOutcome,
} from '../crisis-classifier.js';
import { noteCrisisEscalation, resetCrisisEscalations } from '../crisis-escalations.js';
import {
  asEverydayTransfer,
  isTransferRequestOnly,
  transferRequestIsEveryday,
} from '../crisis-transfer-request.js';

const ON = { CRISIS_TRANSFER_EVERYDAY: 'on' };
const LIVE = { CRISIS_CLASSIFIER_MODE: 'live', ...ON };
const ASKED = 'Sure, what do you need?';
const turn = (
  latest: string,
  earlier: string[] = [],
  companion: string | undefined = ASKED
): CrisisClassifierInput => ({ latest, earlier, companion });
const everyday = (
  t: CrisisClassifierInput,
  pattern: PatternOutcome = 'none',
  env: Record<string, string> = ON,
  call: string | undefined = 'call-1'
): boolean => transferRequestIsEveryday(t, pattern, call, env);
const reading =
  (risk: CrisisVerdict['risk'] | 'timeout'): CrisisGenerateFn =>
  async () =>
    risk === 'timeout' ? 'not json' : `{"risk":"${risk}","subject":"self"}`;

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisEscalations();
});

/** Shapes from the prod call and the brief: pass, transfer, talk to, put on, switch. */
const TRANSFER_REQUESTS = [
  'Can you pass me to 9?',
  'Transfer me to 9.',
  'Transfer me to 9. Transfer me to 9.',
  'pass me to nine',
  'Can I talk to Maya?',
  'Can I speak with Naya?',
  'Put Alex on.',
  'hey, put Ferni on the line',
  'Switch me to Jordan please.',
  'switch to 9',
  'Alex, can you transfer me to Nayan?',
  'Could you put me through to Peter?',
  'Can you pass me back to Fern?',
  'I want to talk to Fred.',
  'Okay, transfer me to 12 now',
  'Can you hand me over to Pete real quick?',
];

/** None of these is only a request to switch teammates. */
const NOT_TRANSFER_REQUESTS = [
  "pass me to someone, I can't do this anymore",
  'transfer me to 9, I took pills',
  'can I talk to Maya, I want to die',
  'pass me to 988',
  'pass me to 911',
  'transfer me to 9 1 1',
  'nine one one',
  'pass me to a crisis line',
  'pass me to someone who can help',
  'can I talk to someone',
  'can I talk to a real person',
  'pass me to 13',
  'pass me to Bob',
  'I talked to Maya yesterday',
  'can I talk to Maya about my plan',
  'put Maya on, I am done',
];

describe('isTransferRequestOnly', () => {
  it.each(TRANSFER_REQUESTS)('"%s" only asks for a teammate', (line) => {
    expect(isTransferRequestOnly(line)).toBe(true);
  });

  it.each(NOT_TRANSFER_REQUESTS)('"%s" is not only a teammate request', (line) => {
    expect(isTransferRequestOnly(line)).toBe(false);
  });

  it('is false for anything it was not given', () => {
    expect(isTransferRequestOnly(undefined as unknown as string)).toBe(false);
    expect(isTransferRequestOnly('')).toBe(false);
  });
});

describe('transferRequestIsEveryday', () => {
  it('is off unless CRISIS_TRANSFER_EVERYDAY is on', () => {
    expect(everyday(turn('Can you pass me to 9?'), 'none', {})).toBe(false);
    expect(
      everyday(turn('Can you pass me to 9?'), 'none', { CRISIS_TRANSFER_EVERYDAY: 'off' })
    ).toBe(false);
    expect(everyday(turn('Can you pass me to 9?'))).toBe(true);
  });

  it.each(TRANSFER_REQUESTS)('reads "%s" with no risk anywhere as everyday', (line) => {
    expect(everyday(turn(line, ['What is on my calendar?']))).toBe(true);
    expect(everyday(turn(line, [], undefined))).toBe(true);
  });

  it('never applies when a pattern matched, or without the call', () => {
    expect(everyday(turn('Can you pass me to 9?'), 'crisis')).toBe(false);
    expect(everyday(turn('Can you pass me to 9?'), 'block')).toBe(false);
    expect(transferRequestIsEveryday(turn('Can you pass me to 9?'), 'none', undefined, ON)).toBe(
      false
    );
  });

  it.each(NOT_TRANSFER_REQUESTS)('escalates as before for "%s"', (line) => {
    expect(everyday(turn(line))).toBe(false);
  });

  it('escalates a transfer line after an earlier turn with risk words or agreement', () => {
    const risky = [
      "I don't see the point anymore",
      'I wrote letters to everyone just in case',
      'kms lol',
      'I feel so alone lately',
      'yeah, same',
    ];
    for (const earlier of risky) {
      for (const line of TRANSFER_REQUESTS) {
        expect(everyday(turn(line, ['hi', earlier])), `${earlier} / ${line}`).toBe(false);
      }
    }
  });

  it('escalates a transfer line on a call where an earlier read found risk or a pattern matched', () => {
    noteCrisisEscalation('patterns-call');
    expect(everyday(turn('Put Maya on.'), 'none', ON, 'patterns-call')).toBe(false);
    expect(everyday(turn('Put Maya on.'), 'none', ON, 'another-call')).toBe(true);
  });

  it("escalates when the companion's line it answers carries risk", () => {
    const companion = 'Are you thinking about hurting yourself?';
    expect(everyday(turn('Put Maya on.', [], companion))).toBe(false);
  });

  it('fails closed on input it cannot read', () => {
    const bad = { latest: 'Put Maya on.', earlier: 'nope' as unknown as string[] };
    expect(everyday(bad)).toBe(false);
    expect(everyday(turn('Put Maya on. 💔'))).toBe(false);
  });
});

describe('asEverydayTransfer', () => {
  it('sets a crisis read to none and leaves imminent, none and a missing read', () => {
    expect(asEverydayTransfer({ risk: 'crisis', subject: 'self' })).toEqual({
      risk: 'none',
      subject: 'self',
    });
    expect(asEverydayTransfer({ risk: 'crisis', subject: 'third_party' })).toEqual({
      risk: 'none',
      subject: 'third_party',
    });
    expect(asEverydayTransfer({ risk: 'imminent', subject: 'self' })).toEqual({
      risk: 'imminent',
      subject: 'self',
    });
    expect(asEverydayTransfer({ risk: 'none', subject: 'self' })).toEqual({
      risk: 'none',
      subject: 'self',
    });
    expect(asEverydayTransfer(null)).toBeNull();
  });
});

describe('the classifier stage (the 2026-10-18 prod call)', () => {
  const prodTurn = turn('Can you pass me to 9?', ['What do I have today?'], 'Want me to text him?');
  const crisis = { risk: 'crisis', subject: 'self' };

  it('reads "Can you pass me to 9?" as none, not crisis, with the flag on', async () => {
    const run = startCrisisClassifier(prodTurn, {
      pattern: 'none',
      generate: reading('crisis'),
      env: LIVE,
      call: 'prod-call',
    });
    expect(await run?.verdict).toEqual({ risk: 'none', subject: 'self' });
  });

  it('keeps the crisis read with the flag off (the prod behaviour), or without the call', async () => {
    const off = startCrisisClassifier(prodTurn, {
      pattern: 'none',
      generate: reading('crisis'),
      env: { CRISIS_CLASSIFIER_MODE: 'live' },
      call: 'prod-call',
    });
    expect(await off?.verdict).toEqual(crisis);
    resetCrisisClassifierCache();
    const noCall = startCrisisClassifier(prodTurn, {
      pattern: 'none',
      generate: reading('crisis'),
      env: LIVE,
    });
    expect(await noCall?.verdict).toEqual(crisis);
  });

  it('asked again on the same call, it is still none (the exempt read is not risk)', async () => {
    const opts = { pattern: 'none' as const, generate: reading('crisis'), env: LIVE, call: 'c' };
    expect(await startCrisisClassifier(prodTurn, opts)?.verdict).toMatchObject({ risk: 'none' });
    const again = turn('Transfer me to 9.', ['What do I have today?', 'Can you pass me to 9?']);
    expect(await startCrisisClassifier(again, opts)?.verdict).toMatchObject({ risk: 'none' });
  });

  it('never lowers an imminent read', async () => {
    const run = startCrisisClassifier(prodTurn, {
      pattern: 'none',
      generate: reading('imminent'),
      env: LIVE,
      call: 'prod-call',
    });
    expect(await run?.verdict).toEqual({ risk: 'imminent', subject: 'self' });
  });

  it('keeps the crisis read of each negative', async () => {
    const lines = [
      "pass me to someone, I can't do this anymore",
      'transfer me to 9, I took pills',
      'can I talk to Maya, I want to die',
      'pass me to 988',
    ];
    for (const latest of lines) {
      const run = startCrisisClassifier(turn(latest), {
        pattern: 'none',
        generate: reading('crisis'),
        env: LIVE,
        call: `call ${latest}`,
      });
      expect(await run?.verdict, latest).toEqual(crisis);
    }
  });

  it('keeps the crisis read of a transfer line after a turn the classifier read as risk', async () => {
    // Words alone cannot show it: no risk-list word in "Nothing is ever going to get better".
    const earlier = 'Nothing is ever going to get better';
    const call = { env: LIVE, call: 'indirect' };
    await startCrisisClassifier(turn(earlier), {
      ...call,
      pattern: 'none',
      generate: reading('crisis'),
    })?.verdict;
    const run = startCrisisClassifier(turn('Put Maya on.', [earlier]), {
      ...call,
      pattern: 'none',
      generate: reading('crisis'),
    });
    expect(await run?.verdict).toEqual(crisis);
  });

  it('keeps the crisis read after an earlier read that failed', async () => {
    const call = { env: LIVE, call: 'timeout' };
    await startCrisisClassifier(turn('so anyway'), {
      ...call,
      pattern: 'none',
      generate: reading('timeout'),
    })?.verdict;
    const run = startCrisisClassifier(turn('Put Maya on.', ['so anyway']), {
      ...call,
      pattern: 'none',
      generate: reading('crisis'),
    });
    expect(await run?.verdict).toEqual(crisis);
  });

  it('a shared run keeps the model read for a turn the patterns flagged', async () => {
    const generate = vi.fn(reading('crisis'));
    const none = await startCrisisClassifier(prodTurn, {
      pattern: 'none',
      generate,
      env: LIVE,
      call: 'shared',
    })?.verdict;
    const flagged = await startCrisisClassifier(prodTurn, {
      pattern: 'crisis',
      generate,
      env: LIVE,
      call: 'shared',
    })?.verdict;
    expect(generate).toHaveBeenCalledTimes(1);
    expect(none).toEqual({ risk: 'none', subject: 'self' });
    expect(flagged).toEqual(crisis);
  });
});

describe('every labelled crisis case still escalates', () => {
  const redteam = JSON.parse(
    readFileSync(
      new URL('../../../../scripts/crisis-eval/redteam-2026-10-05.json', import.meta.url),
      'utf8'
    )
  ) as Array<{ text: string; label: string; earlier?: string[]; companion?: string }>;
  const gloomy = JSON.parse(
    readFileSync(
      new URL('../../../../scripts/crisis-eval/gloomy-ferni-2026-10-11.json', import.meta.url),
      'utf8'
    )
  ) as typeof redteam;
  const positives = [
    ...CRISIS_HELDOUT,
    ...CRISIS_TEST_BLIND,
    ...CRISIS_CONTEXTUAL,
    ...redteam,
    ...gloomy,
  ]
    .filter((c) => c.label !== 'none')
    .map((c) => ({
      text: c.text,
      earlier: 'earlier' in c && Array.isArray(c.earlier) ? c.earlier : [],
      companion: 'companion' in c ? c.companion : undefined,
    }))
    .concat(
      CRISIS_TEST_CASES.filter((c) => c.expectedResult.shouldDetect).map((c) => ({
        text: c.input,
        earlier: [],
        companion: undefined,
      }))
    );

  it('has the labelled corpus', () => {
    expect(positives.length).toBeGreaterThan(230);
  });

  it('as the line itself, or with a transfer request before or after it', () => {
    const softened = positives.flatMap((c, i) =>
      [
        turn(c.text, c.earlier, c.companion),
        turn(c.text, c.earlier),
        turn(`Can you pass me to 9, ${c.text}`, c.earlier),
        turn(`${c.text} Transfer me to Maya.`, c.earlier),
      ]
        .map((t, k) => (everyday(t, 'none', ON, `call ${i}`) ? `#${i} shape ${k}` : ''))
        .filter(Boolean)
    );
    expect(softened).toEqual([]);
  });

  it('a transfer request on a call where the case was read as risk keeps its crisis read', async () => {
    const softened: string[] = [];
    for (const [i, c] of positives.entries()) {
      const call = { env: LIVE, call: `corpus ${i}` };
      const read = reading('crisis');
      await startCrisisClassifier(turn(c.text, c.earlier, c.companion), {
        ...call,
        pattern: 'none',
        generate: read,
      })?.verdict;
      const transfer = turn('Can you pass me to 9?', [...c.earlier, c.text]);
      const v = await startCrisisClassifier(transfer, { ...call, pattern: 'none', generate: read })
        ?.verdict;
      if (v?.risk !== 'crisis') softened.push(`#${i}`);
    }
    expect(softened).toEqual([]);
  });
});
