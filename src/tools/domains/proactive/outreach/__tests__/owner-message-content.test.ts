/**
 * The shape allowlist an unverified call's message must fit (owner-message-content.ts).
 * Property tests generate the shapes a phishing text needs from templates and
 * assert none pass; a realistic benign set measures false refusals. Fictional
 * values only. The independent verifier holds its own adversarial set.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { blockedContent } from '../owner-message-content.js';

const DIGIT_NAMES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
];
const SEPARATORS = ['', ' ', '-', '.', ', ', ' - ', '(', ') ', ':', '  ', '/'];
const pick = <T>(items: readonly T[]) => fc.constantFrom(...items);
/** Words that may sit around a payload in a real message. */
const filler = fc.array(pick(['hey', 'please', 'call', 'now', 'thanks', 'it is', 'here']), {
  maxLength: 3,
});
const around = (payload: fc.Arbitrary<string>) =>
  fc.tuple(filler, payload, filler).map(([a, p, b]) => [...a, p, ...b].join(' '));

describe('property: shapes a phishing text needs never pass', () => {
  it('7 to 11 digits, as digits or number words, with any allowed separators', () => {
    const digit = fc.tuple(fc.integer({ min: 0, max: 9 }), fc.boolean()).map(([d, word]) => (word ? DIGIT_NAMES[d] : String(d))); // prettier-ignore
    const phone = fc
      .array(fc.tuple(digit, pick(SEPARATORS)), { minLength: 7, maxLength: 11 })
      .map((parts) => parts.map(([d, s], i) => (i ? s : '') + d).join(''));
    fc.assert(fc.property(around(phone), (text) => blockedContent(text) !== null), { seed: 3227, numRuns: 500 }); // prettier-ignore
  });

  it('email shapes', () => {
    const name = pick(['pat', 'sam.lee', 'jo', 'Pat Example']);
    const at = pick(['@', ' at ', ' (at) ', ' AT ', ' a t ', '[at]']);
    const host = pick(['gmail', 'g mail', 'g m a i l', 'yahoo', 'example', 'outlook', 'live']);
    const tail = pick(['', '.com', ' dot com', ' . com', ' period net', ' point org', '.co.uk']);
    const email = fc.tuple(name, at, host, tail).map((p) => p.join(''));
    // "x at example" or "x at live" alone is no address (fe dropped "live"); all else must refuse
    const real = email.filter((e) => !/ (at|AT|\(at\)|a t) (example|live)$/.test(e));
    fc.assert(fc.property(around(real), (text) => blockedContent(text) !== null), { seed: 3227, numRuns: 500 }); // prettier-ignore
  });

  it('letters, a separator, then any TLD', () => {
    const label = fc.stringMatching(/^[a-z]{2,10}$/);
    const tld = fc.stringMatching(/^[a-z]{2,6}$/);
    const sep = pick([
      '.',
      ':',
      ' dot ',
      ' DOT ',
      '-dot-',
      ' (dot) ',
      ' period ',
      ' point ',
      '[.]',
      '. ',
    ]);
    const domain = fc
      .tuple(label, sep, tld)
      .map(([l, s, t]) => (s === '. ' ? `${l}.${t}` : l + s + t));
    fc.assert(fc.property(around(domain), (text) => blockedContent(text) !== null), { seed: 3227, numRuns: 500 }); // prettier-ignore
  });

  it('a short code near call, dial, text, reply, send or ring', () => {
    const code = fc.integer({ min: 100, max: 999999 }).filter((n) => ![988, 741741].includes(n));
    const verb = pick(['call', 'Dial', 'text', 'reply', 'send', 'ring', 'texting']);
    const text = fc
      .tuple(verb, pick(['', 'us at', 'STOP to', 'back']), code)
      .map((p) => p.join(' '));
    fc.assert(fc.property(text, (t) => ['short_code', 'vanity_number'].includes(String(blockedContent(t)))), { seed: 3227, numRuns: 300 }); // prettier-ignore
  });

  it('toll-free vanity numbers and digits broken up by capitals', () => {
    const prefix = pick(['1 800', '1-888', '877', '(866)', '1.855', '844', '833']);
    const rest = pick(['FERNI HELP', 'CALL NOW', '555 0142', 'GET-CASH']);
    const vanity = fc.tuple(prefix, rest).map(([p, r]) => `${p} ${r}`);
    fc.assert(fc.property(vanity, (t) => blockedContent(t) === 'vanity_number'), { seed: 3227, numRuns: 200 }); // prettier-ignore
    expect(blockedContent('call 555 HELP 01')).toBe('vanity_number');
  });

  it('"at" before a mail provider, however it is spaced', () => {
    const provider = pick(['gmail', 'g mail', 'G MAIL', 'yahoo', 'icloud', 'proton mail', 'msn']);
    const text = fc.tuple(pick(['pat', 'reach me', 'sam']), pick(['at', 'AT', 'at my']), provider).map((p) => p.join(' ')); // prettier-ignore
    fc.assert(fc.property(text, (t) => blockedContent(t) !== null), { seed: 3227, numRuns: 200 }); // prettier-ignore
    expect(blockedContent('pat at g m a i l')).not.toBeNull();
  });
});

