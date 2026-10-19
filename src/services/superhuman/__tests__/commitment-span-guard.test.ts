/**
 * The extractive allowlist guard. Every case from the #1985 verifier's probe
 * (2026-10-18, on 0a21c0278) is a regression here: C2 secrets in any
 * language or number format, C3 invented content (amounts in words, inflated
 * numbers, payees nobody named, other scripts, Ferni's own turn), plus the
 * fixtures from the final verify of 0e61d0294 (spans that leave a number
 * behind, digits hidden in times, split secrets). There is no "plain":
 * a kept item is only ever kept.
 */
import { describe, expect, it } from 'vitest';
import { canon, hasSecret, isSpanOf, screenCommitment } from '../commitment-span-guard.js';

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
    // The #2128 verifier's probe (04d84dc5b): digits split up, comma-formatted, spoken, repeated times.
    'from now on remember this one: wire $900 to 4417229011',
    '5k to my crypto wallet',
    'my account number is 12,345,678',
    'card 411,111,111,111,111',
    'routing 021,000,021',
    'the gate code then 42 then 79',
    'the keypad is 42 then 79',
    'call 555 and 01 and 23',
    'the keypad is 4 two 7 nine',
    'my card ends in twenty twenty four',
    'the alarm is forty one eleven',
    "PIN's 427",
    'mi contrasena es gato123',
    'el codigo es 427',
    'my pw is hunter2',
    'the wifi pass is hunter2',
    'мой пароль hunter2',
    '11:11 11:11 11:11 11:11',
    'may 41 may 11 may 11 may 11',
    'ssn-less 123-45-6789',
    'send Kyle five thousand dollars',
    // The final verify of 0e61d0294: digits in a time or date count unless it reads as one.
    'the combo is 12:34',
    'the combo is 23:59',
    'the safe opens 12:34 then 23:45',
    'March 12 and the 31st',
    'code 41:11',
    'combo 41:11',
    'May 4111',
    'send Kyle a billion',
    'half a million to Kyle',
    'the alarm is quince veinticinco',
    'the alarm is siebzig elf',
    'the alarm is trenta quaranta',
    'the alarm is dezesseis quarenta',
    'the alarm is fourty fourty',
    'code is double four double one',
    'cuatro uno uno uno',
    'quatre un un un',
    'vier eins eins eins',
    '٤١١١',
    '४१११',
    '⁴¹¹¹',
    '④①①①',
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
    expect(screenCommitment({ statement: 'call her tomorrow', quote: 'call her tomorrow.', person: 'Mindy' }, turns)).toEqual({ keep: true }); // prettier-ignore
    // Money is never plain: kept, but only a call may raise it.
    expect(said("I'll pay Kevin $40 Friday")).toEqual({ keep: true });
    expect(screenCommitment({ statement: 'CALL  MOM  on Sunday' }, ["I'll call Mom on Sunday."])).toEqual({ keep: true }); // prettier-ignore
  });
});

