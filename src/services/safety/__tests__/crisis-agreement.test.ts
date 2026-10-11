/**
 * The agreement gate only ever softens a turn the patterns passed, whose
 * reads disagree or which is a bare reply to "you still there?". It never
 * touches a pattern match, an imminent read, or agreeing or lone reads, and
 * the presence rule matches none of the labelled crisis cases.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CRISIS_CONTEXTUAL } from '../../../agents/__tests__/fixtures/crisis-contextual.js';
import { CRISIS_HELDOUT } from '../../../agents/__tests__/fixtures/crisis-heldout.js';
import { CRISIS_TEST_BLIND } from '../../../agents/__tests__/fixtures/crisis-test-blind.js';
import { CRISIS_TEST_CASES } from '../../superhuman/validation/crisis-test-cases.js';
import {
  agreementOutcome,
  isPresenceReply,
  resolveCrisisAgreementGate,
  SOFT_CRISIS_CHECK,
} from '../crisis-agreement.js';
import type { CrisisVerdict } from '../crisis-classifier.js';

const none: CrisisVerdict = { risk: 'none', subject: 'self' };
const crisis: CrisisVerdict = { risk: 'crisis', subject: 'self' };
const imminent: CrisisVerdict = { risk: 'imminent', subject: 'self' };
const ASKED = 'You still there?';

describe('resolveCrisisAgreementGate', () => {
  it('is off unless set to on', () => {
    expect(resolveCrisisAgreementGate({})).toBe(false);
    expect(resolveCrisisAgreementGate({ CRISIS_AGREEMENT_GATE: 'off' })).toBe(false);
    expect(resolveCrisisAgreementGate({ CRISIS_AGREEMENT_GATE: 'on' })).toBe(true);
  });
});

describe('isPresenceReply', () => {
  it.each([
    "And I'm still here.",
    "Yep, I'm still here.",
    'still here',
    "I'm here",
    'Yeah, still here, sorry.',
  ])('reads "%s" after "you still there?" as presence', (latest) => {
    expect(isPresenceReply(latest, ASKED)).toBe(true);
    expect(isPresenceReply(latest, 'Mm? You still there, or did I lose you for a second?')).toBe(
      true
    );
  });

  it('needs Ferni to have asked whether they are there', () => {
    expect(isPresenceReply("And I'm still here.", undefined)).toBe(false);
    expect(isPresenceReply("And I'm still here.", 'Galway has music on every corner.')).toBe(false);
  });

  it.each([
    "I'm still here, barely",
    "I'm still here but I don't want to be",
    'still here for now',
    "I'm still here, not for long",
    "I'm here at the bridge",
    'still here, unfortunately',
  ])('does not read "%s" as presence', (latest) => {
    expect(isPresenceReply(latest, ASKED)).toBe(false);
  });

  it('matches no labelled crisis case, even right after "you still there?"', () => {
    const redteam = JSON.parse(
      readFileSync(
        new URL('../../../../scripts/crisis-eval/redteam-2026-10-05.json', import.meta.url),
        'utf8'
      )
    ) as Array<{ text: string; label: string }>;
    const positives = [...CRISIS_HELDOUT, ...CRISIS_TEST_BLIND, ...CRISIS_CONTEXTUAL, ...redteam]
      .filter((c) => c.label !== 'none')
      .map((c) => c.text)
      .concat(CRISIS_TEST_CASES.filter((c) => c.expectedResult.shouldDetect).map((c) => c.input));
    expect(positives.length).toBeGreaterThan(150);
    expect(positives.filter((text) => isPresenceReply(text, ASKED))).toEqual([]);
  });
});

describe('agreementOutcome', () => {
  const turn = { latest: 'I just feel off tonight', companion: 'How was the drive?' };

  it('never touches a pattern match', () => {
    for (const pattern of ['crisis', 'block'] as const) {
      expect(agreementOutcome({ ...turn, pattern, verdicts: [crisis, none] })).toBe('escalate');
      expect(
        agreementOutcome({
          pattern,
          verdicts: [none],
          latest: "And I'm still here.",
          companion: ASKED,
        })
      ).toBe('escalate');
    }
  });

  it('never touches an imminent read', () => {
    expect(agreementOutcome({ ...turn, pattern: 'none', verdicts: [imminent, none] })).toBe(
      'escalate'
    );
    expect(
      agreementOutcome({
        pattern: 'none',
        verdicts: [imminent],
        latest: "And I'm still here.",
        companion: ASKED,
      })
    ).toBe('escalate');
  });

  it('never touches agreeing or lone crisis reads', () => {
    expect(agreementOutcome({ ...turn, pattern: 'none', verdicts: [crisis] })).toBe('escalate');
    expect(agreementOutcome({ ...turn, pattern: 'none', verdicts: [crisis, crisis] })).toBe(
      'escalate'
    );
    expect(agreementOutcome({ ...turn, pattern: 'none', verdicts: [crisis, null] })).toBe(
      'escalate'
    );
  });

  it('softens a crisis read another read of the same turn disagreed with', () => {
    expect(agreementOutcome({ ...turn, pattern: 'none', verdicts: [crisis, none] })).toBe('soft');
  });

  it('reads a bare reply to a presence check as presence', () => {
    expect(
      agreementOutcome({
        pattern: 'none',
        verdicts: [crisis],
        latest: "And I'm still here.",
        companion: ASKED,
      })
    ).toBe('presence');
  });
});

describe('SOFT_CRISIS_CHECK', () => {
  it('keeps the conversation and checks in, without leading with the hotline', () => {
    expect(SOFT_CRISIS_CHECK).toMatch(/check in once/);
    expect(SOFT_CRISIS_CHECK).toMatch(/do not switch to crisis talk/);
    expect(SOFT_CRISIS_CHECK).not.toMatch(/MUST/);
  });
});
