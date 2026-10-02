/**
 * First-person health statements are detected; other people's health,
 * negations and everyday phrases are not.
 */

import { describe, expect, it } from 'vitest';
import { detectHealthMentions } from '../detect.js';

const one = (text: string) => detectHealthMentions(text).map((m) => [m.kind, m.text]);

describe('detectHealthMentions', () => {
  it.each([
    [
      'I was diagnosed with type 2 diabetes last year.',
      'condition',
      'Was diagnosed with type 2 diabetes',
    ],
    ['Honestly I have asthma so running is hard', 'condition', 'Has asthma'],
    ['I take metformin 500mg every morning', 'medication', 'Takes metformin 500mg'],
    ["I'm on sertraline now", 'medication', 'Takes sertraline'],
    ['I was prescribed amoxicillin.', 'medication', 'Takes amoxicillin'],
    ['I sprained my ankle playing soccer', 'injury', 'Sprained their ankle'],
    ['My dentist appointment is next Tuesday', 'appointment', 'Dentist appointment next Tuesday'],
    ['I woke up with a headache', 'symptom', 'Had a headache'],
    ['my back is killing me', 'symptom', 'Had back pain'],
    ['I only slept four hours', 'sleep', 'Slept 4 hours'],
    ["I couldn't sleep at all", 'sleep', "Didn't sleep well"],
    ['I went for a run this morning', 'exercise', 'Went for a run'],
    ['I ran 5k today!', 'exercise', 'Ran 5k'],
    ["I'm completely exhausted", 'energy', 'Felt exhausted'],
  ])('%s', (text, kind, expected) => {
    expect(one(text)).toContainEqual([kind, expected]);
  });

  it.each([
    'My mom has diabetes',
    "I don't have asthma",
    "I'm taking a break",
    "I'm on my way",
    'I take the bus to work',
    'We talked about her doctor',
    'I love running',
    'Oh my god I am so excited',
  ])('ignores: %s', (text) => {
    expect(detectHealthMentions(text)).toEqual([]);
  });

  it('finds several in one turn and dedupes', () => {
    const kinds = detectHealthMentions(
      'I have migraines. I take ibuprofen for my migraines. I have migraines, really.'
    ).map((m) => m.kind);
    expect(kinds.sort()).toEqual(['condition', 'medication']);
  });
});
