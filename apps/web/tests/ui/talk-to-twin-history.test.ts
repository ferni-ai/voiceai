/**
 * Talk to your past self sends the conversation so far with each message, in the shape
 * the custom-agent chat takes ({ from: 'person' | 'agent', text }), so the twin can
 * remember what was said a turn earlier (TWIN_CONVERSATION_V2 reads it on the server).
 * Fictional person only.
 */

import { describe, expect, it, vi } from 'vitest';

const apiPost = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiPost, apiGet: vi.fn() }));
vi.mock('../../src/ui/sound.ui.js', () => ({ soundUI: { play: vi.fn() } }));
vi.mock('../../src/services/custom-agent.service.js', () => ({
  getCustomAgent: vi.fn().mockResolvedValue({
    id: 'twin-1',
    type: 'twin',
    name: 'Rosa',
    displayName: 'Rosa',
    personality: { values: ['patience'], worldview: 'water the roots' },
    behaviors: { catchphrases: ['mira,'] },
    memories: {},
  }),
  listMemories: vi.fn().mockResolvedValue([]),
}));

const { openTalkToTwin, closeTalkToTwin } = await import('../../src/ui/talk-to-twin.ui.js');

const flush = () => new Promise((r) => setTimeout(r, 0));

async function send(text: string): Promise<void> {
  const input = document.querySelector<HTMLTextAreaElement>('#twin-input');
  if (!input) throw new Error('no twin input');
  input.value = text;
  document.querySelector<HTMLButtonElement>('#twin-send')?.click();
  await flush();
  await flush();
}

describe('Talk to your past self: history', () => {
  it('sends the earlier turns, oldest first, with each new message', async () => {
    await openTalkToTwin('twin-1');
    apiPost.mockResolvedValue({ ok: true, status: 200, data: { response: 'March, then.' } });

    await send('Ines visits in March.');
    await send('When is she coming?');

    const [, second] = apiPost.mock.calls.map((call) => call[1] as Record<string, unknown>);
    const history = second?.history as Array<{ from: string; text: string }>;
    // the welcome, then the first exchange; never the message being sent now
    expect(history.map((turn) => turn.from)).toEqual(['agent', 'person', 'agent']);
    expect(history[1]).toEqual({ from: 'person', text: 'Ines visits in March.' });
    expect(history[2]).toEqual({ from: 'agent', text: 'March, then.' });
    expect(second?.userMessage).toBe('When is she coming?');
    closeTalkToTwin();
  });
});
