/**
 * A lone imminent read of a plain goodbye, on a call with no risk, gets the
 * soft check. Every other shape keeps the imminent script, and no labelled
 * crisis line ever qualifies.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { CRISIS_CONTEXTUAL } from '../../../agents/__tests__/fixtures/crisis-contextual.js';
import { CRISIS_HELDOUT } from '../../../agents/__tests__/fixtures/crisis-heldout.js';
import { CRISIS_RELAY } from '../../../agents/__tests__/fixtures/crisis-relay.js';
import { CRISIS_TEST_BLIND } from '../../../agents/__tests__/fixtures/crisis-test-blind.js';
import { CRISIS_TEST_CASES } from '../../superhuman/validation/crisis-test-cases.js';
import { noteCrisisRisk, resetCrisisCallRisk } from '../crisis-call-risk.js';
import type { CrisisVerdict } from '../crisis-classifier.js';
import { detectCrisis } from '../crisis-guard.js';
import {
  callRiskBeforeTurn,
  isPlainSignOff,
  loneImminentGoodbye,
  resetCallRiskSnapshots,
} from '../crisis-lone-imminent.js';

const imminent: CrisisVerdict = { risk: 'imminent', subject: 'self' };
const HIKE = [
  'I went hiking this morning.',
  'Up the ridge trail with my brother, the views were amazing.',
];

/** The two dev calls' goodbyes (2026-10-18), synthetic context. */
const DEV_GOODBYES = ['Yeah. it was great. Okay, bye.', 'Bye.'];

function lone(
  latest: string,
  overrides: Partial<Parameters<typeof loneImminentGoodbye>[0]> = {}
): boolean {
  const earlier = overrides.earlier ?? HIKE;
  return loneImminentGoodbye({
    detection: detectCrisis(latest, undefined, { recentMessages: earlier }),
    verdict: imminent,
    latest,
    earlier,
    companion: 'That sounds like a great day out.',
    priorRisk: false,
    ...overrides,
  });
}

beforeEach(() => {
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
});

describe('isPlainSignOff', () => {
  it.each([
    ...DEV_GOODBYES,
    'Okay, bye.',
    'ok bye',
    'bye for now',
    'Talk later.',
    'Goodnight.',
    'Good night.',
    'Okay, bye Ferni, talk later.',
    'Alright, I gotta go. Goodbye.',
    'Haha, that was fun. See you tomorrow!',
    'Bye-bye!',
  ])('reads "%s" as a plain sign-off', (line) => {
    expect(isPlainSignOff(line)).toBe(true);
  });

  it.each([
    "Bye, I won't be here tomorrow.",
    'Goodbye everyone.',
    'Thanks for everything. Bye for good.',
    'This is goodbye, Ferni.',
    "Bye. I won't be talking to you again.",
    'Tell my mom I love her. Bye.',
    'Thanks, bye!',
    'bye forever',
    'goodbye world',
    'bye :(',
    'bye 💔',
    'ok bye, I took them all',
    'I have to go now. Goodbye.',
    'Yeah. it was great.',
    '',
  ])('does not read "%s" as a plain sign-off', (line) => {
    expect(isPlainSignOff(line)).toBe(false);
  });
});

describe('loneImminentGoodbye', () => {
  it.each(DEV_GOODBYES)('softens a lone imminent read of "%s" on a call with no risk', (line) => {
    expect(lone(line)).toBe(true);
  });

  it('needs the call to have had no risk before this turn, and fails closed when unknown', () => {
    expect(lone('Bye.', { priorRisk: true })).toBe(false);
    expect(lone('Bye.', { priorRisk: undefined as unknown as boolean })).toBe(false);
  });

  it('needs an imminent read about the caller', () => {
    expect(lone('Bye.', { verdict: { risk: 'crisis', subject: 'self' } })).toBe(false);
    expect(lone('Bye.', { verdict: { risk: 'none', subject: 'self' } })).toBe(false);
    expect(lone('Bye.', { verdict: { risk: 'imminent', subject: 'third_party' } })).toBe(false);
    expect(lone('Bye.', { verdict: null })).toBe(false);
  });

  it('never applies when the patterns found anything in this turn, voice distress included', () => {
    const distressed = detectCrisis('Bye.', {
      primary: 'desperate',
      intensity: 0.9,
      confidence: 0.9,
    });
    expect(distressed.indicators.length).toBeGreaterThan(0);
    expect(lone('Bye.', { detection: distressed })).toBe(false);
  });

  it.each([
    "I don't want to be here anymore.",
    'I wrote letters for my family.',
    'Everything is too much lately.',
    'Honestly I feel so empty.',
    'I gave away all my stuff.',
    'Okay, bye.',
  ])('keeps the script when an earlier caller line was "%s"', (risky) => {
    expect(lone('Bye.', { earlier: [...HIKE, risky] })).toBe(false);
  });

  it.each([
    "I'm worried about you. Are you safe tonight?",
    'If things ever feel like too much, you can call or text 988.',
    'You doing okay?',
    'Please call 911 if you are in danger.',
  ])('keeps the script when Ferni\'s line raised safety: "%s"', (companion) => {
    expect(lone('Okay, bye.', { companion })).toBe(false);
  });

  it('keeps the script for a goodbye that carries risk of its own', () => {
    for (const line of [
      "Bye, I won't be here tomorrow.",
      'Goodbye everyone.',
      'Thanks for everything. Bye for good.',
      'This is goodbye, Ferni.',
      "Bye. I won't be talking to you again.",
    ]) {
      expect(lone(line), line).toBe(false);
    }
  });

  it('keeps the script for any other line, however benign it looks', () => {
    expect(lone('Can you call my best friend and make sure someone feeds my cat this week?')).toBe(
      false
    );
    expect(lone('took 30 of my adderall and my heart is going crazy')).toBe(false);
  });
});

