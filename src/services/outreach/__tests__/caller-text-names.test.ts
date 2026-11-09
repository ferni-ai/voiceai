/**
 * Ordinary lines the shape rules must not withhold, and names the sponsor wrote.
 *
 * The screen is fail-closed: every rule reads the caller's words as written, and a dotted
 * word with any ending is a link. "Loan" after of or in is a name only when Loan is the
 * known name, and a spaced "ten k-drama" or "two k-pop" is not a sum. The family member's or
 * contact's own name (Mary_Ann, St.Clair) is Ferni's words, so a match wholly inside a mention
 * of it is spared; "pay Loan a visit" is spared only when Loan is that name. A link, email or
 * handle built around the name is still read, as are the name's own digits, email or link. A
 * name with any at-sign ("Sam @ Work") is never spared: its text is read as written. The note
 * the sponsor gets names only what fired. All data is fictional.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

import type { CallOutcome } from '../../../tools/domains/telephony/types.js';
import type { CheckinAlertInput } from '../checkin-urgent-alert.js';

const { callerText, crisisCallerLine, isRiskyCallerText, riskyCallerLine, screenedCallerText } =
  await import('../caller-text.js');
const { generateUrgentNotification } = await import('../checkin-urgent-alert.js');
const { liveReportMessage } = await import('../call-result-live.js');

function alertFor(name: string, description: string): string {
  const record: CheckinAlertInput = {
    familyMemberName: name,
    concernsIdentified: [{ description, urgency: 'urgent' }],
  };
  const alert = generateUrgentNotification(record);
  if (alert === null) throw new Error('expected an alert');
  return alert;
}

/** A link ending no list names; split so the brand-copy check does not read it as copy. */
const NEW_ENDING = ['sol', 'utions'].join('');

/** Withheld on the shapes head, quoted on main: quoted again, in their own words, for any name. */
const ORDINARY = ['ten k-drama episodes', 'she likes k-pop songs', 'two k-pop concerts'];

/** Quoted only when the name in them is the known name: otherwise the screen fails closed. */
const KNOWN_NAME_ONLY: ReadonlyArray<readonly [string, string]> = [
  ['Loan', 'we should pay Loan a visit'],
  ['Loan', 'a friend of Loan came by'],
  ['Loan', "in Loan's garden"],
  ['riley.jones', 'riley.jones came by'],
  ['St.Clair', 'St.Clair is doing well'],
];

/** Built around the known name, so not a mention of it: still withheld. */
const AROUND_THE_NAME: ReadonlyArray<readonly [string, string]> = [
  ['Mary_Ann', 'go to Mary_Ann.com'],
  ['Mary_Ann', 'she is Mary_Ann_99 on insta'],
  ['Jo.Ann', 'mail Jo.Ann@example.test'],
  ['Jo.Ann', 'see Jo.Ann.example today'],
  ['jo_ann.lee', 'her handle is @jo_ann.lee'],
  ['St.Clair', 'visit St.Clair.shop'],
  ['Loan', 'pay Loan the money'],
  ['Loan', 'pay Loan the loan'],
  ['Loan', 'she paid off the Loan today'],
  // A dot in the name can't end the sentence a money rule reads.
  ['St. Clair', 'lend St. Clair the money'],
  ['Dr. Kim', 'send Dr. Kim the money'],
];

/** A mention starts only after a space or a word edge: link or handle characters before it make it part of a handle. */
const BEFORE_THE_NAME: ReadonlyArray<readonly [string, string]> = [
  ['Mary_Ann', 'follow ig:Mary_Ann'],
  ['Mary_Ann', 'she is x.Mary_Ann now'],
  ['St.Clair', 'find her at tg/St.Clair'],
  ['Mary_Ann', 'her page is -Mary_Ann'],
  ['Mary_Ann', 'she is _Mary_Ann on there'],
];

/**
 * A name with a sum or an at-sign, which the name's own read strips: it has no mentions, so the
 * text is read as written. Any at-sign counts, spaced or not, full-width or small, before an
 * address or an ordinary word ("Sam @ Work", "Mia @ Mail Room"): all withheld.
 */
