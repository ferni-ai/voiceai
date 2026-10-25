import { describe, expect, it } from 'vitest';
import { ferniIntro, nameAndRelation, outboundOpener, partiesOf } from '../opening-line.js';

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

// Prod 2026-10-18: a contact saved as "mom" was greeted "Hi mom, it's Ferni, ...".
describe('a contact saved by what they are to the user', () => {
  it.each([
    ['mom', undefined, 'mom'],
    ['Mom', undefined, 'mom'],
    ['my dad', undefined, 'dad'],
    ['Grandma', undefined, 'grandma'],
    ['Mom (Linda)', 'Linda', 'mom'],
    ['Linda (Mom)', 'Linda', 'mom'],
    ['Linda', 'Linda', undefined],
    ['Grandma Rose', 'Grandma Rose', undefined],
    ['Unknown', undefined, undefined],
  ])('%j is name %j, relation %j', (saved, name, relation) => {
    expect(nameAndRelation(saved)).toEqual({ name, relation });
  });

  it('a relation alone: Ferni asks who answered, with the same AI disclosure', () => {
    for (const saved of ['mom', 'Mother', 'my sister']) {
      const parties = partiesOf({ recipientName: saved, userName: 'Seth', callType: 'personal' });
      const opener = outboundOpener(parties);
      expect(opener, saved).toMatch(
        /^Hi, is this Seth's (?:mom|mother|sister)\? It's Ferni, Seth's AI friend\. /
      );
      expect(opener.toLowerCase()).toContain(ferniIntro(parties).toLowerCase());
      expect(opener).not.toMatch(/^Hi (?:mom|mother|my sister)\b/i);
    }
  });

  it('a real name, or a name beside the relation, is greeted by name as before', () => {
    const linda = partiesOf({
      recipientName: 'Mom (Linda)',
      userName: 'Seth',
      callType: 'personal',
    });
    expect(outboundOpener(linda)).toBe(
      "Hi Linda, it's Ferni, Seth's AI friend. Seth asked me to check in on you. Is now an okay time?"
    );
    const doug = partiesOf({ recipientName: 'Doug', userName: 'Seth', callType: 'personal' });
    expect(outboundOpener(doug)).toMatch(/^Hi Doug, it's Ferni/);
  });

  it('with no sponsor name, or on a business call, no one is greeted by a relation', () => {
    expect(outboundOpener(partiesOf({ recipientName: 'mom', callType: 'personal' }))).toMatch(
      /^Hi, it's Ferni/
    );
    expect(outboundOpener(partiesOf({ recipientName: 'mom', userName: 'Seth' }))).toMatch(
      /^Hi, this is Ferni/
    );
  });
});
