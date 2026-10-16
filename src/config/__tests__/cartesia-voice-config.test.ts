import { describe, expect, it } from 'vitest';
import {
  CARTESIA_API_VERSION_PINNED,
  CARTESIA_SNAPSHOT,
  cartesiaPronunciation,
  pinCartesiaApiVersion,
  pinCartesiaModel,
} from '../voice-ids.js';

describe('pinCartesiaModel', () => {
  it('pins the moving sonic-3.6 alias (or nothing) to the dated snapshot', () => {
    expect(pinCartesiaModel('sonic-3.6')).toBe(CARTESIA_SNAPSHOT);
    expect(pinCartesiaModel(undefined)).toBe(CARTESIA_SNAPSHOT);
    expect(pinCartesiaModel('  ')).toBe(CARTESIA_SNAPSHOT);
    expect(CARTESIA_SNAPSHOT).toMatch(/^sonic-3\.6-\d{4}-\d{2}-\d{2}$/);
  });

  it('replaces deprecated aliases and retired models with the snapshot', () => {
    // sonic-3-latest is what the repo .env set: it now serves the beta sonic-preview.
    for (const id of ['sonic-3-latest', 'sonic-latest', 'sonic-preview', 'sonic-3', 'sonic-3-2025-10-27', 'sonic-2-2025-03-07', 'sonic-english']) {
      expect(pinCartesiaModel(id), id).toBe(CARTESIA_SNAPSHOT);
    }
  });

  it('keeps an explicitly chosen dated 3.6+ snapshot', () => {
    expect(pinCartesiaModel('sonic-3.7-2026-12-01')).toBe('sonic-3.7-2026-12-01');
  });
});

describe('pinCartesiaApiVersion', () => {
  it('defaults to 2026-08-14 and ignores older or malformed overrides', () => {
    expect(CARTESIA_API_VERSION_PINNED).toBe('2026-08-14');
    expect(pinCartesiaApiVersion(undefined)).toBe('2026-08-14');
    expect(pinCartesiaApiVersion('2024-06-10')).toBe('2026-08-14');
    expect(pinCartesiaApiVersion('latest')).toBe('2026-08-14');
    expect(pinCartesiaApiVersion('2026-12-01')).toBe('2026-12-01');
  });
});

describe('cartesiaPronunciation', () => {
  it('adds the dictionary id only when one is configured', () => {
    expect(cartesiaPronunciation({ CARTESIA_PRONUNCIATION_DICT_ID: 'pdict_abc' })).toEqual({
      pronunciation_dict_id: 'pdict_abc',
    });
    expect(cartesiaPronunciation({})).toEqual({});
    expect(cartesiaPronunciation({ CARTESIA_PRONUNCIATION_DICT_ID: '  ' })).toEqual({});
  });
});
