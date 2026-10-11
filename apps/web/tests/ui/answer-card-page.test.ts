/**
 * The /a/:id page: shows the owner's card with text as text, safe links and
 * sandboxed search suggestions, and a warm message when it can't.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const steps: string[] = [];
const mockApiGet = vi.fn();
const mockSignOut = vi.fn(async () => void steps.push('signOut'));
const mockGate = vi.fn(async () => {
  // The gate runs over the untouched app page; the card replaces it only afterwards.
  steps.push(document.querySelector('main.answer-card-page') ? 'gate-after-swap' : 'gate');
});
const mockAuth = vi.fn(async () => ({ isAuthenticated: false }));
const mockRefuseFraming = vi.fn(() => false);

vi.mock('../../src/utils/api.js', () => ({
  apiGet: mockApiGet,
  getApiHeaders: vi.fn(() => ({})),
}));
vi.mock('../../src/services/firebase-auth.service.js', () => ({ signOut: mockSignOut }));
vi.mock('../../src/ui/sign-in-gate.ui.js', () => ({ showSignInGate: mockGate }));
// auth-init starts Firebase on import; the page only needs its result.
vi.mock('../../src/services/auth-init.service.js', () => ({ initializeAuth: mockAuth }));
vi.mock('../../src/utils/frame-guard.js', () => ({ refuseFraming: mockRefuseFraming }));

const { answerCardIdFromPath, initAnswerCardPage, renderAnswerCard, showAnswerCard } =
  await import('../../src/ui/answer-card-page.ui');
const { openStandalonePage } = await import('../../src/app/standalone-pages');
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
  vi.clearAllMocks();
  mockApiGet.mockReset();
  steps.length = 0;
  document.body.replaceChildren();
});

const button = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent === label);

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

describe('the pick on a recommendation', () => {
  it('shows the pick as a safe link with who made it', () => {
    const pick = {
      kind: 'video',
      title: 'Shin rehab',
      by: 'A Physio',
      url: 'https://youtu.be/x',
      length: '12 min',
      why: 'Short and clear.',
    };
    const card = renderAnswerCard({ ...CARD, pick });
    const link = card.querySelector('.answer-card-page__pick a');
    expect(link?.getAttribute('href')).toBe('https://youtu.be/x');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(card.querySelector('.answer-card-page__pick')?.textContent).toContain(
      'A Physio · 12 min'
    );
    expect(
      renderAnswerCard({ ...CARD, pick: { ...pick, url: 'javascript:steal()' } }).querySelector(
        '.answer-card-page__pick'
      )
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

  it("says it can't find a card that isn't yours, and offers another account", async () => {
    mockApiGet
      .mockResolvedValueOnce({ ok: false, status: 404, error: 'Not found' })
      .mockResolvedValueOnce({ ok: true, status: 200, data: { card: CARD } });
    const root = document.createElement('main');
    await showAnswerCard(root, ID);
    expect(root.querySelector('[role="status"]')?.textContent).toBe(
      "Couldn't find that one. It may be on the account I texted."
    );
    expect(root.querySelector('a, iframe')).toBeNull();
    button(root, 'Use another account')?.click();
    await vi.waitFor(() => expect(root.textContent).toContain('Try calf raises'));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockGate).toHaveBeenCalledTimes(1);
    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });

  it('tries again when loading fails and the person asks', async () => {
    mockApiGet
      .mockResolvedValueOnce({ ok: false, status: 500, error: 'boom' })
      .mockResolvedValueOnce({ ok: true, status: 200, data: { card: CARD } });
    const root = document.createElement('main');
    await showAnswerCard(root, ID);
    expect(root.querySelector('[role="status"]')?.textContent).toBe(
      "Couldn't load that. Try again?"
    );
    button(root, 'Try again')?.click();
    await vi.waitFor(() => expect(root.textContent).toContain('Try calf raises'));
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});

describe('boot sequence', () => {
  it('checks framing, signs in over the app, then swaps the body and loads the card', async () => {
    document.body.append(document.createElement('div'));
    mockApiGet.mockImplementation(async () => {
      steps.push(
        document.body.firstElementChild?.tagName === 'MAIN' ? 'fetch-in-page' : 'fetch-early'
      );
      return { ok: true, status: 200, data: { card: CARD } };
    });
    await initAnswerCardPage(ID);
    expect(mockRefuseFraming).toHaveBeenCalledTimes(1);
    expect(steps).toEqual(['gate', 'fetch-in-page']);
    expect(document.body.children).toHaveLength(1);
    expect(document.body.textContent).toContain('Try calf raises');
  });

  it('skips the gate for someone already signed in', async () => {
    mockAuth.mockResolvedValueOnce({ isAuthenticated: true });
    mockApiGet.mockResolvedValue({ ok: true, status: 200, data: { card: CARD } });
    await initAnswerCardPage(ID);
    expect(mockGate).not.toHaveBeenCalled();
  });

  it('does nothing at all when framed', async () => {
    mockRefuseFraming.mockReturnValueOnce(true);
    await initAnswerCardPage(ID);
    expect(mockAuth).not.toHaveBeenCalled();
    expect(mockApiGet).not.toHaveBeenCalled();
  });
});

describe('app routing (openStandalonePage)', () => {
  it('takes over only for /a/ with a card id', async () => {
    mockApiGet.mockResolvedValue({ ok: true, status: 200, data: { card: CARD } });
    expect(await openStandalonePage('/')).toBe(false);
    expect(await openStandalonePage('/a/short')).toBe(false);
    expect(mockAuth).not.toHaveBeenCalled();
    expect(await openStandalonePage(`/a/${ID}`)).toBe(true);
    expect(mockApiGet).toHaveBeenCalledWith(`/api/answer-cards/${ID}`, undefined, {
      maxRetries: 1,
    });
  });

  it('is asked by app.ts before the main app sign-in gate', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const app = readFileSync(join(__dirname, '..', '..', 'src', 'app.ts'), 'utf8');
    const routed = app.indexOf('await openStandalonePage(window.location.pathname)');
    expect(routed).toBeGreaterThan(-1);
    expect(routed).toBeLessThan(app.indexOf('await showSignInGate()'));
  });
});
