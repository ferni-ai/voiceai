/**
 * A voicemail Ferni leaves for Sam never speaks as Sam, or as anyone: it
 * opens with the AI-friend greeting, a written line where any speaker names
 * themselves is replaced by fixed words, and a request without a real
 * requester name never reaches the model. Fictional people only: Sam asks,
 * Alex is called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callLLM = vi.hoisted(() => vi.fn<(prompt: string) => Promise<string | null>>());
const logged = vi.hoisted(() => [] as string[]);

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

const { onBehalfVoicemail, speaksAsRequester } = await import('../on-behalf-voicemail.js');

const sam = {
  recipientName: 'Alex',
  relationship: 'friend',
  requesterName: 'Sam',
  purpose: 'pass on a hello',
  callType: 'personal',
};
const GREETING = "Hi Alex, it's Ferni, Sam's AI friend.";
const FALLBACK = `${GREETING} Sam wanted me to pass on a hello. They wanted to make sure you got this message. Take care, and talk soon.`;
const NO_MESSAGE = (who: string) =>
  `${who} asked me to pass on a message, and they'll be in touch soon. Take care.`;

beforeEach(() => {
  callLLM.mockReset();
  logged.length = 0;
});

describe('speaksAsRequester', () => {
  it.each([
    // r1 rows
    ['Hi Alex! It’s Sam.', 'Sam'],
    ["Hi Alex! It's Sam.", 'Sam'],
    ['Hey, Sam here, just wanted to say hello.', 'Sam'],
    ['this is sam calling to say hi', 'Sam'],
    ["I'm Sam, and I wanted to say hello.", 'Sam'],
    ['This is Sam Lee, calling about Saturday.', 'Sam Lee'],
    ['Hi, it is Lee Sam.', 'Lee Sam'],
    ['Hope here! Just checking in.', 'Hope'],
    ["Hey Alex, it's me. Just thinking about you.", 'Sam'],
    // The 13 the r1 verify found spoken
    ['Hey Alex, Sam speaking. Just wanted to say hello.', 'Sam'],
    ['Sam calling to say hi.', 'Sam'],
    ["Hi Alex, it's your friend Sam!", 'Sam'],
    ['Hey Alex — Sam here.', 'Sam'],
    ['Good morning Alex Sam here', 'Sam'],
    ['its me, hi!', 'Sam'],
    ["it's just me.", 'Sam'],
    ['Thinking of you. Love, Sam', 'Sam'],
    ["My name's Sam.", 'Sam'],
    ["Hi Mom, it's your son!", 'Sam'],
    ['It´s Sam.', 'Sam'], // U+00B4
    ["It's Zoë!", 'Zoë'], // NFD text, NFC name
    ["It's​Sam.", 'Sam'], // zero-width space
    // More of the same shapes
    ["it's zoë", 'Zoë'], // lower case: only the name match, after NFC
    ["it's zoë", 'Zoë'], // NFD name
    ["it's s​am", 'Sam'], // a format character inside the name
    ["It's Jordan!", 'Sam'], // a name that isn't the requester's
    ['im Sam, hi', 'Sam'],
    ['this is me again', 'Sam'],
    ["it's only me, Alex", 'Sam'],
    ['Sam here just wanted to say hi', 'Sam'],
    ['Hi Alex, Mom calling.', 'Sam'],
    ['Take care. - Sam', 'Sam'],
    ['Bye for now — Sam Lee', 'Sam Lee'],
    ['Talk soon, Sam!', 'Sam'],
    ['Cheers, Sam.', 'Sam'],
    ['xoxo, Mom', 'Sam'],
    ['Love you lots. Love, Mom ❤️', 'Sam'],
    ["it's your buddy", 'Sam'],
    ["It's your old friend Jo.", 'Sam'],
    ['SAM HERE!', 'Sam'],
    ["Hey it's me Sam ❤️", 'Sam'],
    ['Mary-Jo here!', 'Mary-Jo'],
  ])('rejects %j for requester %s', (line, requester) => {
    expect(speaksAsRequester(line, requester)).toBe(true);
  });

  it.each([
    ['Sam wanted me to say hello, and to tell you Sunday still works.', 'Sam'],
    ['Sam says hi.', 'Sam'],
    ["Sam's been thinking about you all week.", 'Sam'],
    ['Sam asked me to let you know the package is on its way.', 'Sam'],
    ['This is Sam’s way of saying thank you.', 'Sam'],
    ['Samantha says hello too.', 'Sam'],
    ["I hope you're well.", 'Hope'],
    ['Hope to hear from you soon.', 'Hope'],
    ["Sam hopes you're well.", 'Hope'],
    ['Sam Lee wanted me to say thanks for Saturday.', 'Sam Lee'],
    ["It's the little things. Sam says hi.", 'Sam'],
    ["It's the little things. Sam says hi.", 'the user'],
    ["It's been a while, and Sam misses you. Bye for now.", 'Sam'],
    ["It's a big week for you, and Sam is rooting for you.", 'Sam'],
    ["I'm Sam's AI friend, and they wanted me to say hi.", 'Sam'],
    ["I'm passing on a hello from Sam's side. Have a great day.", 'Sam'],
    ['Everyone here is cheering you on.', 'Sam'],
    ['Sam says the weather here is lovely. Take care.', 'Sam'],
    ['Sam is calling later this week to catch up.', 'Sam'],
    ["Sam's here for you whenever you need them.", 'Sam'],
    ["Sam wanted you to know they're proud of you. Take care, Alex.", 'Sam'],
    ['Hope you have a great weekend! Sam sends their love.', 'Sam'],
    ['Sam wanted me to say hi. Love you, Mom.', 'Sam'],
    ["Sam's gift is on its way. Take care, and talk soon.", 'Sam'],
    ['This is hope-filled news, and Sam is thrilled.', 'Hope'],
  ])('keeps %j for requester %s', (line, requester) => {
    expect(speaksAsRequester(line, requester)).toBe(false);
  });

  it("matches the requester's name in any case, other names when written as one", () => {
    expect(speaksAsRequester("hi, it's jordan.", 'Jordan')).toBe(true);
    expect(speaksAsRequester("hi, it's jordan.", 'Sam')).toBe(false);
  });

  it.each(['', 'the user', 'user', undefined])(
    'never takes the placeholder %j for a name',
    (requester) => {
      expect(speaksAsRequester("It's the little things, and the user says hi.", requester)).toBe(
        false
      );
      expect(speaksAsRequester("It's Sam! Just saying hi.", requester)).toBe(true);
    }
  );
});

describe('onBehalfVoicemail', () => {
  it('opens with the AI-friend greeting, then the written line about Sam', async () => {
    callLLM.mockResolvedValueOnce('Sam wanted me to pass on a hello. Take care, Alex.');
    expect(await onBehalfVoicemail(sam)).toBe(
      `${GREETING} Sam wanted me to pass on a hello. Take care, Alex.`
    );
    const prompt = callLLM.mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('third person');
    expect(prompt).toContain('Never speak as Sam');
    expect(prompt).toContain('"pass on a hello"');
  });

  it.each([
    "Hi Alex! It's Sam. Just wanted to say hello.",
    'Hey, Sam here. Hello from me!',
    'this is sam calling to say hello',
    'It’s Sam. Hello!',
    'Hey Alex, Sam speaking. Just wanted to say hello.',
    'Just wanted to say hello. Love, Sam',
    "It's​Sam, hello!",
  ])('drops a written line that speaks as Sam: %j', async (written) => {
    callLLM.mockResolvedValueOnce(written);
    const said = await onBehalfVoicemail(sam);
    expect(said).toBe(FALLBACK);
    expect(speaksAsRequester(said, 'Sam')).toBe(false);
  });

  it.each(['', 'the user', 'user', undefined])(
    'never asks the model when the requester name is %j',
    async (requesterName) => {
      callLLM.mockResolvedValue("It's Sam! Just saying hi.");
      const said = await onBehalfVoicemail({ ...sam, requesterName });
      expect(callLLM).not.toHaveBeenCalled();
      expect(said).toBe(
        "Hi Alex, it's Ferni, an AI friend. Someone wanted me to pass on a hello. They wanted to make sure you got this message. Take care, and talk soon."
      );
    }
  );

  it('passes on only that there is a message when a name-less request speaks as Sam', async () => {
    const said = await onBehalfVoicemail({
      ...sam,
      requesterName: 'the user',
      purpose: "tell Alex it's Sam saying hi",
    });
    expect(said).toBe(`Hi Alex, it's Ferni, an AI friend. ${NO_MESSAGE('Someone')}`);
  });

  it.each([
    "Hi Alex, it's Ferni, Sam's AI friend. Sam wanted me to say hello.",
    'Hi Alex! It’s Ferni, Sam’s AI friend! Sam wanted me to say hello.',
    "hi alex, it's ferni. Sam wanted me to say hello.",
    'Hi Alex. Sam wanted me to say hello.',
  ])('says the greeting once when the model repeats it: %j', async (written) => {
    callLLM.mockResolvedValueOnce(written);
    const said = await onBehalfVoicemail(sam);
    expect(said).toBe(`${GREETING} Sam wanted me to say hello.`);
  });

  it('cuts a repeated greeting only where the greeting ends', async () => {
    callLLM.mockResolvedValueOnce("Hi Alex, it's been a while. Sam misses you.");
    expect(await onBehalfVoicemail(sam)).toBe(`${GREETING} It's been a while. Sam misses you.`);
    callLLM.mockResolvedValueOnce('Hi there! Sam misses you.');
    expect(await onBehalfVoicemail(sam)).toBe(`${GREETING} Hi there! Sam misses you.`);
  });

  it('logs a count when it drops a line, never the line or a name', async () => {
    callLLM.mockResolvedValueOnce("Hi Alex! It's Sam. Just wanted to say hello.");
    await onBehalfVoicemail({ ...sam, requesterName: 'Sam Lee' });
    const text = logged.join('\n');
    expect(text).toMatch(/"selfIdentifiedBodies":\d+/);
    for (const secret of ['Sam', 'Alex', 'hello', 'Just wanted'])
      expect(text).not.toContain(secret);
  });

  it('uses the fallback when the model gives nothing or fails', async () => {
    callLLM.mockResolvedValueOnce(null);
    expect(await onBehalfVoicemail({ ...sam, relationship: 'mom' })).toBe(
      `${GREETING} Sam wanted me to pass on a hello... Just know they're thinking of you. They love you. Bye.`
    );
    callLLM.mockRejectedValueOnce(new Error('vertex 503'));
    expect(await onBehalfVoicemail(sam)).toBe(FALLBACK);
    expect(logged.join('\n')).not.toContain('vertex 503');
  });

  it('greets a business with the intro that names Sam', async () => {
    callLLM.mockResolvedValueOnce(null);
    const said = await onBehalfVoicemail({
      ...sam,
      recipientName: 'Front desk',
      callType: 'business',
    });
    expect(said).toMatch(/^Hi Front desk, this is Ferni, an AI calling for Sam\. Sam wanted me to/);
  });
});

describe('the fallback voicemail', () => {
  beforeEach(() => {
    callLLM.mockResolvedValue(null);
  });

  it.each([
    ['Hope', 'pass on a hello', 'mom', 'pass on a hello'],
    ['Hope', "say I hope you're well", 'friend', "say they hope you're well"],
    ['Hope', 'say hope to see you Sunday', 'mom', 'say hope to see you Sunday'],
    ['Sam', 'say hi', 'friend', 'say hi'],
    ['Sam', 'say happy birthday', 'friend', 'say happy birthday'],
  ])(
    'never speaks as the requester (%s: %j, %s)',
    async (requesterName, purpose, relationship, relayed) => {
      const said = await onBehalfVoicemail({ ...sam, requesterName, purpose, relationship });
      expect(said.startsWith(`Hi Alex, it's Ferni, ${requesterName}'s AI friend. `)).toBe(true);
      expect(speaksAsRequester(said, requesterName)).toBe(false);
      expect(said).toContain(`${requesterName} wanted me to ${relayed}`);
    }
  );

  it.each([
    ['I miss you', 'say they miss you'],
    ["I'll call later", "say they'll call later"],
    ['I was thinking about you', 'say they were thinking about you'],
    ['My door is always open', 'say their door is always open'],
    ["tell her I'm proud of her", "tell her they're proud of her"],
    ['tell Alex to call me back', 'tell Alex to call them back'],
    ['say I am sorry about Friday', 'say they are sorry about Friday'],
  ])('says a first-person request in the third person: %j', async (purpose, relayed) => {
    const said = await onBehalfVoicemail({ ...sam, purpose });
    expect(said).toContain(`Sam wanted me to ${relayed}.`);
    expect(speaksAsRequester(said, 'Sam')).toBe(false);
  });

  it.each([
    ['Sam', 'its me'],
    ['Sam', "it's me, happy birthday"],
    ['Sam', "tell her it's Sam and happy birthday"],
    ['Hope', 'say this is Hope, happy birthday'],
    ['Sam', 'say Sam here, call me later'],
    ['Sam', 'tell her we miss her'],
  ])(
    'passes on only that there is a message when the request can not be relayed (%s: %j)',
    async (requesterName, purpose) => {
      const said = await onBehalfVoicemail({ ...sam, requesterName, purpose });
      expect(said).toBe(
        `Hi Alex, it's Ferni, ${requesterName}'s AI friend. ${NO_MESSAGE(requesterName)}`
      );
      expect(speaksAsRequester(said, requesterName)).toBe(false);
    }
  );
});