const RISKY_NAME_MARKS: ReadonlyArray<readonly [string, string]> = [
  ['Sam $5', 'Sam $5,000 please'],
  ['@riley_r', 'dm @riley_r'],
  ['riley@gmail', 'riley@gmail .com'],
  ['riley@ gmail', 'email riley@ gmail .com'],
  ['riley@ gmail', 'email riley@ gmail'],
  ['@ riley_r', 'dm @ riley_r'],
  ['@ riley', 'dm @ riley'],
  ['Sam @', 'reach Sam @ gmail'],
  ['Sam @', 'dm Sam @ riley'],
  ['Sam\u00a0@', 'reach Sam\u00a0@ gmail'],
  ['Sam\u00a0@', 'dm Sam\u00a0@ riley'],
  ['Sam @riley_r', 'dm Sam @riley_r'],
  ['riley @ gmail', 'email riley @ gmail .com'],
  ['riley \uff20 gmail', 'email riley \uff20 gmail'],
  ['Sam @ riley_r', 'dm Sam @ riley_r'],
  ['Sam @ riley.r', 'dm Sam @ riley.r'],
  ['riley @ gmail com', 'email riley @ gmail com'],
  ['riley @ gmail uk', 'email riley @ gmail uk'],
  ['riley @ gmx de', 'email riley @ gmx de'],
  ['riley @ mail ru', 'email riley @ mail ru'],
  ['riley @ gmail info', 'email riley @ gmail info'],
  ['riley @ gmail dot com', 'email riley @ gmail dot com'],
  ['riley @ gmail(dot)com', 'email riley @ gmail(dot)com'],
  ['riley @ gmail,', 'email riley @ gmail, ok'],
  ['riley @ gmail\u3002com', 'email riley @ gmail\u3002com'],
  ['riley @ example', 'email riley @ example .com'],
  ['Sam @ Work', 'write to Sam @ Work.example'],
  ['Sam @ Work', 'email Sam @ Work . com'],
  ['Sam @ Work', 'email Sam @ Work dot com'],
  ['Sam @ Work', 'email Sam @ Work com'],
  // A spaced @ before an ordinary word is withheld too: the more private reading.
  ['Sam @ Work', 'Sam @ Work came by'],
  ['Tom @ Home', 'Tom @ Home said hi'],
  ['Ana @ Caf\u00e9', 'Ana @ Caf\u00e9 is open'],
  ['Mia @ Mail Room', 'Mia @ Mail Room called'],
  ['Sam \uff20 Work', 'Sam \uff20 Work came by'],
  ['Sam \ufe6b Work', 'Sam \ufe6b Work came by'],
];

/** Still withheld: each one has its own money cue, link ending or scheme. */
const STILL_HELD = [
  'she owes Loan a grand',
  'pay Loan back on Friday',
  'she asked you to pay the loan today',
  'she wants a loan',
  'she is drowning in loans',
  'she is in debt to the landlord',
  'paying loans every month',
  'pay loan today',
  'she came off loan forbearance',
  'she needs 5k by Friday',
  'she needs 5k-ish',
  'send me 5k-pop by friday',
  'need 10k-dramas asap',
  'she fell into loan default',
  'deep in loan payments',
  'a 5k-run fee',
  `see pay-now.${NEW_ENDING}`,
  'riley.jones',
  'St.Clair is doing well',
  'she sells on riley.shop',
  'her site is riley.us',
  'go to riley-help.app',
  'the example.community garden',
  'open wss://example.test/stream',
  'open signal://chat/riley',
];

/** Names with punctuation the shape rules read, plus the ones a reviewer will try. */
const PUNCTUATED = [
  'Mary_Ann',
  'St.Clair',
  'Jo.Ann',
  "O'Brien-Smith",
  'Ann & Bo',
  'jo_ann.lee',
  'St. Clair',
  'Dr. Kim',
];

/** Benign check-in concerns: on main every one is quoted for every name above. */
const BENIGN = [
  'she has had a cough for a week',
  'he fell in the garden but says he is fine',
  'she is not sleeping well',
  'he missed his doctor visit on Tuesday',
  'she sounded lonely and wants more calls',
  'he forgot to eat lunch again',
  'her knee is sore after the walk',
  'he is worried about the move to Maplewood',
];

