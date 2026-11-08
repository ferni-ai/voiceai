/**
 * OPENER_FIRST_NAME_PERSONAL says the user's first name in the personal opener
 * only (Seth, 2026-11-07). A call to a relation ("Mom", "Mom (Linda)"), a family
 * check-in and a business call say exactly what main says, in every text that
 * names the user: the opener, the intro, the voicemail, the voicemail
 * instructions, the model's awareness and the screener line. Initials ("JR
 * Rivera") are never title-cased into "Jr", which TTS reads as "Junior".
 */
import { describe, expect, it } from 'vitest';
import { ferniIntro, outboundOpener, partiesOf } from '../opening-line.js';
import { dispatchedUserName, opensByFirstName } from '../../../utils/ferni-intro.js';
import { outboundCallerAwareness } from '../../../agents/shared/outbound-opener.js';
import { voicemailMessage } from '../../../agents/shared/line-screen.js';
import { voicemailInstructions } from '../../../agents/outbound-call/call-opening.js';
import { screenerLine } from '../../../agents/outbound-call/call-screener.js';

const ON = { OPENER_FIRST_NAME_PERSONAL: 'on' };
const OFF = { OPENER_FIRST_NAME_PERSONAL: 'off' };
type Call = Parameters<typeof partiesOf>[0];

/** Every text an on-behalf call says or tells the model that names the user. */
function texts(call: Call, env: Record<string, string>): Record<string, string> {
  const parties = partiesOf(call, env);
  return {
    opener: outboundOpener(parties),
    intro: ferniIntro(parties),
    voicemail: voicemailMessage(parties),
    voicemailInstructions: voicemailInstructions(parties, 'see how the week went'),
    awareness: outboundCallerAwareness(parties),
    screener: screenerLine(parties),
  };
}

const NAMES = [
  'Sam Rivera',
  'SAM RIVERA',
  'sam rivera',
  'Dr Sam Rivera',
  'Zoë Park',
  'Sammy',
  'JR Rivera',
  'AJ Park',
  'Mr Rivera',
];

const KEEP_MAINS = {
  relation: { callType: 'personal', recipientName: 'Mom' },
  'named relation': { callType: 'personal', recipientName: 'Mom (Linda)' },
  'check-in, no opening line': {
    callType: 'personal',
    recipientName: 'Alex',
    kind: 'family_checkin',
  },
  'check-in to a relation': { callType: 'personal', recipientName: 'Mom', kind: 'family_checkin' },
  'check-in with an opening line': {
    callType: 'personal',
    recipientName: 'Alex',
    kind: 'family_checkin',
    openingLine: "Hi Alex, it's Ferni. Checking in like we planned.",
  },
  business: { callType: 'business', recipientName: 'Bright Dental' },
};

describe('the flag changes nothing but the personal opener', () => {
  it.each(Object.entries(KEEP_MAINS))(
    '%s: every text, every name, on equals off',
    (_kind, call) => {
      for (const userName of NAMES) {
        const on = texts({ ...call, userName }, ON);
        const off = texts({ ...call, userName }, OFF);
        for (const field of Object.keys(off)) {
          expect(on[field], `${userName} / ${field}`).toBe(off[field]);
        }
      }
    }
  );

  it('a personal call to someone saved by name says the first name', () => {
    const on = texts({ callType: 'personal', recipientName: 'Alex', userName: 'Sam Rivera' }, ON);
    expect(on.opener).toBe(
      "Hi Alex, it's Ferni, Sam's AI friend. Sam asked me to check in on you. Is now an okay time?"
    );
    expect(on.awareness).toContain('You are calling on behalf of Sam, who is not on this call.');
  });
});

describe('a blank preferred name changes nothing but the personal opener', () => {
  const BLANKS = ['', '   ', '\t '];
  /** The texts of a call dispatched as callOnBehalf does: preferred name, else the profile's. */
  const dispatched = (call: Call, preferredName: string, env: Record<string, string>) => {
    const userName = dispatchedUserName(preferredName, 'Sam Rivera', opensByFirstName(call), env);
    return texts({ ...call, userName }, env);
  };

  it.each(Object.entries(KEEP_MAINS))('%s: every text, on equals off', (_kind, call) => {
    for (const blank of BLANKS) {
      const on = dispatched(call, blank, ON);
      const off = dispatched(call, blank, OFF);
      for (const field of Object.keys(off)) {
        expect(on[field], `${JSON.stringify(blank)} / ${field}`).toBe(off[field]);
      }
    }
  });

  it("a relation with a blank name says main's line, no name", () => {
    expect(dispatched(KEEP_MAINS.relation, '   ', ON).opener).toBe(
      "Hi, it's Ferni, an AI friend, calling to check in on you. Is now an okay time?"
    );
  });

  it.each(BLANKS)('a personal call to Alex says the first name, blank %j', (blank) => {
    const on = dispatched({ callType: 'personal', recipientName: 'Alex' }, blank, ON);
    expect(on.opener).toBe(
      "Hi Alex, it's Ferni, Sam's AI friend. Sam asked me to check in on you. Is now an okay time?"
    );
  });
});

describe("the relation and check-in lines are main's, with the flag on", () => {
  const on = (call: Call) => texts({ userName: 'Sam Rivera', ...call }, ON);

  it('a contact saved only as "Mom"', () => {
    expect(on(KEEP_MAINS.relation).opener).toBe(
      "Hi, is this Sam Rivera's mom? It's Ferni, Sam Rivera's AI friend. Sam Rivera asked me to check in on you. Is now an okay time?"
    );
  });

  it('a contact saved as "Mom (Linda)"', () => {
    expect(on(KEEP_MAINS['named relation']).opener).toBe(
      "Hi Linda, it's Ferni, Sam Rivera's AI friend. Sam Rivera asked me to check in on you. Is now an okay time?"
    );
  });

  it('a check-in with no opening line, and its voicemail', () => {
    const checkin = on(KEEP_MAINS['check-in, no opening line']);
    expect(checkin.opener).toBe(
      "Hi Alex, it's Ferni. Sam Rivera asked me to check in on you. Is now an okay time?"
    );
    expect(checkin.voicemail).toBe(
      "Hi Alex, it's Ferni. Sam Rivera asked me to check in, no need to call back, I'll try again another time."
    );
  });
});

describe('initials are never said as a first name', () => {
  const opener = (userName: string, env: Record<string, string>) =>
    outboundOpener(partiesOf({ callType: 'personal', recipientName: 'Alex', userName }, env));

  it.each(['JR Rivera', 'AJ Park', 'JR RIVERA', 'AJ PARK', 'Dr JR Rivera', 'TJ'])(
    '%s keeps the name main says',
    (userName) => {
      expect(opener(userName, ON)).toBe(opener(userName, OFF));
      expect(opener(userName, ON)).not.toMatch(/\b(?:Jr|Aj|Tj)'s/);
    }
  );

  it('JR Rivera, as main says it', () => {
    expect(opener('JR Rivera', ON)).toBe(
      "Hi Alex, it's Ferni, JR Rivera's AI friend. JR Rivera asked me to check in on you. Is now an okay time?"
    );
  });

  it.each([
    ['SAM RIVERA', 'Sam'],
    ['SAM', 'Sam'],
    ['Jo Park', 'Jo'],
  ])(
    'a name in capitals, or a short name in lower case, is still a first name: %s',
    (userName, first) => {
      expect(opener(userName, ON)).toContain(`it's Ferni, ${first}'s AI friend.`);
    }
  );
});
