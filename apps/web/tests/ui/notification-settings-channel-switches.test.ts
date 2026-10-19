/**
 * The SMS and email switches in "When I'll Check In" reach the server, on and off.
 *
 * They used to send `disabledChannels`, which the server ignored, and nothing at
 * all for switching one back on. Now the panel sends the switches the person
 * changed (smsEnabled/emailEnabled), and only those: the rest of its copy is
 * this browser's and may be stale, so saving quiet hours never flips texts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet, apiPost, apiDelete: vi.fn() }));
vi.mock('../../src/services/push-preference.js', () => ({ applyPushPreference: vi.fn() }));
vi.mock('../../src/services/timezone.service.js', () => ({
  getUserTimezone: () => 'America/New_York',
}));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function openPanel(): Promise<void> {
  vi.resetModules();
  const { getNotificationSettingsUI } = await import('../../src/ui/notification-settings.ui.js');
  getNotificationSettingsUI().show();
  await flush();
}

function flip(name: 'smsEnabled' | 'emailEnabled', on: boolean): void {
  const box = document.querySelector<HTMLInputElement>(`[data-outreach="${name}"]`);
  if (!box) throw new Error(`missing ${name}`);
  box.checked = on;
  box.dispatchEvent(new Event('change'));
}

async function save(): Promise<Record<string, unknown> | undefined> {
  document.querySelector<HTMLButtonElement>('[data-action="save"]')?.click();
  await flush();
  const call = apiPost.mock.calls.find(([url]) => url === '/api/outreach/preferences');
  return (call?.[1] as { preferences: Record<string, unknown> } | undefined)?.preferences;
}

beforeEach(() => {
  localStorage.clear();
  apiGet.mockResolvedValue({ ok: true, status: 200, data: { upcoming: [] } });
  apiPost.mockResolvedValue({ ok: true, status: 200, data: { success: true } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("When I'll Check In: SMS and email switches", () => {
  it('switching texts off sends smsEnabled: false (not the ignored disabledChannels)', async () => {
    await openPanel();
    flip('smsEnabled', false);
    expect(await save()).toEqual({ smsEnabled: false });
  });

  it('switching texts back on is sent too', async () => {
    localStorage.setItem('ferni-outreach-prefs', JSON.stringify({ smsEnabled: false }));
    await openPanel();
    flip('smsEnabled', true);
    expect(await save()).toEqual({ smsEnabled: true });
  });

  it('a save that changed no switch sends none, so a stale copy flips nothing', async () => {
    localStorage.setItem('ferni-outreach-prefs', JSON.stringify({ smsEnabled: false }));
    await openPanel();
    expect(await save()).toEqual({});
  });
});
