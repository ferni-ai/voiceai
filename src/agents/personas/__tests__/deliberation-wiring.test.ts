import { afterEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.hoisted(() =>
  vi.fn(async (_req: unknown) => ({
    text: '{"kind":"question","note":"What would staying cost her, not him?","confidence":0.8,"whyNow":"","doNotUseIf":""}',
    usageMetadata: { promptTokenCount: 700, candidatesTokenCount: 40, thoughtsTokenCount: 600 },
  }))
);
vi.mock('../../../config/gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../config/gemini-config.js')>()),
  getGeminiClient: async () => ({ models: { generateContent } }),
}));

import { installDirectorNotes } from '../../multi-agent/turn-observers.js';
import { TURN_CONTEXT_HEADER } from '../../multi-agent/turn-intelligence.js';
import { getDeliberator } from '../deliberation.js';
import { ANTICIPATE_SYSTEM, MIND_NOTE_HEADER } from '../deliberation-anticipate.js';

afterEach(() => {
  delete process.env.DELIBERATION;
  delete process.env.DELIBERATION_MODE;
  generateContent.mockClear();
});

/** A session whose state changes the test fires, and the agent's chat items. */
function call() {
  const handlers: Array<(ev: unknown) => void> = [];
  const session = {
    on: (_e: string, h: (ev: unknown) => void) => handlers.push(h),
    off: vi.fn(),
  };
  const items = [
    {
      type: 'message',
      role: 'user',
      textContent:
        "My brother wants me to co-sign his lease and I said yes before I thought about it, now I can't sleep.",
    },
    {
      type: 'message',
      role: 'user',
      textContent: `${TURN_CONTEXT_HEADER}\nBrother: Sam, lent him money in May.`,
    },
    { type: 'message', role: 'assistant', textContent: 'Oh, that is a big yes to give fast.' },
  ];
  const cleanup: Array<() => void> = [];
  const fire = (state: string) => handlers.forEach((h) => h({ newState: state }));
  return { session, items, cleanup, fire };
}

const install = (c: ReturnType<typeof call>) =>
  installDirectorNotes({
    session: c.session as never,
    sessionId: 's',
    userName: 'Alex',
    agent: { chatCtx: { items: c.items } },
    cleanupFunctions: c.cleanup,
  });

describe('deliberation on the live call', () => {
  it('is off by default', async () => {
    const c = call();
    await install(c);
    expect(getDeliberator(c.session)).toBeUndefined();
  });

  it('thinks over the turn after Ferni replies, with the memory note, and offers the result', async () => {
    process.env.DELIBERATION = 'on';
    const c = call();
    await install(c);
    const d = getDeliberator(c.session);
    expect(d).toBeDefined();
    c.fire('speaking');
    c.fire('listening');
    await vi.waitFor(() => expect(generateContent).toHaveBeenCalledTimes(1));
    const req = generateContent.mock.calls[0]![0] as {
      model: string;
      contents: Array<{ parts: Array<{ text: string }> }>;
      config: { thinkingConfig: { thinkingBudget: number } };
    };
    const prompt = req.contents[0].parts[0].text;
    expect(req.model).toBe('gemini-3.5-flash');
    expect(req.config.thinkingConfig.thinkingBudget).toBeGreaterThan(0);
    expect(prompt).toContain('lent him money in May');
    expect(prompt).toContain('Alex: My brother wants me to co-sign');
    expect(prompt).not.toContain(TURN_CONTEXT_HEADER);
    await vi.waitFor(() =>
      expect(d!.noteFor('Anyway.', false)).toContain('What would staying cost')
    );
    c.cleanup.forEach((f) => f());
    expect(getDeliberator(c.session)).toBeUndefined();
    expect(d!.summary()).toMatchObject({
      runs: 1,
      offered: 1,
      promptTokens: 700,
      thoughtTokens: 600,
    });
  });

  it('anticipate mode: the simulating prompt, with how they tend to be from the mind note', async () => {
    process.env.DELIBERATION = 'on';
    process.env.DELIBERATION_MODE = 'anticipate';
    const c = call();
    c.items.unshift({
      type: 'message',
      role: 'system',
      textContent: `${MIND_NOTE_HEADER}\nThey tend to: jokes when anxious, then wants practical help.`,
    });
    await install(c);
    c.fire('speaking');
    c.fire('listening');
    await vi.waitFor(() => expect(generateContent).toHaveBeenCalledTimes(1));
    const req = generateContent.mock.calls[0]![0] as {
      contents: Array<{ parts: Array<{ text: string }> }>;
      config: { systemInstruction: string };
    };
    expect(req.config.systemInstruction).toBe(ANTICIPATE_SYSTEM);
    expect(req.contents[0].parts[0].text).toContain(
      'jokes when anxious, then wants practical help'
    );
    c.cleanup.forEach((f) => f());
  });

  it('reflect mode (the default) leaves the mind note out', async () => {
    process.env.DELIBERATION = 'on';
    const c = call();
    c.items.unshift({
      type: 'message',
      role: 'system',
      textContent: `${MIND_NOTE_HEADER}\nThey tend to: jokes when anxious.`,
    });
    await install(c);
    c.fire('speaking');
    c.fire('listening');
    await vi.waitFor(() => expect(generateContent).toHaveBeenCalledTimes(1));
    const req = generateContent.mock.calls[0]![0] as {
      contents: Array<{ parts: Array<{ text: string }> }>;
      config: { systemInstruction: string };
    };
    expect(req.config.systemInstruction).not.toBe(ANTICIPATE_SYSTEM);
    expect(req.contents[0].parts[0].text).not.toContain('jokes when anxious');
    c.cleanup.forEach((f) => f());
  });
});
