import { afterEach, describe, expect, it } from 'vitest';

import { endsOnQuestion, QUESTION_PACE_LINE, questionPaceNote } from '../question-pace.js';
import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';

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

describe('questionPaceNote never bars a safety check', () => {
  afterEach(() => resetCrisisCallRisk());
  const asked = ['Morning.', 'What kind of tea did you go with?'];

  it('no note on a call with crisis risk noted, though this turn carries no guidance', () => {
    expect(questionPaceNote(asked, { crisis: false, sessionId: 'risky' }, ON)).toBe(QUESTION_PACE_LINE); // prettier-ignore
    noteCrisisRisk('risky');
    expect(questionPaceNote(asked, { crisis: false, sessionId: 'risky' }, ON)).toBe('');
    // Another call's risk changes nothing here.
    expect(questionPaceNote(asked, { crisis: false, sessionId: 'calm' }, ON)).toBe(QUESTION_PACE_LINE); // prettier-ignore
  });

  it('no note after a reply with a sentence on safety, wherever it sits', () => {
    for (const last of [
      'Are you somewhere safe right now?',
      'Do you have a plan to hurt yourself tonight?',
      "Are you thinking about killing yourself? Can you tell me what's going on?",
      'You can text 988 any time. How are you holding up?',
    ])
      expect(questionPaceNote(['Hey.', last], calm, ON), last).toBe('');
  });
});
