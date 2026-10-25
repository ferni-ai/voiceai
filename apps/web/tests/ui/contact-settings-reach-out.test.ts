/**
 * How I reach you: "Ferni can reach out", the on/off switch every sender obeys.
 *
 * PR #2783 removed a push-only "Ferni Check-ins" switch nothing read. The real
 * setting is the outreach consent's on/off (POST /api/outreach/pause and /resume),
 * and it pauses the check-ins and calls Ferni starts on its own (not reminders they set,
 * nor what they ask for), so this switch says so. It shows what the server
 * has (GET /api/outreach/preferences `outreachEnabled`), never a guess.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const enUS = JSON.parse(
  readFileSync(resolve(__dirname, '../../src/i18n/locales/en-US.json'), 'utf8')
) as { contactSettings: Record<string, string> };

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet, apiPost }));
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
const reachSwitch = (): HTMLButtonElement | null => document.querySelector('#reach-out-switch');
const posted = (): string[] => apiPost.mock.calls.map(([url]) => url as string);

/** The server's answers, with outreach on/off as given (undefined: the field is missing). */
function serverSays(outreachEnabled: boolean | undefined, preferencesOk = true): void {
  apiGet.mockImplementation(async (url: string) => {
    if (url === '/api/user/contact') {
      return {
        ok: true,
        status: 200,
        data: { success: true, contactInfo: { verifiedPhone: '+15551234567' } },
      };
    }
    if (url === '/api/outreach/preferences') {
      return preferencesOk
        ? {
            ok: true,
            status: 200,
            data: { success: true, allowedChannels: ['sms'], outreachEnabled },
          }
        : { ok: false, status: 500, error: 'boom' };
    }
    return { ok: true, status: 200, data: { success: true, preferences: {} } };
  });
}

let close: () => void;
async function open(): Promise<void> {
  vi.resetModules();
  await (await import('../../src/i18n/index.js')).initI18n();
  const mod = await import('../../src/ui/contact-settings.ui.js');
  close = mod.close;
  await mod.openContactSettings();
  await flush();
}

beforeEach(() => {
  document.body.textContent = '';
  apiPost.mockResolvedValue({ ok: true, status: 200, data: { success: true } });
});
afterEach(() => {
  close?.();
  vi.clearAllMocks();
});

describe('How I reach you: Ferni can reach out', () => {
  it.each([true, false])('shows the server state on open (outreachEnabled=%s)', async (on) => {
    serverSays(on);
    await open();

    const sw = reachSwitch();
    expect(sw?.getAttribute('role')).toBe('switch');
    expect(sw?.getAttribute('aria-checked')).toBe(String(on));
    expect(sw?.classList.contains('active')).toBe(on);
    expect(apiGet).toHaveBeenCalledWith('/api/outreach/preferences');
  });

  it('says what it really controls: what Ferni starts on its own, not your reminders', async () => {
    serverSays(true);
    await open();

    const label = document.getElementById(reachSwitch()!.getAttribute('aria-labelledby')!);
    const desc = document.getElementById(reachSwitch()!.getAttribute('aria-describedby')!);
    expect(label?.textContent?.trim()).toBe('Ferni can reach out');
    expect(desc?.textContent?.trim()).toBe(
      'Check-ins and calls Ferni starts on its own. Your own reminders still come through.'
    );
    expect(enUS.contactSettings.reachOut).toBe('Ferni can reach out');
    expect(enUS.contactSettings.reachOutDesc).toBe(
      'Check-ins and calls Ferni starts on its own. Your own reminders still come through.'
    );
    expect(`${label?.textContent} ${desc?.textContent}`).not.toMatch(/\bAI\b/);
  });

  it('switching off pauses, switching on resumes', async () => {
    serverSays(true);
    await open();

    reachSwitch()!.click();
    await flush();
    expect(posted()).toEqual(['/api/outreach/pause']);
    expect(reachSwitch()!.getAttribute('aria-checked')).toBe('false');

    reachSwitch()!.click();
    await flush();
    expect(posted()).toEqual(['/api/outreach/pause', '/api/outreach/resume']);
    expect(reachSwitch()!.getAttribute('aria-checked')).toBe('true');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('a failed save puts the switch back and shows the error toast', async () => {
    serverSays(false);
    await open();
    apiPost.mockResolvedValueOnce({ ok: false, status: 500, error: 'boom' });

    reachSwitch()!.click();
    await flush();

    expect(posted()).toEqual(['/api/outreach/resume']);
    expect(reachSwitch()!.getAttribute('aria-checked')).toBe('false');
    expect(reachSwitch()!.classList.contains('active')).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Couldn't save that. Try again?");
  });

  it('a request that throws is a failure too', async () => {
    serverSays(true);
    await open();
    apiPost.mockRejectedValueOnce(new Error('offline'));

    reachSwitch()!.click();
    await flush();

    expect(reachSwitch()!.getAttribute('aria-checked')).toBe('true');
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the server did not answer', undefined, false],
    ['the server sent no on/off', undefined, true],
  ])('no switch when %s: it never guesses', async (_why, on, ok) => {
    serverSays(on, ok);
    await open();
    expect(reachSwitch()).toBeNull();
  });
});
