/**
 * The answer card strings exist only in en-US; every other locale must show
 * the English text, never a raw key like "answerCard.notFound".
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { initI18n, setLocale, t, type SupportedLocale } from '../src/i18n/index';

const EN = JSON.parse(
  readFileSync(join(__dirname, '..', 'src', 'i18n', 'locales', 'en-US.json'), 'utf8')
) as { answerCard: Record<string, string> };

afterAll(async () => {
  await setLocale('en-US', { reload: false });
});

describe('answerCard strings outside en-US', () => {
  it.each(['es', 'ja', 'ar', 'zh-Hant', 'en-GB'] as SupportedLocale[])(
    '%s falls back to English',
    async (locale) => {
      await initI18n();
      await setLocale(locale, { reload: false });
      for (const [key, english] of Object.entries(EN.answerCard)) {
        expect(t(`answerCard.${key}`)).toBe(english);
      }
    }
  );
});
