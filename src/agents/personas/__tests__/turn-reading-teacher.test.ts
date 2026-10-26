import { describe, expect, it, vi } from 'vitest';
import { CAR_INPUT, carReading } from '../../../understanding/__tests__/fixtures.js';
import { turnReadingTeacher } from '../turn-reading-teacher.js';

const signal = new AbortController().signal;

describe('the turn reading teacher on the understander client', () => {
  it('asks three focused calls by default, each with its own output schema', async () => {
    const schemas: unknown[] = [];
    const understand = vi.fn((_model?: string, out: { schema?: unknown } = {}) => {
      schemas.push(out.schema);
      return async (_system: string, user: string) => {
        const u = JSON.parse(user) as Record<string, unknown>;
        const {
          answered_prior_question,
          affect_text,
          affect_situation,
          sarcasm: _s,
          ...core
        } = carReading();
        if ('QUESTION' in u) return JSON.stringify({ answered_prior_question });
        if (!('EARLIER' in u))
          return JSON.stringify({ affect_text, affect_situation, sincere: false });
        return JSON.stringify(core);
      };
    });
    const teacher = turnReadingTeacher({}, understand as never);
    expect(teacher.id).toBe('llm-teacher-parallel');
    expect((await teacher.read(CAR_INPUT, signal))?.reading).toEqual(carReading());
    expect(understand).toHaveBeenCalledTimes(3);
    expect(schemas.every((s) => typeof s === 'object' && s !== null)).toBe(true);
  });

  it('TURN_UNDERSTANDING_CALLS=single makes one combined call', () => {
    expect(turnReadingTeacher({ TURN_UNDERSTANDING_CALLS: 'single' }).id).toBe(
      'llm-teacher-single'
    );
  });
});
