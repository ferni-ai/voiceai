/**
 * The voicemail Ferni leaves for Sam is fixed words: the AI-friend greeting,
 * one sentence about Sam, the close. Sam's own words are only said inside an
 * attributed quote, so no request, however it is written, makes Ferni speak
 * as Sam. Fictional people only: Sam asks, Alex is called.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as string[]);
const callLLM = vi.hoisted(() => vi.fn(async () => "Hi Alex! It's Sam."));

vi.mock('../../llm-utils.js', () => ({ callLLM }));

vi.mock('../../../utils/safe-logger.js', () => {
  const logger = (): Record<string, unknown> => {
    const capture = (...args: unknown[]): void => {
      logged.push(JSON.stringify(args));
    };
    return { debug: capture, info: capture, warn: capture, error: capture, child: logger };
  };
  return { getLogger: logger, createLogger: logger };
});

const { onBehalfVoicemail } = await import('../on-behalf-voicemail.js');
const { PLACEHOLDER_NAMES } = await import('../opening-line.js');

const GREETING = "Hi Alex, it's Ferni, Sam's AI friend.";
const NO_NAME_GREETING = "Hi Alex, it's Ferni, an AI friend.";
const CLOSE = 'They wanted to make sure you got this message. Take care, and talk soon.';
const ATTRIBUTION = 'Sam asked me to pass on a message, in their words: ';

/** A purpose as quoted: as written, with a period when it has no end of its own. */
const quoteOf = (purpose: string): string => (/[.!?]$/.test(purpose) ? purpose : `${purpose}.`);

const said = (purpose: string, requesterName: string | undefined = 'Sam', callType = 'personal') =>
  onBehalfVoicemail({ recipientName: 'Alex', requesterName, purpose, callType });

beforeEach(() => {
  logged.length = 0;
  callLLM.mockClear();
});

afterEach(() => {
  // No model is ever asked for any part of this voicemail
  expect(callLLM).toHaveBeenCalledTimes(0);
});

describe('the requests the last review found relayed wrongly (all now read as English)', () => {
  it.each([
    // The 12 broken relays
    ['Sam', 'Running late, see you at 7', `${ATTRIBUTION}Running late, see you at 7.`],
    ['Sam', 'Happy birthday!', 'Sam wishes you a happy birthday!'],
    ['Sam', 'Call me when you can', `${ATTRIBUTION}Call me when you can.`],
    ['Sam', "It's raining here", `${ATTRIBUTION}It's raining here.`],
    ['Sam', "It's been a while", `${ATTRIBUTION}It's been a while.`],
    ['Sam', 'This is so exciting', `${ATTRIBUTION}This is so exciting.`],
    [
      'Will',
      'Will you call back?',
      'Will asked me to pass on a message, in their words: Will you call back?',
    ],
    ['May', 'May is great', 'May asked me to pass on a message, in their words: May is great.'],
    ['Sam', "tell her I wasn't mad", `${ATTRIBUTION}I wasn't mad.`],
    ['Sam', 'tell her me and Jordan say hi', `${ATTRIBUTION}me and Jordan say hi.`],
    ['Sam', "we're at the park", `${ATTRIBUTION}we're at the park.`],
    ['Sam', 'I love you', `${ATTRIBUTION}I love you.`],
    // The 7 benign lines that used to fall back to "pass on a message"
    ['Sam', 'Sam sends their love, Alex.', `${ATTRIBUTION}Sam sends their love, Alex.`],
    ['Sam', 'Lots of love from Sam.', `${ATTRIBUTION}Lots of love from Sam.`],
    ['Sam', 'Sam sends hugs, Alex.', `${ATTRIBUTION}Sam sends hugs, Alex.`],
    [
      'Sam',
      "It's Friday, and Sam says enjoy the weekend.",
      `${ATTRIBUTION}It's Friday, and Sam says enjoy the weekend.`,
    ],
    [
      'Sam',
      "It's Christmas Eve, and Sam is thinking of you.",
      `${ATTRIBUTION}It's Christmas Eve, and Sam is thinking of you.`,
    ],
    [
      'Sam',
      'Everyone here and at home misses you. Sam says hi.',
      `${ATTRIBUTION}Everyone here and at home misses you. Sam says hi.`,
    ],
    ['Sam', 'Sam says hi from Denver.', `${ATTRIBUTION}Sam says hi from Denver.`],
  ])('%s: %j', (requester, purpose, relay) => {
    expect(said(purpose, requester)).toBe(
      `Hi Alex, it's Ferni, ${requester}'s AI friend. ${relay} ${CLOSE}`
    );
  });
});

