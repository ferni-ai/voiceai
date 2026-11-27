/**
 * A forgotten phone number stays forgotten in any format, and a forgotten "number" topic hides
 * a raw passage holding one (#3995 follow-up). Two verifiers saw "+1 435 555 0199" and
 * "435/555/0199" pass the forget check, and "his cell is 435 555 0199" pass "brother phone
 * number". Numbers are fictional (555-01xx).
 */
import { describe, expect, it } from 'vitest';
import { isForgotten, isForgottenPassage } from '../forgotten.js';

const NUMBER = ['435-555-0199'];

describe('a forgotten number, in any format', () => {
  it.each([
    ['with a country code', 'his number is +1 435 555 0199'],
    ['with slashes', 'his number is 435/555/0199'],
    ['in parentheses', 'call (435) 555-0199 after six'],
    ['with dots', 'try 435.555.0199'],
    ['as one block with a 1', 'text 14355550199'],
    ['in spoken digits', 'it is four three five five five five zero one nine nine'],
    ['in wide digits', 'call ４３５ ５５５ ０１９９'],
  ])('%s: a fact and a passage are both forgotten', (_l, text) => {
    expect(isForgotten(text, NUMBER)).toBe(true);
    expect(isForgottenPassage(text, NUMBER)).toBe(true);
  });

  it('a topic written with a country code hides the bare number', () => {
    expect(isForgotten('call 435 555 0199', ['+1 (435) 555-0199'])).toBe(true);
  });

  it('a topic with a number and words hides a passage with only the number', () => {
    expect(isForgottenPassage('ring +1 435 555 0199', ['brother 435 555 0199'])).toBe(true);
  });

  it('a number run together with another is still found', () => {
    expect(isForgotten('either 435 555 0142, 435 555 0199', NUMBER)).toBe(true);
  });

  it('a number written without its area code is still found', () => {
    expect(isForgottenPassage('his line is 555-0199', NUMBER)).toBe(true);
  });

  it('a different number is not forgotten', () => {
    expect(isForgotten('his number is +1 435 555 0142', NUMBER)).toBe(false);
    expect(isForgottenPassage('call 435/555/0142', NUMBER)).toBe(false);
  });

  it.each([
    ['joined by a comma', 'his are +1 435 555 0142, +1 435 555 0199'],
    ['back to back', 'his are 435 555 0142 435 555 0199'],
  ])('the forgotten number beside another, %s, is found', (_l, text) => {
    expect(isForgotten(text, NUMBER)).toBe(true);
  });

  it('a forgotten price is not a phone number: a bigger price stays', () => {
    expect(isForgotten('we raised 12,500,000 for the school', ['the $1,250,000 house'])).toBe(
      false
    );
  });

  it('a date or a short number is not read as the forgotten number', () => {
    expect(isForgottenPassage('on 2026-11-17 we paid 435', NUMBER)).toBe(false);
  });
});

