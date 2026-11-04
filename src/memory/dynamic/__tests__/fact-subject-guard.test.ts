/**
 * FACT_SUBJECT_GUARD: what the persona says about itself (its friends, pets, home) never
 * becomes the caller's fact, and what the caller says about their own life is always kept,
 * even when a name collides with a persona's canon. Fictional personas, names and lines.
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
  // The rest of the module stays real: the canon test loads the identity context's index.
  return {
    ...(await importOriginal<object>()),
    createLogger: () => logger,
  };
});

import {
  FACT_SUBJECT_RULE,
  keepCallerFacts,
  personaCanonNames,
  subjectDropReason,
  type CallLine,
} from '../fact-subject-guard.js';
import { factExtractionPrompt } from '../deep-extraction-prompts.js';

const persona = (text: string): CallLine => ({ speaker: 'persona', text });
const caller = (text: string): CallLine => ({ speaker: 'caller', text });
const fact = (entityName: string, value: string) => ({ entityName, value });
const NO_CANON: ReadonlySet<string> = new Set();
const THEO_CANON: ReadonlySet<string> = new Set(['theo']);

describe('subjectDropReason: the persona is never the caller', () => {
  it('a persona line "my buddy Theo plays guitar" never becomes a caller fact', () => {
    const call = [persona('My buddy Theo plays guitar every Sunday.'), caller('Oh, nice.')];
    expect(subjectDropReason(fact('User', 'friend: Theo, plays guitar'), call, NO_CANON)).toBe(
      'persona_line'
    );
    expect(subjectDropReason(fact('Theo', 'plays guitar'), call, NO_CANON)).toBe('persona_line');
  });

  it('the caller saying "my buddy Theo plays guitar" is kept, even with Theo in the canon', () => {
    const call = [caller('My buddy Theo plays guitar.'), persona('That sounds fun.')];
    expect(subjectDropReason(fact('User', 'friend: Theo, plays guitar'), call, THEO_CANON)).toBe(
      null
    );
    expect(subjectDropReason(fact('Theo', 'plays guitar'), call, THEO_CANON)).toBe(null);
  });

  it('a persona saying "I don\'t have a dog" is no "user has no dog" fact', () => {
    const call = [caller('Do you have a dog?'), persona("I don't have a dog, never have.")];
    expect(subjectDropReason(fact('User', 'has no dog'), call, NO_CANON)).toBe('persona_line');
  });

  it('the caller asking "how\'s your friend Theo?" makes no caller fact', () => {
    const call = [caller("How's your friend Theo?")];
    expect(subjectDropReason(fact('User', 'friend: Theo'), call, NO_CANON)).toBe('persona_line');
    expect(subjectDropReason(fact('Theo', 'friend of User'), call, THEO_CANON)).toBe(
      'persona_canon'
    );
  });

  it('the caller repeating the names the persona just gave is an echo, not their friends', () => {
    const call = [
      persona("Well, there's Theo, who I hike with, and Max. We go way back."),
      caller('Theo and Max.'),
      persona('Yep, Theo and Max.'),
    ];
    expect(subjectDropReason(fact('User', 'Theo and Max'), call, NO_CANON)).toBe('persona_line');
    expect(subjectDropReason(fact('Max', 'friend of User'), call, NO_CANON)).toBe('persona_line');
  });

  it('caller lines alone (deep extraction): "I thought you had a dog" is about the persona', () => {
    const call = [
      caller('What about pets?'),
      caller('Really? I thought you had a dog.'),
      caller('I think you need a bulldog.'),
    ];
    expect(
      subjectDropReason(fact('User', 'Does not currently have a dog (implied)'), call, NO_CANON)
    ).toBe('persona_line');
  });
});

describe('subjectDropReason: the caller keeps what is theirs', () => {
  it('a plain statement after the persona raised the topic is the caller\'s ("beach")', () => {
    const call = [persona('I love the beach.'), caller('Beach day tomorrow with the kids.')];
    expect(subjectDropReason(fact('User', 'beach day tomorrow with kids'), call, NO_CANON)).toBe(
      null
    );
  });

  it('"mine" answers a question to the persona with the caller\'s own', () => {
    const call = [
      caller('Have you got kids?'),
      persona('I have three kids.'),
      caller('Ha. Have you got kids? Mine are five and seven.'),
    ];
    expect(subjectDropReason(fact('User', 'two kids, five and seven'), call, NO_CANON)).toBe(null);
    expect(subjectDropReason(fact('User', 'has kids'), call, NO_CANON)).toBe(null);
  });

  it("a question about the persona's friend by name is not the caller's friend", () => {
    const call = [
      persona('My buddy Theo plays guitar.'),
      caller('Does Theo still play at the cafe?'),
    ];
    expect(subjectDropReason(fact('Theo', 'plays at the cafe'), call, NO_CANON)).toBe(
      'persona_line'
    );
  });

  it('"do you have big ears like me?" is the caller\'s own ears', () => {
    const call = [caller('Do you have big ears like me?'), persona('My ears are not that big.')];
    expect(subjectDropReason(fact('User', 'has big ears'), call, NO_CANON)).toBe(null);
  });

  it("the persona asking about the caller's own (\"how's your dog Rex?\") is not the persona's", () => {
    const call = [persona("How's your dog Rex?"), caller('Rex is great, he turned five.')];
    expect(subjectDropReason(fact('Rex', 'turned five'), call, NO_CANON)).toBe(null);
  });

  it('a canon name the caller uses about their own life is kept', () => {
    const call = [caller('Theo called me yesterday about the trip.')];
    expect(subjectDropReason(fact('Theo', 'called about the trip'), call, THEO_CANON)).toBe(null);
  });

  it('a canon name the fact names but nobody said is left alone', () => {
    expect(subjectDropReason(fact('Theo', 'likes tea'), [caller('I like tea.')], THEO_CANON)).toBe(
      null
    );
  });
});

describe('keepCallerFacts', () => {
  it('keeps the caller facts, drops the persona ones and logs counts and reasons only', () => {
    logged.length = 0;
    const call = [
      persona('My buddy Theo plays guitar.'),
      caller("How's your friend Max? My sister Ada just moved to Lisbon."),
    ];
    const facts = [
      fact('Theo', 'plays guitar'),
      fact('Max', 'friend of User'),
      fact('Ada', 'moved to Lisbon'),
    ];
    const kept = keepCallerFacts(facts, call, new Set(['max']), 'sweep');
    expect(kept).toEqual([fact('Ada', 'moved to Lisbon')]);
    expect(logged).toEqual([
      [{ reason: 'persona_canon', count: 1, extractor: 'sweep' }, 'FACT_SUBJECT_DROPPED'],
      [{ reason: 'persona_line', count: 1, extractor: 'sweep' }, 'FACT_SUBJECT_DROPPED'],
    ]);
    expect(JSON.stringify(logged)).not.toMatch(/theo|max|guitar/i);
  });

  it("logs nothing when every fact is the caller's", () => {
    logged.length = 0;
    const kept = keepCallerFacts([fact('Ada', 'moved')], [caller('Ada moved.')], NO_CANON, 'deep');
    expect(kept).toHaveLength(1);
    expect(logged).toEqual([]);
  });
});

describe('the canon and the prompts', () => {
  it("reads the personas' own people and pets from the bundles, not a second store", async () => {
    const canon = await personaCanonNames();
    expect(canon.has('holli')).toBe(true); // Ferni's friend Hollis, normalised as fact words are
    expect(canon.has('compass')).toBe(true); // a teammate's dog (canon-facts.json pets)
    expect(canon.has('jyoti')).toBe(true);
    expect(canon.has('interest')).toBe(false); // a common word is never a canon name
  });

  it('tells the fact extractor whose "you" it is only with the guard on', () => {
    expect(factExtractionPrompt(false, true)).toContain(FACT_SUBJECT_RULE);
    expect(factExtractionPrompt(true, true)).toContain(FACT_SUBJECT_RULE);
    expect(factExtractionPrompt(false)).not.toContain(FACT_SUBJECT_RULE);
    expect(factExtractionPrompt(true)).not.toContain(FACT_SUBJECT_RULE);
  });
});
