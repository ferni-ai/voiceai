import { describe, expect, it } from 'vitest';
import { ferniIntro, outboundOpener, partiesOf } from '../opening-line.js';

describe('partiesOf', () => {
  it('reads who is on the line and who asked from the call context', () => {
    expect(partiesOf({ recipientName: ' Doug ', userName: 'Seth', callType: 'personal' })).toEqual({
      recipientName: 'Doug',
      sponsorName: 'Seth',
      personal: true,
    });
  });

  it('never keeps a placeholder as a name', () => {
    for (const placeholder of ['Unknown', 'the user', 'Friend', 'contact', '']) {
      const parties = partiesOf({ recipientName: placeholder, userName: placeholder });
      expect(parties.recipientName, placeholder).toBeUndefined();
      expect(parties.sponsorName, placeholder).toBeUndefined();
      expect(parties.personal).toBe(false);
    }
  });
});

describe('ferniIntro', () => {
  it('is the same AI disclosure the opener makes', () => {
    for (const personal of [true, false]) {
      for (const sponsorName of ['Seth', undefined]) {
        const parties = { recipientName: 'Doug', sponsorName, personal };
        expect(outboundOpener(parties)).toContain(ferniIntro(parties));
        expect(ferniIntro(parties)).toMatch(/\bAI\b/);
      }
    }
  });
});

describe('outboundOpener', () => {
  it("is Seth's agreed wording on a personal call", () => {
    expect(outboundOpener({ recipientName: 'Doug', sponsorName: 'Seth', personal: true })).toBe(
      "Hi Doug, it's Ferni, Seth's AI friend. Seth asked me to check in on you. Is now an okay time?"
    );
    expect(outboundOpener({ sponsorName: 'Seth', personal: true })).toBe(
      "Hi, it's Ferni, Seth's AI friend. Seth asked me to check in on you. Is now an okay time?"
    );
  });

  it('has no em dashes or ellipses', () => {
    for (const personal of [true, false]) {
      for (const sponsorName of ['Seth', undefined]) {
        expect(outboundOpener({ sponsorName, personal })).not.toMatch(/—|…|\.\.\./);
      }
    }
  });
});

describe('a family check-in', () => {
  const parties = partiesOf({
    recipientName: 'Mom',
    userName: 'Seth',
    callType: 'personal',
    kind: 'family_checkin',
  });

  it('is marked from the call context kind; an on-behalf call is not', () => {
    expect(parties.checkin).toBe(true);
    expect(
      partiesOf({ recipientName: 'Mom', userName: 'Seth', callType: 'personal', kind: 'on_behalf' })
        .checkin
    ).toBeUndefined();
  });

  it('introduces Ferni by name only, and an on-behalf call keeps "AI friend"', () => {
    expect(ferniIntro(parties)).toBe("it's Ferni");
    expect(ferniIntro({ ...parties, checkin: undefined })).toBe("it's Ferni, Seth's AI friend");
  });

  it('opens with the dispatched line even though it names no AI', () => {
    const openingLine = "Good morning Mom, it's Ferni. Seth asked me to check in on you.";
    expect(outboundOpener({ ...parties, openingLine })).toBe(openingLine);
    expect(outboundOpener({ ...parties, checkin: undefined, openingLine })).toMatch(/AI friend/);
  });
});
