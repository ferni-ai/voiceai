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
  endorses,
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

  it('escalates disagreeing reads when the words carry distress', () => {
    expect(agreementOutcome({ ...turn, pattern: 'none', verdicts: [crisis, none] })).toBe(
      'escalate'
    );
  });

  it('softens disagreeing reads only of words with no risk or agreement in them', () => {
    expect(
      agreementOutcome({
        pattern: 'none',
        verdicts: [crisis, none],
        latest: 'Why is that?',
        companion: turn.companion,
      })
    ).toBe('soft');
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
    "Ferni, I can't do this",
    "Fern... I'm done",
    'Ferni, me too',
    'Yeah, Ferni',
    'Ok Fern',
    'Ferni help',
    'Fern 😔',
    'Hey Ferni, are you there? I took them all',
  ])('does not read "%s" as only calling Ferni', (latest) =>
    expect(isVocative(latest)).toBe(false)
  );
});

describe('addsNothing', () => {
  it("reads a short question back about Ferni's words as adding nothing", () => {
    expect(addsNothing("What's too much effort?", GLOOMY[1])).toBe(true);
    expect(addsNothing('Why is that?', GLOOMY[0])).toBe(true);
  });

  it('never counts assent, an echo or a statement as adding nothing', () => {
    for (const latest of [
      'Yeah.',
      'Same.',
      'The easiest thing.',
      'Yeah, the easiest thing',
      'Me too',
    ]) {
      expect(addsNothing(latest, EASIEST), latest).toBe(false);
    }
  });

  it("reads any word of the caller's own as adding something", () => {
    expect(addsNothing("What's too much effort?", 'Galway has music on every corner.')).toBe(false);
    expect(addsNothing("I'm fine, just really tired all the time", EASIEST)).toBe(false);
    expect(addsNothing('the easiest thing would be to not wake up?', EASIEST)).toBe(false);
    expect(addsNothing("I'm done?", GLOOMY[1])).toBe(false);
  });

  it("is false without the caller's words or Ferni's line", () => {
    expect(addsNothing('', EASIEST)).toBe(false);
    expect(addsNothing('Why is that?', undefined)).toBe(false);
    expect(addsNothing('Why is that?', '  ')).toBe(false);
    expect(addsNothing(undefined as unknown as string, EASIEST)).toBe(false);
  });
});

