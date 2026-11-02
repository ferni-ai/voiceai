/**
 * hostileStoredText (owner-message-policy.ts): stored call text is refused for a scam's
 * instruction (hand over a code; send money somewhere), never for numbers, prices,
 * links or phone numbers on their own. The ordinary lines are the independent
 * verifier's over-screen set (PR 3329), which the first screen refused 12 of 25;
 * the hostile lines are its hostile set. Fictional data only.
 */
import { describe, expect, it } from 'vitest';

import { blockedContent } from '../owner-message-content.js';
import { STORED_TEXT_MAX_CHARS, hostileStoredText } from '../owner-message-policy.js';

const ORDINARY = [
  'call mom at 5', 'pick up the prescription', 'water the plants', 'dentist at 3:30',
  'renew the library card', 'Pick up Mia at 3:15pm', 'Text Raj when you land',
  'Send Grandma the photos', 'finish the 10-page report', 'Fix the wi-fi',
  'book flights for Thanksgiving', 'Pay rent $1200', 'Buy 2% milk', 'Email Sam re: the Q3 deck',
  'Verify insurance with the clinic', 'Change the Netflix password', 'Log in to the HSA portal',
  'Wire rent to the landlord', 'Call Dr. Lee at 555-0123', 'Order from amazon.com',
  'Team lunch @ noon', 'Bring #2 pencils', "Mom's b-day 3/14", 'Pick up dry cleaning; then gym',
  'Get the PIN for the garage',
  // Two prices in one line are two amounts, not one seven-digit number
  'pay $1200 and $350', 'pay $1,200 rent and $350 for utilities', 'split $40 / $25',
]; // prettier-ignore

const HOSTILE: Array<[string, string]> = [
  ['tell him to wire $500 to 555-0142', 'money_destination'],
  ['tell him to wire 500 dollars to 555 0142 tonight', 'money_destination'],
  ['have him pay at example.com slash billing', 'money_destination'],
  ['send me the verification code he gets', 'code_handover'],
  ['text 555 0143 for the refund', 'money_destination'],
  ['visit http://pay.example.net now', 'money_destination'],
  ['reply with your login code', 'code_handover'],
  // R3, the callback scam (the lead's cases)
  ['call 555 0142 about the account', 'callback_scam'],
  ['text 555-0143, your card is locked', 'callback_scam'],
];

/** R3's ordinary lines: a number with no account or alarm word, or the word with no number. */
const CALLBACK_ORDINARY = [
  'Call Dr. Lee at 555-0123',
  'call mom at 555-0199 about dinner',
  'text the plumber 555-0144',
  'verify your bank', // nothing to act on: no number
  'Contact HR at hr@example.com about the benefits account', // an address, not a number to call
];

