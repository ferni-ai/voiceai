/**
 * Ordinary lines the shape rules must not withhold, and names the sponsor wrote.
 *
 * "Loan" is a name as often as a debt, so it reads as money only with a money cue
 * (a debt verb, "pay ... back", a determiner, a sum); never as the bare word after
 * of, in or pay. A name written with a dot ("riley.jones") is not a link, and
 * "k-drama" is not a sum. And the family member's or contact's own name (Mary_Ann,
 * St.Clair, "Sam @ Work") is the sponsor's words, so its punctuation never trips the
 * handle, @ or link rules; its digits and an email or link in it still do. The note
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

/** Withheld on the shapes head, quoted on main: quoted again, in their own words. */
const ORDINARY = [
  'a friend of Loan came by',
  "in Loan's garden",
  'we should pay Loan a visit',
  'riley.jones',
  'ten k-drama episodes',
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
  'she needs 5k by Friday',
  'she needs 5k-ish',
  'she sells on riley.shop',
  'her site is riley.us',
  'go to riley-help.app',
  'the example.community garden',
  'open wss://example.test/stream',
];

/** Names with punctuation the shape rules read, plus the ones a reviewer will try. */
const PUNCTUATED = [
  'Mary_Ann',
  'St.Clair',
  'Jo.Ann',
  'Sam @ Work',
  "O'Brien-Smith",
  'Ann & Bo',
  'jo_ann.lee',
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

  it("a name's own digit run, email or link is still read", () => {
    for (const name of [
      'Riley 555 0142 22',
      'riley@example.com',
      'riley.shop',
      'Riley www.rileyhelp',
      'sam@maplewood.example',
    ]) {
      expect(alertFor(name, BENIGN[0])).toContain(riskyCallerLine(name));
    }
  });
});
