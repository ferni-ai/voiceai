/**
 * Numbers said as words (#2425 review): a card number, an SSN or a code read out digit by
 * digit is still that credential, in text and as a fact. Ordinary number words are kept.
 * All values are fake.
 */
import { describe, expect, it } from 'vitest';
import { redactCredentials } from '../credential-redaction.js';
import { credentialCategory } from '../spoken-credential.js';
import { spokenDigits } from '../spoken-digits.js';

const CARD_WORDS = 'four one one one one one one one one one one one one one one one';
const SSN_WORDS = 'oh seven eight oh five one one two oh';

describe('spokenDigits', () => {
  it('writes runs of number words as digits and maps them back to the words', () => {
    const said = 'door code is forty-eight twenty one, ok';
    const d = spokenDigits(said);
    expect(d.text).toBe('door code is 4821, ok');
    const span = d.original(13, 17);
    expect(said.slice(span.start, span.end)).toBe('forty-eight twenty one');
    expect(said.slice(d.original(17, 21).start)).toBe(', ok'); // after a run, offsets shift back
  });

  it('joins number words across hyphens, not across other words', () => {
    expect(spokenDigits('four-eight-two-one').text).toBe('4821');
    expect(spokenDigits('four and eight').text).toBe('four and eight');
  });

  it('leaves a lone number word alone', () => {
    expect(spokenDigits('one of my friends said hunter two').text).toBe(
      'one of my friends said hunter two'
    );
  });
});

const SAID: Array<[said: string, stored: string]> = [
  [`card number ${CARD_WORDS}`, 'card number [redacted]'],
  [`social is ${SSN_WORDS}`, 'social is [redacted]'],
  ["my pin's one two three four", "my pin's [redacted]"],
  ['door code is forty-eight twenty one, ok', 'door code is [redacted], ok'],
  ['pin = one nine nine zero, her birth year', 'pin = [redacted], her birth year'],
  [
    'it is four eight two one, the code for the front door',
    'it is [redacted], the code for the front door',
  ],
];

const KEPT: string[] = [
  'card four one one one one one one one one one one one one one one two', // fails Luhn
  'I have two three year olds and one dog',
  'we were married in nineteen ninety eight',
  'my number is four one five five five five oh one three two',
  'call me at five five five one two three four',
  'oh I see, one of them',
];

describe('a credential read out as words is redacted', () => {
  it.each(SAID)('%s', (said, stored) => {
    expect(redactCredentials(said)).toBe(stored);
  });
});

describe('ordinary number words are kept', () => {
  it.each(KEPT)('%s', (said) => {
    expect(redactCredentials(said)).toBe(said);
  });
});

describe('as facts', () => {
  it('drops a card number and an SSN said as words, keeps a year and a phone number', () => {
    expect(credentialCategory('card', CARD_WORDS)).toBe('card-number');
    expect(credentialCategory('ssn', SSN_WORDS)).toBe('ssn');
    expect(credentialCategory('wedding_year', 'nineteen ninety eight')).toBeNull();
    expect(credentialCategory('phone', 'four one five five five five oh one three two')).toBeNull();
  });
});
