/**
 * A bare request to forget a named thing gets at most the soft check-in (CRISIS_FORGET_EVERYDAY,
 * #4159). Dev 2026-11-19: "please forget everything about the Denver job" and "forget Theo's
 * number too" read crisis and the caller heard the 988 line. Anything about the caller themself,
 * anything with risk in it now or on an earlier turn, and every labelled crisis case keeps full
 * crisis handling. Lines are fictional.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CRISIS_CONTEXTUAL } from '../../../agents/__tests__/fixtures/crisis-contextual.js';
import { CRISIS_HELDOUT_RETIRED } from '../../../agents/__tests__/fixtures/crisis-heldout-retired.js';
import { CRISIS_TEST_CASES } from '../../superhuman/validation/crisis-test-cases.js';
import {
  resetCrisisClassifierCache,
  type CrisisClassifierInput,
  type PatternOutcome,
} from '../crisis-classifier.js';
import { noteCrisisRisk, resetCrisisCallRisk, trackCrisisRead } from '../crisis-call-risk.js';
import { forgetRequestIsEveryday } from '../crisis-forget-request.js';

// A step inside the check throwing (the risk list here) must leave full crisis handling.
const h = vi.hoisted(() => ({ breaks: false }));
vi.mock('../crisis-agreement.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../crisis-agreement.js')>();
  return {
    ...real,
    hasRiskContent: (text: string) => {
      if (h.breaks) throw new Error('risk list broke');
      return real.hasRiskContent(text);
    },
  };
});

const ON = { CRISIS_FORGET_EVERYDAY: 'on' };
const ASKED = 'Got it. Anything else?';
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
): boolean => forgetRequestIsEveryday(t, pattern, call, env);

beforeEach(() => {
  h.breaks = false;
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
});

/** The three dev lines (#4159) and the shapes of a forget request. */
const FORGET_REQUESTS = [
  "Before anything, please forget everything about the Denver job. I don't want it brought up.",
  "Actually, you know what? Please forget everything about the Denver job. I don't want it brought up again.",
  "And forget Theo's number too. I'll just keep it in my phone.",
  'Please forget the recruiter call.',
  "Delete Theo's new number from your memory.",
  'Can you erase what I told you about the move?',
  "Don't bring up the Denver job again.",
  "I don't want the recruiter mentioned again.",
  'Forget everything about my old apartment, please.',
  "Yes, I'm sure. Forget the Denver job.",
  'Could you just remove the dentist appointment?',
];

/** None of these is only a request to forget a named thing. */
const NOT_FORGET_REQUESTS = [
  'forget about me',
  'just forget me',
  'please forget I exist',
  'forget I said that',
  'forget everything',
  "delete everything, I won't need it",
  'forget my life',
  'forget the Denver job, I am done with all of it',
  'forget the Denver job, it does not matter, nothing does',
  'forget everything about my family, they will be better off',
  'forget the plan, goodbye',
  'delete my number, nobody needs it',
  'forget the Denver job and help me',
  'forget 988',
  'forget it',
  "don't bring it up",
  "Yes, I'm sure. Forget it.",
  'thanks, please forget it',
  'I forgot my keys',
  'can you remind me about the Denver job',
  'forget the Denver job, I want to die',
  "I don't want to be mentioned again",
  // A sentence after the named thing is never read as part of its name.
  "forget the Denver job I'm so tired",
  'please forget the Denver job, so tired of all of it',
  'forget the Denver job, nothing matters',
];

/** A forget request the agreement gate's risk list still flags ("I've decided" reads as resolve). */
const FLAGGED_BY_RISK_LIST =
  "Before anything, please forget everything about the Denver job. I've decided and I don't want it brought up.";

/** Only the line itself: no earlier turn, no companion line, a clean call. */
const alone = (line: string): boolean => everyday(turn(line, [], undefined));

