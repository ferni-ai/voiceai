import { describe, expect, it } from 'vitest';
import {
  fieldValue,
  parseTurnReading,
  READING_FIELDS,
  TURN_READING_JSON_SCHEMA,
  withField,
} from '../schema.js';
import { carReading } from './fixtures.js';

describe('turn reading schema v0.1', () => {
  it('accepts a full reading, as an object or as model text around JSON', () => {
    expect(parseTurnReading(carReading())).toEqual(carReading());
    expect(parseTurnReading(`Here you go:\n${JSON.stringify(carReading())}\n`)).toEqual(
      carReading()
    );
  });

  it.each([
    ['not JSON', 'sure! the caller sounds happy'],
    ['truncated JSON', JSON.stringify(carReading()).slice(0, 80)],
    ['empty', ''],
    ['null', null],
    ['a number', 42],
    ['an unknown speech act', { ...carReading(), speech_act: 'rant' }],
    ['a missing field', (({ sarcasm: _s, ...rest }) => rest)(carReading())],
    ['an extra field', { ...carReading(), mood: 'happy' }],
    ['valence out of range', { ...carReading(), affect_text: { label: 'upbeat', valence: 3 } }],
    ['a fractional valence', { ...carReading(), affect_situation: { valence: -1.5 } }],
    [
      'a v0 affect object',
      { ...carReading(), affect: { label: 'low', valence: 0, arousal: 'low' } },
    ],
    [
      'a null claim kind',
      { ...carReading(), action_claim: { kind: null, tense: null, own_life: null } },
    ],
    ['a v0 crisis value', { ...carReading(), crisis_signal: 'ideation' }],
    [
      'a bad claim kind',
      { ...carReading(), action_claim: { kind: 'text', tense: 'past', own_life: true } },
    ],
    [
      'a date that is not a string',
      {
        ...carReading(),
        time_expressions: [
          { text: 'monday', kind: 'point', start_iso: 20261019, end_iso: null, relation: 'past' },
        ],
      },
    ],
    [
      'a time phrase with no relation',
      {
        ...carReading(),
        time_expressions: [{ text: 'monday', kind: 'point', start_iso: null, end_iso: null }],
      },
    ],
  ])('returns null without throwing for %s', (_name, raw) => {
    expect(() => parseTurnReading(raw)).not.toThrow();
    expect(parseTurnReading(raw)).toBeNull();
  });

  it('drops a date that is not ISO and keeps the rest of the reading', () => {
    const time = (start_iso: string, end_iso: string) =>
      carReading({
        time_expressions: [
          { text: 'after the surgery', kind: 'point', start_iso, end_iso, relation: 'future' },
        ],
      });
    expect(parseTurnReading(time("mom's surgery", 'next tuesday'))).toEqual(
      carReading({
        time_expressions: [
          {
            text: 'after the surgery',
            kind: 'point',
            start_iso: null,
            end_iso: null,
            relation: 'future',
          },
        ],
      })
    );
    for (const iso of [
      '2026-10-30',
      '2026-10-30T15:00',
      '2026-10-30T15:00:00Z',
      '2026-10-30T15:00:00.000-04:00',
    ])
      expect(parseTurnReading(time(iso, iso))?.time_expressions[0].start_iso).toBe(iso);
    for (const bad of ['2026-10-30 because of the surgery', 'Oct 30', '2026-10-30T3pm'])
      expect(parseTurnReading(time(bad, bad))?.time_expressions[0].start_iso).toBeNull();
  });

  it('gives the model a JSON schema Vertex accepts: no $schema, every field required, closed', () => {
    expect(TURN_READING_JSON_SCHEMA.$schema).toBeUndefined();
    expect(TURN_READING_JSON_SCHEMA.additionalProperties).toBe(false);
    expect([...(TURN_READING_JSON_SCHEMA.required as string[])].sort()).toEqual(
      Object.keys(carReading()).sort()
    );
  });

  it('reads and writes nested fields by path', () => {
    const r = carReading();
    expect(fieldValue(r, 'affect_text.label')).toBe('upbeat');
    expect(fieldValue(r, 'affect_situation.valence')).toBe(-1);
    expect(fieldValue(r, 'action_claim.kind')).toBe('none');
    const next = withField(r, 'action_claim.kind', 'send');
    expect(next.action_claim).toEqual({ kind: 'send', tense: null, own_life: null });
    expect(r.action_claim.kind).toBe('none'); // the original is not mutated
    expect(READING_FIELDS).toHaveLength(17); // the golden set's `agreed` keys
    expect(READING_FIELDS).toContain('action_claim.own_life');
    expect(READING_FIELDS.every((f) => fieldValue(r, f) !== undefined)).toBe(true);
  });
});
