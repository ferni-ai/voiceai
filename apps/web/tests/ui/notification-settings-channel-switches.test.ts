/**
 * When I'll Check In: the email switch shows and saves the SERVER's value.
 *
 * It was "Email Updates": it showed this browser's copy (ferni-outreach-prefs)
 * and promised "milestone celebrations and weekly recaps". No weekly recap
 * exists, and milestone emails don't read it. What reads it is the daily
 * check-in run (automated-scheduler.ts, outreachPreferences.channels), which
 * GET /api/outreach/preferences reports as `allowedChannels`. The panel can't
 * grant email consent that was never given, so the row shows only while email
 * is on there, and stays for the visit once switched off so it can go back on.
 * Texts have no switch here (#2059): they go on next to the disclosure.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const enUS = JSON.parse(
  readFileSync(resolve(__dirname, '../../src/i18n/locales/en-US.json'), 'utf8')
) as { notificationSettings: Record<string, string> };

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet, apiPost, apiDelete: vi.fn() }));
vi.mock('../../src/services/push-preference.js', () => ({ applyPushPreference: vi.fn() }));
vi.mock('../../src/services/timezone.service.js', () => ({
  getUserTimezone: () => 'America/New_York',
}));
const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast, whisper: toast }));

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};
const emailBox = (): HTMLInputElement | null => document.querySelector('[data-email-checkins]');
const preferencePosts = (): unknown[] =>
  apiPost.mock.calls
    .filter(([url]) => url === '/api/outreach/preferences')
    .map(([, body]) => (body as { preferences: unknown }).preferences);

/** What GET /api/outreach/preferences answers (outreach.routes.ts), in order. */
function serverChannels(...answers: Array<string[] | null>): void {
  let n = 0;
  apiGet.mockImplementation(async (url: string) => {
    if (url !== '/api/outreach/preferences')
      return { ok: true, status: 200, data: { upcoming: [] } };
    const channels = answers[Math.min(n++, answers.length - 1)];
    return channels
      ? {
          ok: true,
          status: 200,
          data: { success: true, allowedChannels: channels, outreachEnabled: true },
        }
      : { ok: false, status: 500, error: 'boom' };
  });
}

async function openPanel(): Promise<void> {
  vi.resetModules();
  const { getNotificationSettingsUI } = await import('../../src/ui/notification-settings.ui.js');
  getNotificationSettingsUI().show();
  await flush();
}

function flip(on: boolean): void {
  const box = emailBox();
  if (!box) throw new Error('no email switch');
  box.checked = on;
  box.dispatchEvent(new Event('change'));
}

beforeEach(() => {
  localStorage.clear();
  apiPost.mockResolvedValue({ ok: true, status: 200, data: { success: true } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("When I'll Check In: check-ins by email", () => {
  it('shows the server value, not the one this browser saved', async () => {
    localStorage.setItem('ferni-outreach-prefs', JSON.stringify({ emailEnabled: false }));
    serverChannels(['sms', 'email']);
    await openPanel();
    expect(emailBox()?.checked).toBe(true);
    expect(emailBox()?.getAttribute('role')).toBe('switch');
  });

  it("is not offered when the server has email off, whatever this browser's copy says", async () => {
    localStorage.setItem('ferni-outreach-prefs', JSON.stringify({ emailEnabled: true }));
    serverChannels(['sms']);
    await openPanel();
    expect(emailBox()).toBeNull();
  });

  it('is not offered when the server did not answer', async () => {
    localStorage.setItem('ferni-outreach-prefs', JSON.stringify({ emailEnabled: true }));
    serverChannels(null);
    await openPanel();
    expect(emailBox()).toBeNull();
  });

  it('says only what it sends: check-ins, no weekly recaps or milestones', async () => {
    serverChannels(['email']);
    await openPanel();
    const row = emailBox()!.closest('.notif-settings__capability-row')!;
    expect(row.querySelector('.notif-settings__label')?.textContent).toBe('Check-ins by email');
    expect(row.querySelector('.notif-settings__desc')?.textContent).toBe(
      'Whether I can check in with you by email. Off means no check-in emails.'
    );
    expect(enUS.notificationSettings.emailCheckins).toBe('Check-ins by email');
    expect(enUS.notificationSettings.emailCheckinsDesc).toBe(
      'Whether I can check in with you by email. Off means no check-in emails.'
    );
    expect(document.body.textContent).not.toMatch(/weekly recap/i);
    expect(enUS.notificationSettings).not.toHaveProperty('emailUpdatesDesc');
  });

  it('switching off saves emailEnabled: false right away (the server drops email itself)', async () => {
    serverChannels(['sms', 'email']);
    await openPanel();
    flip(false);
    await flush();
    expect(preferencePosts()).toEqual([{ emailEnabled: false }]);
    expect(emailBox()?.checked).toBe(false); // still there, so it can go back on
  });

  it('switching back on sends the list read just now, plus email', async () => {
    // open: texts and email on; texts went off elsewhere and calls on before email goes back on
    serverChannels(['sms', 'email'], ['call']);
    await openPanel();
    flip(false);
    await flush();
    flip(true);
    await flush();
    expect(preferencePosts()).toEqual([
      { emailEnabled: false },
      { allowedChannels: ['call', 'email'] },
    ]);
  });

  it('a failed save puts the switch back and shows the error toast', async () => {
    serverChannels(['email']);
    await openPanel();
    apiPost.mockResolvedValueOnce({ ok: false, status: 500, error: 'boom' });
    flip(false);
    await flush();
    expect(emailBox()?.checked).toBe(true);
    expect(toast.error).toHaveBeenCalledWith("Couldn't save that. Try again?");
  });

  it('Save sends no email change: the switch already saved itself', async () => {
    serverChannels(['email']);
    await openPanel();
    document.querySelector<HTMLButtonElement>('[data-action="save"]')?.click();
    await flush();
    expect(preferencePosts()).toEqual([{}]);
  });

  it('texts have no switch here: they go on only next to the disclosure', async () => {
    serverChannels(['sms', 'email']);
    await openPanel();
    expect(document.querySelector('[data-outreach="smsEnabled"]')).toBeNull();
    expect(document.querySelector('[data-outreach="emailEnabled"]')).toBeNull();
    expect(document.querySelector('[data-action="open-contact-texts"]')).not.toBeNull();
  });
});
