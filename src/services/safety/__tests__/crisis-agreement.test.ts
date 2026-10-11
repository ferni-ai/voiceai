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
  addsNothing,
  agreementOutcome,
  hasRiskContent,
  isPresenceReply,
  isVocative,
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

  it("never touches agreeing reads, or a lone read of the caller's own words", () => {
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

/** Ferni's lines from the 2026-10-11 dev call, about Ferni's own evening. */
const GLOOMY = [
  "I think I'm just avoiding the electric bill, to be honest.",
  "These days my kitchen skills mostly involve the microwave and a prayer, to be honest. It's just too much effort.",
  "Just the thought of figuring out what to make after a long week can make the whole evening feel like work before it's even started, you know?",
  "Yeah, it's just, uh, sometimes the easiest thing is the only thing that makes sense.",
];
const EASIEST = GLOOMY[3];

describe('isVocative', () => {
  it.each([
    'You Fern.',
    'Ferni?',
    'Fern',
    'hey Ferni',
    'you there Ferni',
    'Ferni, you still there?',
    'Hello? Ferni?',
    'You there?',
  ])('reads "%s" as only calling Ferni', (latest) => expect(isVocative(latest)).toBe(true));

  it.each([
    'Ferni, I want to die',
    'Fern I am not okay',
    'bye Ferni',
    'you',
    'Ferni goodbye',
    'Fern, it hurts',
  ])('does not read "%s" as only calling Ferni', (latest) =>
    expect(isVocative(latest)).toBe(false)
  );
});

describe('addsNothing', () => {
  it("reads a reply made of Ferni's words and function words as adding nothing", () => {
    expect(addsNothing("What's too much effort?", GLOOMY[1])).toBe(true);
    expect(addsNothing('Why is that?', GLOOMY[0])).toBe(true);
    expect(addsNothing('Yeah.', GLOOMY[2])).toBe(true);
  });

  it("reads any word of the caller's own as adding something", () => {
    expect(addsNothing("What's too much effort?", 'Galway has music on every corner.')).toBe(false);
    expect(addsNothing("I'm fine, just really tired all the time", EASIEST)).toBe(false);
    expect(addsNothing('the easiest thing would be to not wake up', EASIEST)).toBe(false);
    expect(addsNothing('', EASIEST)).toBe(false);
  });
});

describe('hasRiskContent', () => {
  it('finds dying, means, goodbyes and distress, and text it cannot read', () => {
    for (const text of [
      'which bridges have no fences',
      'i drank bleach',
      'this is goodbye',
      'are you thinking about hurting yourself?',
      'me quiero matar',
      'не хочу жить',
    ]) {
      expect(hasRiskContent(text), text).toBe(true);
    }
    expect(hasRiskContent("What's too much effort?")).toBe(false);
    expect(hasRiskContent(EASIEST)).toBe(false);
  });
});

describe('agreementOutcome after a downbeat Ferni line (the 2026-10-11 dev call)', () => {
  const lone = (latest: string, companion: string, earlier: string[] = []) =>
    agreementOutcome({ pattern: 'none', verdicts: [crisis], latest, earlier, companion });

  it('reads "You Fern." after Ferni\'s line as presence, not crisis', () => {
    expect(lone('You Fern.', EASIEST, ["What's too much effort?", 'Yeah.'])).toBe('presence');
  });

  it('gives a lone read of a reply that adds nothing the soft check', () => {
    expect(lone("What's too much effort?", GLOOMY[1])).toBe('soft');
    expect(lone('Yeah.', GLOOMY[2])).toBe('soft');
  });

  it("escalates when the caller's words, now or earlier, carry risk", () => {
    expect(lone('Ferni?', EASIEST, ["I don't want to be alive anymore."])).toBe('escalate');
    expect(lone('Yeah.', EASIEST, ["I've been thinking about ending it."])).toBe('escalate');
    expect(lone("And I'm still here.", ASKED, ['I have the pills here.'])).toBe('escalate');
    expect(lone('Yeah. I keep thinking about not waking up.', EASIEST)).toBe('escalate');
  });

  it("escalates a short answer to Ferni's question about the caller's safety", () => {
    expect(lone('Yeah.', 'When you say that, are you thinking about hurting yourself?')).toBe(
      'escalate'
    );
  });

  it('escalates two reads that agree, and a read that timed out beside it', () => {
    const verdicts = [crisis, crisis];
    expect(
      agreementOutcome({ pattern: 'none', verdicts, latest: 'Yeah.', companion: GLOOMY[2] })
    ).toBe('escalate');
    expect(
      agreementOutcome({
        pattern: 'none',
        verdicts: [crisis, null],
        latest: 'Yeah.',
        companion: GLOOMY[2],
      })
    ).toBe('escalate');
  });

  it('never softens a labelled crisis case, after any of these lines, even if the patterns missed it', () => {
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
        earlier: 'earlier' in c ? c.earlier : [],
        companion: 'companion' in c ? c.companion : undefined,
      }))
      .concat(
        CRISIS_TEST_CASES.filter((c) => c.expectedResult.shouldDetect).map((c) => ({
          text: c.input,
          earlier: [],
          companion: undefined,
        }))
      );
    expect(positives.length).toBeGreaterThan(230);
    const softened = positives.flatMap((c) =>
      [c.companion, ...GLOOMY, ASKED]
        .filter((companion) => lone(c.text, companion ?? '', c.earlier ?? []) !== 'escalate')
        .map((companion) => `${c.text} <- ${companion}`)
    );
    expect(softened).toEqual([]);
  });
});

describe('SOFT_CRISIS_CHECK', () => {
  it('keeps the conversation and checks in, without leading with the hotline', () => {
    expect(SOFT_CRISIS_CHECK).toMatch(/check in once/);
    expect(SOFT_CRISIS_CHECK).toMatch(/do not switch to crisis talk/);
    expect(SOFT_CRISIS_CHECK).not.toMatch(/MUST/);
  });
});
