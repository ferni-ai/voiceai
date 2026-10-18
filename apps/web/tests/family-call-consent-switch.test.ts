/**
 * The "they're happy to hear from Ferni" switch shows what the server has,
 * saves each change, and rolls back with a toast when a save or load fails.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiDelete = vi.fn();
vi.mock('../src/utils/api.js', () => ({ apiGet, apiPost, apiPut: vi.fn(), apiDelete }));
const toast = { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() };
vi.mock('../src/ui/whisper.ui.js', () => ({ toast }));

const { mountCallConsent, renderCallConsent } = await import('../src/ui/family-call-consent.ui.js');
const { t } = await import('../src/i18n/index.js');

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount(agreed: boolean | null) {
  apiGet.mockResolvedValue(
    agreed === null
      ? { ok: false, status: 500, error: 'boom' }
      : { ok: true, status: 200, data: { agreed } }
  );
  const root = document.createElement('div');
  root.innerHTML = renderCallConsent('mom-id');
  await mountCallConsent(root);
  return root.querySelector<HTMLInputElement>('.family-call-consent__switch')!;
}

afterEach(() => vi.clearAllMocks());

describe('the call-consent switch', () => {
  it('shows what the server has', async () => {
    const input = await mount(true);
    expect(apiGet).toHaveBeenCalledWith('/api/sponsored-identities/mom-id/call-consent');
    expect(input.checked).toBe(true);
    expect(input.disabled).toBe(false);
  });

  it('saves a confirm', async () => {
    const input = await mount(false);
    apiPost.mockResolvedValue({ ok: true, status: 200, data: { agreed: true } });
    input.checked = true;
    input.dispatchEvent(new Event('change'));
    await flush();
    expect(apiPost).toHaveBeenCalledWith('/api/sponsored-identities/mom-id/call-consent');
    expect(input.checked).toBe(true);
    expect(toast.success).toHaveBeenCalledWith(t('familyIdentities.callConsentSaved'));
  });

  it('saves a withdraw', async () => {
    const input = await mount(true);
    apiDelete.mockResolvedValue({ ok: true, status: 200, data: { agreed: false } });
    input.checked = false;
    input.dispatchEvent(new Event('change'));
    await flush();
    expect(apiDelete).toHaveBeenCalledWith('/api/sponsored-identities/mom-id/call-consent');
    expect(input.checked).toBe(false);
  });

  it('rolls back and says so when the save fails', async () => {
    const input = await mount(false);
    apiPost.mockResolvedValue({ ok: false, status: 503, error: 'down' });
    input.checked = true;
    input.dispatchEvent(new Event('change'));
    await flush();
    expect(input.checked).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(t('familyIdentities.callConsentFailed'));
  });

  it('keeps an odd id inside its attribute', () => {
    const root = document.createElement('div');
    root.innerHTML = renderCallConsent('a"><img src=x>');
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector<HTMLElement>('[data-call-consent]')?.dataset.callConsent).toBe(
      'a"><img src=x>'
    );
  });

  it('stays off and says so when loading fails', async () => {
    const input = await mount(null);
    expect(input.disabled).toBe(true);
    expect(toast.error).toHaveBeenCalledWith(t('familyIdentities.callConsentLoadFailed'));
  });
});
