/**
 * Without a SIP trunk, a family check-in goes out as Twilio TwiML that Polly
 * reads word for word. It used to add a second "How are you doing today?"
 * after the opening line, said goodbye with "I'll let <the family member on
 * the line> know I called", and read exclamation marks aloud.
 */
import { describe, expect, it } from 'vitest';
import { checkinTwiml } from '../family-checkin-twiml.js';
import { generateOpeningLine } from '../../../intelligence/context-builders/family/family-wellbeing-context.js';

const NOW = new Date('2026-10-11T01:30:00Z');
const opening = generateOpeningLine(
  { timezone: 'America/Denver' },
  { displayName: 'Doug' },
  { name: 'Seth', relationship: 'sponsor' },
  [],
  NOW
);
const twiml = checkinTwiml(opening, 'Seth', 'https://example.test/api/family-checkin/response/c1');
const spoken = [...twiml.matchAll(/<Say[^>]*>([^<]*)<\/Say>/g)].map((m) =>
  m[1].replace(/&apos;/g, "'")
);

describe('family check-in TwiML', () => {
  it("opens as Seth's AI friend and asks one question before listening", () => {
    expect(spoken[0]).toBe(
      "Good evening Doug, it's Ferni, Seth's AI friend. Seth asked me to check in on you. Is now an okay time?"
    );
    expect(twiml.indexOf('<Gather')).toBeGreaterThan(twiml.indexOf(spoken[0].slice(0, 20)));
    expect(twiml).not.toMatch(/How are you doing today/);
  });

  it('says goodbye on behalf of Seth, not the person on the line', () => {
    expect(spoken.at(-1)).toBe("I'll let Seth know I called. Take care.");
    expect(spoken.join(' ')).not.toMatch(/let Doug know/);
  });

  it('never reads an exclamation mark aloud', () => {
    expect(spoken.join(' ')).not.toMatch(/!/);
  });
});