describe('hostileStoredText', () => {
  it('passes all 28 ordinary owner lines', () => {
    expect(ORDINARY).toHaveLength(28);
    expect(ORDINARY.filter((t) => hostileStoredText(t) !== null)).toEqual([]);
  });

  it.each(CALLBACK_ORDINARY)('passes %s', (line) => {
    expect(hostileStoredText(line)).toBeNull();
  });

  it.each(HOSTILE)('refuses %s', (line, reason) => {
    expect(hostileStoredText(line)).toBe(reason);
  });

  it('reads the folded form: full-width digits and accents are no disguise', () => {
    expect(hostileStoredText('wíre the money to ５５５-０１４２')).toBe('money_destination');
    expect(hostileStoredText('séñd me the códe')).toBe('code_handover');
  });

  it('a money word alone, or somewhere to send it alone, passes', () => {
    expect(hostileStoredText('refund the jacket')).toBeNull();
    expect(hostileStoredText('the store is at example.com')).toBeNull();
    expect(hostileStoredText('send the deposit to sam@example.com')).toBe('money_destination');
  });

  it("a job's own bare date is not a number to send money to; a date-shaped run is", () => {
    expect(hostileStoredText('you said "I need to pay the dentist" on 2026-10-19')).toBeNull();
    expect(hostileStoredText('you said "wire it to 212 555 0198" on 2026-10-19')).toBe('money_destination'); // prettier-ignore
    // A timestamp's tail is digits too, and a date touching another number is one number.
    expect(hostileStoredText('pay it to 2026-10-19T5550142')).toBe('money_destination');
    expect(hostileStoredText('pay it to 212-2026-10-19')).toBe('money_destination');
  });

  it('counts digits across every separator and look-alike letter, as blockedContent does', () => {
    expect(hostileStoredText('pay at 555/01/42 tonight')).toBe('money_destination');
    expect(hostileStoredText('pay at 555-O142 tonight')).toBe('money_destination');
    expect(hostileStoredText('pay five five five, one four two two')).toBe('money_destination');
    expect(hostileStoredText('wire it to 555 0l42')).toBe('money_destination');
  });

  it('send and a currency amount are money words; with nowhere to send it, they pass', () => {
    expect(hostileStoredText('send 555-0142 the money')).toBe('money_destination');
    expect(hostileStoredText('$500 to 555-0142 by Friday')).toBe('money_destination');
    expect(hostileStoredText('500 dollars to example.com')).toBe('money_destination');
    expect(hostileStoredText('send $500 to Sam for the trip')).toBeNull();
    expect(hostileStoredText('send 500 dollars to Sam')).toBeNull();
    expect(hostileStoredText('Pay rent $1200. Still open: the deck')).toBeNull(); // no "spaced dot" left behind
    expect(hostileStoredText('send $555-0142 to Sam')).toBe('money_destination'); // an "amount" that runs on is a number
    expect(hostileStoredText('wire $555 0142 to Sam')).toBe('money_destination');
  });

  it('an amount never hides a phone number: only a price-shaped amount is read as a price', () => {
    expect(hostileStoredText('Wire $5550100123 now')).toBe('money_destination');
    expect(hostileStoredText('send 5,550,100,123 dollars')).toBe('money_destination');
    expect(hostileStoredText('pay \u20AC555,010,0123 today')).toBe('money_destination');
    expect(hostileStoredText('wire it to 2026-555-0100')).toBe('money_destination');
    // Grouped in threes past six digits: phone-length, so never a price
    expect(hostileStoredText('Wire $1,234,567')).toBe('money_destination');
    expect(hostileStoredText('send 5,550,100 dollars')).toBe('money_destination');
    // Not price-shaped, or run on into more digits: read as digits, near a dial word a short code.
    expect(hostileStoredText('text $12,34,56 for the refund')).toBe('money_destination');
    expect(hostileStoredText('text $1234 56 for the refund')).toBe('money_destination');
    // / and & are separators to the mask too, as they are to the digit rule
    expect(hostileStoredText('text $12/34 for the refund')).toBe('money_destination');
    expect(hostileStoredText('text $12&34 for the refund')).toBe('money_destination');
    for (const line of [
      'Pay rent $1,200',
      'Pay rent $1200',
      'Pay rent $250,000',
      'Buy 2% milk',
      'send $1,250.00 to Sam',
    ]) {
      expect(hostileStoredText(line)).toBeNull();
    }
  });

  it('a currency sign alone never splits a number: only a word between two amounts does', () => {
    for (const line of [
      '$555-$123-$4567',
      '$555 $123 $4567',
      '$555/$1234',
      '$555&$1234',
      '$5551234',
      'pay $20 then $555-$1234',
    ]) {
      expect(hostileStoredText(line)).toBe('money_destination');
    }
  });

  it('a rule that fires before the digit rule on the unmasked text still counts', () => {
    // vanity_number comes first in destinationIn; masking the amount would hide the number
    expect(hostileStoredText('Pay $800-FLOWERS now')).toBe('money_destination');
    expect(hostileStoredText('Pay $888-CALL-NOW')).toBe('money_destination');
  });

  it('a phone number or a link alone passes here, and blockedContent still refuses it', () => {
    // The live-call filter keeps its stricter rule; the stored screen needs an instruction too.
    for (const line of ['Call Dr. Lee at 555-0123', 'Order from amazon.com']) {
      expect(hostileStoredText(line)).toBeNull();
      expect(blockedContent(line)).not.toBeNull();
    }
  });

  it('refuses what is not a string, and text past the cap', () => {
    for (const v of [undefined, null, 5550142, ['call 555', '0142'], { toString: () => 'x' }]) {
      expect(hostileStoredText(v)).toBe('not_text');
    }
    expect(hostileStoredText('a'.repeat(STORED_TEXT_MAX_CHARS))).toBeNull();
    expect(hostileStoredText('a'.repeat(STORED_TEXT_MAX_CHARS + 1))).toBe('too_long');
  });
});
