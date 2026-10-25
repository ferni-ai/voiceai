import { afterEach, describe, expect, it } from 'vitest';

import { endsOnQuestion, QUESTION_PACE_LINE, questionPaceNote } from '../question-pace.js';
import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import { SAFETY_WORDING } from '../phrase-loops-safety.generated.js';

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

describe('questionPaceNote: safety by topic and script, not by loose word overlap', () => {
  const after = (last: string): string => questionPaceNote(['Hey.', last], calm, ON);

  it('no note after any question in the safety scripts', () => {
    const scriptQuestions = SAFETY_WORDING.filter((l) => l.trim().endsWith('?'));
    expect(scriptQuestions.length).toBeGreaterThan(20);
    for (const q of scriptQuestions) expect(after(q), q).toBe('');
  });

  it('no note after paraphrased safety questions (the #2809 verify misses)', () => {
    for (const q of [
      'Are you thinking about ending your life?',
      'Have you had thoughts of not wanting to be here anymore?',
      'Is there a part of you that wants to go to sleep and not wake up?',
      'Did you mean it when you said everyone would be better off without you?',
      'Do you feel like you might do something to yourself tonight?',
      'Have you taken anything tonight?',
      'Can you put some distance between you and the medication for tonight?',
      'Have you cut yourself again since we last talked?',
      'Has he ever put his hands on you?',
      'Is anyone there with you right now?',
      'Is there someone you trust who could come stay with you tonight?',
    ])
      expect(after(q), q).toBe('');
  });

  it('holds the note after the questions main held it for (#2812 verify)', () => {
    for (const q of [
      'Have you been giving your things away?',
      "When you say you're done, do you mean done with everything?",
    ])
      expect(after(q), q).toBe('');
  });

  it('keeps the note after a reaction that only shares words with a script, and plain follow-ups', () => {
    for (const q of [
      'That sounds so heavy. When do you fly out?',
      'That makes sense. When do you fly out?',
      'I love that. What movie did you pick?',
      'Oof, long week. What are you doing this weekend?',
    ])
      expect(after(q), q).toBe(QUESTION_PACE_LINE);
  });
});