describe('the closed English requests', () => {
  it.each([
    ['say hi', 'Sam says hi!'],
    ['hi', 'Sam says hi!'],
    ['Say hello!!', 'Sam says hello!'],
    ['say hey 👋🏽', 'Sam says hey!'],
    ['say hi from me ❤️', 'Sam says hi!'],
    ['wish Alex a happy birthday from me 🎉', 'Sam wishes you a happy birthday!'],
    ['wish her a happy birthday', 'Sam wishes you a happy birthday!'],
    ['say happy new year!', 'Sam wishes you a happy new year!'],
    ['wish Alex happy anniversary', 'Sam wishes you a happy anniversary!'],
    ['tell Alex that dinner is at 7', `${ATTRIBUTION}dinner is at 7.`],
    ["let her know I'm running late", `${ATTRIBUTION}I'm running late.`],
    ['tell you, the keys are under the mat', `${ATTRIBUTION}the keys are under the mat.`],
    ['remind her to pick up the cake', 'Sam wanted to remind you to pick up the cake.'],
    ['remind Alex about dinner on Friday.', 'Sam wanted to remind you about dinner on Friday.'],
    ['remind him that the game starts at 6', 'Sam wanted to remind you that the game starts at 6.'],
    ['ask Alex if Friday still works', 'Sam wanted to ask you if Friday still works.'],
    ['ask her whether the blue one fits?', 'Sam wanted to ask you whether the blue one fits.'],
    ['ask them about the trip', 'Sam wanted to ask you about the trip.'],
    ['ask you to bring a salad', 'Sam wanted to ask you to bring a salad.'],
  ])('%j', (purpose, relay) => {
    expect(said(purpose)).toBe(`${GREETING} ${relay} ${CLOSE}`);
  });

  it.each([
    // A pronoun in a reminder or question would say the wrong person: quoted whole instead
    'remind her to call her dentist',
    'remind him about my recital',
    'ask him to call me back',
    "ask her if she's free Saturday",
    'ask Alex whether we can come',
    'remind them that our flight lands at 9',
    'ask Alex if he got the photos',
    'remind her that they moved the date',
    // Someone who isn't the recipient, or more than the closed shape
    'remind you about her party',
    'remind Alex about your keys',
    'ask Alex if you can borrow the ladder',
    // Not the closed shape: no recipient, someone else, a tail after a greeting, or another word
    'ask if you are free',
    'tell Jordan I said hi',
    'say hi, it is Sam',
    'say hi to mom for me',
    'say hi to Alex',
    'Say hello to Alex for me',
    'say happy birthday to you both',
    'Happy birthday, Alex!',
    'remind mom to call',
    'telling her about the move went fine',
    'sayonara',
    'reminder: the dentist is at 3',
    'asking around about the flat',
    'letting her know was hard',
    'hiking on Sunday',
    // A pronoun hidden by an invisible character or fullwidth letters is still a pronoun
    'remind her about m\u200Be',
    'remind her about ｍｅ',
  ])('quotes %j whole', (purpose) => {
    expect(said(purpose)).toBe(`${GREETING} ${ATTRIBUTION}${quoteOf(purpose)} ${CLOSE}`);
  });

  it('quotes only what follows "tell her": "tell her I\'m sorry"', () => {
    expect(said("tell her I'm sorry")).toBe(`${GREETING} ${ATTRIBUTION}I'm sorry. ${CLOSE}`);
  });
});