describe('property: disguises the one ASCII fold undoes (security review, 2026-10-31)', () => {
  const ACUTE = String.fromCodePoint(0x0301);
  const SMALL_CAPS: Record<string, string> = { a: 'ᴀ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', i: 'ɪ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', r: 'ʀ', s: 'ꜱ', v: 'ᴠ', w: 'ᴡ', y: 'ʏ' }; // prettier-ignore
  const dress = (c: string, how: number) =>
    how === 1 ? c + ACUTE : how === 2 ? (SMALL_CAPS[c] ?? c) : how === 3 && c === 'i' ? 'ı' : c;

  it('credential words with accents, small capitals or a dotless i', () => {
    const word = pick(['verify', 'password', 'login', 'ssn', 'pin', 'wire']);
    const dressed = fc
      .tuple(word, fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 8, maxLength: 8 }))
      .map(([w, hows]) => [...w].map((c, i) => dress(c, hows[i])).join(''));
    fc.assert(fc.property(around(dressed), (t) => blockedContent(t) !== null), { seed: 3227, numRuns: 500 }); // prettier-ignore
  });

  it('defanged dots: "x(.)y", "x . y", "x. y" with y in lower case', () => {
    const label = fc.stringMatching(/^[a-z]{2,10}$/);
    const tld = fc.stringMatching(/^[a-z]{2,6}$/);
    const sep = pick(['(.)', ' (.) ', '( . )', ' . ', ' .', '. ', '.  ']);
    const domain = fc.tuple(label, sep, tld).map((p) => p.join(''));
    fc.assert(fc.property(around(domain), (t) => blockedContent(t) === 'address_token'), { seed: 3227, numRuns: 500 }); // prettier-ignore
  });

  // Joined to the digits by nothing, "-" or ".". Across a space, a real word made of
  // those letters ("I", "is", "so", "oil") stays a word: "Order 48213 is ready" passes.
  it('digits written as look-alike letters (l, I, i, o, O, s, S) next to digits', () => {
    const LOOKS: Record<string, string[]> = {
      '0': ['o', 'O'],
      '1': ['l', 'I', 'i'],
      '5': ['s', 'S'],
    };
    const digit = fc
      .tuple(fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: 2 }))
      .map(([d, k]) => LOOKS[String(d)]?.[k % LOOKS[String(d)].length] ?? String(d));
    const phone = fc
      .tuple(
        fc.integer({ min: 2, max: 9 }),
        fc.array(fc.tuple(digit, pick(['', '-', '.'])), { minLength: 6, maxLength: 10 })
      ) // prettier-ignore
      .map(([first, rest]) => String(first) + rest.map(([d, sep]) => sep + d).join(''));
    fc.assert(fc.property(around(phone), (t) => blockedContent(t) !== null), { seed: 3227, numRuns: 500 }); // prettier-ignore
  });

  it('seven digits padded apart by one word each', () => {
    const word = pick(['apples', 'then', 'and', 'please', 'okay', 'call', 'now', 'mom']);
    const padded = fc
      .array(fc.tuple(fc.integer({ min: 0, max: 9 }), word), { minLength: 7, maxLength: 9 })
      .map((parts) => parts.map(([d, w]) => `${d} ${w}`).join(' '));
    fc.assert(fc.property(padded, (t) => blockedContent(t) !== null), { seed: 3227, numRuns: 500 }); // prettier-ignore
  });

  it.each([
    ['please vérify it', 'credential_ask'],
    ['ᴠᴇʀɪꜰʏ your account', 'credential_ask'],
    ['pat at ıcloud', 'mail_provider'],
    ['55S-O1l2 now', 'digits'],
    ['call 2ooo ooo l', 'digits'],
    ['555 l23 IS 4o', 'digits'],
    ['1a2b3c4', 'digits'],
    ['e.g.com', 'address_token'],
  ])('%s -> %s', (text, reason) => {
    expect(blockedContent(text)).toBe(reason);
  });

  it.each([
    'Call mom. She misses you.',
    'Ask Dr. Patel about it',
    'Café at 8',
    'Note: buy milk',
    'Room 214 then 5s',
  ])(
    // prettier-ignore
    'still benign: %s',
    (text) => {
      expect(blockedContent(text)).toBeNull();
    }
  );
});

