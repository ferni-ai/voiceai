import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { disagreements, readingForLog, type RulesRead } from '../compare.js';
import { isoDateOrNull, TURN_READING_ZOD, type TurnReading } from '../schema.js';
import { carReading } from './fixtures.js';

/**
 * A reading built from the schema itself, with every free-text string (the
 * time phrase, its dates, the name: any string field added later too) set to
 * caller words; `labels` collects every enum label the schema allows.
 */
function readingOfCallerWords(): { reading: TurnReading; words: string[]; labels: Set<string> } {
  const words: string[] = [];
  const labels = new Set<string>();
  const fill = (schema: z.ZodType): unknown => {
    if (schema instanceof z.ZodString) {
      words.push(`mom's surgery ${words.length}`);
      return words[words.length - 1];
    }
    if (schema instanceof z.ZodEnum) {
      for (const o of schema.options) labels.add(String(o));
      return schema.options[0];
    }
    if (schema instanceof z.ZodBoolean) return true;
    if (schema instanceof z.ZodNumber) return 0;
    if (schema instanceof z.ZodNullable) return fill(schema.unwrap() as z.ZodType);
    if (schema instanceof z.ZodPipe) return fill(schema.out as z.ZodType);
    if (schema instanceof z.ZodArray) return [fill(schema.element as z.ZodType)];
    if (schema instanceof z.ZodObject)
      return Object.fromEntries(
        Object.entries(schema.shape).map(([k, v]) => [k, fill(v as z.ZodType)])
      );
    throw new Error(`no filler for a ${schema.def.type} field`);
  };
  return { reading: fill(TURN_READING_ZOD) as TurnReading, words, labels };
}

function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
  return [];
}

/** What today's rules said for the sarcastic car line (ATTUNE read it as excited). */
const rules: RulesRead = {
  answer: false,
  attune: 'excited',
  backchannel: null,
  crisis: { isCrisis: false, severity: 0, indicators: [] },
  laughCue: false,
  dayAhead: false,
};

describe('reading vs rules', () => {
  it('flags exactly the fields where they disagree', () => {
    expect(
      disagreements(carReading({ affect_text: { label: 'mixed', valence: 2 } }), rules)
    ).toEqual({
      answered: true, // the reading heard an answer
      affect: true, // mixed words vs "excited"
      bad_news: true, // the events were bad; no bad-news backchannel
      crisis_risk: false,
      humor: false,
      day_ahead: false,
    });
  });

  it('agrees on a day ahead only when a time phrase is not past', () => {
    const ahead = carReading({
      time_expressions: [
        {
          text: 'on the 30th',
          kind: 'point',
          start_iso: '2026-10-30',
          end_iso: '2026-10-30',
          relation: 'future',
        },
      ],
    });
    expect(disagreements(ahead, rules).day_ahead).toBe(true);
    expect(disagreements(ahead, { ...rules, dayAhead: true }).day_ahead).toBe(false);
  });

  it('logs no words: the name and time phrases become flags', () => {
    const line = JSON.stringify(
      readingForLog(
        carReading({
          name_given: 'Sam',
          time_expressions: [
            {
              text: 'next tuesday',
              kind: 'point',
              start_iso: null,
              end_iso: null,
              relation: 'future',
            },
          ],
        })
      )
    );
    expect(line).not.toMatch(/sam|tuesday/i);
    expect(line).toContain('"name_given":true');
  });

  it('logs no caller words from any free-text field, dates included', () => {
    const { reading, words, labels } = readingOfCallerWords();
    // text, start_iso, end_iso and name_given at least.
    expect(words.length).toBeGreaterThanOrEqual(4);
    const logged = readingForLog(reading);
    const line = JSON.stringify(logged);
    for (const w of words) expect(line).not.toContain(w);
    for (const s of stringsIn(logged))
      expect(labels.has(s) || isoDateOrNull(s) === s, `logged "${s}"`).toBe(true);
  });

  it('keeps ISO dates in the log', () => {
    const [time] = (
      readingForLog(
        carReading({
          time_expressions: [
            {
              text: 'friday at three',
              kind: 'point',
              start_iso: '2026-10-30T15:00:00.000-04:00',
              end_iso: '2026-10-30',
              relation: 'future',
            },
          ],
        })
      ) as { time_expressions: Array<Record<string, unknown>> }
    ).time_expressions;
    expect(time).toEqual({
      kind: 'point',
      start_iso: '2026-10-30T15:00:00.000-04:00',
      end_iso: '2026-10-30',
      relation: 'future',
    });
  });
});