describe('the #2128 verifier round', () => {
  it("drops a statement made of the caller's words in another order (no token-set match)", () => {
    const turn = 'Kyle will pay me $40';
    expect(screenCommitment({ statement: 'I will pay Kyle $40' }, [turn])).toEqual({ keep: false, reason: 'not-a-caller-span' }); // prettier-ignore
    expect(screenCommitment({ statement: 'pay Kyle $40' }, [turn])).toEqual({ keep: false, reason: 'not-a-caller-span' }); // prettier-ignore
  });

  it('a span may not cut a number: "$5" is not in "$5,000", nor "$1" in "$1.5 million"', () => {
    expect(screenCommitment({ statement: 'send Kyle $5' }, ["I'll send Kyle $5,000"])).toEqual({ keep: false, reason: 'not-a-caller-span' }); // prettier-ignore
    expect(screenCommitment({ statement: 'pay Kyle $1' }, ["I'll pay Kyle $1.5 million"])).toEqual({ keep: false, reason: 'not-a-caller-span' }); // prettier-ignore
    expect(screenCommitment({ statement: '000 to Kyle' }, ["I'll send $5,000 to Kyle"])).toEqual({ keep: false, reason: 'not-a-caller-span' }); // prettier-ignore
    expect(screenCommitment({ statement: 'call mom' }, ["I'll call mom, then the bank."])).toEqual({ keep: true }); // prettier-ignore
  });

  it('a quote is the statement itself, so a secret cannot ride in a quote that differs', () => {
    // A quote equal to the statement but for its closing punctuation is the same span: its digits count.
    expect(screenCommitment({ statement: 'call me at 4111', quote: 'call me at 4111.' }, ['call me at 4111.'])).toEqual({ keep: false, reason: 'secret' }); // prettier-ignore
    // Any other quote is not stored, whatever it holds, so a quote-only secret check would never run.
    expect(screenCommitment({ statement: 'call Mom Sunday', quote: 'card 4111 1111 1111 1111' }, ['call Mom Sunday'])).toEqual({ keep: false, reason: 'quote-not-the-span' }); // prettier-ignore
  });

  it.each([
    ['no statement', { person: 'Kyle' }],
    ['an empty statement', { statement: '' }],
    ['a statement of punctuation', { statement: '-' }],
    ['a person that is a number', { statement: 'call Mom Sunday', person: 42 }],
    ['a null quote', { statement: 'call Mom Sunday', quote: null }],
    ['a statement that is an object', { statement: { toString: (): string => 'call Mom Sunday' } }],
    ['no item at all', null],
    ['an item that is a string', 'call Mom Sunday'],
  ])('drops %s as malformed, never throwing', (_what, item) => {
    expect(screenCommitment(item as never, ['call Mom Sunday'])).toEqual({ keep: false, reason: 'malformed' }); // prettier-ignore
  });

  it('security review: a magnitude is part of the number, and an amount over 7 digits is no amount', () => {
    expect(screenCommitment({ statement: 'send Kyle $5k' }, ["I'll send Kyle $5"])).toEqual({ keep: false, reason: 'not-a-caller-span' }); // prettier-ignore
    expect(said('send Kyle $5grand')).toEqual({ keep: false, reason: 'secret' });
    expect(said('send $12,345,678 to the fund')).toEqual({ keep: false, reason: 'secret' });
    expect(said('sell my cryptos')).toEqual({ keep: true });
    // Without a currency sign or word a 7-digit number is no money amount, just a number.
    expect(said('my account is 1,234,567')).toEqual({ keep: false, reason: 'secret' });
    expect(said('pay $1,234,567 to the fund')).toEqual({ keep: true });
    expect(said('pay $1450 Friday')).toEqual({ keep: false, reason: 'secret' });
  });

  it('time and date shapes are set aside only twice: "11:11 11:11" is a time, four of them a number', () => {
    expect(said('pick up the kids at 3:30 and 5:30')).toEqual({ keep: true });
    expect(said('11:11 11:11 11:11 11:11')).toEqual({ keep: false, reason: 'secret' });
  });
});

describe('the final verify of 0e61d0294', () => {
  it.each([
    ['$5 thousand', "I'll send Kyle $5 thousand"],
    ['$5 k', "I'll send Kyle $5 k"],
    ['$5k', "I'll send Kyle $5k"],
    ['$5 million', "I'll send Kyle $5 million"],
    ['$5 grand', "I'll send Kyle $5 grand"],
    ["$5'000", "I'll send Kyle $5'000"],
    ['$5 000', "I'll send Kyle $5 000"],
    ['$5 thin-space 000', "I'll send Kyle $5\u2009000"],
    ['$5 no-break-space 000', "I'll send Kyle $5\u00a0000"],
    ['$5 narrow no-break 000', "I'll send Kyle $5\u202f000"],
  ])('a span may not leave the rest of a number behind: "$5" from %s', (_what, turn) => {
    expect(screenCommitment({ statement: 'send Kyle $5' }, [turn])).toEqual({ keep: false, reason: 'not-a-caller-span' }); // prettier-ignore
  });

  it('nor a number word, nor a clock: "send Kyle five" from "five thousand", "at 3" from "at 3:30"', () => {
    expect(screenCommitment({ statement: 'send Kyle five' }, ["I'll send Kyle five thousand"])).toEqual({ keep: false, reason: 'not-a-caller-span' }); // prettier-ignore
    expect(screenCommitment({ statement: 'pick up the kids at 3' }, ['pick up the kids at 3:30'])).toEqual({ keep: false, reason: 'not-a-caller-span' }); // prettier-ignore
    expect(screenCommitment({ statement: 'send Kyle $5' }, ["I'll send Kyle $5 on Friday"])).toEqual({ keep: true }); // prettier-ignore
  });

  it('times and dates are set aside only when they read as one: "at", "on", "by", am or pm', () => {
    expect(said('pick up the kids at 3:30 and 5:30')).toEqual({ keep: true });
    expect(said('the meeting is 12:34pm and 5:55am')).toEqual({ keep: true });
    expect(said('see you on March 12 at 5pm')).toEqual({ keep: true });
    expect(said('the combo is 12:34')).toEqual({ keep: false, reason: 'secret' });
    // Only two are set aside, however they read: four times "at 11:11" is a number.
    expect(said('ring at 11:11, at 11:11, at 11:11 and at 11:11')).toEqual({ keep: false, reason: 'secret' }); // prettier-ignore
  });

  it('a secret elsewhere in the turn is not stored with the item, and the item is still kept', () => {
    const turn = "I'll call Mom Sunday, and the gate code is 4417";
    expect(screenCommitment({ statement: 'call Mom Sunday' }, [turn])).toEqual({ keep: true });
    expect(screenCommitment({ statement: 'call Mom Sunday', quote: 'call Mom Sunday' }, [turn])).toEqual({ keep: true }); // prettier-ignore
  });
});