describe('which lines count as only a forget request', () => {
  it.each(FORGET_REQUESTS)('"%s" only asks to forget a named thing', (line) => {
    expect(alone(line)).toBe(true);
  });

  it.each(NOT_FORGET_REQUESTS)('"%s" is not only a named forget request', (line) => {
    expect(alone(line)).toBe(false);
  });

  it('a bare "forget it" never counts, even right after a named request', () => {
    // Callers also say it to take back something heavy they just said.
    for (const line of ['Forget it.', "Yes, I'm sure. Forget it.", 'Just forget that.']) {
      expect(alone(line)).toBe(false);
      expect(everyday(turn(line, ['Please forget everything about the Denver job.']))).toBe(false);
    }
  });

  it('reads at most 24 words', () => {
    const named = 'please forget everything about the Denver job';
    expect(alone(`${named} ${Array(17).fill('again').join(' ')}`)).toBe(true); // 24 words
    expect(alone(`${named} ${Array(18).fill('again').join(' ')}`)).toBe(false); // 25 words
  });

  it('rejects the slowest lines it can be given quickly (it runs on every crisis read)', () => {
    // Each word here can open a clause or sit inside a name; an ambiguous grammar tries every
    // split before it rejects the last word. 40 "forget"s and an "i" once took 30 seconds.
    const rep = (word: string, n: number): string => Array(n).fill(word).join(' ');
    for (const n of [23, 39, 200]) {
      for (const line of [
        `${rep('forget', n)} i`,
        `${rep('delete', n)} i`,
        `forget x ${rep('ok', n)} i`,
        `${rep('forget x on second thought', Math.ceil(n / 5))} forget i`,
        `${rep('could you forget', Math.ceil(n / 3))} forget i`,
      ]) {
        const start = performance.now();
        expect(alone(line)).toBe(false);
        expect(performance.now() - start, `${n}: ${line.slice(0, 30)}`).toBeLessThan(100);
      }
    }
  });

  it('is false for anything it was not given', () => {
    expect(everyday({ latest: undefined as unknown as string, earlier: [] })).toBe(false);
    expect(alone('')).toBe(false);
  });
});

describe('the hard block', () => {
  // The grammar reads each of these as a forget request about a named thing; only the hard block
  // (the caller themself, their life, leaving, an emergency or crisis line) refuses them.
  it.each([
    'forget my life',
    'forget the recipe, goodbye',
    'forget the call to 988',
    'delete the hotline number',
    'forget my old place, I am leaving',
    'forget the whole world',
  ])('refuses "%s"', (line) => {
    expect(alone(line)).toBe(false);
  });

  // Putting affairs in order, or clearing what is kept for others: warning signs (owner, 2026-11-26).
  it.each([
    'delete my insurance policy details',
    'erase every photo of us',
    'delete the voicemail for my mom',
    'delete my texts to my sister',
    'forget the email to my brother',
    'delete my journal entries',
    'erase my diary draft',
    'forget my notebook notes',
    'delete my memo card',
    'forget my poem drafts',
    'forget the playlist for my funeral',
    'forget who gets the dog',
    'forget who gets my car',
    'delete my noet to Theo',
    'forget my jornal draft',
    'delete this leter to my mom',
    "delete my kids' college fund details",
    'erase the video for my wife',
    'forget my bank accounts',
    'forget the life insurance',
    'delete the pictures from the beach',
    'erase the messages for my sister',
    'forget my savings',
    'delete the recording for Theo',
    'forget the letters to my kids',
    'delete my pension details',
    'forget my retirement plan',
  ])('refuses "%s" (affairs in order, or kept for others)', (line) => {
    expect(alone(line)).toBe(false);
  });

  it('lets the same shape through when nothing in it is refused', () => {
    expect(alone('forget my old place')).toBe(true);
    expect(alone('forget the recipe')).toBe(true);
  });
});

