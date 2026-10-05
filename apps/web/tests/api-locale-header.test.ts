/**
 * API copy (sanctuary practices, quiz questions, practice view) is written by
 * the server, so every API call must say which language the app is in.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/firebase-auth.service.js', () => ({
  getAuthToken: vi.fn(async () => null),
  getFirebaseUid: vi.fn(() => null),
  initAuth: vi.fn(async () => undefined),
}));

const i18n = await import('../src/i18n/index.js');
const api = await import('../src/utils/api.js');
const helpers = await import('../src/utils/api-helpers.js');

afterEach(async () => {
  await i18n.setLocale('en-US', { reload: false });
});

describe('API requests carry the app locale', () => {
  it('sends Accept-Language from both header builders', async () => {
    await i18n.setLocale('de', { reload: false });
    expect((api.getApiHeaders() as Record<string, string>)['Accept-Language']).toBe('de');
    expect(helpers.getApiHeaders()['Accept-Language']).toBe('de');
  });

  it('follows a locale change', async () => {
    await i18n.setLocale('he', { reload: false });
    expect((await api.getApiHeadersAsync(false) as Record<string, string>)['Accept-Language']).toBe('he');
    expect((await helpers.getApiHeadersAsync())['Accept-Language']).toBe('he');
  });
});