describe('any other request is quoted, attributed', () => {
  it.each([
    ["It's Sam!", "It's Sam!"],
    ['Are you free Saturday?', 'Are you free Saturday?'],
    ['Congrats on the new job!!', 'Congrats on the new job!!'],
    ['Miss you 💛', 'Miss you 💛.'],
    ["  tell her it's Sam  ", "it's Sam."],
    ["it's Sam, call me", "it's Sam, call me."],
    ['this is Sam, call me', 'this is Sam, call me.'],
    ['Hi Alex, it’s Sam! Call me.', 'Hi Alex, it’s Sam! Call me.'],
    // Not English: always quoted as they are
    ['Dile que la quiero mucho', 'Dile que la quiero mucho.'],
    ['¿Vienes el sábado?', '¿Vienes el sábado?'],
    ["Dis-lui que je l'aime", "Dis-lui que je l'aime."],
    ["C'est Sam, rappelle-moi !", "C'est Sam, rappelle-moi !"],
    ['remind her about mе', 'remind her about mе.'], // Cyrillic "е": not matched as English
  ])('%j', (purpose, quote) => {
    expect(said(purpose)).toBe(`${GREETING} ${ATTRIBUTION}${quote} ${CLOSE}`);
  });

  it('says a long request whole', () => {
    const purpose = `${'We found the old photo albums in the attic, '.repeat(11)}and they are wonderful`;
    expect(purpose.length).toBeGreaterThanOrEqual(500);
    expect(said(purpose)).toBe(`${GREETING} ${ATTRIBUTION}${purpose}. ${CLOSE}`);
  });

  it.each(['', '   ', '...'])(
    'says only that Sam asked for the call when the request is %j',
    (p) => {
      expect(said(p)).toBe(`${GREETING} Sam asked me to call you. ${CLOSE}`);
    }
  );

  it('greets a business with the intro that names Sam', () => {
    expect(
      onBehalfVoicemail({
        recipientName: 'Acme Dental',
        requesterName: 'Sam',
        purpose: "move Sam's cleaning to next week",
        callType: 'business',
      })
    ).toBe(
      `Hi Acme Dental, this is Ferni, an AI calling for Sam. ${ATTRIBUTION}move Sam's cleaning to next week. ${CLOSE}`
    );
  });
});

/**
 * The 88 self-introduction shapes from the last review (its 34 misses and the
 * classes it found caught), now given as the request itself. None of them is
 * ever said outside the quote: the only words around it are the fixed ones.
 */
const SELF_INTROS = [
  "It's ya boy Sam!",
  'Hey Alex, Sam again!',
  'Hey Alex, Sam (your sister)!',
  'Thinking of you. Sam (your sister)',
  'Hi sweetie, your mom here.',
  'mom here!',
  '~Sam',
  'Sam x',
  'Sam, x',
  'Sam 💛',
  'it′s Sam',
  'itʹs Sam',
  'it＇s Sam',
  'it՚s Sam',
  "it's ｓａｍ",
  'ｓａｍ here',
  "Ｉｔ'ｓ Sam",
  "it's sаm",
  'sаm here',
  'grаcе here',
  "it's s\u034Fam",
  "It's\u3164Sam",
  "ıt's Sam",
  'Sam—here',
  "it's your boy Sam",
  "it's your girl Sam",
  "it's ur boy Sam",
  "It's your one and only Sam!",
  "Guess who? It's yours truly!",
  "it's jordan",
  'soy Sam',
  'habla Sam',
  "c'est Sam",
  "c'est moi",
  "IT'S SAM",
  "it's sam",
  "It's SAM!",
  "It's Zoë",
  "It's Zoë",
  "It's S\u200Bam",
  "It's Sa\u200Dm",
  "It's S\u00ADam",
  "It's \uFEFFSam",
  "It\u2060's Sam",
  "It's\u2009Sam",
  "It's\u3000Sam",
  "It's\u202FSam",
  'it is Sam',
  "hey it's Sam!!",
  'S-A-M here',
  'Mom here',
  '– Sam',
  'sent from Sam',
  'Signed, Sam',
  'Yours, Sam',
  'xoxo Sam',
  'Love, Sam 💛',
  'Sam here 👋',
  "Just checking in. It's Sam, by the way.",
  "Hi Alex\nit's Sam",
  "It's Samantha Leigh-Okafor the Third",
  "It's Sam Lee",
  'Will here',
  "it's may",
  'GRACE HERE',
  'hope here!',
  "It's Samuel",
  'me again, Sam',
  'Peace out, Sam',
  'From your favourite sister, Sam',
  'This is your son calling',
  'Sam speaking',
  'Sam calling',
  "it's your friend Sam",
  'Hey Alex — Sam here',
  'Good morning Alex Sam here',
  'its me',
  "it's just me",
  "My name's Sam",
  "Hi Mom, it's your son!",
  'It´s Sam',
  "I'm Sam",
  'this is Sam calling to say hi',
  'Talk soon, Sam!',
  'Take care. - Sam',
  'Cheers, Sam.',
  'xoxo, Mom',
  "Hey it's me Sam ❤️",
];

