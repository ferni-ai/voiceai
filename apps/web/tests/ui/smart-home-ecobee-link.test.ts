/**
 * Smart home settings: the Ecobee PIN flow finishes.
 *
 * Before: the panel waited for { authorized: true } from
 * /api/ecobee/link/status, but the server answers { status: 'connected' |
 * 'pending' | 'expired' | 'no_pending_auth' }, so the flow never completed;
 * an expired PIN said nothing, and Cancel left the poll running.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('../../src/utils/api.js', () => ({
  apiGet: (...a: unknown[]) => apiGet(...a),
  apiPost: (...a: unknown[]) => apiPost(...a),
  apiDelete: vi.fn(),
}));

const toast = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast }));

const smartHome = await import('../../src/ui/smart-home-settings.ui.js');

let linkStatus: string;
const statusPolls = () => apiGet.mock.calls.filter(([path]) => path === '/api/ecobee/link/status').length;

function serve(): void {
  apiGet.mockImplementation(async (path: string) => {
    if (path === '/api/ecobee/link/status') return { ok: true, status: 200, data: { status: linkStatus } };
    return { ok: false, status: 404 };
  });
  apiPost.mockImplementation(async (path: string) => {
    if (path === '/api/ecobee/link/start') return { ok: true, status: 200, data: { pin: 'AB12', expiresIn: 600 } };
    return { ok: false, status: 404 };
  });
}

const buttonWithText = (text: string): HTMLButtonElement | undefined =>
  [...document.querySelectorAll<HTMLButtonElement>('.smart-home-settings button')].find((b) =>
    b.textContent?.includes(text)
  );

/** Open the panel, pick Ecobee, enter a key and press Connect: the panel is then waiting on the PIN. */
async function startEcobeePin(onConnected = vi.fn()): Promise<void> {
  await smartHome.showSmartHomeSettings({ onConnected });
  const card = await vi.waitFor(() => {
    const found = [...document.querySelectorAll<HTMLElement>('.smart-home-settings__card')].find((c) =>
      c.textContent?.includes('Ecobee')
    );
    if (!found) throw new Error('no Ecobee card yet');
    return found;
  });
  card.click();
  document.querySelector<HTMLButtonElement>('.smart-home-settings__step-content .smart-home-settings__btn--secondary')?.click();
  const input = document.querySelector<HTMLInputElement>('.smart-home-settings__input');
  if (!input) throw new Error('no API key input');
  input.value = 'key-123';
  document.querySelector<HTMLButtonElement>('.smart-home-settings__step-content .smart-home-settings__btn--primary')?.click();
  await vi.waitFor(() => expect(document.querySelector('.smart-home-settings__hint')).not.toBeNull());
}

describe('Ecobee PIN link in smart home settings', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    apiGet.mockReset();
    apiPost.mockReset();
    Object.values(toast).forEach((fn) => fn.mockReset());
    window.open = vi.fn() as typeof window.open;
    document.body.replaceChildren();
    linkStatus = 'pending';
    serve();
  });

  afterEach(async () => {
    smartHome.hideSmartHomeSettings();
    await new Promise((r) => setTimeout(r, 400));
    vi.useRealTimers();
  });

  it('finishes when the server says connected', async () => {
    const onConnected = vi.fn();
    await startEcobeePin(onConnected);

    linkStatus = 'connected';
    await vi.advanceTimersByTimeAsync(3000);

    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledWith('ecobee'));
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('says the PIN expired and stops polling', async () => {
    await startEcobeePin();

    linkStatus = 'expired';
    await vi.advanceTimersByTimeAsync(3000);
    await vi.waitFor(() => expect(toast.warning).toHaveBeenCalledWith('PIN expired. Try again?'));

    const polls = statusPolls();
    await vi.advanceTimersByTimeAsync(9000);
    expect(statusPolls()).toBe(polls);
  });

  it('stops polling when the user cancels', async () => {
    await startEcobeePin();

    buttonWithText('Cancel')?.click();
    await vi.advanceTimersByTimeAsync(9000);

    expect(statusPolls()).toBe(0);
  });

  it('stops polling when the panel closes', async () => {
    await startEcobeePin();

    smartHome.hideSmartHomeSettings();
    await vi.advanceTimersByTimeAsync(9000);

    expect(statusPolls()).toBe(0);
  });
});
