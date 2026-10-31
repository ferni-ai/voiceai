/**
 * The connect flow speaks every shipped language (connect polish C1b). #3016
 * left the new keys as [NEEDS_TRANSLATION], so a German caller saw "Still
 * reaching Ferni…" under "Zum Abbrechen tippen", and es/he still said
 * "Disconnect" on the end button. Each key below must be a real translation in
 * every locale, keep the {name} the code fills in, and use a real "…".
 *
 * Not covered: tryFirst.* (the sign-in gate) and callRoom.* (flag off) exist in
 * English only; they fall back to en-US until those namespaces are localised.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES_DIR = join(__dirname, '..', 'src', 'i18n', 'locales');
const LOCALES = readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json'));

/** Key → the placeholders it must keep */
const KEYS: Record<string, readonly string[]> = {
  'entrance.connectingNow': ['{name}'],
  'entrance.connectingCancel': ['{name}'],
  'entrance.stillCalling': ['{name}'],
  'entrance.stillCallingCancel': ['{name}'],
  'entrance.reconnecting': [],
  'entrance.endTalk': [],
  'entrance.arrived': ['{name}'],
  'session.untilNextTime': [],
  'session.ending': [],
  'session.goodbyeEndCall': [],
};

/** Old meanings that must not come back ("Disconnect", the network-y "Connecting") */
const STALE: Record<string, Record<string, string>> = {
  'es.json': { 'entrance.endTalk': 'Desconectar' },
  'he.json': { 'entrance.endTalk': 'ניתוק' },
};

function valueOf(locale: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    return typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined;
  }, locale);
}

const load = (file: string): unknown => JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8'));

describe('connect copy is translated', () => {
  it('covers all 11 locales', () => {
    expect(LOCALES).toHaveLength(11);
  });

  for (const file of LOCALES) {
    describe(file, () => {
      const locale = load(file);

      it('has every key, translated', () => {
        const bad = Object.keys(KEYS).filter((key) => {
          const value = valueOf(locale, key);
          return typeof value !== 'string' || value.trim() === '' || value.includes('[NEEDS_TRANSLATION]');
        });
        expect(bad).toEqual([]);
      });

      it('keeps {name} where the code fills it in, and adds no other placeholder', () => {
        for (const [key, placeholders] of Object.entries(KEYS)) {
          const value = String(valueOf(locale, key));
          expect(value.match(/\{\w+\}/g) ?? [], key).toEqual(placeholders);
        }
      });

      it('uses a real "…", never three dots', () => {
        const dotted = Object.keys(KEYS).filter((key) => String(valueOf(locale, key)).includes('...'));
        expect(dotted).toEqual([]);
      });

      it('has no stale meaning left', () => {
        for (const [key, stale] of Object.entries(STALE[file] ?? {})) {
          expect(valueOf(locale, key), key).not.toBe(stale);
        }
        // Removed: no callers. A key nobody reads only drifts.
        expect(valueOf(locale, 'app.connecting')).toBeUndefined();
        expect(valueOf(locale, 'session.endConversationGoodbye')).toBeUndefined();
      });

      it('does not translate the persona name', () => {
        // The name only ever arrives through {name}; none is spelled out here.
        for (const key of Object.keys(KEYS)) {
          expect(String(valueOf(locale, key)), key).not.toMatch(/Ferni|Maya|Jordan|Alex|Peter|Nayan/);
        }
      });
    });
  }

  it('en-US is the copy Seth approved', () => {
    const en = load('en-US.json');
    expect(valueOf(en, 'entrance.connectingNow')).toBe('Calling {name}…');
    expect(valueOf(en, 'entrance.stillCalling')).toBe('Still reaching {name}…');
    expect(valueOf(en, 'entrance.reconnecting')).toBe('Reconnecting…');
    expect(valueOf(en, 'entrance.endTalk')).toBe('End call');
    expect(valueOf(en, 'entrance.arrived')).toBe('{name} is here');
    expect(valueOf(en, 'session.untilNextTime')).toBe('Until next time');
    expect(valueOf(en, 'session.ending')).toBe('Call ended');
  });
});
