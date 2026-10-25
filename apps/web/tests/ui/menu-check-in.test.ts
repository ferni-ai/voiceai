/**
 * When I'll Check In (notification settings): the Upcoming tab shows what is
 * really planned, and every switch is one something reads.
 *
 * Before (2026-10-25 audit): loadUpcomingData kept only `scheduledFor` from each
 * item, so a planned follow-up rendered as "… undefined undefined". The Ferni
 * Check-ins, Daily Practice Reminders, Prediction Results, Team Huddles and
 * Weekly Recap switches were saved in this browser only and no sender read them
 * (Team Huddles was deleted, Predictions is hidden).
 */
import { describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({
  apiGet,
  apiPost: vi.fn().mockResolvedValue({ ok: true, status: 200, data: { success: true } }),
  apiDelete: vi.fn(),
}));
vi.mock('../../src/services/push-preference.js', () => ({ applyPushPreference: vi.fn() }));

/** One item as GET /api/outreach/upcoming sends it (outreach-upcoming-route.ts). */
const FOLLOW_UP = {
  id: 'fu-42',
  type: 'follow_up',
  personaId: 'ferni',
  personaName: 'Ferni',
  channel: 'sms',
  scheduledFor: new Date(Date.now() + 26 * 3_600_000).toISOString(),
  preview: { body: 'How did the interview with Dana go?' },
  reason: 'Checking how it went',
  priority: 'medium',
  canReschedule: false,
  canCancel: false,
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const panel = () => document.querySelector('.notif-settings') as HTMLElement;

async function open(tab: 'settings' | 'upcoming'): Promise<void> {
  vi.resetModules();
  apiGet.mockImplementation(async (url: string) =>
    url === '/api/outreach/upcoming'
      ? { ok: true, status: 200, data: { success: true, upcoming: [FOLLOW_UP] } }
      : { ok: false, status: 404 }
  );
  await (await import('../../src/i18n/index.js')).initI18n();
  const { showNotificationSettings } = await import('../../src/ui/notification-settings.ui.js');
  showNotificationSettings({ tab });
  await flush();
}

describe('Upcoming tab', () => {
  it("renders a planned follow-up with its own words, not 'undefined'", async () => {
    await open('upcoming');

    const item = panel().querySelector<HTMLElement>('.notif-settings__upcoming-item');
    expect(item?.dataset.outreachId).toBe('fu-42');
    expect(item?.querySelector('.notif-settings__upcoming-preview')?.textContent).toBe(
      'How did the interview with Dana go?'
    );
    expect(item?.querySelector('.notif-settings__upcoming-persona')?.textContent).toBe('Ferni');
    expect(item?.textContent).not.toContain('undefined');
  });
});

describe('Settings tab', () => {
  it('offers only switches something reads', async () => {
    await open('settings');

    const switches = [...panel().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].map(
      (input) => input.dataset.pref ?? input.dataset.outreach
    );
    // enabled: subscribes this browser on the server (push-preference.ts)
    // emailEnabled: sent to POST /api/outreach/preferences
    // milestoneNotifications: read before this page sends a milestone (outreach.service.ts)
    expect(switches).toEqual(['enabled', 'emailEnabled', 'milestoneNotifications']);
    for (const gone of ['teamHuddles', 'predictionResults', 'ferniCheckins', 'ritualReminders']) {
      expect(panel().querySelector(`[data-pref="${gone}"]`), gone).toBeNull();
    }
    expect(panel().querySelector('[data-outreach="weeklyRecap"]')).toBeNull();
    expect(panel().textContent).not.toMatch(/Team Huddles|Prediction Results|Weekly Recap/);
  });
});
