import { describe, expect, it } from 'vitest';

import { endsOnQuestion, QUESTION_PACE_LINE, questionPaceNote } from '../question-pace.js';

const ON = { QUESTION_PACE: 'on' };
const OFF = {};
const calm = { crisis: false };

describe('endsOnQuestion', () => {
  it('sees a question at the end, past closing quotes and space', () => {
    expect(endsOnQuestion('What kind did you brew?')).toBe(true);
    expect(endsOnQuestion('She said "really?" ')).toBe(true);
  });

  it('a question mid-reply that ends on a thought is not one', () => {
    expect(endsOnQuestion('Did it rain? Mine was sunny all day.')).toBe(false);
    expect(endsOnQuestion('Soft green sounds lovely.')).toBe(false);
    expect(endsOnQuestion('')).toBe(false);
  });
});

describe('questionPaceNote', () => {
  it('after a reply that ended on a question, holds the next one back', () => {
    expect(questionPaceNote(['Morning.', 'What kind of tea did you go with?'], calm, ON)).toBe(
      QUESTION_PACE_LINE
    );
  });

  it('after a reply that ended on a thought, says nothing', () => {
    expect(
      questionPaceNote(['What is up?', 'Tea on a quiet evening sounds perfect.'], calm, ON)
    ).toBe('');
  });

  it('only the last reply counts, not earlier ones', () => {
    expect(questionPaceNote(['How are you?', 'That sounds rough.'], calm, ON)).toBe('');
  });

  it('nothing before Ferni has spoken', () => {
    expect(questionPaceNote([], calm, ON)).toBe('');
  });

  it('off by default: the same history gets no note', () => {
    expect(questionPaceNote(['What kind of tea did you go with?'], calm, OFF)).toBe('');
  });

  it('steps aside in a crisis reply', () => {
    expect(questionPaceNote(['How are you holding up?'], { crisis: true }, ON)).toBe('');
  });
});
