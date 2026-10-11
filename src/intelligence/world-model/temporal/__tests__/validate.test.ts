/**
 * The WorldObservation gate: other teams write into the sink, so it trusts nothing.
 */

import { describe, expect, it } from 'vitest';
import type { WorldObservation } from '../types.js';
import { isDay } from '../types.js';
import { MAX_VALUE_CHARS, validObservation } from '../validate.js';

const good: WorldObservation = {
  subject: 'Mindy',
  subjectKind: 'person',
  relation: 'sister',
  attribute: 'Event',
  value: 'knee  surgery',
  eventDate: '2026-10-13',
  observedAt: '2026-10-10T14:00:00-04:00',
  confidence: 0.9,
  source: { kind: 'summary', sessionId: 's1', quote: 'her knee surgery is Tuesday' },
};

describe('validObservation', () => {
  it('keeps a well-formed observation, normalised', () => {
    expect(validObservation(good, 'fallback')).toEqual({
      ...good,
      attribute: 'event',
      value: 'knee surgery',
      observedAt: '2026-10-10T18:00:00.000Z',
    });
  });

  it('drops what cannot be stored', () => {
    for (const bad of [
      null,
      'Mindy',
      { ...good, subject: '  ' },
      { ...good, value: undefined },
      { ...good, subjectKind: 'pet' },
      { ...good, observedAt: 'last Tuesday' },
      { ...good, value: 'said she wants to end my life' },
      { ...good, subject: 'Ferni' },
      { ...good, subject: 'They' },
      { ...good, subject: 'the AI' },
    ]) {
      expect(validObservation(bad, 's1')).toBeNull();
    }
    expect(
      validObservation({ ...good, subject: 'self', subjectKind: 'self' }, 's1')
    ).not.toBeNull();
  });

  it('removes a date that is not a real day, clamps confidence, caps text', () => {
    const kept = validObservation(
      { ...good, eventDate: 'Tuesday', since: '2026-02-31', confidence: 7, value: 'x'.repeat(900) },
      's1'
    );
    expect(kept?.eventDate).toBeUndefined();
    expect(kept?.since).toBeUndefined();
    expect(kept?.confidence).toBe(1);
    expect(kept?.value).toHaveLength(MAX_VALUE_CHARS);
    expect(validObservation({ ...good, confidence: Number.NaN }, 's1')?.confidence).toBe(0.5);
    expect(validObservation({ ...good, confidence: -3 }, 's1')?.confidence).toBe(0);
  });

  it('fills a missing source and keeps a clean replaces hint', () => {
    const kept = validObservation(
      { ...good, source: undefined, replaces: { attribute: ' Job ', priorValue: '' } },
      'call-9'
    );
    expect(kept?.source).toEqual({ kind: 'summary', sessionId: 'call-9' });
    expect(kept?.replaces).toEqual({ attribute: 'job' });
    expect(
      validObservation({ ...good, replaces: { priorValue: 'x' } }, 's1')?.replaces
    ).toBeUndefined();
  });
});

describe('isDay', () => {
  it('accepts only real calendar days', () => {
    expect(isDay('2026-10-13')).toBe(true);
    expect(isDay('2028-02-29')).toBe(true);
    for (const bad of ['2026-02-31', '2026-13-01', 'Tuesday', '2026-10-13T00:00:00Z', 20261013]) {
      expect(isDay(bad)).toBe(false);
    }
  });
});
