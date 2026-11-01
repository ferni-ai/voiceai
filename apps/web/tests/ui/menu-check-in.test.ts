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

async function open(
  tab: 'settings' | 'upcoming',
  upcoming: unknown[] = [FOLLOW_UP]
): Promise<void> {
  vi.resetModules();
  apiGet.mockImplementation(async (url: string) =>
    url === '/api/outreach/upcoming'
      ? { ok: true, status: 200, data: { success: true, upcoming } }
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

/** Markup in every field the route sends: none of it may become an element or attribute. */
const IMG = '<img src=x onerror="alert(1)">';
const BREAKOUT = '"><script>alert(2)</script>';
const HOSTILE = {
  ...FOLLOW_UP,
  id: `fu-1${BREAKOUT}`,
  personaId: `ferni${BREAKOUT}`,
  personaName: `${IMG}Ferni`,
  preview: { body: `${IMG} and ${BREAKOUT}` },
  reason: BREAKOUT,
  priority: `high${BREAKOUT}`,
  canCancel: true,
};

/** Every element and attribute name under root: injection shows up as an extra one. */
function injected(root: Element): string[] {
  const found: string[] = [];
  for (const el of root.querySelectorAll('*')) {
    if (el.matches('img, script')) found.push(`<${el.tagName.toLowerCase()}>`);
    for (const a of el.attributes)
      if (/^on|^src$/i.test(a.name)) found.push(`${el.tagName}[${a.name}]`);
  }
  return found;
}

describe('Upcoming tab with markup in the server fields', () => {
  it('shows it as text, injects no element or attribute, and keeps priority to its values', async () => {
    await open('upcoming', [HOSTILE]);

    const item = panel().querySelector<HTMLElement>('.notif-settings__upcoming-item');
    expect(item).not.toBeNull();
    expect(injected(panel())).toEqual([]);
    // the text arrives as text, attributes keep their whole value
    expect(item?.querySelector('.notif-settings__upcoming-preview')?.textContent).toBe(
      `${IMG} and ${BREAKOUT}`
    );
    expect(item?.querySelector('.notif-settings__upcoming-persona')?.textContent).toBe(
      `${IMG}Ferni`
    );
    expect(item?.dataset.outreachId).toBe(HOSTILE.id);
    expect(item?.dataset.persona).toBe(HOSTILE.personaId);
    expect(item?.querySelector<HTMLElement>('[data-action="cancel"]')?.dataset.id).toBe(HOSTILE.id);
    // an unknown priority falls back to medium, in the class and the label
    const priority = item?.querySelector('.notif-settings__upcoming-priority');
    expect(priority?.className).toBe(
      'notif-settings__upcoming-priority notif-settings__upcoming-priority--medium'
    );
    expect(priority?.textContent).toBe('medium');
  });
});

describe('the upcoming item reader', () => {
  it('keeps only the known fields, with a safe priority and channel', async () => {
    const { toUpcomingOutreachItem } = await import('../../src/ui/upcoming-outreach-item.js');
    const item = toUpcomingOutreachItem({
      ...FOLLOW_UP,
      html: '<b>x</b>',
      priority: 'urgent',
      channel: 'fax',
    });

    expect(Object.keys(item).sort()).toEqual(
      [
        'canCancel',
        'canReschedule',
        'channel',
        'id',
        'personaId',
        'personaName',
        'preview',
        'priority',
        'reason',
        'scheduledFor',
        'type',
      ].sort()
    );
    expect([item.priority, item.channel]).toEqual(['medium', 'sms']);
    expect(item.scheduledFor.toISOString()).toBe(FOLLOW_UP.scheduledFor);
  });
});

describe('Settings tab with markup in the saved quiet hours', () => {
  it('keeps the server value inside its input when the panel redraws', async () => {
    await open('settings');
    apiGet.mockImplementation(async (url: string) =>
      url === '/api/user/preferences'
        ? {
            ok: true,
            status: 200,
            data: {
              success: true,
              preferences: { quietHoursStart: BREAKOUT, quietHoursEnd: '07:00' },
            },
          }
        : { ok: true, status: 200, data: { upcoming: [] } }
    );
    const { showNotificationSettings } = await import('../../src/ui/notification-settings.ui.js');
    showNotificationSettings({ tab: 'settings' });
    await flush();
    // switching tabs redraws the settings tab from the values loaded above
    panel().querySelector<HTMLElement>('[data-tab="upcoming"]')!.click();
    panel().querySelector<HTMLElement>('[data-tab="settings"]')!.click();

    expect(injected(panel())).toEqual([]);
    expect(panel().querySelectorAll('input[type="time"]')).toHaveLength(2);
    expect(panel().querySelector<HTMLInputElement>('#quiet-end')?.value).toBe('07:00');
  });
});

describe('Settings tab', () => {
  it('offers only switches something reads', async () => {
    await open('settings');

    const switches = [...panel().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].map(
      (input) => input.dataset.pref ?? input.dataset.outreach
    );
    // enabled: subscribes this browser on the server (push-preference.ts)
    // milestoneNotifications: read before this page sends a milestone (outreach.service.ts)
    // The email switch shows only while the server has email on (email-checkins-switch.ts);
    // here GET /api/outreach/preferences fails, so it is not offered.
    expect(switches).toEqual(['enabled', 'milestoneNotifications']);
    for (const gone of ['teamHuddles', 'predictionResults', 'ferniCheckins', 'ritualReminders']) {
      expect(panel().querySelector(`[data-pref="${gone}"]`), gone).toBeNull();
    }
    expect(panel().querySelector('[data-outreach="weeklyRecap"]')).toBeNull();
    expect(panel().querySelector('[data-email-checkins]')).toBeNull();
    expect(panel().textContent).not.toMatch(/Team Huddles|Prediction Results|Weekly Recap/);
  });
});
