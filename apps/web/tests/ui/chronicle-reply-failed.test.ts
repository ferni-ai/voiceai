/**
 * The Chronicle, "talk to your past self": when no reply comes back, say so.
 * Never answer in the user's own past voice from canned lines.
 *
 * Before: a failed /api/journal/twin-response (it 500s today) was answered with
 * lines like "That's a lot to carry. I've felt that too." as the past self.
 */

import { describe, expect, it, vi } from 'vitest';

const apiPost = vi.fn();
vi.mock('../../src/utils/api.js', () => ({
  apiGet: vi.fn().mockResolvedValue({ ok: false, status: 404 }),
  apiPost,
  getUserId: () => null,
}));
vi.mock('../../src/ui/sound.ui.js', () => ({ soundUI: { play: vi.fn() } }));

const { openChronicle } = await import('../../src/ui/chronicle.ui.js');
const { t } = await import('../../src/i18n/index.js');

const flush = () => new Promise((r) => setTimeout(r, 0));

async function ask(question: string): Promise<Element | null> {
  openChronicle();
  const input = document.querySelector<HTMLTextAreaElement>('#converse-input');
  if (!input) throw new Error('no converse input');
  input.value = question;
  document.querySelector<HTMLButtonElement>('#converse-send')?.click();
  await flush();
  return document.querySelector('#converse-messages');
}

describe('The Chronicle, past-self reply', () => {
  it('says no reply came instead of answering in the past-self voice', async () => {
    apiPost.mockResolvedValue({ ok: false, status: 500, error: 'boom' });

    const messages = await ask('should I take the job? I feel stuck');

    expect(messages?.querySelector('.chronicle-chat-message.past-self')).toBeNull();
    expect(messages?.querySelector('.chronicle-chat-message.notice')?.textContent).toContain(
      t('chronicle.replyFailed')
    );
  });

  it('says no reply came when the request throws', async () => {
    apiPost.mockRejectedValue(new Error('network'));

    const messages = await ask('do you remember last spring?');

    expect(messages?.querySelector('.chronicle-chat-message.past-self')).toBeNull();
    expect(messages?.textContent).toContain(t('chronicle.replyFailed'));
  });

  it('still shows a real reply in the past-self voice', async () => {
    apiPost.mockResolvedValue({ ok: true, status: 200, data: { response: 'We figured it out last time.' } });

    const messages = await ask('how did we get through it?');

    expect(messages?.querySelector('.chronicle-chat-message.past-self')?.textContent).toContain(
      'We figured it out last time.'
    );
  });
});
