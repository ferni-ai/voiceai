/**
 * TWIN_CONVERSATION_V2: the Digital Twin hears the conversation so far, never invents
 * facts about the person's life, greets only on the first turn, keeps its sign-off for
 * goodbyes and writes no em dashes. Off, the prompt and the reply are as before.
 *
 * Drives the real generateTwinResponse; the one model call (callLLM) is stubbed, so the
 * test reads the exact prompt the model would get. Fictional person only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callLLM = vi.hoisted(() =>
  vi.fn<(prompt: string, opts?: unknown) => Promise<string | null>>()
);
vi.mock('../../llm-utils.js', () => ({ callLLM }));

const { generateTwinResponse } = await import('../twin-reply.js');
type Request = Parameters<typeof generateTwinResponse>[0];

const ON = { TWIN_CONVERSATION_V2: 'on' };
const OFF = {};

const request = (history: Request['history'] = []): Request => ({
  userMessage: 'When is Ines coming?',
  profile: {
    name: 'Rosa',
    mannerisms: ['mira,'],
    values: ['patience'],
    communicationStyle: 'warm',
    philosophy: 'water the roots',
    passions: ['gardening'],
    greetingStyle: 'Ay, there you are.',
    farewellStyle: 'Go water something.',
  },
  relevantJournals: [{ content: 'Planted the chiltepin by the gate.', date: '2026-04-01' }],
  keyThemes: ['garden'],
  history,
});

const earlier: Request['history'] = [
  { from: 'person', text: 'My sister Ines visits in March with the calabacitas recipe.' },
  { from: 'agent', text: 'March, then. We will cook it together.' },
];

/** The prompt the model was asked with on the last call. */
const lastPrompt = (): string => String(callLLM.mock.calls.at(-1)?.[0]);

beforeEach(() => {
  callLLM.mockReset();
  callLLM.mockResolvedValue('March — with the recipe – like we said.');
});

describe('TWIN_CONVERSATION_V2 on', () => {
  it('puts the earlier turns in the prompt, in order, before the new message', async () => {
    await generateTwinResponse(request(earlier), '', ON);
    const prompt = lastPrompt();
    const person = prompt.indexOf('Them: My sister Ines visits in March');
    const twin = prompt.indexOf('You: March, then.');
    const now = prompt.indexOf('## They say to you now');
    expect(person).toBeGreaterThan(-1);
    expect(twin).toBeGreaterThan(person);
    expect(now).toBeGreaterThan(twin);
  });

  it('tells the model never to invent facts and to say it does not remember', async () => {
    await generateTwinResponse(request(), '', ON);
    expect(lastPrompt()).toContain('Never invent facts about your life');
    expect(lastPrompt()).toContain("say you don't remember");
  });

  it('offers the greeting on the first turn only', async () => {
    await generateTwinResponse(request(), '', ON);
    expect(lastPrompt()).toContain('Ay, there you are.');
    expect(lastPrompt()).not.toContain('already mid-conversation');

    await generateTwinResponse(request(earlier), '', ON);
    expect(lastPrompt()).not.toContain('Ay, there you are.');
    expect(lastPrompt()).toContain("don't greet them again");
  });

  it('keeps the sign-off for when they are leaving, on every turn', async () => {
    for (const history of [[], earlier]) {
      await generateTwinResponse(request(history), '', ON);
      expect(lastPrompt()).toContain(
        'How you say goodbye, only when they are leaving: "Go water something."'
      );
    }
  });

  it('returns the reply with no em or en dashes', async () => {
    const reply = await generateTwinResponse(request(earlier), '', ON);
    expect(reply).toBe('March, with the recipe, like we said.');
  });

  it('still puts a crisis guidance note last', async () => {
    await generateTwinResponse(request(earlier), 'GUIDANCE-NOTE', ON);
    expect(lastPrompt().endsWith('GUIDANCE-NOTE')).toBe(true);
  });
});

describe('TWIN_CONVERSATION_V2 off', () => {
  it('leaves the history, the facts rule and the dash cleanup out, and greets as before', async () => {
    const reply = await generateTwinResponse(request(earlier), '', OFF);
    const prompt = lastPrompt();
    expect(prompt).not.toContain('Them: My sister Ines');
    expect(prompt).not.toContain('Never invent facts');
    expect(prompt).toContain('How you greet: "Ay, there you are."');
    expect(prompt).toContain('How you say goodbye: "Go water something."');
    expect(reply).toBe('March — with the recipe – like we said.');
  });
});
