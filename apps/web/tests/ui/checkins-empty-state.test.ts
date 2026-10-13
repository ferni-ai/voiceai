/**
 * When I'll Check In, Upcoming tab: an empty list says what will appear, and
 * never shows invented sample check-ins as if they were the user's own.
 *
 * Before: "What this will look like" over three samples ("Your meditation
 * streak is at 6 days!", "You mentioned feeling overwhelmed yesterday", "That
 * big presentation is coming up"). A failed load showed the same empty state,
 * and the tab never re-rendered after its fetch.
 */

import { describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({
  apiGet,
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  apiPut: vi.fn(),
}));

const { showNotificationSettings } = await import('../../src/ui/notification-settings.ui.js');
const { t } = await import('../../src/i18n/index.js');

const flush = () => new Promise((r) => setTimeout(r, 0));
const panelText = () => document.querySelector('.notif-settings')?.textContent ?? '';

// The panel is a singleton that keeps its element and setup.ts empties the body
// before each test, so both states are checked in one test.
describe("When I'll Check In", () => {
  it('says nothing is scheduled with no sample check-ins, and says so when the load fails', async () => {
    apiGet.mockImplementation(async (url: string) =>
      url === '/api/outreach/upcoming'
        ? { ok: true, status: 200, data: { upcoming: [] } }
        : { ok: false, status: 404 }
    );
    showNotificationSettings({ tab: 'upcoming' });
    await flush();

    expect(panelText()).toContain(t('notificationSettings.upcomingEmptyNote'));
    expect(panelText()).not.toMatch(/meditation streak|overwhelmed yesterday|big presentation/);
    expect(document.querySelector('.notif-settings__sample-checkin')).toBeNull();

    apiGet.mockResolvedValue({ ok: false, status: 500 });
    showNotificationSettings({ tab: 'upcoming' });
    await flush();

    expect(panelText()).toContain(t('notificationSettings.upcomingLoadFailed'));
    expect(panelText()).not.toContain(t('notificationSettings.upcomingEmptyNote'));
  });
});
