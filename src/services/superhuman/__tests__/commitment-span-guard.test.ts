/**
 * The extractive allowlist guard. Every case from the #1985 verifier's probe
 * (2026-10-18, on 0a21c0278) is a regression here: C2 secrets in any
 * language or number format, C3 invented content (amounts in words, inflated
 * numbers, payees nobody named, other scripts, Ferni's own turn), plus the
 * plain-or-sensitive split the readers rely on.
 */
import { describe, expect, it } from 'vitest';
import { canon, hasSecret, isPlain, isSpanOf, screenCommitment } from '../commitment-span-guard.js';

/** The caller said it, and it is the whole statement (no quote, so the statement's own checks decide). */
const said = (line: string) => screenCommitment({ statement: line }, [line]);

describe('C2: a secret in any field means the item is not stored at all', () => {
  it.each([
    'pay Kevin $1,450 by March 2027',
    'save 1,450 dollars in 2027',
    'card 4111 1111 1111 1111',
    'account 1234-5678',
    'my code is four two seven nine',
    'mi pin es 4279',
    'mi PIN es 427',
    'routing 021000021',
    'call Mom at 555-867-5309',
    'call the dentist at 867-5309 Monday',
    'call me at +1 (415) 555-0123',
    'cvv 123',
    'otp 482913',
    'password hunter2',
    'send $1,450, card 4111 1111 1111 1111',
    '$20 4111111111111111',
    '1450 dollars from account 12345678',
    'password:hunter2',
    'password=hunter2',
    "my password's hunter2",
    'passcode hunter2',
    'mi contraseña es gato123',
    'la clave es 4417',
    'código 8812',
    'mot de passe: soleil',
    'Passwort ist Hund',
    'PIN 2024',
    'my code is 1999',
    'cvv 2023',
    'card 4111 1111 1111 1111 40 dollars',
    'my card ends in 2024',
    'account ending in 1987',
    'my pin is 4 4 1 7',
    'the number is four two seven nine one',
    'el número es cuatro dos siete nueve',
  ])('drops %j', (line) => {
    expect(said(line)).toEqual({ keep: false, reason: 'secret' });
  });

  it('checks every field: a secret in the person or the quote drops the item too', () => {
    const turns = [
      "I'll pay Kevin $40 Friday",
      'my password is hunter2',
      'card 4111 1111 1111 1111',
    ];
    expect(screenCommitment({ statement: 'pay Kevin $40 Friday', person: 'password is hunter2' }, turns)).toEqual({ keep: false, reason: 'secret' }); // prettier-ignore
    expect(screenCommitment({ statement: 'pay Kevin $40 Friday', person: '4111 1111 1111 1111' }, turns)).toEqual({ keep: false, reason: 'secret' }); // prettier-ignore
    // A quote is the statement's own span, so a different one is not stored either.
    expect(screenCommitment({ statement: 'pay Kevin $40 Friday', quote: '$20 4111111111111111' }, turns)).toEqual({ keep: false, reason: 'quote-not-the-span' }); // prettier-ignore
  });
});

