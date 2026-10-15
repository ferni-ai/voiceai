/**
 * Talk to your past self: when no reply comes back, the app says so in a notice.
 * It never answers in the person's own voice from canned lines.
 *
 * Before: a failed /api/journal/twin-response was answered by a client-side
 * fallback built from the profile ("You know what I've learned? \"keep going\"
 * Whatever you're facing, remember that."), and other errors showed in a twin
 * bubble ("I'm having trouble thinking right now").
 */

import { describe, expect, it, vi } from 'vitest';

const apiPost = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiPost, apiGet: vi.fn() }));
vi.mock('../../src/ui/sound.ui.js', () => ({ soundUI: { play: vi.fn() } }));
vi.mock('../../src/services/custom-agent.service.js', () => ({
  getCustomAgent: vi.fn().mockResolvedValue({
    id: 'twin-1',
    type: 'twin',
    name: 'Sam',
    displayName: 'Sam',
    personality: { values: ['honesty'], worldview: 'keep going' },
    behaviors: { catchphrases: ['honestly,'] },
    memories: {},
  }),
  listMemories: vi.fn().mockResolvedValue([]),
}));

const { openTalkToTwin, closeTalkToTwin } = await import('../../src/ui/talk-to-twin.ui.js');
const { t } = await import('../../src/i18n/index.js');

const flush = () => new Promise((r) => setTimeout(r, 0));

async function send(question: string): Promise<Element | null> {
  const input = document.querySelector<HTMLTextAreaElement>('#twin-input');
  if (!input) throw new Error('no twin input');
  input.value = question;
  document.querySelector<HTMLButtonElement>('#twin-send')?.click();
  await flush();
  await flush();
  return document.querySelector('#twin-messages');
}

// The modal is a singleton and setup.ts empties the body before each test, so
// the failed and the real reply are checked in one conversation.
describe('Talk to your past self', () => {
  it('shows a notice, not a canned past-self reply, when the reply fails; real replies still show', async () => {
    await openTalkToTwin('twin-1');

    apiPost.mockResolvedValueOnce({ ok: false, status: 503, error: 'Twin response unavailable' });
    let messages = await send('should I take the job? I need advice');

    // only the welcome is in the twin's voice
    expect(messages?.querySelectorAll('.twin-message--twin')).toHaveLength(1);
    expect(messages?.querySelector('.twin-message--notice')?.textContent).toContain(t('talkToTwin.error'));
    expect(messages?.textContent).not.toMatch(/what I've learned|what matters to us/);

    apiPost.mockResolvedValueOnce({ ok: true, status: 200, data: { response: 'We figured it out last time.' } });
    messages = await send('how did we get through it?');

    expect(messages?.querySelectorAll('.twin-message--twin')).toHaveLength(2);
    expect(messages?.textContent).toContain('We figured it out last time.');
    closeTalkToTwin();
  });
});
