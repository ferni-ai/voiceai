/**
 * "When should Ferni check in?" stays hidden until the call-consent switch is
 * on, saves what the sponsor picked, can be removed, and says so on failure.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiPut = vi.fn();
const apiDelete = vi.fn();
vi.mock('../src/utils/api.js', () => ({ apiGet, apiPost, apiPut, apiDelete }));
const toast = { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() };
vi.mock('../src/ui/whisper.ui.js', () => ({ toast }));

const { mountCallConsent, renderCallConsent } = await import('../src/ui/family-call-consent.ui.js');
const { t } = await import('../src/i18n/index.js');

const flush = () => new Promise((r) => setTimeout(r, 0));
const SCHEDULE_PATH = '/api/sponsored-identities/mom-id/checkin-schedule';
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

async function mount(agreed: boolean, schedule: unknown = null) {
  apiGet.mockImplementation(async (path: string) =>
    path.endsWith('/call-consent')
      ? { ok: true, status: 200, data: { agreed } }
      : { ok: true, status: 200, data: { schedule } }
  );
  const root = document.createElement('div');
  root.innerHTML = `<div class="family-form">${renderCallConsent('mom-id')}</div>`;
  await mountCallConsent(root);
  await flush();
  const q = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
  return {
    section: q<HTMLElement>('[data-checkin-schedule]'),
    consent: q<HTMLInputElement>('.family-call-consent__switch'),
    frequency: q<HTMLSelectElement>('[data-field="frequency"]'),
    day: q<HTMLSelectElement>('[data-field="day"]'),
    time: q<HTMLInputElement>('[data-field="time"]'),
    save: q<HTMLButtonElement>('[data-field="save"]'),
    remove: q<HTMLAnchorElement>('[data-field="remove"]'),
  };
}

afterEach(() => vi.clearAllMocks());

describe('the check-in schedule', () => {
  it('stays hidden and unloaded while they have not agreed to calls', async () => {
    const ui = await mount(false);
    expect(ui.section.hidden).toBe(true);
    expect(apiGet).not.toHaveBeenCalledWith(SCHEDULE_PATH);
  });

  it('appears once the switch is turned on, and hides again when it is off', async () => {
    const ui = await mount(false);
    apiPost.mockResolvedValue({ ok: true, status: 200, data: { agreed: true } });
    ui.consent.checked = true;
    ui.consent.dispatchEvent(new Event('change'));
    await flush();
    await flush();
    expect(ui.section.hidden).toBe(false);
    expect(apiGet).toHaveBeenCalledWith(SCHEDULE_PATH);

    apiDelete.mockResolvedValue({ ok: true, status: 200, data: { agreed: false } });
    ui.consent.checked = false;
    ui.consent.dispatchEvent(new Event('change'));
    await flush();
    expect(ui.section.hidden).toBe(true);
  });

  it('shows the saved schedule', async () => {
    const ui = await mount(true, {
      frequency: 'weekly',
      dayOfWeek: 'sunday',
      preferredTime: '10:30',
      timezone: 'America/Denver',
      isActive: true,
    });
    expect(ui.section.hidden).toBe(false);
    expect(ui.frequency.value).toBe('weekly');
    expect(ui.day.hidden).toBe(false);
    expect(ui.day.value).toBe('sunday');
    expect(ui.time.value).toBe('10:30');
    expect(ui.remove.hidden).toBe(false);
  });

  it('saves a weekly time in the browser time zone', async () => {
    const ui = await mount(true);
    expect(ui.day.hidden).toBe(true);
    expect(ui.remove.hidden).toBe(true);
    ui.frequency.value = 'weekly';
    ui.frequency.dispatchEvent(new Event('change'));
    expect(ui.day.hidden).toBe(false);
    ui.day.value = 'wednesday';
    ui.time.value = '18:15';
    const saved = {
      frequency: 'weekly',
      dayOfWeek: 'wednesday',
      preferredTime: '18:15',
      timezone: zone,
    };
    apiPut.mockResolvedValue({
      ok: true,
      status: 200,
      data: { schedule: { ...saved, isActive: true } },
    });
    ui.save.click();
    await flush();
    expect(apiPut).toHaveBeenCalledWith(SCHEDULE_PATH, saved);
    expect(toast.success).toHaveBeenCalledWith(t('familyIdentities.checkinSaved'));
    expect(ui.remove.hidden).toBe(false);
  });

  it('sends no day for a daily check-in', async () => {
    const ui = await mount(true);
    ui.time.value = '09:00';
    apiPut.mockResolvedValue({ ok: true, status: 200, data: { schedule: null } });
    ui.save.click();
    await flush();
    expect(apiPut).toHaveBeenCalledWith(SCHEDULE_PATH, {
      frequency: 'daily',
      preferredTime: '09:00',
      timezone: zone,
    });
  });

  it('removes the schedule', async () => {
    const ui = await mount(true, { frequency: 'daily', preferredTime: '08:00', timezone: 'UTC' });
    apiDelete.mockResolvedValue({ ok: true, status: 200, data: { schedule: null } });
    ui.remove.click();
    await flush();
    expect(apiDelete).toHaveBeenCalledWith(SCHEDULE_PATH);
    expect(toast.success).toHaveBeenCalledWith(t('familyIdentities.checkinRemoved'));
    expect(ui.remove.hidden).toBe(true);
    expect(ui.time.value).toBe('10:00');
  });

  it('says so when the save fails and keeps what was picked', async () => {
    const ui = await mount(true);
    ui.time.value = '07:45';
    apiPut.mockResolvedValue({ ok: false, status: 400, error: 'bad' });
    ui.save.click();
    await flush();
    expect(toast.error).toHaveBeenCalledWith(t('familyIdentities.checkinFailed'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(ui.time.value).toBe('07:45');
    expect(ui.save.disabled).toBe(false);
  });

  it('keeps an odd id inside its attribute', () => {
    const root = document.createElement('div');
    root.innerHTML = renderCallConsent('a"><img src=x>');
    expect(root.querySelector('img')).toBeNull();
    expect(
      root.querySelector<HTMLElement>('[data-checkin-schedule]')?.dataset.checkinSchedule
    ).toBe('a"><img src=x>');
  });
});