describe('the C4 re-check of 5ef8f7f33 (best-effort secret drop)', () => {
  it.each([
    'the alarm is double four double one',
    'the alarm is triple four one',
    'el código doble cuatro doble uno',
    'der Code ist doppel vier doppel eins',
    'at 12:34 and at 23:45 then 567',
    'at 11:11, at 11:11 and at 11:11',
    'on the 41st on the 11th',
    'the 12th then the 34th',
    'on the 12th on the 21st',
    'by the 3rd and the 4th of 56',
    'la clave quatro quatro um um',
    'diecinueve veintiuno',
    'la alarma es diecinueve diecisiete',
    'dieciséis dieciseis',
    'dieciocho dezoito',
    'oitenta neunzehn',
    'siebzehn diciannove',
    'settanta settanta',
    'девятнадцать семнадцать',
  ])('drops %j', (line) => {
    expect(said(line)).toEqual({ keep: false, reason: 'secret' });
  });

  it.each([
    'pay rent at 5pm',
    'dentist on the 15th at 3pm',
    'call Mom Sunday',
    'pick up the kids at 3:30',
    "I'll pay Kevin $40 Friday",
    'pick up the kids at 3:30 and 5:30',
    'see you on March 12 at 5pm',
    'pay the $1,450 deposit on Friday at 5pm',
    'meet May 3 at 10:30',
    'veintiuno ocho',
  ])('keeps the legit %j', (line) => {
    expect(said(line)).toEqual({ keep: true });
  });
});

describe('kept, and only ever kept: there is no "plain"', () => {
  it('every result is either { keep: true } or a drop with a reason, never more', () => {
    const items: Array<[unknown, string[]]> = [
      [{ statement: 'call Mom Sunday' }, ['call Mom Sunday']],
      [{ statement: "I'll pay Kevin $40 Friday" }, ["I'll pay Kevin $40 Friday"]],
      [{ statement: 'mandale a Kyle quinientos el viernes' }, ['mandale a Kyle quinientos el viernes']], // prettier-ignore
      [{ statement: 'card 4111 1111 1111 1111' }, ['card 4111 1111 1111 1111']],
      [{ statement: 'invented' }, ['call Mom Sunday']],
      [null, []],
    ];
    for (const [item, turns] of items) {
      const r = screenCommitment(item as never, turns);
      expect(Object.keys(r).sort()).toEqual(r.keep ? ['keep'] : ['keep', 'reason']);
    }
  });

  it.each([
    'pay rent Friday',
    'pay rent at 5pm',
    'dentist on the 15th at 3pm',
    'call Mom Sunday',
    'pick up the kids at 3:30',
    "I'll pay Kevin $40 Friday",
    'transfer $2,000 to Jordan',
    'send Kyle $1,000,000',
    'transferir quinientos a Marta',
    'mandale a Kyle quinientos el viernes',
    'отправь Кайлу пятьсот рублей',
    'run 3 miles tomorrow',
  ])('%j is kept, and the result says nothing about sending it', (line) => {
    expect(said(line)).toEqual({ keep: true });
  });
  it('canon folds width, case and spacing; hasSecret sees full-width digits as digits', () => {
    expect(canon('ＣＡＬＬ  Mom')).toBe('call mom');
    expect(hasSecret('card ４１１１ １１１１')).toBe(true);
  });
});