interface Labelled {
  text: string;
  label: string;
  earlier?: string[];
  companion?: string;
}
const fromJson = (path: string): Labelled[] => JSON.parse(readFileSync(path, 'utf8')) as Labelled[];
const POSITIVES: Labelled[] = [
  ...CRISIS_HELDOUT,
  ...CRISIS_TEST_BLIND,
  ...CRISIS_CONTEXTUAL,
  ...CRISIS_RELAY,
  ...CRISIS_TEST_CASES.filter((c) => c.expectedResult.shouldDetect).map((c) => ({
    text: c.input,
    label: 'crisis',
  })),
  ...fromJson('src/agents/__tests__/fixtures/crisis-adjudicator-2026-10-17.json'),
  ...fromJson('src/agents/__tests__/fixtures/crisis-everyday-call-2026-10-17.json'),
  ...fromJson('scripts/crisis-eval/gloomy-ferni-2026-10-11.json'),
  ...fromJson('scripts/crisis-eval/redteam-2026-10-05.json'),
].filter((c) => c.label !== 'none');

describe('the labelled crisis lines', () => {
  it('are many, from every set', () => {
    expect(POSITIVES.length).toBeGreaterThan(400);
  });

  it('never qualify on their own words, with no call risk recorded', () => {
    const softened = POSITIVES.filter((c) => {
      const earlier = c.earlier ?? [];
      return loneImminentGoodbye({
        detection: detectCrisis(c.text, undefined, { recentMessages: earlier }),
        verdict: imminent,
        latest: c.text,
        earlier,
        companion: c.companion,
        priorRisk: false,
      });
    });
    // Goodbyes after risk no word list or pattern sees: they need the earlier
    // turn's classifier read on the call record (crisis-gate-lone-goodbye.test.ts).
    expect(softened.map((c) => `${c.earlier?.join(' / ')} -> ${c.text}`).sort()).toEqual([
      'I just want it all to stop. -> ok bye',
      'I just want to make it stop. -> Talk later.',
      'Nothing matters. -> Okay, bye.',
    ]);
  });

  it('keep every goodbye after them once the call has risk noted', () => {
    for (const c of POSITIVES) {
      for (const bye of ['Bye.', 'Okay, bye.', 'Yeah. it was great. Okay, bye.']) {
        const earlier = [...(c.earlier ?? []), c.text];
        expect(
          loneImminentGoodbye({
            detection: detectCrisis(bye, undefined, { recentMessages: earlier }),
            verdict: imminent,
            latest: bye,
            earlier,
            companion: c.companion,
            priorRisk: true,
          }),
          c.text
        ).toBe(false);
      }
    }
  });
});

describe('callRiskBeforeTurn', () => {
  it('is risk for an unknown call', () => {
    expect(callRiskBeforeTurn(undefined, { latest: 'Bye.' })).toBe(true);
  });

  it('reads the call record, and keeps the first reading for the same turn', () => {
    expect(callRiskBeforeTurn('call-1', { latest: 'Bye.', earlier: HIKE })).toBe(false);
    noteCrisisRisk('call-1'); // this turn's own read, settling between the two paths
    expect(callRiskBeforeTurn('call-1', { latest: 'Bye.', earlier: HIKE })).toBe(false);
    // A later turn sees it.
    expect(
      callRiskBeforeTurn('call-1', { latest: 'Bye.', earlier: [...HIKE, 'Bye.', 'wait'] })
    ).toBe(true);
  });

  it('is risk once anything on the call has noted it', () => {
    noteCrisisRisk('call-2');
    expect(callRiskBeforeTurn('call-2', { latest: 'Bye.', earlier: HIKE })).toBe(true);
  });
});