describe('a forgotten "number" topic hides a raw passage holding a number', () => {
  it.each([
    ['brother phone number', 'his cell is 435 555 0199'],
    ["my mom's cell", 'reach her on +1 435 555 0142'],
    ['work mobile', 'it is 435/555/0177'],
    ['the digits I gave you', 'four three five five five five zero one two three'],
  ])('%s', (topic, text) => {
    expect(isForgottenPassage(text, [topic])).toBe(true);
  });

  it('a passage with no number stays', () => {
    expect(isForgottenPassage('his cell died at the game', ['brother phone number'])).toBe(false);
  });

  it('a date or a year is not a phone number', () => {
    expect(isForgottenPassage('we met on 2026-11-17 in 1998', ['brother phone number'])).toBe(
      false
    );
  });

  it('a topic not about a number leaves a passage with one alone', () => {
    expect(isForgottenPassage('his cell is 435 555 0199', ['Denver job offer'])).toBe(false);
  });

  it('the topic words match whole: "headphones" is not "phone", "cellar" not "cell"', () => {
    expect(isForgottenPassage('the shop is 435 555 0199', ['my headphones'])).toBe(false);
    expect(isForgottenPassage('the shop is 435 555 0199', ['wine cellar'])).toBe(false);
  });

  // The verifier of #4042: any 7+ digit run hid the whole call summary. Only a phone shape does.
  it.each([
    ['a list of years', 'in 2019, 2020 and 2021 we moved twice'],
    ['a time range', 'from 10:30-11:45:30 today'],
    ['a price', 'we paid 1,250,000 for the house'],
  ])('%s is not a phone number: the passage stays', (_l, text) => {
    expect(isForgottenPassage(text, ['brother phone number'])).toBe(false);
  });

  // The security review of the second commit: a filter on the whole run dropped real numbers.
  it.each([
    ['two numbers joined by a comma', 'his are +1 435 555 0142, +1 435 555 0177'],
    ['two numbers back to back', 'his are 435 555 0142 435 555 0177'],
    ['digits grouped by commas', 'it is 435, 555, 0142'],
    ['spoken digits grouped by commas', 'four three five, five five five, zero one four two'],
    ['a number longer than a phone number', 'order 112-3456789-0123456 arrived'],
  ])('%s: hidden, it may be a phone number (fails closed)', (_l, text) => {
    expect(isForgottenPassage(text, ['brother phone number'])).toBe(true);
  });

  // The exemptions are whole runs only (#4042 verifier): beside a price, a time or years, a
  // phone number still hides. Each case leaks if an anchor is dropped.
  it.each([
    ['digits in thousands groups', 'his is 435,555,0199'],
    ['a price before it', 'paid 1,250,000 435 555 0199'],
    ['a price after it', 'his is 435 555 0199, 1,250'],
    ['a time before it', 'at 10:30 435 555 0199'],
    ['a time after it', 'his is 435 555 0199 10:30'],
    ['years after it', 'his is 435 555 0199, 2019, 2020'],
    ['two four-digit groups spaced like years', 'her line is 2012 1999'],
  ])('a phone number with %s still hides', (_l, text) => {
    expect(isForgottenPassage(text, ['brother phone number'])).toBe(true);
  });

  it('"number of" a person is still their phone number', () => {
    expect(isForgottenPassage('it is 435 555 0142', ['the number of my therapist'])).toBe(true);
  });

  it.each([["brother's cellphone"], ['his telephone'], ['her landline'], ['his tel']])(
    '%s names a phone number too',
    (topic) => {
      expect(isForgottenPassage('his is 435 555 0142', [topic])).toBe(true);
    }
  );

  it('a fact (all words) is not hidden by the rule: only raw passages are', () => {
    expect(isForgotten('his cell is 435 555 0199', ['brother phone number'])).toBe(false);
  });
});

