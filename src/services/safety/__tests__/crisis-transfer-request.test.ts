/**
 * A bare request to switch teammates gets at most the soft check-in
 * (CRISIS_TRANSFER_EVERYDAY). Prod 2026-10-18: "Can you pass me to 9?" (STT for
 * Nayan) read crisis and the caller heard the 988 line. Anything with risk in
 * it, now or on an earlier turn (finished or still being read), and every
 * labelled crisis case, keeps full crisis handling.
 *
 * What the gate and the turn pipeline do with the decision is tested in
 * agents/personas/__tests__/crisis-transfer-gate.test.ts.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { CRISIS_CONTEXTUAL } from '../../../agents/__tests__/fixtures/crisis-contextual.js';
import { CRISIS_HELDOUT } from '../../../agents/__tests__/fixtures/crisis-heldout.js';
import { CRISIS_TEST_BLIND } from '../../../agents/__tests__/fixtures/crisis-test-blind.js';
import { CRISIS_TEST_CASES } from '../../superhuman/validation/crisis-test-cases.js';
import {
  resetCrisisClassifierCache,
  startCrisisClassifier,
  type CrisisClassifierInput,
  type CrisisGenerateFn,
  type PatternOutcome,
} from '../crisis-classifier.js';
import {
  crisisRiskThisCall,
  noteCrisisRisk,
  resetCrisisCallRisk,
  trackCrisisRead,
} from '../crisis-call-risk.js';
import { isTransferRequestOnly, transferRequestIsEveryday } from '../crisis-transfer-request.js';

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
  call = 'call-1'
): boolean => transferRequestIsEveryday(t, pattern, call, env);

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
});

/** Shapes from the prod call and the brief: pass, transfer, talk to, put on, switch. */
const TRANSFER_REQUESTS = [
  'Can you pass me to 9?',
  'Transfer me to 9.',
  'Transfer me to 9. Transfer me to 9.',
  'pass me to nine',
  'Can I talk to Maya?',
  'Put Alex on.',
  'hey, put Ferni on the line',
  'Switch me to Jordan please.',
  'switch to 9',
  'Alex, can you transfer me to Nayan?',
  'Could you put me through to Peter?',
  'Can you pass me back to Ferni?',
  'I want to talk to Nayan.',
  'Okay, transfer me to 12 now',
  'Can you hand me over to Peter real quick?',
];

