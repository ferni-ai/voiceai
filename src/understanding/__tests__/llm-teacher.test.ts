import { describe, expect, it, vi } from 'vitest';
import { llmTeacher, type GenerateFn } from '../llm-teacher.js';
import { clash } from '../teacher-prompts.js';
import { resolveTimes } from '../time-resolver.js';
import { CAR_INPUT, carReading } from './fixtures.js';

const signal = new AbortController().signal;
const {
  answered_prior_question,
  affect_text,
  affect_situation,
  sarcasm: _s,
  ...core
} = carReading();

describe('the LLM teacher', () => {
  it('single: one call carrying every sub-question; sarcasm comes from the valence clash', async () => {
    const generate = vi.fn<GenerateFn>(async () =>
      JSON.stringify({
        ...core,
        answered_prior_question,
        affect_text,
        affect_situation,
        sincere: false,
      })
    );
    const out = await llmTeacher(generate, 'single').read(CAR_INPUT, signal);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(out?.backend).toBe('llm-teacher-single');
    expect(out?.reading.sarcasm).toBe(true);
    const [system, user, schema] = generate.mock.calls[0];
    expect(system).toContain('answered_prior_question');
    expect(JSON.parse(user)).toMatchObject({ FERNI: CAR_INPUT.ferniLast, KNOWN_NAME: 'Sam' });
    expect((schema.required as string[]).includes('sincere')).toBe(true);
  });

  it('parallel: answered is asked about the (question, reply) pair alone', async () => {
    const generate = vi.fn<GenerateFn>(async (_system, user) => {
      const u = JSON.parse(user) as Record<string, unknown>;
      if ('QUESTION' in u) return JSON.stringify({ answered_prior_question: 'yes' });
      if (!('EARLIER' in u))
        return JSON.stringify({ affect_text, affect_situation, sincere: false });
      return JSON.stringify(core);
    });
    const out = await llmTeacher(generate, 'parallel').read(CAR_INPUT, signal);
    expect(generate).toHaveBeenCalledTimes(3);
    const pair = generate.mock.calls.map((c) => JSON.parse(c[1])).find((u) => 'QUESTION' in u);
    expect(pair).toEqual({ QUESTION: 'How was the drive in?', REPLY: CAR_INPUT.callerTurn });
    expect(out?.reading).toEqual(carReading());
  });

  it('a sincere clash is not sarcasm; words and events must point opposite ways', async () => {
    const generate: GenerateFn = async () =>
      JSON.stringify({
        ...core,
        answered_prior_question,
        affect_text,
        affect_situation,
        sincere: true,
      });
    expect((await llmTeacher(generate).read(CAR_INPUT, signal))?.reading.sarcasm).toBe(false);
    expect(clash(2, -1)).toBe(true);
    expect(clash(-1, 1)).toBe(true);
    expect(clash(0, -2)).toBe(false);
    expect(clash(1, 2)).toBe(false);
  });

  it("a free-text date costs only that date, not the turn's reading", async () => {
    const time = { text: 'after the surgery', kind: 'point', relation: 'future' } as const;
    const generate: GenerateFn = async (_s, user) => {
      const u = JSON.parse(user) as Record<string, unknown>;
      if ('QUESTION' in u) return JSON.stringify({ answered_prior_question });
      if (!('EARLIER' in u))
        return JSON.stringify({ affect_text, affect_situation, sincere: false });
      return JSON.stringify({
        ...core,
        time_expressions: [{ ...time, start_iso: "mom's surgery", end_iso: null }],
      });
    };
    const out = await llmTeacher(generate, 'parallel').read(
      { ...CAR_INPUT, callerTimezone: undefined },
      signal
    );
    expect(out?.reading).toEqual(
      carReading({ time_expressions: [{ ...time, start_iso: null, end_iso: null }] })
    );
  });

  it('any malformed sub-answer makes the whole reading null', async () => {
    const generate: GenerateFn = async (_s, user) =>
      'QUESTION' in JSON.parse(user) ? '{"answered_prior_question":"maybe"}' : JSON.stringify(core);
    expect(await llmTeacher(generate, 'parallel').read(CAR_INPUT, signal)).toBeNull();
  });
});

describe('time phrases resolved by code', () => {
  const said = (text: string, relation: 'future' | 'past', start: string | null = null) =>
    carReading({
      time_expressions: [{ text, kind: 'point', start_iso: start, end_iso: start, relation }],
    });
  const at = new Date('2026-10-22T14:00:00.000Z');

  it('"in two weeks" lands on Nov 5 in the caller\'s zone, across the DST change', () => {
    const { reading, resolved } = resolveTimes(
      said('in two weeks', 'future', '2026-10-22'),
      at,
      'America/New_York'
    );
    expect(resolved).toBe(1);
    expect(reading.time_expressions[0].start_iso).toBe('2026-11-05');
  });

  it('"on the 30th" said on the 22nd is this month, in the future', () => {
    const { reading } = resolveTimes(said('on the 30th', 'future'), at, 'America/New_York');
    expect(reading.time_expressions[0].start_iso).toBe('2026-10-30');
  });

  it('keeps the model\'s dates when the parser contradicts the tense ("I went on Monday")', () => {
    const { reading, resolved } = resolveTimes(
      said('Monday', 'past', '2026-10-19'),
      at,
      'America/New_York'
    );
    expect(resolved).toBe(0);
    expect(reading.time_expressions[0].start_iso).toBe('2026-10-19');
  });

  it('leaves everything alone without a valid zone', () => {
    expect(resolveTimes(said('tomorrow', 'future'), at, undefined).resolved).toBe(0);
    expect(resolveTimes(said('tomorrow', 'future'), at, 'Mars/Base').resolved).toBe(0);
  });
});

describe('the resolver keeps its date plugin to itself', () => {
  it("the shared compromise still tags 'noon' as a noun after a resolve", async () => {
    const { default: nlp } = await import('compromise');
    resolveTimes(
      carReading({
        time_expressions: [
          { text: 'tomorrow', kind: 'point', start_iso: null, end_iso: null, relation: 'future' },
        ],
      }),
      new Date('2026-10-22T14:00:00.000Z'),
      'America/New_York'
    );
    const nouns = (
      nlp('i will meet august at noon') as unknown as {
        nouns: () => { json: () => Array<{ text: string }> };
      }
    )
      .nouns()
      .json()
      .map((n) => n.text);
    expect(nouns).toContain('noon');
  });
});