describe('each rule', () => {
  it.each([
    ['visit example.com', 'address_token'],
    ['pat@example.com', 'charset'],
    ['call 555−555−0123', 'charset'],
    ['5 × 5', 'charset'],
    ['see you \u{1F642}', 'charset'],
    ['сall now', 'charset'],
    ['50% off', 'charset'],
    ['go to www example', 'address_token'],
    ['type http then example', 'address_token'],
    ['example com', 'address_token'],
    ['a:b', 'address_token'],
    ['10.0.0.1', 'address_token'],
    ['5 5 5 then more', 'spaced_chars'],
    ['p a s s', 'spaced_chars'],
    ['order 48213 is ready', null],
    ['text 48213', 'short_code'],
  ])('%s -> %s', (text, reason) => {
    expect(blockedContent(text)).toBe(reason);
  });

  it.each([
    'your card number',
    'check your bank account',
    'the account number ends in',
    'the routing number',
    'the verification code',
    'a one-time code',
    'your security code',
    'buy a gift card',
    'please verify it',
    'the password is',
    'pass word',
    'what is your PIN',
    'send your SSN',
    'your social security number',
    'log in again',
    'log back in',
    'login now',
    'wire the money',
    'reply with the code we sent you',
    'type the code here',
    'passw0rd',
  ])('credential ask: %s', (text) => {
    expect(blockedContent(text)).toBe('credential_ask');
  });

  it.each([
    'thank Grandma for the card',
    'the code word for the party',
    'leave early to account for traffic',
  ])('not a credential ask: %s', (text) => {
    expect(blockedContent(text)).toBeNull();
  });
});

describe('crisis lines from the crisis module stay sendable, but only alone', () => {
  it.each([
    "If you're in crisis, call or text 988 right now",
    'text HOME to 741741',
    'call 988 or text HOME to 741741',
    'call nine eight eight',
    'call 1-800-950-6264 any time',
    'call 911',
    'If you are in danger, call 911 now',
  ])('passes: %s', (text) => {
    expect(blockedContent(text)).toBeNull();
  });

  it.each([
    '988 988 0142',
    '741741 5550',
    '911-911-0142',
    '9885550142',
    '988 555 0142',
    'call 988 0142',
    'nine eight eight five five five one two',
  ])(
    // prettier-ignore
    'refuses a crisis number joined to other digits: %s',
    (text) => {
      expect(blockedContent(text)).not.toBeNull();
    }
  );
});