// Stored keys and timestamps are not numbers anyone said (#4042 bot verifier): under "his
// number" they hid every stored call summary, whose id carries the epoch in milliseconds.
describe('a number topic and the shapes a stored record carries', () => {
  it.each([
    ['a stored summary id', 'summary_session-prev_1763478000123'],
    ['a voice call summary id', 'summary_session-AJ_FhDLDpE3gTFu-1763478000123_1763478000456'],
    ['a voice call session id', 'session-AJ_FhDLDpE3gTFu-1763478000123'],
    ['an outreach session id', 'outreach-1763478000123'],
    ['an open loop id', 'loop_1763478000123_k2j9x1'],
    ['an id ending in a digit beside a date', 'session-AJ_x7-1763478000123 2025-11-18'],
    [
      'an id ending in digits, then a date on the next line',
      'loop_1763478000123_abc123\n2025-11-18',
    ],
    [
      'an id ending in digits, then a date and time in the next field',
      'loop_1763478000123_abc123 \n 2025-11-18T15:00:00.000Z',
    ],
    ['a date then a year', 'we met 2025-11-18 \n 2019'],
    [
      'an id ending in a digit, then a count in the next field',
      'session-AJ_x7-1763478000123 \n 123456 steps',
    ],
    [
      'an id ending in digits, a date, then a count',
      'loop_1763478000123_abc123 \n 2025-11-18 \n 4567 steps',
    ],
    ['a timestamp with milliseconds', '2026-11-18T15:00:00.000Z'],
    ['a date with its time', 'we met on 2026-11-18 15:00'],
    ['a span of times with milliseconds', '15:00:00.000-15:30:00.000'],
  ])('%s hides nothing', (_l, text) => {
    expect(isForgottenPassage(text, ['his number'])).toBe(false);
  });

  it.each([
    ['beside a stored id', 'summary_session-prev_1763478000123 his cell is 435 555 0199'],
    ['beside a timestamp', '2026-11-18T15:00:00.000Z call 435-555-0199'],
    ['after a date and time', 'on 2026-11-18 15:00 he gave me 435 555 0199'],
    ['in markdown emphasis', 'he said _his number is 435-555-0199_'],
    ['wrapped in underscores', '_435 555 0199_'],
    ['in a snake_case note', 'note_for_mom 435 555 0199'],
    ['after a stored id with no epoch', 'id_x 4355550199'],
    ['as thirteen digits with no underscore', 'his line is 1435555019912'],
    ['after a list of years', 'in 2019, 2020 435 555 0199'],
    ['before a time', 'his is 435-555-0199 15:00'],
    ['before a stored id', 'his cell is 435 555 0199 summary_x_1763478000123'],
    ['as +1 and the number glued to a word', 'mom_14355550199'],
    ['with an extension glued to a word', 'tel_4355550199123'],
    ['as thirteen digits glued to a word by "_"', 'cell_1435555019900'],
    ['as thirteen digits glued to a word by "-"', 'mom-1435555019900'],
    ['run into an epoch', 'x_17634780001234355550199'],
    ['as fourteen digits glued to a word', 'tel_15555550199123'],
    ['as twelve digits glued to a word', 'mom-155555501991'],
    ['broken across a line', 'his cell is 435\n555 0199'],
    ['broken after its area code and exchange', 'his cell is 435 555\n0199'],
    ['broken inside its dashes', 'his cell is (435) 555-\n0199'],
    ['split across two joined fields', 'his cell is 435 555 \n 0199'],
    ['after a date on the line before', '2025-11-18\n435 555 0199'],
    ['that only ends like a date', 'his cell is 4352019-55-01'],
    ['that only starts like a date', 'his cell is 2019-55-0199'],
    ['grouped in twos after a date-shaped four', 'his cell is 2015-55-01-99'],
    ['run on from a date by a dash', 'his cell is 2025-11-18-0199'],
    ['ending in a date-shaped group on one line', 'his cell is 435 555 2025-11-18'],
    ['seven separators before a date-shaped group', 'his cell is 435 555 - - - 2019-05-12'],
    ['joined to a date by a soft hyphen', 'his cell is 2025-11-18\u00ad0199'],
    ['joined to a date by a zero-width space', 'his cell is 435\u200b2025-11-18'],
    ['shaped like a date with no such month', 'his cell is 2015-55-01'],
    ['shaped like a date with no such day', 'his cell is 2015-11-55'],
    ['shaped like a date and time that cannot be', 'his cell is 4355-55-01 99:00'],
    ['shaped like a span with no such hours', 'his cell is 43:55-50:19'],
    ['shaped like a span with no such minutes', 'his cell is 12:75-12:99'],
    ['shaped like a date that cannot be and a time', 'his cell is 4355-55-01 12:00'],
    ['shaped like a span with no such seconds', 'his cell is 12:00:75-12:00:99'],
    [
      'as +1, an extension and wide digits glued to a word',
      'mom_\uff11\uff16\uff11\uff17\uff15\uff15\uff15\uff10\uff11\uff19\uff19\uff11\uff12',
    ],
    ['spoken, then a date-shaped group', 'his cell is four three five five five five 2025-11-18'],
    [
      'in wide digits, then a date-shaped group',
      'his cell is \uff14\uff13\uff15 \uff15\uff15\uff15 2025-11-18',
    ],
    ['after a space and a joiner', 'call _1555555019900'],
    ['at the start after a joiner', '-1555555019900 is his'],
  ])('a real number %s still hides', (_l, text) => {
    expect(isForgottenPassage(text, ['his number'])).toBe(true);
  });

  it.each([
    ['an eight-digit order number', 'order 48213377 shipped'],
    ['counting aloud to eight', 'one two three four five six seven eight'],
    ['a descending pair of years', 'the 2020-2019 seasons'],
    ['a nine-digit run in an id', 'id_435555019'],
  ])('%s still hides: it fails closed (a known gap)', (_l, text) => {
    expect(isForgottenPassage(text, ['his number'])).toBe(true);
  });
});