describe('forgetRequestIsEveryday', () => {
  const line = 'Please forget everything about the Denver job.';

  it('is off unless CRISIS_FORGET_EVERYDAY is on', () => {
    expect(everyday(turn(line), 'none', {})).toBe(false);
    expect(everyday(turn(line), 'none', { CRISIS_FORGET_EVERYDAY: 'off' })).toBe(false);
    expect(everyday(turn(line))).toBe(true);
  });

  it.each(FORGET_REQUESTS)('reads "%s" with no risk anywhere as a forget request', (said) => {
    expect(everyday(turn(said, ['What is on my calendar?']))).toBe(true);
    expect(everyday(turn(said, [], undefined))).toBe(true);
  });

  it('keeps full handling when the risk list flags a word, even in a forget request', () => {
    expect(everyday(turn(FLAGGED_BY_RISK_LIST))).toBe(false);
  });

  it('never applies when a pattern matched, or without the call', () => {
    expect(everyday(turn(line), 'crisis')).toBe(false);
    expect(everyday(turn(line), 'block')).toBe(false);
    expect(forgetRequestIsEveryday(turn(line), 'none', undefined, ON)).toBe(false);
  });

  it.each(NOT_FORGET_REQUESTS)('keeps full crisis handling for "%s"', (said) => {
    expect(everyday(turn(said))).toBe(false);
  });

  it('keeps it for a forget line after an earlier turn with risk words or agreement', () => {
    const risky = [
      "I don't see the point anymore",
      'I wrote letters to everyone just in case',
      'kms lol',
      'I feel so alone lately',
      'yeah, same',
    ];
    for (const earlier of risky) {
      for (const said of FORGET_REQUESTS) {
        expect(everyday(turn(said, ['hi', earlier])), `${earlier} / ${said}`).toBe(false);
      }
    }
  });

  it('keeps it on a call where an earlier read found risk, failed, or a pattern matched', async () => {
    noteCrisisRisk('patterns-call');
    expect(everyday(turn(line), 'none', ON, 'patterns-call')).toBe(false);
    await trackCrisisRead(
      'risky-call',
      'I wont be a problem much longer',
      Promise.resolve({ risk: 'crisis' })
    );
    expect(everyday(turn(line), 'none', ON, 'risky-call')).toBe(false);
    await trackCrisisRead('failed-call', 'so anyway', Promise.resolve(null));
    expect(everyday(turn(line), 'none', ON, 'failed-call')).toBe(false);
    await trackCrisisRead('clean-call', 'what time is it', Promise.resolve({ risk: 'none' }));
    expect(everyday(turn(line), 'none', ON, 'clean-call')).toBe(true);
  });

  it("keeps it when the companion's line it answers carries risk", () => {
    expect(everyday(turn(line, [], 'Are you thinking about hurting yourself?'))).toBe(false);
  });

  it('fails closed when a step inside the check throws', () => {
    expect(everyday(turn(line))).toBe(true); // the control: the same line, nothing broken
    h.breaks = true;
    expect(everyday(turn(line))).toBe(false);
  });

  it('fails closed on input it cannot read', () => {
    expect(everyday({ latest: line, earlier: 'nope' as unknown as string[] })).toBe(false);
    expect(everyday(turn(`${line} 💔`))).toBe(false);
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
  const positives = [...CRISIS_HELDOUT_RETIRED, ...CRISIS_CONTEXTUAL, ...redteam, ...gloomy]
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
    expect(positives.length).toBeGreaterThanOrEqual(184);
  });

  // Indices only: the failure names a case, never its words.
  it('as the line itself, or with a forget request before or after it', () => {
    const exempted = positives.flatMap((c, i) =>
      [
        turn(c.text, c.earlier, c.companion),
        turn(c.text, c.earlier),
        turn(`Please forget the Denver job, ${c.text}`, c.earlier),
        turn(`${c.text} Forget the Denver job.`, c.earlier),
        turn('Forget it.', [...c.earlier, 'Please forget the Denver job.', c.text]),
      ]
        .map((t, k) => (everyday(t, 'none', ON, `call ${i}`) ? `#${i} shape ${k}` : ''))
        .filter(Boolean)
    );
    expect(exempted).toEqual([]);
  });

  it('a forget request after the case was read as risk on the same call', async () => {
    const exempted: string[] = [];
    for (const [i, c] of positives.entries()) {
      const call = `read ${i}`;
      await trackCrisisRead(call, c.text, Promise.resolve({ risk: 'crisis' }));
      const later = turn('Please forget the Denver job.', [...c.earlier, c.text]);
      if (everyday(later, 'none', ON, call)) exempted.push(`#${i}`);
    }
    expect(exempted).toEqual([]);
  });
});
