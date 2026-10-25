/**
 * Quiet hours in Notifications settings reach the server.
 *
 * The panel promises "I'll stay quiet during these hours", but texts, calls and
 * check-ins are sent by the server. The inputs used to save to localStorage only,
 * so they gated nothing but this browser's own notifications.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet, apiPost, apiDelete: vi.fn() }));
vi.mock('../../src/services/push-preference.js', () => ({ applyPushPreference: vi.fn() }));
vi.mock('../../src/services/timezone.service.js', () => ({
  getUserTimezone: () => 'America/Chicago',
}));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// The setup file empties document.body between tests, so each test opens a fresh panel.
async function openPanel(): Promise<void> {
  vi.resetModules();
  const { getNotificationSettingsUI } = await import('../../src/ui/notification-settings.ui.js');
  getNotificationSettingsUI().show();
  await flush();
}

function setTime(id: string, value: string): void {
  const input = document.querySelector<HTMLInputElement>(id);
  if (!input) throw new Error(`missing ${id}`);
  input.value = value;
  input.dispatchEvent(new Event('change'));
}

beforeEach(() => {
  localStorage.clear();
  apiGet.mockImplementation(async (url: string) =>
    url === '/api/user/preferences'
      ? {
          ok: true,
          status: 200,
          data: {
            success: true,
            preferences: { quietHoursStart: '21:30', quietHoursEnd: '06:45' },
          },
        }
      : { ok: true, status: 200, data: { upcoming: [] } }
  );
  apiPost.mockResolvedValue({ ok: true, status: 200, data: { success: true } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('notification settings quiet hours', () => {
  it('saves the quiet window to the server with the IANA time zone', async () => {
    await openPanel();

    setTime('#quiet-start', '23:00');
    setTime('#quiet-end', '07:00');
    document.querySelector<HTMLButtonElement>('[data-action="save"]')?.click();
    await flush();

    expect(apiPost).toHaveBeenCalledWith('/api/user/preferences', {
      timezone: 'America/Chicago',
      quietHoursStart: '23:00',
      quietHoursEnd: '07:00',
    });
  });

  it('shows the server value when the panel opens', async () => {
    await openPanel();

    expect(apiGet).toHaveBeenCalledWith('/api/user/preferences');
    expect(document.querySelector<HTMLInputElement>('#quiet-start')?.value).toBe('21:30');
    expect(document.querySelector<HTMLInputElement>('#quiet-end')?.value).toBe('06:45');
  });

  it('stays editable when push notifications are off, since texts and calls still honor it', async () => {
    await openPanel();

    const enabled = document.querySelector<HTMLInputElement>('[data-pref="enabled"]');
    if (!enabled) throw new Error('missing push toggle');
    enabled.checked = false;
    enabled.dispatchEvent(new Event('change'));
    expect(document.querySelector<HTMLInputElement>('#quiet-start')?.disabled).toBe(false);
    expect(document.querySelector<HTMLInputElement>('#quiet-end')?.disabled).toBe(false);
  });
});

describe('notification settings texts row', () => {
  it('has no texts switch (never pre-checked); it sends people to the disclosure instead', async () => {
    await openPanel();
    expect(document.querySelector('[data-outreach="smsEnabled"]')).toBeNull();
    expect(document.querySelector('[data-action="open-contact-texts"]')?.textContent).toContain(
      'Set up texts'
    );
  });
});
