/**
 * The Chronicle renders journal entries, the user's chat and the past-self
 * replies as text. Before: they went into innerHTML as-is, so an entry or a
 * model reply containing markup ran in the page.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const PAYLOAD = '<img src=x onerror=alert(1)>';

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiPut = vi.fn();
const apiDelete = vi.fn();
const getUserId = vi.fn((): string | null => null);
vi.mock('../../src/utils/api.js', () => ({ apiGet, apiPost, apiPut, apiDelete, getUserId }));
vi.mock('../../src/ui/sound.ui.js', () => ({ soundUI: { play: vi.fn() } }));

const { openChronicle, close } = await import('../../src/ui/chronicle.ui.js');

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

afterEach(() => {
  close();
  document.body.innerHTML = '';
  getUserId.mockReturnValue(null);
});

describe('The Chronicle renders words, not markup', () => {
  it("shows the user's message as text and creates no img element", async () => {
    apiGet.mockResolvedValue({ ok: false, status: 404 });
    apiPost.mockResolvedValue({ ok: false, status: 500 });

    const messages = await ask(PAYLOAD);

    expect(messages?.querySelector('.chronicle-chat-message.user')?.textContent).toBe(PAYLOAD);
    expect(document.querySelector('img')).toBeNull();
  });

  it('shows a past-self reply containing markup as text', async () => {
    apiGet.mockResolvedValue({ ok: false, status: 404 });
    apiPost.mockResolvedValue({ ok: true, status: 200, data: { response: `remember ${PAYLOAD}` } });

    const messages = await ask('what did we say?');

    expect(messages?.querySelector('.chronicle-chat-message.past-self')?.textContent).toBe(
      `remember ${PAYLOAD}`
    );
    expect(document.querySelector('img')).toBeNull();
  });

  it('shows a saved entry and an insight from the server as text', async () => {
    getUserId.mockReturnValue('user-1');
    apiGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        recentEntries: [
          { id: 'e1', content: PAYLOAD, type: 'text', createdAt: '2026-10-01T10:00:00Z' },
        ],
        insights: [{ kind: 'theme', icon: 'sparkles', theme: PAYLOAD }],
        prompts: [],
        stats: { totalEntries: 1, currentStreak: 1, entriesThisWeek: 1, topThemes: [] },
      },
    });

    openChronicle();
    const content = document.querySelector('#chronicle-content');
    await vi.waitFor(() =>
      expect(content?.querySelector('.chronicle-entry-content')).not.toBeNull()
    );

    expect(content?.querySelector('.chronicle-entry-content')?.textContent).toBe(PAYLOAD);
    expect(content?.querySelector('.chronicle-insight-description')?.textContent).toContain(
      `${PAYLOAD} keeps coming up`
    );
    expect(document.querySelector('img')).toBeNull();
  });
});
