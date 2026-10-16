/**
 * Feedback never interrupts a live call.
 *
 * Before: a feedback_prompt from the agent popped "This landed / Helpful /
 * Too much / Off track" over the conversation mid-call. Now the prompt is
 * held and asked once, with one tap, on the post-call card.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockApiGet = vi.fn();
const mockApiPost = vi.fn(() => Promise.resolve({ ok: true, status: 200 }));

vi.mock('../../src/utils/api.js', () => ({
  apiGet: mockApiGet,
  apiPost: mockApiPost,
  getApiHeaders: vi.fn(() => ({})),
}));
vi.mock('../../src/state/app.state.js', () => ({
  appState: { get: (key: string) => (key === 'connection' ? 'connected' : undefined) },
}));
vi.mock('../../src/ui/support-ferni.ui.js', () => ({
  supportFerniUI: { open: vi.fn(() => Promise.resolve()) },
}));

const COST = { sessionId: 's1', totalCost: 0.06, durationMinutes: 10, message: 'Thanks for chatting.' };

function sendPrompt(feedbackId: string): void {
  window.dispatchEvent(
    new CustomEvent('ferni:data-message', {
      detail: {
        type: 'feedback_prompt',
        feedbackId,
        trigger: 'natural_pause',
        reactions: ['resonated', 'helpful', 'too_much', 'off_track'],
        autoHideMs: 8000,
        timestamp: Date.now(),
      },
    })
  );
}

const feedbackRow = (): HTMLElement | null => document.querySelector('.ferni-call-feedback');

describe('call feedback', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    localStorage.clear();
    mockApiPost.mockClear();
    mockApiGet.mockImplementation((path: string) =>
      Promise.resolve(path === '/api/conversation/cost' ? { ok: true, status: 200, data: COST } : { ok: false, status: 404 })
    );
    await (await import('../../src/i18n/index.js')).initI18n();
    (await import('../../src/ui/contextual-feedback.ui.js')).initContextualFeedbackUI();
  });

  afterEach(async () => {
    (await import('../../src/ui/conversation-cost.ui.js')).hide();
    (await import('../../src/ui/after-call/call-feedback.js')).clearHeldFeedbackPrompt();
  });

  it('shows nothing during the call when the agent asks for feedback', async () => {
    sendPrompt('fb-1');

    expect(document.querySelector('.contextual-feedback--visible')).toBeNull();
    const { hasHeldFeedbackPrompt } = await import('../../src/ui/after-call/call-feedback.js');
    expect(hasHeldFeedbackPrompt()).toBe(true);
  });

  it('asks once, with one tap, on the post-call card and records the reaction', async () => {
    sendPrompt('fb-2');
    const { showPostCallCard } = await import('../../src/ui/after-call/post-call.js');

    await showPostCallCard();

    const row = feedbackRow();
    // The recap is the post-call card by default (after-call-flag.ts). The row
    // rides that card; flag off still puts it on the cost card.
    expect(row?.closest('.ferni-after-call-card')).not.toBeNull();
    expect(row?.textContent).toContain('How did that feel?');
    const helpful = row?.querySelector<HTMLButtonElement>('[data-reaction="helpful"]');
    expect(helpful?.getAttribute('aria-label')).toBe('Helpful');

    helpful?.click();

    expect(mockApiPost).toHaveBeenCalledWith('/api/feedback', { feedbackId: 'fb-2', reaction: 'helpful' });
    expect(feedbackRow()?.textContent).toContain('Thanks, that helps.');
    expect(feedbackRow()?.querySelectorAll('button')).toHaveLength(0);
  });

  it('adds no row when the agent never asked, and asks only once per prompt', async () => {
    const { buildCallFeedbackRow, holdFeedbackPrompt } = await import(
      '../../src/ui/after-call/call-feedback.js'
    );
    const { REACTIONS } = await import('../../src/ui/contextual-feedback.ui.js');

    expect(buildCallFeedbackRow(REACTIONS)).toBeNull();
    holdFeedbackPrompt('fb-3');
    expect(buildCallFeedbackRow(REACTIONS)).not.toBeNull();
    expect(buildCallFeedbackRow(REACTIONS)).toBeNull();
  });

  it('drops an unanswered prompt when the next call starts', async () => {
    sendPrompt('fb-4');
    window.dispatchEvent(new CustomEvent('ferni:conversation-start'));

    const { hasHeldFeedbackPrompt } = await import('../../src/ui/after-call/call-feedback.js');
    expect(hasHeldFeedbackPrompt()).toBe(false);
  });
});
