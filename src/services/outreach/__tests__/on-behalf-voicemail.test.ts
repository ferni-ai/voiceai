/**
 * A voicemail Ferni leaves for Sam never speaks as Sam: it opens with the
 * AI-friend greeting, and a written line that names itself as Sam is
 * replaced by the fallback. Fictional people only: Sam asks, Alex is called.
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

beforeEach(() => {
  callLLM.mockReset();
  logged.length = 0;
});

describe('speaksAsRequester', () => {
  it.each([
    ['Hi Alex! It’s Sam.', 'Sam'], // curly apostrophe
    ["Hi Alex! It's Sam.", 'Sam'],
    ['Hey, Sam here, just wanted to say hello.', 'Sam'],
    ['this is sam calling to say hi', 'Sam'],
    ["I'm Sam, and I wanted to say hello.", 'Sam'],
    ['This is Sam Lee, calling about Saturday.', 'Sam Lee'],
    ['Hi, it is Lee Sam.', 'Lee Sam'],
    ['Hope here! Just checking in.', 'Hope'],
    ["Hey Alex, it's me. Just thinking about you.", 'Sam'],
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
  ])('keeps %j for requester %s', (line, requester) => {
    expect(speaksAsRequester(line, requester)).toBe(false);
  });

  it("matches the request's name, not a fixed list", () => {
    expect(speaksAsRequester("Hi, it's Jordan.", 'Jordan')).toBe(true);
    expect(speaksAsRequester("Hi, it's Jordan.", 'Sam')).toBe(false);
  });
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
  ])('drops a written line that speaks as Sam: %j', async (written) => {
    callLLM.mockResolvedValueOnce(written);
    const said = await onBehalfVoicemail(sam);
    expect(said).toBe(
      `${GREETING} Sam wanted me to pass on a hello. They wanted to make sure you got this message. Take care, and talk soon.`
    );
    expect(speaksAsRequester(said, 'Sam')).toBe(false);
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
    expect(await onBehalfVoicemail(sam)).toMatch(new RegExp(`^${GREETING} Sam wanted me to`));
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
  it.each([
    ['Hope', 'pass on a hello', 'mom'],
    ['Hope', "say I hope you're well", 'friend'],
    ['Hope', 'say hope to see you Sunday', 'mom'],
    ['Sam', 'say hi', 'friend'],
  ])('never speaks as the requester (%s: %j, %s)', async (requesterName, purpose, relationship) => {
    callLLM.mockResolvedValue(null);
    const said = await onBehalfVoicemail({ ...sam, requesterName, purpose, relationship });
    expect(said.startsWith(`Hi Alex, it's Ferni, ${requesterName}'s AI friend. `)).toBe(true);
    expect(speaksAsRequester(said, requesterName)).toBe(false);
    expect(said).toContain(`${requesterName} wanted me to ${purpose}`);
  });

  it.each([
    ['Sam', "tell her it's Sam and happy birthday"],
    ['Hope', 'say this is Hope, happy birthday'],
  ])(
    'passes on that there is a message when the request itself speaks as %s',
    async (requesterName, purpose) => {
      callLLM.mockResolvedValue(null);
      const said = await onBehalfVoicemail({ ...sam, requesterName, purpose });
      expect(said).toBe(
        `Hi Alex, it's Ferni, ${requesterName}'s AI friend. ${requesterName} asked me to pass on a message, and they'll be in touch soon. Take care.`
      );
      expect(speaksAsRequester(said, requesterName)).toBe(false);
    }
  );
});