describe('endorses', () => {
  it.each([
    'yeah, same',
    'Me too.',
    'Exactly.',
    "honestly that's how I feel",
    'you get it',
    "that's what I keep thinking",
    'Story of my life.',
    'I know the feeling',
    "That's how I've been feeling about everything.",
  ])('reads "%s" as taking Ferni\'s line as the caller\'s own', (latest) =>
    expect(endorses(latest)).toBe(true)
  );

  it('does not read a question back or a bare call as agreement, and fails closed', () => {
    expect(endorses("What's too much effort?")).toBe(false);
    expect(endorses('You Fern.')).toBe(false);
    expect(endorses(undefined)).toBe(true);
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

  it('fails closed on text it was not given', () => {
    expect(hasRiskContent(undefined)).toBe(true);
    expect(hasRiskContent(null)).toBe(true);
  });
});

describe('agreementOutcome after a downbeat Ferni line (the 2026-10-11 dev call)', () => {
  const lone = (latest: string, companion: string, earlier: string[] = []) =>
    agreementOutcome({ pattern: 'none', verdicts: [crisis], latest, earlier, companion });

  it('reads "You Fern." after Ferni\'s line as presence, not crisis', () => {
    expect(lone('You Fern.', EASIEST, ["What's too much effort?", 'Yeah.'])).toBe('presence');
  });

  it("gives a lone read of a short question back about Ferni's words the soft check", () => {
    expect(lone("What's too much effort?", GLOOMY[1])).toBe('soft');
    expect(lone('Why is that?', GLOOMY[0])).toBe('soft');
  });

  it('escalates a caller agreeing with or echoing the downbeat line', () => {
    for (const latest of [
      'Yeah.',
      'Yeah, same.',
      'Me too.',
      'Exactly.',
      "Honestly that's how I feel.",
      'You get it.',
      "That's what I keep thinking.",
      'The easiest thing.',
      'Ferni, me too.',
    ]) {
      expect(lone(latest, EASIEST), latest).toBe('escalate');
    }
  });

  it("escalates agreement even when it is phrased as a question in Ferni's own words", () => {
    const askedBack = `${EASIEST.slice(0, -1)}, same as always.`;
    expect(addsNothing("What's the same?", askedBack)).toBe(true);
    expect(lone("What's the same?", askedBack)).toBe('escalate');
  });

  it('escalates a call of the name with anything else in it', () => {
    expect(lone("Ferni, I can't do this", EASIEST)).toBe('escalate');
    expect(lone("Fern... I'm done", EASIEST)).toBe('escalate');
    expect(lone('Yeah, Ferni', EASIEST)).toBe('escalate');
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

  it('escalates two crisis reads of a quiet question back', () => {
    expect(
      agreementOutcome({
        pattern: 'none',
        verdicts: [crisis, crisis],
        latest: 'Why is that?',
        companion: GLOOMY[0],
      })
    ).toBe('escalate');
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
    // A lone crisis read, and a crisis read another read of the same turn disagreed with.
    const paired = (latest: string, companion: string, earlier: string[]) =>
      agreementOutcome({ pattern: 'none', verdicts: [crisis, none], latest, earlier, companion });
    const softened = positives.flatMap((c) =>
      [c.companion, ...GLOOMY, ASKED]
        .filter(
          (companion) =>
            lone(c.text, companion ?? '', c.earlier ?? []) !== 'escalate' ||
            paired(c.text, companion ?? '', c.earlier ?? []) !== 'escalate'
        )
        .map((_, i) => `positive #${positives.indexOf(c)} companion #${i}`)
    );
    expect(softened).toEqual([]);
  });
});

/** The 2026-10-11 security review of #1010: each verified failing input must escalate. */
describe('security review findings', () => {
  const paired = (latest: string, companion: string) =>
    agreementOutcome({ pattern: 'none', verdicts: [crisis, none], latest, companion });

  it('1: disagreeing reads never soften agreement or risk words', () => {
    expect(paired('Yeah, same.', 'some days I wonder what the point of any of it is')).toBe(
      'escalate'
    );
    expect(paired('Ferni said: I have the pills ready tonight.', EASIEST)).toBe('escalate');
    for (const latest of [
      'yeah, same',
      'Me too.',
      'Exactly.',
      'You get it.',
      'I know the feeling',
    ]) {
      expect(paired(latest, GLOOMY[2]), latest).toBe('escalate');
    }
    expect(SOFT_CRISIS_CHECK).not.toMatch(/nothing they said/);
  });

  it('3: emoticons, a "?" on an echo, and any apostrophe never soften', () => {
    expect(isPresenceReply('still here :(', ASKED)).toBe(false);
    expect(
      agreementOutcome({
        pattern: 'none',
        verdicts: [crisis],
        latest: 'still here :(',
        companion: ASKED,
      })
    ).toBe('escalate');
    expect(paired('still here :(', ASKED)).toBe('escalate');
    expect(addsNothing('the only thing that makes sense?', EASIEST)).toBe(false);
    expect(
      agreementOutcome({
        pattern: 'none',
        verdicts: [crisis],
        latest: 'the only thing that makes sense?',
        companion: EASIEST,
      })
    ).toBe('escalate');
    for (const apostrophe of ["'", '‘', '’', 'ʼ', '´', '＇']) {
      expect(hasRiskContent(`I can${apostrophe}t go on`), apostrophe).toBe(true);
    }
    expect(addsNothing('What is 30?', 'There were 30 of them.')).toBe(false);
  });
});

describe('agreementOutcome fails closed', () => {
  const base = { pattern: 'none' as const, latest: 'You Fern.', companion: EASIEST };

  it('escalates with no reads, a missing read, or a read without a risk', () => {
    expect(agreementOutcome({ ...base, verdicts: [] })).toBe('escalate');
    expect(agreementOutcome({ ...base, verdicts: [crisis, null] })).toBe('escalate');
    expect(agreementOutcome({ ...base, verdicts: [crisis, none, null] })).toBe('escalate');
    const broken = [crisis, undefined, { subject: 'self' }] as unknown as CrisisVerdict[];
    expect(agreementOutcome({ ...base, verdicts: broken })).toBe('escalate');
    expect(agreementOutcome({ ...base, verdicts: undefined as unknown as CrisisVerdict[] })).toBe(
      'escalate'
    );
  });

  it("escalates without Ferni's line or the caller's words", () => {
    for (const companion of [undefined, '', '   ']) {
      expect(agreementOutcome({ ...base, verdicts: [crisis], companion })).toBe('escalate');
      expect(
        agreementOutcome({ ...base, verdicts: [crisis, none], latest: 'Why?', companion })
      ).toBe('escalate');
    }
    expect(agreementOutcome({ ...base, verdicts: [crisis], latest: '' })).toBe('escalate');
    expect(
      agreementOutcome({ ...base, verdicts: [crisis], latest: undefined as unknown as string })
    ).toBe('escalate');
  });

  it('escalates when an earlier line cannot be read', () => {
    const earlier = [undefined] as unknown as string[];
    expect(agreementOutcome({ ...base, verdicts: [crisis], earlier })).toBe('escalate');
  });

  it('escalates when anything throws', () => {
    const throwing = new Proxy([crisis], {
      get() {
        throw new Error('boom');
      },
    });
    expect(agreementOutcome({ ...base, verdicts: throwing })).toBe('escalate');
  });

  it('the helpers answer "not presence" for missing text', () => {
    expect(isVocative(undefined as unknown as string)).toBe(false);
    expect(isPresenceReply(undefined as unknown as string, ASKED)).toBe(false);
    expect(isPresenceReply("I'm still here", undefined)).toBe(false);
  });
});

describe('SOFT_CRISIS_CHECK', () => {
  it('keeps the conversation and checks in, without leading with the hotline', () => {
    expect(SOFT_CRISIS_CHECK).toMatch(/check in once/);
    expect(SOFT_CRISIS_CHECK).toMatch(/do not switch to crisis talk/);
    expect(SOFT_CRISIS_CHECK).not.toMatch(/MUST/);
  });
});
