/**
 * After-call card tests.
 *
 * - Default: the goodbye ends with the after-call recap (what was saved during
 *   this call and a commitment from it), or a short warm close when nothing
 *   was saved. Never the cost card. Support Ferni is a quiet link on it.
 * - Flag off (env or localStorage): the conversation cost card, as before.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockApiGet = vi.fn();

vi.mock('../../src/utils/api.js', () => ({
  apiGet: mockApiGet,
  apiPost: vi.fn(() => Promise.resolve({ ok: true, status: 200 })),
  getApiHeaders: vi.fn(() => ({})),
}));

const mockSupportOpen = vi.fn(() => Promise.resolve());

vi.mock('../../src/ui/support-ferni.ui.js', () => ({
  supportFerniUI: { open: mockSupportOpen },
}));

const FLAG_KEY = 'ferni:flag:after-call-card';

const COST = {
  sessionId: 'session-1',
  totalCost: 0.06,
  formattedCost: '$0.06',
  durationMinutes: 10,
  breakdown: { llm: 0.03, tts: 0.02, stt: 0.005, livekit: 0.003, infrastructure: 0.002 },
  suggestedTips: { small: 1, medium: 5, large: 10 },
  message: 'Thanks for chatting.',
};

interface ApiFixtures {
  memories?: unknown[];
  commitments?: unknown[];
  cost?: typeof COST;
}

function routeApi({ memories = [], commitments = [], cost = COST }: ApiFixtures): void {
  mockApiGet.mockImplementation((path: string) => {
    if (path === '/api/cognitive/memories') {
      return Promise.resolve({ ok: true, status: 200, data: { memories } });
    }
    if (path === '/api/commitments') {
      return Promise.resolve({ ok: true, status: 200, data: { items: commitments } });
    }
    if (path === '/api/conversation/cost') {
      return Promise.resolve({ ok: true, status: 200, data: cost });
    }
    return Promise.resolve({ ok: false, status: 404 });
  });
}

const inCall = (offsetMs: number): string => new Date(Date.now() + offsetMs).toISOString();
const LONG_AGO = '2025-01-01T00:00:00.000Z';

async function startCall(): Promise<void> {
  const { conversationTracker } =
    await import('../../src/services/conversation-tracker.service.js');
  conversationTracker.startSession('ferni', 'Ferni');
}

async function runPostCall(): Promise<void> {
  const { showPostCallCard } = await import('../../src/ui/after-call/post-call.js');
  await showPostCallCard();
}

const afterCallCard = (): HTMLElement | null => document.querySelector('.ferni-after-call-card');
const costCard = (): HTMLElement | null => document.querySelector('.ferni-cost-card');

describe('after-call card', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    localStorage.clear();
    mockApiGet.mockReset();
    mockSupportOpen.mockClear();
    await startCall();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    const { hideAfterCallCard } = await import('../../src/ui/after-call/after-call-card.ui.js');
    hideAfterCallCard(true);
    const { hide } = await import('../../src/ui/conversation-cost.ui.js');
    hide();
  });

  describe('flag off', () => {
    it('shows the conversation cost card after the call when the build turns it off', async () => {
      vi.stubEnv('VITE_AFTER_CALL_CARD', 'false');
      routeApi({ memories: [{ content: 'Likes tea', learnedAt: inCall(1000) }] });

      await runPostCall();

      expect(costCard()).not.toBeNull();
      expect(afterCallCard()).toBeNull();
      expect(mockApiGet).not.toHaveBeenCalledWith('/api/cognitive/memories');
    });

    it('shows the cost card when one browser turns it off', async () => {
      localStorage.setItem(FLAG_KEY, 'false');
      routeApi({});

      await runPostCall();

      expect(costCard()).not.toBeNull();
      expect(afterCallCard()).toBeNull();
    });
  });

  describe('default build', () => {

    it('shows memories saved during this call and a commitment from it, not the cost card', async () => {
      routeApi({
        memories: [
          { content: 'Your sister Maya is moving to Lisbon', learnedAt: inCall(2000) },
          { content: 'Started running again', learnedAt: inCall(1000) },
          { content: 'Old fact from last spring', learnedAt: LONG_AGO },
          { content: 'Undated fact' },
        ],
        commitments: [
          { description: 'Call Maya on Sunday', createdAt: Date.now() + 1500 },
          { description: 'An old promise', createdAt: Date.parse(LONG_AGO) },
        ],
      });

      await runPostCall();

      const card = afterCallCard();
      expect(card).not.toBeNull();
      expect(costCard()).toBeNull();
      const items = Array.from(card!.querySelectorAll('li')).map((li) => li.textContent);
      expect(items).toEqual(['Your sister Maya is moving to Lisbon', 'Started running again']);
      expect(card!.textContent).not.toContain('Old fact from last spring');
      expect(card!.textContent).not.toContain('Undated fact');
      expect(card!.querySelector('.after-call-commitment')?.textContent).toBe(
        'Call Maya on Sunday'
      );
      expect(card!.querySelector('.after-call-empty')).toBeNull();
    });

    it('shows only a short warm close, not invented content or the cost card, when nothing was saved this call', async () => {
      routeApi({
        memories: [{ content: 'Old fact from last spring', learnedAt: LONG_AGO }],
        commitments: [],
      });

      await runPostCall();

      const card = afterCallCard();
      expect(card).not.toBeNull();
      expect(costCard()).toBeNull();
      expect(card!.querySelector('.after-call-close-line')?.textContent).toBe(
        "Come back whenever you like. I'll be here."
      );
      expect(card!.querySelectorAll('h2, li')).toHaveLength(0);
      expect(card!.textContent).not.toContain('Old fact from last spring');
    });

    it('shows the warm close when the memory and commitment requests fail', async () => {
      mockApiGet.mockResolvedValue({ ok: false, status: 500 });

      await runPostCall();

      const card = afterCallCard();
      expect(card!.querySelector('.after-call-close-line')).not.toBeNull();
      expect(costCard()).toBeNull();
    });

    it('offers Support Ferni as a quiet link that opens only when tapped', async () => {
      routeApi({ memories: [{ content: 'Likes tea', learnedAt: inCall(1000) }] });

      await runPostCall();
      const link = afterCallCard()!.querySelector<HTMLButtonElement>('.after-call-support');
      expect(link?.textContent).toBe('Support Ferni');
      // It comes after the recap, not in place of it.
      expect(afterCallCard()!.lastElementChild).toBe(link);
      expect(afterCallCard()!.querySelector('li')?.textContent).toBe('Likes tea');
      expect(mockSupportOpen).not.toHaveBeenCalled();
      expect(costCard()).toBeNull();

      link!.click();
      await vi.waitFor(() => expect(mockSupportOpen).toHaveBeenCalledTimes(1));
      const { isAfterCallCardShowing } =
        await import('../../src/ui/after-call/after-call-card.ui.js');
      expect(isAfterCallCardShowing()).toBe(false);
      expect(costCard()).toBeNull();
    });

    it('sits in the page flow after the call controls, so it never covers Connect', async () => {
      document.body.innerHTML = `
        <main class="main">
          <div class="controls-row"><div class="controls"><button id="connectBtn">Connect</button></div></div>
          <p id="helperText">Your personal guide</p>
        </main>`;
      routeApi({});

      await runPostCall();

      const card = afterCallCard()!;
      const controls = document.querySelector('.controls-row')!;
      expect(controls.nextElementSibling).toBe(card);
      expect(card.contains(document.getElementById('connectBtn'))).toBe(false);
      const position = getComputedStyle(card).position;
      expect(position).not.toBe('fixed');
      expect(position).not.toBe('absolute');
      expect(card.querySelector('.after-call-support')).not.toBeNull();
    });

    it('closes when the next call connects', async () => {
      routeApi({});

      await runPostCall();
      expect(afterCallCard()).not.toBeNull();
      document.dispatchEvent(new CustomEvent('ferni:connected'));
      expect(afterCallCard()).toBeNull();
    });

    it('never appears over a call that connected while its data loaded', async () => {
      let releaseMemories: () => void = () => undefined;
      mockApiGet.mockImplementation((path: string) => {
        if (path === '/api/cognitive/memories') {
          return new Promise((resolve) => {
            releaseMemories = () => resolve({ ok: true, status: 200, data: { memories: [] } });
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          data: path === '/api/conversation/cost' ? COST : { items: [] },
        });
      });

      const pending = runPostCall();
      await vi.waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/api/cognitive/memories'));
      document.dispatchEvent(new CustomEvent('ferni:connected'));
      releaseMemories();
      await pending;
      expect(afterCallCard()).toBeNull();
    });

    it('is a labelled, focusable dialog that closes on Escape', async () => {
      routeApi({});
      const matchMedia = vi.fn(() => ({ matches: true }) as unknown as MediaQueryList);
      vi.stubGlobal('matchMedia', matchMedia);
      try {
        await runPostCall();

        const card = afterCallCard()!;
        expect(card.getAttribute('role')).toBe('dialog');
        expect(card.getAttribute('aria-label')).toBe('After your call');
        expect(card.tabIndex).toBe(-1);
        expect(document.activeElement).toBe(card);
        expect(card.querySelector('.after-call-close')?.getAttribute('aria-label')).toBe('Close');

        card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(afterCallCard()).toBeNull();
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});

describe('after-call data', () => {
  it('ignores memories without a real learnedAt or from before the call', async () => {
    const { memoriesFromCall } = await import('../../src/ui/after-call/after-call-data.js');
    const start = Date.parse('2026-10-11T10:00:00.000Z');
    expect(
      memoriesFromCall(
        [
          { content: 'during', learnedAt: '2026-10-11T10:05:00.000Z' },
          { content: 'before', learnedAt: '2026-10-11T09:59:59.000Z' },
          { content: 'bad date', learnedAt: 'not a date' },
          { content: '', learnedAt: '2026-10-11T10:06:00.000Z' },
        ],
        start
      )
    ).toEqual(['during']);
  });

  it('returns nothing when the call start is unknown', async () => {
    const { loadAfterCallData } = await import('../../src/ui/after-call/after-call-data.js');
    mockApiGet.mockReset();
    expect(await loadAfterCallData(null, ['an insight'])).toEqual({
      remembered: [],
      nextStep: null,
    });
    expect(mockApiGet).not.toHaveBeenCalled();
  });
});