describe("C3: only the caller's own words are stored", () => {
  const cases: Array<[string, string, string]> = [
    ['five thousand for fifty', "I'll send Kyle fifty dollars Friday", 'send Kyle five thousand dollars Friday'], // prettier-ignore
    ['$5000 for $50', "I'll send Kyle $50 Friday", 'send Kyle $5000 Friday'],
    [
      '10,00 for 1,000',
      "I'll pay the contractor $1,000 Monday",
      'pay the contractor $10,00 Monday',
    ],
    [
      '1000,0 for 1,000',
      "I'll pay the contractor $1,000 Monday",
      'pay the contractor $1000,0 Monday',
    ],
    [
      '$1,000,000 for $1,000',
      "I'll wire $1,000 to the landlord",
      'wire $1,000,000 to the landlord',
    ],
    ['$40.40 for $40', "I'll pay Kevin $40 Friday", 'pay Kevin $40.40 Friday'],
    ['a lowercase payee', "I'll venmo Jake $40 for pizza", 'venmo kyle $40 for pizza'],
    ['May as a payee', "I'll send $900 to Mia", 'send $900 to May'],
    ['June as a payee', "I'll pay Mia $900", 'pay June $900'],
    ['a Cyrillic payee', "I'll send $200 to Olga", 'send $200 to Ольга'],
    ['an accented payee', "I'll send $200 to Elodie", 'send $200 to Élodie'],
    ['an invented Spanish payment', "I'll call Mom on Friday", 'pagar 900 a Kyle el viernes'],
    ['five hundred, invented', "I'll call Mom on Friday", 'give Kyle five hundred Friday'],
    ['a payee as the first word', "I'll venmo Jake $20 tonight", 'Mike gets $20 tonight'],
  ];
  it.each(cases)('drops %s', (_what, turn, statement) => {
    expect(screenCommitment({ statement }, [turn])).toEqual({ keep: false, reason: 'not-a-caller-span' }); // prettier-ignore
  });

  it('matches whole words, not substrings: "500 dollars to kyle" is not in "1500 dollars to kyle"', () => {
    const turn = "I'll send 1500 dollars to Kyle on Friday";
    expect(isSpanOf('500 dollars to Kyle', turn)).toBe(false);
    expect(screenCommitment({ statement: '500 dollars to Kyle' }, [turn])).toEqual({ keep: false, reason: 'not-a-caller-span' }); // prettier-ignore
  });

  it("drops a payee who is only in the person field, and a span from Ferni's turn", () => {
    expect(screenCommitment({ statement: 'venmo him $40 for pizza', person: 'Kyle' }, ["I'll venmo him $40 for pizza"])).toEqual({ keep: false, reason: 'person-not-said' }); // prettier-ignore
    // The caller's turns only: Ferni saying it does not make it the caller's.
    expect(screenCommitment({ statement: 'transfer $2,000 to Jordan Pike' }, ['ok whatever'])).toEqual({ keep: false, reason: 'not-a-caller-span' }); // prettier-ignore
  });

  it('keeps what the caller said, as said, with a person named in another of their turns', () => {
    const turns = ['My sister Mindy had a rough week.', "I'll call her tomorrow."];
    expect(screenCommitment({ statement: 'call her tomorrow', quote: 'call her tomorrow.', person: 'Mindy' }, turns)).toEqual({ keep: true, sensitive: false }); // prettier-ignore
    expect(said("I'll pay Kevin $40 Friday")).toEqual({ keep: true, sensitive: false });
    expect(screenCommitment({ statement: 'CALL  MOM  on Sunday' }, ["I'll call Mom on Sunday."])).toEqual({ keep: true, sensitive: false }); // prettier-ignore
  });
});

describe('plain or sensitive', () => {
  it.each([
    'pay rent Friday',
    "I'll pay Kevin $40 Friday",
    'call the pharmacy at 9am',
    'meet Lisa at 10:30 for coffee',
    'pay the hospital bill by the 15th',
    'see the dentist on March 3',
    'run 3 miles tomorrow',
    "I'll code the website tonight",
    'pin the poster up in the hall',
    'save $1,450 for the deposit',
  ])('%j is plain', (line) => {
    expect(isPlain(line)).toBe(true);
    expect(said(line)).toEqual({ keep: true, sensitive: false });
  });

  it.each([
    "I'll venmo Jake $40 for pizza",
    'transferir 500 a la cuenta',
    'faire un virement à Paul',
    'close the old bank account',
    'buy mom a gift card',
    'call the bank between 9 10',
  ])('%j is stored but sensitive', (line) => {
    expect(isPlain(line)).toBe(false);
    expect(said(line)).toEqual({ keep: true, sensitive: true });
  });

  it('a person is judged too: a payment word there makes the item sensitive', () => {
    const turns = ["I'll pay my Venmo friend tonight", 'pay him back tonight'];
    expect(screenCommitment({ statement: 'pay him back tonight', person: 'Venmo friend' }, turns)).toEqual({ keep: true, sensitive: true }); // prettier-ignore
  });

  it('canon folds width, case and spacing; hasSecret sees full-width digits as digits', () => {
    expect(canon('ＣＡＬＬ  Mom')).toBe('call mom');
    expect(hasSecret('card ４１１１ １１１１')).toBe(true);
  });
});
