/**
 * "How I reach you": Save never writes quiet hours it didn't load.
 *
 * Before: when GET /api/user/preferences failed (apiGet answers { ok: false }, it
 * never throws), the quiet fields stayed undefined and Save posted '22:00'/'08:00'
 * over the person's saved window, then said "Saved! I'll stay quiet…". A Save that
 * only changed the name was enough. An unchanged window loaded earlier also went back
 * on every Save, undoing a newer change made by voice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../src/config/animation-constants.js', () => ({
  DURATION: { FAST: 150, NORMAL: 200, SLOW: 300 },
  EASING: { EXPO_OUT: 'ease-out', SPRING: 'ease-out', EASE_IN_OUT: 'ease-in-out' },
}));
vi.mock('../../src/services/firebase-auth.service.js', () => ({
  getAuthState: () => ({ isAuthenticated: true, userId: 'riley-test' }),
}));
const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet, apiPost }));

const CONTACT = { email: 'riley@example.com', preferredName: 'Riley', timezone: 'America/Chicago' };
const SAVED = { timezone: 'America/Chicago', quietHoursStart: '23:00', quietHoursEnd: '06:00' };
const DOWN = { ok: false, status: 503, error: 'Service Unavailable' };

const settle = () => new Promise((r) => setTimeout(r, 50));
const prefsPosts = () => apiPost.mock.calls.filter(([url]) => url === '/api/user/preferences');
const quietFieldsPosted = () =>
  apiPost.mock.calls.filter(([, body]) => 'quietHoursStart' in body || 'quietHoursEnd' in body);

function answer(contact: unknown, prefs: unknown): void {
  apiGet.mockImplementation(async (url: string) => {
    if (url === '/api/user/contact') return contact;
    if (url === '/api/user/preferences') return prefs;
    return { ok: true, status: 200, data: {} };
  });
}
const ok = (data: object) => ({ ok: true, status: 200, data: { success: true, ...data } });

let close: () => void;
async function open(): Promise<void> {
  vi.resetModules();
  const ui = await import('../../src/ui/contact-settings.ui.js');
  close = ui.close;
  await ui.openContactSettings();
  await settle();
}
function rename(to: string): void {
  const name = document.querySelector<HTMLInputElement>('#name-input')!;
  name.value = to;
  name.dispatchEvent(new Event('input'));
}
async function save(): Promise<void> {
  document.querySelector<HTMLElement>('#save-btn')!.click();
  await settle();
}

beforeEach(() => {
  document.body.textContent = '';
  apiPost.mockResolvedValue({ ok: true, status: 200, data: { success: true } });
});
afterEach(() => {
  close?.();
  vi.clearAllMocks();
});

describe('quiet hours that did not load', () => {
  it('prefs load fails, the name is edited, Save posts no quiet fields and the name still saves', async () => {
    answer(ok({ contactInfo: CONTACT }), DOWN);
    await open();
    rename('Riley Test');
    await save();

    expect(apiPost).toHaveBeenCalledWith(
      '/api/user/contact',
      expect.objectContaining({ preferredName: 'Riley Test' })
    );
    expect(quietFieldsPosted()).toEqual([]);
    expect(prefsPosts()).toEqual([]);
    expect(document.querySelector('.contact-settings-success')?.textContent).not.toMatch(/quiet/i);
  });

  it('says it could not load them and locks the controls instead of showing a made-up window', async () => {
    answer(ok({ contactInfo: CONTACT }), DOWN);
    await open();
    expect(document.querySelector('#quiet-note')?.textContent).toMatch(
      /couldn't load your quiet hours/
    );
    expect(document.querySelector<HTMLSelectElement>('#quiet-start')?.disabled).toBe(true);
    expect(document.querySelector<HTMLSelectElement>('#quiet-end')?.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('#quiet-hours-toggle')?.disabled).toBe(true);
  });

  it('the contact load fails: Save posts no quiet fields either', async () => {
    answer(DOWN, ok({ preferences: SAVED }));
    await open();
    rename('Riley Test');
    await save();
    expect(quietFieldsPosted()).toEqual([]);
  });
});

describe('quiet hours that loaded', () => {
  it('an unchanged window is not sent back, so it cannot undo a newer voice change', async () => {
    answer(ok({ contactInfo: CONTACT }), ok({ preferences: SAVED }));
    await open();
    rename('Riley Test');
    await save();
    expect(quietFieldsPosted()).toEqual([]);
    expect(document.querySelector('.contact-settings-success')).not.toBeNull();
  });

  it('a window changed here is sent whole', async () => {
    answer(ok({ contactInfo: CONTACT }), ok({ preferences: SAVED }));
    await open();
    const start = document.querySelector<HTMLSelectElement>('#quiet-start')!;
    expect(start.disabled).toBe(false);
    start.value = '21:00';
    start.dispatchEvent(new Event('change'));
    await save();
    expect(prefsPosts()).toEqual([
      [
        '/api/user/preferences',
        { timezone: 'America/Chicago', quietHoursStart: '21:00', quietHoursEnd: '06:00' },
      ],
    ]);
  });

  it('a changed window the server refused is not claimed as saved', async () => {
    answer(ok({ contactInfo: CONTACT }), ok({ preferences: SAVED }));
    apiPost.mockImplementation(async (url: string) =>
      url === '/api/user/preferences' ? DOWN : { ok: true, status: 200, data: { success: true } }
    );
    await open();
    const end = document.querySelector<HTMLSelectElement>('#quiet-end')!;
    end.value = '07:00';
    end.dispatchEvent(new Event('change'));
    await save();
    expect(document.querySelector('.contact-settings-error')?.textContent).toMatch(
      /not your quiet hours/
    );
  });
});