/** None of these is only a request to switch teammates. */
const NOT_TRANSFER_REQUESTS = [
  "pass me to someone, I can't do this anymore",
  'transfer me to 9, I took pills',
  'can I talk to Maya, I want to die',
  'pass me to 988',
  'pass me to 911',
  'transfer me to 9 1 1',
  'pass me to nine. one one',
  'nine one one',
  'pass me to a crisis line',
  'pass me to someone who can help',
  'can I talk to someone',
  'can I talk to a real person',
  'pass me to 13',
  'pass me to Bob',
  // Speech-to-text spellings are often ordinary words: only the names as written count.
  'Can I speak with Naya?',
  'Can you pass me back to Fern?',
  'I want to talk to Fred.',
  'I talked to Maya yesterday',
  'can I talk to Maya about my plan',
  'put Maya on, I am done',
  // No crisis pattern matches these: the exemption's own guards must catch them.
  'let me talk to Maya one last time',
  "put Ferni on, I'm done",
  'transfer me to Nayan, I just want to say goodbye to everyone',
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

describe('the hard block, on its own', () => {
  // A grammar that takes anything: only the block stands between these lines and the exemption.
  const ANYTHING = /^.*$/;

  it.each([
    'pass me to 988',
    'pass me to 911',
    'can I talk to someone',
    'transfer me to 9 1 1',
    'pass me to nine eight eight',
    'put me through to a crisis line',
    'can I talk to a counselor',
    'get me someone who can help',
    'transfer me to a real person',
    'call emergency',
  ])('refuses "%s" whatever the grammar says', (line) => {
    expect(isTransferRequestOnly(line, ANYTHING)).toBe(false);
  });

  it('lets a plain teammate request through that grammar', () => {
    expect(isTransferRequestOnly('Can you pass me to 9?', ANYTHING)).toBe(true);
    expect(isTransferRequestOnly('Put Maya on.', ANYTHING)).toBe(true);
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

  it.each(TRANSFER_REQUESTS)('reads "%s" with no risk anywhere as a transfer request', (line) => {
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

  it.each(NOT_TRANSFER_REQUESTS)('keeps full crisis handling for "%s"', (line) => {
    expect(everyday(turn(line))).toBe(false);
  });

  it('keeps it for a transfer line after an earlier turn with risk words or agreement', () => {
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

  it('keeps it on a call where an earlier read found risk, failed, or a pattern matched', async () => {
    noteCrisisRisk('patterns-call');
    expect(everyday(turn('Put Maya on.'), 'none', ON, 'patterns-call')).toBe(false);
    await trackCrisisRead(
      'risky-call',
      'I wont be a problem much longer',
      Promise.resolve({ risk: 'crisis' })
    );
    expect(everyday(turn('Put Maya on.'), 'none', ON, 'risky-call')).toBe(false);
    await trackCrisisRead('failed-call', 'so anyway', Promise.resolve(null));
    expect(everyday(turn('Put Maya on.'), 'none', ON, 'failed-call')).toBe(false);
    await trackCrisisRead('clean-call', 'what time is it', Promise.resolve({ risk: 'none' }));
    expect(everyday(turn('Put Maya on.'), 'none', ON, 'clean-call')).toBe(true);
  });

  it('keeps it while an earlier read is still in flight (a split turn)', async () => {
    let finish: (v: { risk: string }) => void = () => undefined;
    const slow = new Promise<{ risk: string }>((resolve) => {
      finish = resolve;
    });
    // The risky final's read has not come back when the transfer final arrives.
    void trackCrisisRead(
      'split',
      "I gave my dog to my sister, she'll take better care of him",
      slow
    );
    expect(everyday(turn('Can you pass me to 9?'), 'none', ON, 'split')).toBe(false);
    finish({ risk: 'crisis' });
    await slow;
    expect(everyday(turn('Can you pass me to 9?'), 'none', ON, 'split')).toBe(false);
  });

  it("does not count this turn's own read on the other path as risk", () => {
    void trackCrisisRead(
      'same-turn',
      'Can you pass me to 9?',
      new Promise<{ risk: string }>((_resolve) => {
        void _resolve;
      })
    );
    expect(everyday(turn('Can you pass me to 9?'), 'none', ON, 'same-turn')).toBe(true);
  });

  it("keeps it when the companion's line it answers carries risk", () => {
    const companion = 'Are you thinking about hurting yourself?';
    expect(everyday(turn('Put Maya on.', [], companion))).toBe(false);
  });

  it('fails closed on input it cannot read', () => {
    const bad = { latest: 'Put Maya on.', earlier: 'nope' as unknown as string[] };
    expect(everyday(bad)).toBe(false);
    expect(everyday(turn('Put Maya on. 💔'))).toBe(false);
  });
});

describe('every labelled crisis case keeps full crisis handling', () => {
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
    const exempted = positives.flatMap((c, i) =>
      [
        turn(c.text, c.earlier, c.companion),
        turn(c.text, c.earlier),
        turn(`Can you pass me to 9, ${c.text}`, c.earlier),
        turn(`${c.text} Transfer me to Maya.`, c.earlier),
      ]
        .map((t, k) => (everyday(t, 'none', ON, `call ${i}`) ? `#${i} shape ${k}` : ''))
        .filter(Boolean)
    );
    expect(exempted).toEqual([]);
  });

  it('a transfer request after the case was read, or while its read is in flight', async () => {
    const exempted: string[] = [];
    for (const [i, c] of positives.entries()) {
      const call = `corpus ${i}`;
      const transfer = turn('Can you pass me to 9?', [...c.earlier, c.text]);
      // In flight: the classifier has not answered yet.
      let finish: (v: string) => void = () => undefined;
      const slow: CrisisGenerateFn = () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        });
      const read = startCrisisClassifier(turn(c.text, c.earlier, c.companion), {
        env: LIVE,
        call,
        pattern: 'none',
        generate: slow,
      })?.verdict;
      if (everyday(transfer, 'none', ON, call)) exempted.push(`#${i} in flight`);
      finish('{"risk":"crisis","subject":"self"}');
      await read;
      if (everyday(transfer, 'none', ON, call)) exempted.push(`#${i} after`);
    }
    expect(exempted).toEqual([]);
  });
});

describe('risk noted on a call', () => {
  it('is kept for 6 hours from the last note, however many other calls come after', () => {
    const start = 1_000_000;
    noteCrisisRisk('first', start);
    for (let i = 0; i < 2000; i++) noteCrisisRisk(`other ${i}`, start + i);
    expect(crisisRiskThisCall('first', undefined, start + 5_000)).toBe(true);
    noteCrisisRisk('first', start + 60_000); // noted again: its 6 hours start again
    const sixHours = 6 * 60 * 60 * 1000;
    expect(crisisRiskThisCall('first', undefined, start + 60_000 + sixHours)).toBe(true);
    expect(crisisRiskThisCall('first', undefined, start + 60_001 + sixHours)).toBe(false);
  });
});
