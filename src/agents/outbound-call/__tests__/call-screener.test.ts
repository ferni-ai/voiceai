import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openOnBehalfCall, type CallOpeningPorts, type FirstWords } from '../call-opening.js';
import { isScreenerPrompt, PERSON_WAIT_MS, screenerLine } from '../call-screener.js';
import type { OutboundParties } from '../../../services/outreach/opening-line.js';

const mindy: OutboundParties = { recipientName: 'Mindy', sponsorName: 'Seth', personal: true };

const GOOGLE =
  "Hi, the person you're calling is using a screening service from Google. Go ahead and say your name and why you're calling.";
const APPLE =
  "Hi, if you record your name and reason for calling, I'll see if this person is available.";
const HOLD = 'Thanks, please stay on the line.';
const SILENCE: FirstWords = { category: 'uncertain', transcript: '' };

/** A phone whose detector hears `rounds` in order, then silence. */
function phone(rounds: FirstWords[]) {
  const order: string[] = [];
  const heard = [...rounds];
  const ports = {
    waitForAnswer: vi.fn(async () => true),
    hearFirstWords: vi.fn(async (_options?: { afterScreener?: boolean }) => {
      const next = heard.shift() ?? SILENCE;
      order.push(`heard: ${next.category}`);
      return next;
    }),
    say: vi.fn(async (text: string) => void order.push(`say: ${text}`)),
    answerScreener: vi.fn(async (text: string) => void order.push(`screener: ${text}`)),
    leaveVoicemail: vi.fn(async () => void order.push('voicemail')),
    hangUp: vi.fn(async (d?: string) => void order.push(`hang up${d ? ` (${d})` : ''}`)),
  } satisfies CallOpeningPorts;
  return { ports, order };
}

const ID_LINE = "screener: Hi, it's Ferni, Seth's AI friend, calling to check in on Mindy.";
const savedFlag = process.env.CALL_OPENING_AMD;

afterEach(() => {
  if (savedFlag === undefined) delete process.env.CALL_OPENING_AMD;
  else process.env.CALL_OPENING_AMD = savedFlag;
});

describe('recognising a screener (whole words)', () => {
  it('knows the Google and Apple prompts and the hold, apostrophes either way', () => {
    for (const prompt of [GOOGLE, APPLE, HOLD, GOOGLE.replace(/'/g, '’')]) {
      expect(isScreenerPrompt(prompt)).toBe(true);
    }
  });

  it('is not fooled by a person, a voicemail asking for a name, or a word inside a word', () => {
    expect(isScreenerPrompt('Hello?')).toBe(false);
    expect(isScreenerPrompt('Who is this and why are you calling?')).toBe(false);
    expect(isScreenerPrompt('Leave your name and the reason for your call after the tone.')).toBe(
      false
    );
    expect(isScreenerPrompt('We are prescreening applicants today.')).toBe(false);
  });

  it("says who is calling and why in the opener's AI-disclosing words, no dashes or ellipses", () => {
    expect(screenerLine(mindy)).toBe(
      "Hi, it's Ferni, Seth's AI friend, calling to check in on Mindy."
    );
    expect(screenerLine({ sponsorName: 'Seth', personal: false })).toBe(
      'Hi, this is Ferni, an AI calling for Seth.'
    );
    expect(screenerLine({ personal: true })).not.toMatch(/undefined|—|…|\.\.\./);
  });
});

describe('with CALL_OPENING_AMD on', () => {
  beforeEach(() => {
    process.env.CALL_OPENING_AMD = 'on';
  });

  it('answers the screener once, stays silent through its prompts and silence, then lets the person be greeted', async () => {
    const { ports, order } = phone([
      { category: 'machine-ivr', transcript: GOOGLE },
      { category: 'machine-ivr', transcript: HOLD },
      SILENCE,
      { category: 'uncertain', transcript: 'Can you say your name again?' },
      { category: 'human', transcript: 'Hello?' },
    ]);
    await expect(openOnBehalfCall(mindy, ports)).resolves.toBe('person');
    expect(order).toEqual([
      'heard: machine-ivr',
      ID_LINE,
      'heard: machine-ivr',
      'heard: uncertain',
      'heard: uncertain',
      'heard: human',
    ]);
    expect(ports.hearFirstWords).toHaveBeenLastCalledWith({ afterScreener: true });
    expect(ports.say).not.toHaveBeenCalled(); // the opener is the reply to "Hello?"
    expect(ports.hangUp).not.toHaveBeenCalled();
  });

  it('catches a screener however the detector filed it, but never a person', async () => {
    for (const category of ['machine-vm', 'uncertain'] as const) {
      const { ports, order } = phone([
        { category, transcript: APPLE },
        { category: 'human', transcript: 'Hi, this is Mindy.' },
      ]);
      await expect(openOnBehalfCall(mindy, ports)).resolves.toBe('person');
      expect(order).toEqual([`heard: ${category}`, ID_LINE, 'heard: human']);
      expect(ports.leaveVoicemail).not.toHaveBeenCalled();
    }
    const asked = phone([{ category: 'human', transcript: 'Say your name, who is this?' }]);
    await expect(openOnBehalfCall(mindy, asked.ports)).resolves.toBe('person');
    expect(asked.ports.answerScreener).not.toHaveBeenCalled();
  });

  it('leaves the voicemail when the screener sends the call there, then hangs up', async () => {
    const { ports, order } = phone([
      { category: 'machine-ivr', transcript: GOOGLE },
      { category: 'machine-vm', transcript: 'Please leave a message after the tone.' },
    ]);
    await expect(openOnBehalfCall(mindy, ports)).resolves.toBe('voicemail');
    expect(order.filter((step) => !step.startsWith('heard'))).toEqual([
      ID_LINE,
      'voicemail',
      'hang up (voicemail_left)',
    ]);
  });

  it('hangs up quietly, saying nothing more, when nobody comes within a minute', async () => {
    let clock = 0;
    const { ports, order } = phone([{ category: 'machine-ivr', transcript: GOOGLE }]);
    ports.hearFirstWords.mockImplementation(async () => {
      clock += 10_000;
      return SILENCE;
    });
    const { waitThroughScreener } = await import('../call-screener.js');
    await expect(waitThroughScreener(mindy, ports, () => clock)).resolves.toBe('screened');
    expect(ports.hearFirstWords).toHaveBeenCalledTimes(PERSON_WAIT_MS / 10_000);
    expect(order).toEqual([ID_LINE, 'hang up']);
  });

  it('gives up after a bounded number of rounds even if they end instantly', async () => {
    const { ports, order } = phone([{ category: 'machine-ivr', transcript: GOOGLE }]);
    await expect(openOnBehalfCall(mindy, ports)).resolves.toBe('screened');
    expect(ports.answerScreener).toHaveBeenCalledTimes(1);
    expect(order.at(-1)).toBe('hang up');
  });
});

describe('with CALL_OPENING_AMD off', () => {
  it('treats a screener like any phone menu: a quiet hang-up, no answer', async () => {
    delete process.env.CALL_OPENING_AMD;
    const { ports, order } = phone([{ category: 'machine-ivr', transcript: GOOGLE }]);
    await expect(openOnBehalfCall(mindy, ports)).resolves.toBe('unreachable');
    expect(order).toEqual(['heard: machine-ivr', 'hang up (unreachable)']);
    expect(ports.answerScreener).not.toHaveBeenCalled();
  });
});
