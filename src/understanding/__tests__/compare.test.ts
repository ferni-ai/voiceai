import { describe, expect, it } from 'vitest';
import { disagreements, readingForLog, type RulesRead } from '../compare.js';
import { carReading } from './fixtures.js';

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
});
