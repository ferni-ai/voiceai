/**
 * Daily Check-in panel with nothing in it: say what fills it, in Ferni's
 * voice, with no invented habits and no streak counts. A failed load says so.
 *
 * Before: the empty state was the habits teaser, three made-up habits shown as
 * the user's own ("Morning walk", 12-day streak; "Read before bed", 5-day
 * streak; "Meditation", Needs attention). A failed load showed the same.
 */

import { describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet, apiPost: vi.fn() }));

const { getEngagementUI, initializeEngagementUI } = await import('../../src/ui/engagement.ui.js');
const { t } = await import('../../src/i18n/index.js');

const flush = () => new Promise((r) => setTimeout(r, 0));
const contentText = () => document.getElementById('engagement-content')?.textContent ?? '';

// The panel is a singleton and setup.ts empties the body before each test,
// so the empty and the failed state are checked in one test.
describe('Daily Check-in panel', () => {
  it('says what fills it with no invented habits, and says so when the load fails', async () => {
    initializeEngagementUI();
    getEngagementUI().show();
    await flush();

    expect(contentText()).toContain(t('engagementPanel.emptyTitle'));
    expect(contentText()).toContain(t('engagementPanel.emptyMessage'));
    expect(contentText()).not.toMatch(/Morning walk|Read before bed|Meditation|streak|\d/i);

    localStorage.setItem('ferni_user_id', 'u1');
    apiGet.mockResolvedValue({ ok: false, status: 500, error: 'boom' });
    getEngagementUI().show();
    await flush();

    expect(apiGet).toHaveBeenCalledWith('/api/rituals', { userId: 'u1' });
    expect(contentText()).toContain(t('engagementPanel.loadFailedMessage'));
    expect(contentText()).not.toContain(t('engagementPanel.emptyMessage'));
    localStorage.clear();
  });
});