describe('a request that introduces someone', () => {
  it('has all 88 shapes', () => {
    expect(new Set(SELF_INTROS).size).toBe(88);
  });

  it.each(SELF_INTROS)('is said only after the greeting and the attribution: %j', (purpose) => {
    const voicemail = said(purpose);
    expect(voicemail.startsWith(`${GREETING} ${ATTRIBUTION}`)).toBe(true);
    expect(voicemail.endsWith(` ${CLOSE}`)).toBe(true);
    // Between the attribution and the close: the request, and at most its added period
    const quote = voicemail.slice(`${GREETING} ${ATTRIBUTION}`.length, -` ${CLOSE}`.length);
    expect([purpose.trim(), `${purpose.trim()}.`]).toContain(quote);
  });
});

describe('a Spanish or French request', () => {
  it.each(['Dile que la quiero mucho', "Dis-lui que je l'aime", 'Hola Alex, soy Sam'])(
    'keeps the English greeting main already says, and quotes %j as written',
    async (purpose) => {
      // Main localises no voicemail: the LiveKit voicemail starts with the same English words
      const { voicemailInstructions } =
        await import('../../../agents/outbound-call/call-opening.js');
      const parties = { recipientName: 'Alex', sponsorName: 'Sam', personal: true };
      expect(voicemailInstructions(parties, purpose)).toContain(
        `Start with exactly: "${GREETING}"`
      );
      expect(said(purpose)).toBe(`${GREETING} ${ATTRIBUTION}${quoteOf(purpose)} ${CLOSE}`);
    }
  );
});

describe('the requester name', () => {
  it.each([
    'user\u200B',
    '\u200Bthe user\u200B',
    'ｕｓｅｒ',
    '  User ',
    'the\u1680user',
    '\tthe\n user',
    '',
    undefined,
    ...[...PLACEHOLDER_NAMES].flatMap((placeholder) => [
      placeholder.toUpperCase(),
      `\u200B${placeholder}\u200B`,
      `\u00A0${placeholder}\u00A0`,
      placeholder.replace(/[!-~ ]/g, (ch) =>
        ch === ' ' ? '\u3000' : String.fromCharCode(ch.charCodeAt(0) + 0xfee0)
      ),
    ]),
  ])('%j is no name: the no-name greeting, and "someone"', (requesterName) => {
    const asked = (purpose: string) =>
      onBehalfVoicemail({ recipientName: 'Alex', requesterName, purpose, callType: 'personal' });
    expect(asked('say hi')).toBe(`${NO_NAME_GREETING} Someone says hi! ${CLOSE}`);
    expect(asked("we're at the park")).toBe(
      `${NO_NAME_GREETING} Someone asked me to pass on a message, in their words: we're at the park. ${CLOSE}`
    );
  });

  it.each([
    ['Mary-Jo', 'Mary-Jo'],
    ['Zoe\u0308', 'Zo\u00EB'],
    ["O'Neil", "O'Neil"],
    ['Sa\u200Bm', 'Sam'],
    ['Ｓａｍ', 'Sam'],
    // A Cyrillic look-alike of "user" is not the placeholder: it reads as a name
    ['us\u0435r', 'us\u0435r'],
  ])('%j is named as %j', (requesterName, name) => {
    expect(said('say hi', requesterName)).toBe(
      `Hi Alex, it's Ferni, ${name}'s AI friend. ${name} says hi! ${CLOSE}`
    );
  });
});

describe('logging', () => {
  it('logs which relay and counts, never the request or a name', () => {
    said('remind her to pick up the cake at Elm Street', 'Sam Quill');
    said('call 213-555-0123, sam.quill@example.com', 'Sam Quill');
    const purposes = ["we're at the park", "It's Sam!", "tell her I wasn't mad", 'say hi'];
    for (const purpose of purposes) said(purpose, 'Sam Quill');
    const text = logged.join('\n');
    for (const purpose of purposes) expect(text).not.toContain(purpose);
    expect(text).toContain('"relay":"remind"');
    expect(text).toContain('"purposeChars":');
    for (const secret of ['Sam', 'Quill', 'Alex', 'cake', 'Elm', '555', 'example.com'])
      expect(text).not.toContain(secret);
  });
});
