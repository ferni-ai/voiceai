/**
 * The SMS and email switches in "When I'll Check In" reach the server, on and off.
 *
 * They used to send `disabledChannels`, which the server ignored, and nothing at
 * all for switching one back on. Now the panel sends the switches the person
 * changed (smsEnabled/emailEnabled), and only those: the rest of its copy is
 * this browser's and may be stale, so saving quiet hours never flips texts.
 * Texts themselves have no switch here (#2059): they are turned on only in
 * Contact Settings, next to the disclosure, so this tests the email switch.
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
  it('switching email off sends emailEnabled: false (not the ignored disabledChannels)', async () => {
    await openPanel();
    flip('emailEnabled', false);
    expect(await save()).toEqual({ emailEnabled: false });
  });

  it('switching email back on is sent too', async () => {
    localStorage.setItem('ferni-outreach-prefs', JSON.stringify({ emailEnabled: false }));
    await openPanel();
    flip('emailEnabled', true);
    expect(await save()).toEqual({ emailEnabled: true });
  });

  it('texts have no switch here: they go on only next to the disclosure', async () => {
    await openPanel();
    expect(document.querySelector('[data-outreach="smsEnabled"]')).toBeNull();
    expect(document.querySelector('[data-action="open-contact-texts"]')).not.toBeNull();
  });

  it('a save that changed no switch sends none, so a stale copy flips nothing', async () => {
    localStorage.setItem('ferni-outreach-prefs', JSON.stringify({ smsEnabled: false }));
    await openPanel();
    expect(await save()).toEqual({});
  });
});
