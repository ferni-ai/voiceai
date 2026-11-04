/**
 * FACT_SUBJECT_GUARD: a fact is dropped only on positive evidence that it is the persona's,
 * and what the caller says about their own life is always kept. Fictional names and lines.
 */
import { describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[][]);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const logger = {
    debug: () => {},
    warn: () => {},
    error: () => {},
    info: (...a: unknown[]) => void logged.push(a),
  };
  return { ...(await importOriginal<object>()), createLogger: () => logger };
});

import {
  FACT_SUBJECT_RULE,
  keepCallerFacts,
  subjectDropReason,
  type CallLine,
} from '../fact-subject-guard.js';
import { factExtractionPrompt } from '../deep-extraction-prompts.js';

const persona = (text: string): CallLine => ({ speaker: 'persona', text });
const caller = (text: string): CallLine => ({ speaker: 'caller', text });
const fact = (entityName: string, value: string) => ({ entityName, value });

describe('subjectDropReason: what the persona owns is never the caller', () => {
  it('a persona line "my buddy Theo plays guitar" never becomes a caller fact', () => {
    const call = [persona('My buddy Theo plays guitar every Sunday.'), caller('Oh, nice.')];
    expect(subjectDropReason(fact('User', 'friend: Theo, plays guitar'), call)).toBe(
      'persona_line'
    );
    expect(subjectDropReason(fact('Theo', 'plays guitar'), call)).toBe('persona_line');
  });

  it('the caller saying "my buddy Theo plays guitar" is kept', () => {
    const call = [caller('My buddy Theo plays guitar.'), persona('That sounds fun.')];
    expect(subjectDropReason(fact('Theo', 'plays guitar'), call)).toBe(null);
  });

  it('owns names given as "a dog named X" and "X is my dog", never in a question', () => {
    const echo = (said: string) => [persona(said), caller('Compass.')];
    const named = fact('User', 'has a dog named Compass');
    expect(subjectDropReason(named, echo('I have a dog named Compass.'))).toBe('persona_line');
    expect(subjectDropReason(named, echo('Compass is my dog.'))).toBe('persona_line');
    expect(subjectDropReason(named, echo('Is Compass my dog or yours?'))).toBe(null);
    expect(subjectDropReason(named, echo('Your dog named Compass is sweet.'))).toBe(null);
  });

  it('the caller repeating the names the persona owns is an echo, not their friends', () => {
    const call = [persona('My buddies Theo and Max, we go way back.'), caller('Theo and Max.')];
    expect(subjectDropReason(fact('User', 'Theo and Max'), call)).toBe('persona_line');
    expect(subjectDropReason(fact('Max', 'friend of User'), call)).toBe('persona_line');
  });

  it("a question about the persona's friend by name is not the caller's friend", () => {
    const call = [
      persona('My buddy Theo plays guitar.'),
      caller('Does Theo still play at the cafe?'),
    ];
    expect(subjectDropReason(fact('Theo', 'plays at the cafe'), call)).toBe('persona_line');
  });

  it('"I thought you had a dog" and "do you have a dog?" are about the persona, on caller lines alone', () => {
    const noDog = fact('User', 'Does not currently have a dog (implied)');
    expect(subjectDropReason(noDog, [caller('Really? I thought you had a dog.')])).toBe(
      'caller_your'
    );
    expect(subjectDropReason(fact('User', 'has no dog'), [caller('Do you have a dog?')])).toBe(
      'caller_your'
    );
    expect(subjectDropReason(fact('Lyle', 'friend'), [caller("How's your friend Lyle?")])).toBe(
      'caller_your'
    );
  });
});

describe('subjectDropReason: the caller keeps what is theirs', () => {
  it('a mention or a question by the persona owns nothing ("How\'s Owen?")', () => {
    const call = [persona("How's Owen doing?"), caller('Owen? He scored twice.')];
    expect(subjectDropReason(fact('Owen', 'scored twice'), call)).toBe(null);
    const hope = [persona("I hope Maya's recital went well!"), caller('Maya!')];
    expect(subjectDropReason(fact('Maya', 'had a recital'), hope)).toBe(null);
  });

  it("the caller's claim may sit in the next sentence of their line", () => {
    const call = [persona('My buddy Theo plays guitar.'), caller('Theo? He coaches my son.')];
    expect(subjectDropReason(fact('Theo', "coaches the caller's son"), call)).toBe(null);
  });

  it('"mine", "me" and "I have" keep the line the caller\'s', () => {
    const call = [caller('Ha. Have you got kids? Mine are five and seven.')];
    expect(subjectDropReason(fact('User', 'has kids'), call)).toBe(null);
    const ears = [caller('Do you have big ears like me?')];
    expect(subjectDropReason(fact('User', 'has big ears'), ears)).toBe(null);
    expect(
      subjectDropReason(fact('User', 'has two dogs'), [caller('You have a dog? I have two.')])
    ).toBe(null);
  });

  it('"your X" owns X and one more word, never the rest of the line', () => {
    const call = [caller('your tip about sleep helped sleeping eight hours now')];
    expect(subjectDropReason(fact('User', 'sleeping eight hours now'), call)).toBe(null);
    const tips = [caller('Do you have any tips for when the twins start school on Monday?')];
    expect(subjectDropReason(fact('User', 'twins start school on Monday'), tips)).toBe(null);
  });

  it('"you have to", "you\'re gonna" and "you get" are filler', () => {
    for (const line of [
      'you have to try pickleball been playing every weekend',
      "you're gonna love pickleball been playing every weekend",
      'you get used to it been playing pickleball every weekend',
    ])
      expect(
        subjectDropReason(fact('User', 'plays pickleball every weekend'), [caller(line)])
      ).toBe(null);
  });
});

describe('keepCallerFacts', () => {
  it('keeps the caller facts, drops the persona ones and logs counts and reasons only', () => {
    logged.length = 0;
    const call = [
      persona('My buddy Theo plays guitar.'),
      caller("How's your friend Max?"),
      caller('My sister Ada just moved to Lisbon.'),
    ];
    const facts = [
      fact('Theo', 'plays guitar'),
      fact('Max', 'friend of User'),
      fact('Ada', 'moved to Lisbon'),
    ];
    expect(keepCallerFacts(facts, call, 'sweep')).toEqual([fact('Ada', 'moved to Lisbon')]);
    expect(logged).toEqual([
      [{ reason: 'persona_line', count: 1, extractor: 'sweep' }, 'FACT_SUBJECT_DROPPED'],
      [{ reason: 'caller_your', count: 1, extractor: 'sweep' }, 'FACT_SUBJECT_DROPPED'],
    ]);
    expect(JSON.stringify(logged)).not.toMatch(/theo|max|guitar/i);
  });

  it("logs nothing when every fact is the caller's", () => {
    logged.length = 0;
    expect(keepCallerFacts([fact('Ada', 'moved')], [caller('Ada moved.')], 'deep')).toHaveLength(1);
    expect(logged).toEqual([]);
  });
});

describe('the prompt', () => {
  it('tells the fact extractor whose "you" it is only with the guard on', () => {
    expect(factExtractionPrompt(false, true)).toContain(FACT_SUBJECT_RULE);
    expect(factExtractionPrompt(true, true)).toContain(FACT_SUBJECT_RULE);
    expect(factExtractionPrompt(false)).not.toContain(FACT_SUBJECT_RULE);
    expect(factExtractionPrompt(true)).not.toContain(FACT_SUBJECT_RULE);
  });
});
