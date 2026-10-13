/**
 * A page that boots straight into a non-English locale (the saved preference,
 * as after setLocale's reload) must still fall back to en-US for keys the
 * locale hasn't translated, never show the raw key. Only the chosen locale
 * used to load, so the fallback chain had nothing to read and the signed-in
 * locale walk saw "aiLabel.companion" on the home screen (2026-10-11).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  localStorage.removeItem('ferni_locale');
});

describe('cold start in a non-English locale', () => {
  it.each(['es', 'he', 'zh-Hant'])('%s shows English for an untranslated key', async (locale) => {
    localStorage.setItem('ferni_locale', locale);
    vi.resetModules(); // a fresh page: nothing loaded yet
    const i18n = await import('../src/i18n/index');
    await i18n.initI18n();
    expect(i18n.getLocale()).toBe(locale);
    // "" in every non-English locale today: the runtime treats it as missing
    expect(i18n.t('aiLabel.companion')).toBe('AI companion');
  });
});
