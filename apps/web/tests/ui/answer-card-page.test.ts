/**
 * The /a/:id page: shows the owner's card with text as text, safe links and
 * sandboxed search suggestions, and a warm message when it can't.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockApiGet = vi.fn();

vi.mock('../../src/utils/api.js', () => ({
  apiGet: mockApiGet,
  getApiHeaders: vi.fn(() => ({})),
}));

const { answerCardIdFromPath, renderAnswerCard, showAnswerCard } =
  await import('../../src/ui/answer-card-page.ui');
const { SUGGESTIONS_SANDBOX } = await import('../../src/utils/search-suggestions');

const ID = 'A'.repeat(43);

const CARD = {
  id: ID,
  kind: 'recommendation' as const,
  answerText: 'Try calf raises <img src=x onerror="steal()">, 3 sets of 15.',
  sources: [
    { title: 'Shin splints guide', url: 'https://example.org/shins' },
    { title: 'Sneaky', url: 'javascript:steal()' },
    { title: '', url: 'https://physio.example.com/stretch' },
  ],
  searchSuggestionsHtml:
    '<div class="carousel"><a class="chip" href="https://www.google.com/search?q=shins">shins</a></div><script>steal()</script>',
  createdAt: 1,
};

beforeEach(() => {
  mockApiGet.mockReset();
  document.body.replaceChildren();
});

describe('answerCardIdFromPath', () => {
  it('takes only a 43-character card id under /a/', () => {
    expect(answerCardIdFromPath(`/a/${ID}`)).toBe(ID);
    expect(answerCardIdFromPath(`/a/${ID}/`)).toBe(ID);
    expect(answerCardIdFromPath('/a/short')).toBeNull();
    expect(answerCardIdFromPath(`/b/${ID}`)).toBeNull();
    expect(answerCardIdFromPath(`/a/${ID}/x`)).toBeNull();
  });
});

describe('renderAnswerCard', () => {
  it('shows the answer as text, never as HTML', () => {
    const card = renderAnswerCard(CARD);
    expect(card.querySelector('img')).toBeNull();
    expect(card.textContent).toContain('<img src=x onerror="steal()">');
  });

  it('lists only web links, opening safely in a new tab', () => {
    const links = [...renderAnswerCard(CARD).querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://example.org/shins',
      'https://physio.example.com/stretch',
    ]);
    expect(links.map((a) => a.textContent)).toEqual(['Shin splints guide', 'physio.example.com']);
    for (const a of links) {
      expect(a.target).toBe('_blank');
      expect(a.rel).toBe('noopener noreferrer');
    }
  });

  it('puts search suggestions in a sandboxed frame, sanitized', () => {
    const frame = renderAnswerCard(CARD).querySelector('iframe');
    expect(frame?.getAttribute('sandbox')).toBe(SUGGESTIONS_SANDBOX);
    expect(frame?.srcdoc).toContain('https://www.google.com/search?q=shins');
    expect(frame?.srcdoc).not.toContain('<script');
  });

  it('has no frame when there are no suggestions', () => {
    expect(
      renderAnswerCard({ ...CARD, searchSuggestionsHtml: '' }).querySelector('iframe')
    ).toBeNull();
  });
});

describe('showAnswerCard', () => {
  it('reads the card by id from the owner-checked API', async () => {
    mockApiGet.mockResolvedValue({ ok: true, status: 200, data: { card: CARD } });
    const root = document.createElement('main');
    await showAnswerCard(root, ID);
    expect(mockApiGet).toHaveBeenCalledWith(`/api/answer-cards/${ID}`, undefined, {
      maxRetries: 1,
    });
    expect(root.querySelector('iframe')).not.toBeNull();
    expect(root.textContent).toContain('Try calf raises');
  });

  it("says it can't find a card that isn't yours", async () => {
    mockApiGet.mockResolvedValue({ ok: false, status: 404, error: 'Not found' });
    const root = document.createElement('main');
    await showAnswerCard(root, ID);
    expect(root.querySelector('[role="status"]')?.textContent).toBe(
      "Couldn't find that one. Try the account I texted."
    );
    expect(root.querySelector('a, iframe')).toBeNull();
  });

  it('offers a retry when loading fails', async () => {
    mockApiGet.mockResolvedValue({ ok: false, status: 500, error: 'boom' });
    const root = document.createElement('main');
    await showAnswerCard(root, ID);
    expect(root.textContent).toBe("Couldn't load that. Refresh to try again?");
  });
});
