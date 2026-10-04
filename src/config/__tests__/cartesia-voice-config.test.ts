import { describe, expect, it } from 'vitest';
import { CARTESIA_SNAPSHOT, cartesiaPronunciation, pinCartesiaModel } from '../voice-ids.js';

describe('pinCartesiaModel', () => {
  it('pins the moving sonic-3.6 alias (or nothing) to the dated snapshot', () => {
    expect(pinCartesiaModel('sonic-3.6')).toBe(CARTESIA_SNAPSHOT);
    expect(pinCartesiaModel(undefined)).toBe(CARTESIA_SNAPSHOT);
    expect(CARTESIA_SNAPSHOT).toMatch(/^sonic-3\.6-\d{4}-\d{2}-\d{2}$/);
  });

  it('keeps an explicitly chosen model', () => {
    expect(pinCartesiaModel('sonic-preview')).toBe('sonic-preview');
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
