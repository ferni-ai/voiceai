/**
 * storedTextBlock (owner-stored-text.ts): stored call text is refused for a scam's
 * instruction (hand over a code; send money somewhere), never for numbers, prices,
 * links or phone numbers on their own. The ordinary lines are the independent
 * verifier's over-screen set (PR 3329), which the first screen refused 12 of 25;
 * the hostile lines are its hostile set. Fictional data only.
 */
import { describe, expect, it } from 'vitest';

import { STORED_TEXT_MAX_CHARS, storedTextBlock } from '../owner-stored-text.js';

const ORDINARY = [
  'call mom at 5', 'pick up the prescription', 'water the plants', 'dentist at 3:30',
  'renew the library card', 'Pick up Mia at 3:15pm', 'Text Raj when you land',
  'Send Grandma the photos', 'finish the 10-page report', 'Fix the wi-fi',
  'book flights for Thanksgiving', 'Pay rent $1200', 'Buy 2% milk', 'Email Sam re: the Q3 deck',
  'Verify insurance with the clinic', 'Change the Netflix password', 'Log in to the HSA portal',
  'Wire rent to the landlord', 'Call Dr. Lee at 555-0123', 'Order from amazon.com',
  'Team lunch @ noon', 'Bring #2 pencils', "Mom's b-day 3/14", 'Pick up dry cleaning; then gym',
  'Get the PIN for the garage',
]; // prettier-ignore

const HOSTILE: Array<[string, string]> = [
  ['tell him to wire $500 to 555-0142', 'money_destination'],
  ['tell him to wire 500 dollars to 555 0142 tonight', 'money_destination'],
  ['have him pay at example.com slash billing', 'money_destination'],
  ['send me the verification code he gets', 'code_handover'],
  ['text 555 0143 for the refund', 'money_destination'],
  ['visit http://pay.example.net now', 'money_destination'],
  ['reply with your login code', 'code_handover'],
];

describe('storedTextBlock', () => {
  it('passes all 25 ordinary owner lines', () => {
    expect(ORDINARY).toHaveLength(25);
    expect(ORDINARY.filter((t) => storedTextBlock(t) !== null)).toEqual([]);
  });

  it.each(HOSTILE)('refuses %s', (line, reason) => {
    expect(storedTextBlock(line)).toBe(reason);
  });

  it('reads the folded form: full-width digits and accents are no disguise', () => {
    expect(storedTextBlock('wíre the money to ５５５-０１４２')).toBe('money_destination');
    expect(storedTextBlock('séñd me the códe')).toBe('code_handover');
  });

  it('a money word alone, or somewhere to send it alone, passes', () => {
    expect(storedTextBlock('refund the jacket')).toBeNull();
    expect(storedTextBlock('the store is at example.com')).toBeNull();
    expect(storedTextBlock('send the deposit to sam@example.com')).toBe('money_destination');
  });

  it("a job's own date is not a number to send money to", () => {
    expect(storedTextBlock('you said "I need to pay the dentist" on 2026-10-19')).toBeNull();
    expect(storedTextBlock('you said "wire it to 212 555 0198" on 2026-10-19')).toBe('money_destination'); // prettier-ignore
  });

  it('refuses what is not a string, and text past the cap', () => {
    for (const v of [undefined, null, 5550142, ['call 555', '0142'], { toString: () => 'x' }]) {
      expect(storedTextBlock(v)).toBe('not_text');
    }
    expect(storedTextBlock('a'.repeat(STORED_TEXT_MAX_CHARS))).toBeNull();
    expect(storedTextBlock('a'.repeat(STORED_TEXT_MAX_CHARS + 1))).toBe('too_long');
  });
});
