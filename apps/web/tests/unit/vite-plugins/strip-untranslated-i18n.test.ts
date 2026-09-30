import { describe, expect, it } from 'vitest';
import { stripUntranslated, stripUntranslatedI18n } from '../../../vite-plugins/strip-untranslated-i18n';

describe('stripUntranslated', () => {
  it('drops placeholder strings and objects they leave empty, keeps real text', () => {
    expect(
      stripUntranslated({
        common: { save: 'Speichern', cancel: '[NEEDS_TRANSLATION] Cancel' },
        onlyPlaceholders: { a: '[NEEDS_TRANSLATION] A', b: { c: '[NEEDS_TRANSLATION] C' } },
        list: ['[NEEDS_TRANSLATION] kept in arrays'],
        count: 3,
      })
    ).toEqual({ common: { save: 'Speichern' }, list: ['[NEEDS_TRANSLATION] kept in arrays'], count: 3 });
  });

  it('keeps text that only mentions the marker later on', () => {
    expect(stripUntranslated({ note: 'See [NEEDS_TRANSLATION] docs' })).toEqual({ note: 'See [NEEDS_TRANSLATION] docs' });
  });
});

describe('stripUntranslatedI18n plugin', () => {
  const plugin = stripUntranslatedI18n();
  const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

  it('rewrites locale JSON files only', () => {
    const src = JSON.stringify({ a: 'Hallo', b: '[NEEDS_TRANSLATION] Bye' });
    expect(JSON.parse(transform(src, '/repo/apps/web/src/i18n/locales/de.json')!.code)).toEqual({ a: 'Hallo' });
    expect(transform(src, '/repo/apps/web/src/config/personas.generated.json')).toBeNull();
  });

  it('runs only for production builds', () => {
    expect(plugin.apply).toBe('build');
  });
});