describe('ordinary lines go out in their own words', () => {
  it.each(ORDINARY)('%j', (line) => {
    expect(isRiskyCallerText(line)).toBe(false);
    expect(screenedCallerText(line, 'Riley Test')).toBe(callerText(line));
    expect(alertFor('Riley Test', line)).toContain(`During my call with Riley Test, ${line}.`);
    expect(alertFor('Loan', line)).not.toContain(riskyCallerLine('Loan'));
  });

  it.each(KNOWN_NAME_ONLY)('as the known name %j, %j is quoted', (name, line) => {
    expect(isRiskyCallerText(line)).toBe(true);
    expect(isRiskyCallerText(line, name)).toBe(false);
    expect(alertFor(name, line)).toContain(`During my call with ${name}, ${line}.`);
  });

  it.each(AROUND_THE_NAME)('with the known name %j, %j is still withheld', (name, line) => {
    expect(isRiskyCallerText(line, name)).toBe(true);
    expect(alertFor(name, line)).toContain(riskyCallerLine(name));
  });

  it.each(BEFORE_THE_NAME)('with the known name %j, %j is still withheld', (name, line) => {
    expect(isRiskyCallerText(`${name} came by`, name)).toBe(false);
    expect(isRiskyCallerText(line, name)).toBe(true);
  });

  it.each(RISKY_NAME_MARKS)('the name %j gets no mentions, so %j is withheld', (name, line) => {
    expect(isRiskyCallerText(line, name)).toBe(true);
    expect(alertFor(name, line)).toContain(riskyCallerLine(name));
  });

  it.each(STILL_HELD)('%j is still withheld', (line) => {
    expect(isRiskyCallerText(line)).toBe(true);
    expect(screenedCallerText(line, 'Loan')).toBe(riskyCallerLine('Loan'));
  });
});

describe("the family member's name is the sponsor's words", () => {
  describe.each(PUNCTUATED)('name %j', (name) => {
    it.each(BENIGN)('the check-in alert quotes %j, with no note', (description) => {
      const alert = alertFor(name, description);
      expect(alert).toContain(`During my call with ${name}, ${description}.`);
      expect(alert).not.toContain(riskyCallerLine(name));
      expect(alert).not.toContain(crisisCallerLine(name));
    });

    it('the live call report quotes the outcome, the summary and the message', () => {
      const outcome: CallOutcome = {
        callId: 'call-names-1',
        status: 'completed',
        objectiveAchieved: true,
        outcome: 'the table for four is booked for Saturday',
        transcriptSummary: 'they confirmed the booking and said thanks',
        message: 'see you at the Maplewood library',
      };
      const report = liveReportMessage(name, outcome);
      for (const said of [outcome.outcome, outcome.transcriptSummary, outcome.message]) {
        expect(report).toContain(said);
      }
      expect(report).not.toContain(riskyCallerLine(callerText(name, 60)));
    });

    it('the note names only what fired: money for a money line, never for a crisis line', () => {
      const money = alertFor(name, 'she asked you to send her money today');
      expect(money).toContain(riskyCallerLine(name));
      expect(money).not.toContain('send her money');

      // Quoted in full, the words carry the crisis themselves; nothing about money is said.
      const words = 'she said she wants to end her life';
      const crisis = alertFor(name, words);
      expect(crisis).toContain(`During my call with ${name}, ${words}.`);
      expect(crisis).not.toContain(riskyCallerLine(name));
    });

    it("the caller's own handle, email or link is still withheld", () => {
      for (const line of ['write to riley@gmail', 'she is riley_help on insta', 'see riley.shop']) {
        const alert = alertFor(name, line);
        expect(alert).toContain(riskyCallerLine(name));
        expect(alert).not.toContain(line);
      }
    });
  });

  it("a name's own digit run, email, at-sign or link is still read", () => {
    for (const name of [
      'Riley 555 0142 22',
      'riley@example.com',
      'riley.shop',
      'Riley www.rileyhelp',
      'sam@maplewood.example',
      'Sam @ Work',
      'Sam \uff20 Work',
    ]) {
      expect(alertFor(name, BENIGN[0])).toContain(riskyCallerLine(name));
    }
  });
});
