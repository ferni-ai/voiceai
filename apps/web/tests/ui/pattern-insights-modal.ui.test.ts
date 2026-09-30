/**
 * Pattern Insights Modal Tests
 *
 * "Show patterns" (settings menu and the voice agent's ferni:open-patterns)
 * used to look for an `.app-shell` element that doesn't exist and silently
 * did nothing. It now opens the insights card in the shared modal.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const mockAuthState = { isAuthenticated: true, userId: 'test-user-123' };
vi.mock('../../src/services/firebase-auth.service.js', () => ({
  getAuthState: () => mockAuthState,
}));

vi.mock('../../src/utils/api.js', () => ({ apiGet: vi.fn() }));

import { apiGet } from '../../src/utils/api.js';
import {
  openPatternInsights,
  disposePatternInsightsModal,
} from '../../src/ui/pattern-insights-modal.ui.js';
import { disposePatternInsightsUI } from '../../src/ui/pattern-insights.ui.js';

const mockApiGet = vi.mocked(apiGet);

// jsdom has no Web Animations API; the base Modal animates open/close.
if (!Element.prototype.animate) {
  Element.prototype.animate = function animate() {
    return { finished: Promise.resolve(), cancel: () => undefined } as unknown as Animation;
  };
}

describe('openPatternInsights', () => {
  beforeEach(() => {
    document.body.textContent = '';
    localStorage.clear();
    mockApiGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        insights: [
          {
            id: 'p1',
            type: 'timing',
            title: 'Evening reflector',
            description: 'You tend to open up after 9pm',
            icon: 'moon',
          },
        ],
      },
    } as never);
  });

  afterEach(() => {
    disposePatternInsightsModal();
    disposePatternInsightsUI();
    vi.clearAllMocks();
  });

  it('opens a dialog with the patterns in it', async () => {
    await openPatternInsights();

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.querySelector('.ferni-modal__title')?.textContent).toContain('Your Patterns');

    const card = dialog?.querySelector('.pattern-insights-card');
    expect(card?.classList.contains('pattern-insights-card--embedded')).toBe(true);
    expect(card?.textContent).toContain('Evening reflector');
    expect(mockApiGet).toHaveBeenCalledWith('/api/insights/patterns');
  });

  it('shows the insights expanded, without the card header or toggle', async () => {
    await openPatternInsights();

    const card = document.querySelector('.pattern-insights-card');
    expect(card?.querySelector('.pattern-insights-card__header')).toBeNull();
    expect(card?.querySelector('.pattern-insights-card__toggle')).toBeNull();
    expect(card?.querySelector('.pattern-insights-card__content--expanded')).not.toBeNull();
  });

  it('reuses one dialog and refreshes the insights when reopened', async () => {
    await openPatternInsights();
    await openPatternInsights();

    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.querySelectorAll('.pattern-insights-card')).toHaveLength(1);
    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });

  it('still opens, with a friendly empty state, when the fetch fails', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('offline'));

    await openPatternInsights();

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector('.pattern-insights-card')).not.toBeNull();
  });
});
