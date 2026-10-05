import { describe, expect, it } from 'vitest';
import { localeFromAcceptLanguage } from '../detection/request.js';
import { localeForRequest, t, tFor } from '../index.js';

describe('localeFromAcceptLanguage', () => {
  it('takes the supported locale the app sent', () => {
    expect(localeFromAcceptLanguage('he')).toBe('he');
    expect(localeFromAcceptLanguage('zh-Hant')).toBe('zh-Hant');
    expect(localeFromAcceptLanguage('en-GB')).toBe('en-GB');
  });

  it('maps regional and script variants to the closest supported locale', () => {
    expect(localeFromAcceptLanguage('es-MX')).toBe('es');
    expect(localeFromAcceptLanguage('fr-CA,fr;q=0.9')).toBe('fr');
    expect(localeFromAcceptLanguage('zh-TW')).toBe('zh-Hant');
    expect(localeFromAcceptLanguage('zh-Hant-HK')).toBe('zh-Hant');
    expect(localeFromAcceptLanguage('zh-CN')).toBe('zh-Hans');
    expect(localeFromAcceptLanguage('en')).toBe('en-US');
    expect(localeFromAcceptLanguage('iw')).toBe('he');
  });

  it('honours q values and skips unsupported languages', () => {
    expect(localeFromAcceptLanguage('pt-BR,de;q=0.5,ja;q=0.8')).toBe('ja');
    expect(localeFromAcceptLanguage('ar;q=0,ko')).toBe('ko');
  });

  it('falls back to en-US for missing, wildcard or unknown headers', () => {
    expect(localeFromAcceptLanguage(undefined)).toBe('en-US');
    expect(localeFromAcceptLanguage('')).toBe('en-US');
    expect(localeFromAcceptLanguage('*')).toBe('en-US');
    expect(localeFromAcceptLanguage('xx-YY')).toBe('en-US');
  });
});

describe('tFor', () => {
  it('translates for the request locale without touching the global one', async () => {
    const locale = await localeForRequest('de');
    const key = 'hero.headline';
    const german = tFor(locale, key);
    expect(german).not.toBe(key);
    expect(german).not.toBe(tFor('en-US', key));
    // the process-wide locale is still English
    expect(t(key)).toBe(tFor('en-US', key));
  });

  it('falls back to en-US, then the key, when a string is missing', () => {
    expect(tFor('ja', 'definitely.not.a.key')).toBe('definitely.not.a.key');
  });
});
