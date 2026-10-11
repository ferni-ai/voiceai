/**
 * After-call card tests.
 *
 * - Flag off: the goodbye still ends with the conversation cost card.
 * - Flag on: the after-call card shows what was saved during this call and a
 *   commitment from it, or a warm fallback when nothing was saved.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockApiGet = vi.fn();

vi.mock('../../src/utils/api.js', () => ({
  apiGet: mockApiGet,
  apiPost: vi.fn(() => Promise.resolve({ ok: true, status: 200 })),
  getApiHeaders: vi.fn(() => ({})),
}));

vi.mock('../../src/ui/support-ferni.ui.js', () => ({
  supportFerniUI: { open: vi.fn(() => Promise.resolve()) },
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
    await startCall();
  });

  afterEach(async () => {
    const { hideAfterCallCard } = await import('../../src/ui/after-call/after-call-card.ui.js');
    hideAfterCallCard(true);
    const { hide } = await import('../../src/ui/conversation-cost.ui.js');
    hide();
  });

  describe('flag off (default)', () => {
    it('shows the conversation cost card after the call, as before', async () => {
      routeApi({ memories: [{ content: 'Likes tea', learnedAt: inCall(1000) }] });

      await runPostCall();

      expect(costCard()).not.toBeNull();
      expect(afterCallCard()).toBeNull();
      expect(mockApiGet).not.toHaveBeenCalledWith('/api/cognitive/memories');
    });
  });

  describe('flag on', () => {
    beforeEach(() => {
      localStorage.setItem(FLAG_KEY, 'true');
    });

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

    it('shows the warm fallback, not invented content, when nothing was saved this call', async () => {
      routeApi({
        memories: [{ content: 'Old fact from last spring', learnedAt: LONG_AGO }],
        commitments: [],
      });

      await runPostCall();

      const card = afterCallCard();
      expect(card).not.toBeNull();
      expect(card!.querySelectorAll('li')).toHaveLength(0);
      expect(card!.querySelector('.after-call-empty')?.textContent).toBe(
        'Nothing new to hold onto this time. Thanks for the company.'
      );
      expect(card!.querySelector('.after-call-commitment')).toBeNull();
      expect(card!.querySelector('.after-call-invitation')?.textContent).toBe(
        "Come back whenever you like. I'll be here."
      );
    });

    it('falls back when the memory and commitment requests fail', async () => {
      mockApiGet.mockResolvedValue({ ok: false, status: 500 });

      await runPostCall();

      const card = afterCallCard();
      expect(card!.querySelector('.after-call-empty')).not.toBeNull();
      expect(card!.querySelector('.after-call-invitation')).not.toBeNull();
      expect(card!.querySelector('.after-call-cost')).toBeNull();
    });

    it('keeps the call cost one tap away', async () => {
      routeApi({});

      await runPostCall();
      afterCallCard()!.querySelector<HTMLButtonElement>('.after-call-cost')!.click();
      await vi.waitFor(() => expect(costCard()).not.toBeNull());
      const { isAfterCallCardShowing } =
        await import('../../src/ui/after-call/after-call-card.ui.js');
      expect(isAfterCallCardShowing()).toBe(false);
      expect(afterCallCard()?.classList.contains('visible') ?? false).toBe(false);
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