/** Ordinary texts Ferni sends. Any refused here is a false refusal, listed below. */
const BENIGN = [
  'Pick up milk on the way home', "Don't forget to stretch before your run at 5pm",
  'Call your mom tonight, she misses you', 'Dentist tomorrow at 3, bring the forms',
  'You said you would drink more water today', 'Meet Pat at the park around noon',
  'Flight leaves at 6:45 from gate B12', 'Oven at 375 for 25 minutes',
  '1 cup flour, 2 eggs, 1 1/4 cups milk, 2 tbsp sugar', '500g pasta, 2 cloves garlic',
  'meet at Live Oak Park', 'Thank Grandma for the card she sent',
  'The code word for the party is pineapple', 'Leave early to account for traffic',
  'Dinner at Osteria Mozza at 7:30', 'Grab your prescription at Walgreens on 5th',
  'Your yoga class starts at 6 tomorrow', "Remind Sam about the 2 o'clock meeting",
  'Bring the blue folder to work', 'Water the tomatoes before it gets hot',
  "Book club is Thursday at 7, you're reading chapter 12", 'Take out the recycling tonight',
  'Pick up 2 dozen eggs, 3 apples and a loaf of bread', 'Happy birthday! Hope the cake is great',
  "Remember to breathe. You've got this.", 'Text me when you land',
  'Call the plumber about the sink', "Your sister's flight lands at 9:15",
  'Laundry, dishes, then rest', 'Practice the piano for 20 minutes',
  'Soccer practice moved to 4:30 at Riverside Field', 'Buy 2 oil filters and 1 lime',
  "Don't forget the farmers market Saturday morning", 'Ask Dr. Patel about the new medication',
  'Take 2 pills with breakfast', 'Meeting with Jordan at 10:30, then lunch at noon',
  'Pay the electric bill by Friday', "Mom's birthday is June 12th",
  'Go for a 20 minute walk after lunch', 'Pack sunscreen, towels and snacks for the beach',
  'Meet at the corner of Main and 3rd', 'You wanted to call Aunt Rosa this weekend',
  'The movie starts at 8:10, get there by 7:50', 'Pick up Lily from school at 3:15',
  "Write 3 things you're grateful for", 'Return the library books by the 15th',
  'Check the oil before the road trip', 'Bake the cookies at 350 for 12 minutes',
  'Order 48213 is ready for pickup', "The party is at Jamie's place on Elm Street",
  "Reply to Sam's email about the trip", 'Bring a sweater, it gets cold after 9',
  'Stretch for 10 minutes before bed', "Don't skip breakfast tomorrow",
  'Your haircut is at 11:45 on Tuesday', 'Call or text me if you need anything',
  'Grab coffee with Alex at Blue Bottle', 'Finish the report draft by 4',
  'Feed the cat twice today', 'At some point today, take a break',
  'Good luck on your interview at 9 tomorrow', 'Your package should arrive Wednesday',
  'Walk 5000 steps before dinner', "The game starts at 7, we're at Section 112",
  'See you at the cafe on 2nd Avenue', 'Drink a glass of water every hour',
  'Remember the 1/1/2027 deadline for the lease', 'Anecdotes make the toast, keep it short',
  'Oh no, the oven! Check it at 5 p.m.', 'Call Abuela, the café opens at 8',
]; // prettier-ignore

describe(`false refusals on ${BENIGN.length} ordinary texts`, () => {
  const refused = BENIGN.filter((text) => blockedContent(text) !== null);

  it('are exactly the known ones ("point", kept as an address word by fe)', () => {
    expect(refused).toEqual(['At some point today, take a break']);
  });

  it('stay at or under 5%', () => {
    expect(refused.length / BENIGN.length).toBeLessThanOrEqual(0.05);
  });
});
