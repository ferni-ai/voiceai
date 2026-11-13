/**
 * The call's language tags reach the hello: token.ts dispatches `locale` (the app's chosen
 * language, else the IP's, else en-US) and `locales`; callLocales reads them for
 * STRANGER_GREETING_EASY, which is English-only (first-call-stranger.ts).
 * A phone call dispatches neither, so it carries none.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const { applyCallOrigin } = await import('../metadata-parser.js');
const { easyStrangerDirection, EASY_QUESTION, STRANGER_GREETING_DIRECTION } =
  await import('../../multi-agent/first-call-stranger.js');

/** The language tags applyCallOrigin puts on userData for this dispatch metadata. */
function callLocales(metadata: Record<string, unknown>): string[] {
  const userData: Record<string, unknown> = {};
  applyCallOrigin(userData, metadata);
  return userData.callerLocales as string[];
}

const ON = { STRANGER_GREETING_EASY: 'on' };
/** True when an on flag gives these tags the easy hello. */
const easy = (tags: string[]) =>
  easyStrangerDirection(STRANGER_GREETING_DIRECTION, ON, tags).includes(EASY_QUESTION);

describe('callLocales', () => {
  it('reads locale first, then locales, without duplicates', () => {
    expect(callLocales({ locale: 'en-US', locales: ['en-US', 'es-US'] })).toEqual([
      'en-US',
      'es-US',
    ]);
    expect(callLocales({ locale: 'es-MX', locales: ['es-MX'] })).toEqual(['es-MX']);
  });

  it("token.ts's default (en-US for both) reads as an English call", () => {
    const tags = callLocales({ locale: 'en-US', locales: ['en-US'] });
    expect(tags).toEqual(['en-US']);
    expect(easy(tags)).toBe(true);
  });

  it('a Spanish app language leads, so the call is not English-only', () => {
    const tags = callLocales({ locale: 'es-US', locales: ['es-US', 'en-US'] });
    expect(easy(tags)).toBe(false);
  });

  it('a phone call (no locale, no locales) has no tags, so it is not an English call', () => {
    const tags = callLocales({ type: 'inbound_call' });
    expect(tags).toEqual([]);
    expect(easy(tags)).toBe(false);
  });

  it('drops non-string and empty values, trims, and keeps everything else', () => {
    expect(
      callLocales({ locale: 42, locales: [' en-US ', '', '  ', null, 7, 'es_ES', 'pt-BR'] })
    ).toEqual(['en-US', 'es_ES', 'pt-BR']);
    expect(callLocales({ locales: 'en-US' })).toEqual([]);
  });

  it.each([
    ['underscore region', { locale: 'en_GB', locales: ['en_GB'] }, true],
    ['padded and upper case', { locale: ' EN-us ' }, true],
    ['an underscore Spanish tag beside English', { locale: 'en-US', locales: ['es_MX'] }, false],
    ['a malformed tag beside English', { locale: 'en-US', locales: ['espanol'] }, false],
    ['"end"', { locale: 'end' }, false],
    ['"english"', { locale: 'english' }, false],
    ['only junk values', { locale: 42, locales: [null, ''] }, false],
  ])('%s: whether the call gets the easy hello', (_name, metadata, expected) => {
    expect(easy(callLocales(metadata))).toBe(expected);
  });
});

describe('applyCallOrigin', () => {
  it('puts the tags and the IP city on userData', () => {
    const userData: Record<string, unknown> = {};
    applyCallOrigin(userData, {
      locale: 'es-MX',
      locales: ['es-MX'],
      city: 'Springfield',
      regionCode: 'XX',
      countryCode: 7,
    });
    expect(userData.callerLocales).toEqual(['es-MX']);
    expect(userData.userLocation).toEqual({
      city: 'Springfield',
      regionCode: 'XX',
      countryCode: undefined,
    });
  });

  it('a phone call (no tags, no city) sets empty tags and no location', () => {
    const userData: Record<string, unknown> = {};
    applyCallOrigin(userData, { type: 'inbound_call' });
    expect(userData.callerLocales).toEqual([]);
    expect('userLocation' in userData).toBe(false);
  });
});

describe('the entrypoint puts the origin on userData', () => {
  it('calls applyCallOrigin with the dispatch metadata', () => {
    const entry = readFileSync(fileURLToPath(new URL('../index.ts', import.meta.url)), 'utf8');
    expect(entry).toMatch(/applyCallOrigin\(userData, metadata\)/);
  });
});
