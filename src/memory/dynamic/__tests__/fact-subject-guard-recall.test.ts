/**
 * FACT_SUBJECT_GUARD never costs the caller a fact of their own. Every probe so far, run end
 * to end through both extractors with the flag off and on: the after-call sweep sees both
 * sides of the call, deep extraction the caller's lines only. Every fact kept with the flag
 * off is kept with it on; the traced shapes drop. Fictional lines; common first names that
 * are also persona canon names (Owen, Daniel, Diane, Sam, Marty, Lyle) are used on purpose.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  return { ...(await importOriginal<object>()), createLogger: () => logger };
});
vi.mock('../async-events-config.js', () => ({ safeOnEvent: () => () => undefined }));

import { sweepAfterCall } from '../../../agents/fact-sweep-register.js';
import {
  DeepExtractionWorker,
  type DeepExtractionJob,
  type ExtractionResult,
} from '../deep-extraction-worker.js';

/**
 * id, the call ("C:" caller, "P:" persona), the fact the model returns, and what the flag
 * does: keep it, drop it on both paths, or drop it on the sweep only (deep extraction never
 * sees the persona's lines, so a caller line that only echoes its names reads as theirs).
 */
type Row = [
  id: string,
  lines: string[],
  entityName: string,
  value: string,
  on: 'keep' | 'drop' | 'sweep',
];

const ROWS: Row[] = [
  // Round 1: common first names that are also canon names; filler "you"
  ['C1', ['P:My partner Sam is a great cook.', 'C:Ha, my sister is also called Sam.'], 'Sam', 'sister', 'keep'],
  ['C2', ['P:I have a dog named Compass.', "C:No way, my dog's name is Compass too."], 'User', 'has a dog named Compass', 'keep'],
  ['C3', ['C:Sam is coming to visit on Saturday.'], 'Sam', 'coming to visit on Saturday', 'keep'],
  ['C4', ['C:What do you think, should Owen take the job in Denver?'], 'Owen', 'has a job offer in Denver', 'keep'],
  ['C5', ['C:Daniel just got promoted, you know, at the bank.'], 'Daniel', 'got promoted at the bank', 'keep'],
  ['C6', ['C:Thanks to you Daniel and I are engaged now.'], 'User', 'engaged to Daniel', 'keep'],
  ['C7', ['C:My brother, the one who lives in Austin with the two cats, Marty, is getting married.'], 'Marty', 'getting married', 'keep'],
  ['C8', ['P:My friend Lyle is visiting.', 'C:Funny, my coworker is Lyle too.'], 'Lyle', 'coworker', 'keep'],
  ['C9', ['C:Should I text Marty back tonight?'], 'Marty', 'texted the user', 'keep'],
  ['C10', ["C:Diane, you'd love her, she's my aunt."], 'Diane', 'aunt', 'keep'],
  // Agreeing with the persona
  ['M1', ["P:I've got a golden retriever.", 'C:Me too, a golden retriever named Rex.'], 'User', 'has a golden retriever named Rex', 'keep'],
  ['M2', ['P:I have two kids.', 'C:Same, two boys.'], 'User', 'has two boys', 'keep'],
  ['M3', ['P:I have two kids.', 'C:Same. Two kids.'], 'User', 'has two kids', 'keep'],
  ['M4', ['P:My birthday is in March.', 'C:Mine too, March.'], 'User', 'March', 'keep'],
  ['M5', ['P:I grew up in Ohio.', 'C:Same! Ohio.'], 'User', 'grew up in Ohio', 'keep'],
  ['M6', ['P:I love jazz.', 'C:Love jazz.'], 'User', 'loves jazz', 'keep'],
  ['M7', ['P:I love jazz.', 'C:So do I, jazz is everything.'], 'User', 'loves jazz', 'keep'],
  ['M8', ['P:I grew up in Ohio.', 'C:Yeah. Ohio.'], 'User', 'grew up in Ohio', 'keep'],
  // Corrections
  ['K1', ['P:Pepper is my dog, right?', "C:No, that's MY dog. Pepper is mine."], 'Pepper', "user's dog", 'keep'],
  ['K2', ['P:How is my pup Pepper?', 'C:No, Pepper is MY dog.'], 'Pepper', "user's dog", 'keep'],
  // Third person
  ['T1', ['C:My son Eli starts college in the fall.'], 'Eli', 'starts college in the fall', 'keep'],
  ['T2', ['C:Rachel just got promoted at the bank.'], 'Rachel', 'got promoted at the bank', 'keep'],
  ['T3', ['C:Rachel just got promoted, you know, at the bank.'], 'Rachel', 'got promoted at the bank', 'keep'],
  ['T4', ['C:What do you think, should Rachel take the job in Denver?'], 'Rachel', 'has a job offer in Denver', 'keep'],
  ['T5', ['P:My sister loves hiking.', 'C:My sister Nora hates hiking.'], 'Nora', 'hates hiking', 'keep'],
  // No pronoun (speech to text drops them), and filler "you"
  ['A1', ['C:got a new puppy last week'], 'User', 'got a new puppy last week', 'keep'],
  ['A2', ['C:got a new puppy last week you know'], 'User', 'got a new puppy last week', 'keep'],
  ['A3', ['C:you know what got a new puppy last week'], 'User', 'got a new puppy last week', 'keep'],
  ['A4', ['C:thank you got a new job at the hospital'], 'User', 'new job at the hospital', 'keep'],
  ['A5', ["C:Running at six every morning, you'd hate it."], 'User', 'running at six every morning', 'keep'],
  ['A6', ['C:moving to Tampa', 'C:in June'], 'User', 'moving to Tampa in June', 'keep'],
  // The persona's words repeated, the caller's own added
  ['R1', ['P:I have a dog named Compass.', 'C:You have a dog? I have two.'], 'User', 'has two dogs', 'keep'],
  ['R2', ['P:I have a dog.', 'C:You have a dog? Got two labs.'], 'User', 'has two labs', 'keep'],
  ['R3', ['P:I have a dog.', 'C:You have a dog? I have two dogs.'], 'User', 'has dogs', 'keep'],
  ['R4', ['P:My dog loves the beach.', 'C:Your dog sounds like my dog, she loves the beach too.'], 'User', 'dog loves the beach', 'keep'],
  ['R5', ['P:I love Italy.', 'C:You love Italy? I lived in Rome for two years.'], 'User', 'lived in Rome for two years', 'keep'],
  ['R6', ['C:Your tip about sleep helped, sleeping eight hours now.'], 'User', 'sleeping eight hours now', 'keep'],
  ['Q1', ['C:Do you have any tips for when the twins start school on Monday?'], 'User', 'twins start school on Monday', 'keep'],
  // Round 2: no punctuation, "you have to / you're gonna / you get" filler
  ['N3', ['C:your tip about sleep helped sleeping eight hours now'], 'User', 'sleeping eight hours now', 'keep'],
  ['N4', ['C:you have to try pickleball been playing every weekend'], 'User', 'playing pickleball every weekend', 'keep'],
  ['N5', ['C:You have to try pickleball. Been playing every weekend.'], 'User', 'playing pickleball every weekend', 'keep'],
  ['N6', ["C:you're gonna love this adopted a third cat"], 'User', 'adopted a third cat', 'keep'],
  ['N7', ['C:you were right Daniel and I broke up'], 'User', 'broke up with Daniel', 'keep'],
  ['N8', ["C:You've got to see my new place."], 'User', 'has a new place', 'keep'],
  ['N9', ['C:You got me a puppy, remember?'], 'User', 'has a puppy', 'keep'],
  ['N10', ["C:Bless you, I'm getting married in May."], 'User', 'getting married in May', 'keep'],
  ['N11', ['C:bless you getting married in May'], 'User', 'getting married in May', 'keep'],
  ['N12', ['C:you get used to it been running every morning'], 'User', 'running every morning', 'keep'],
  ['N13', ['C:daniel just got promoted'], 'Daniel', 'got promoted', 'keep'],
  ['N14', ['C:owen got into college you know'], 'Owen', 'got into college', 'keep'],
  // The persona's name, then the caller's own person; the persona asking from memory
  ['N15', ['P:My partner Sam loves to bake.', 'C:Oh my brother is called Sam too.'], 'Sam', 'brother', 'keep'],
  ['N16', ['P:My buddy Owen plays guitar.', "C:Owen? That's my nephew's name."], 'Owen', 'nephew', 'keep'],
  ['N17', ['P:My buddy Theo plays guitar.', "C:Theo? That's my nephew's name."], 'Theo', 'nephew', 'keep'],
  ['N18', ["P:I hope Maya's recital went well!", 'C:Maya? She nailed it.'], 'Maya', 'nailed her recital', 'keep'],
  ['N19', ["P:I hope Maya's recital went well!", 'C:Maya nailed it!'], 'Maya', 'nailed her recital', 'keep'],
  ['N20', ["P:How did Owen's soccer game go?", 'C:Owen? He scored twice.'], 'Owen', 'scored twice in soccer', 'keep'],
  ['N21', ["P:How's Owen doing?", 'C:Stressed. Should Owen take the Denver job?'], 'Owen', 'has a job offer in Denver', 'keep'],
  ['N22', ['P:I was thinking about Daniel this week.', 'C:Daniel? He moved to Austin.'], 'Daniel', 'moved to Austin', 'keep'],
  ['N23', ['P:I was thinking about Daniel this week.', 'C:Yeah, Daniel moved to Austin.'], 'Daniel', 'moved to Austin', 'keep'],
  ['N24', ['P:Do your kids still play soccer?', 'C:Yes, my kids are Theo and Wren.'], 'User', 'kids named Theo and Wren', 'keep'],
  ['N25', ["P:What are your kids' names?", 'C:Theo and Wren.'], 'User', 'kids named Theo and Wren', 'keep'],
  ['N26', ['P:I have a golden retriever.', "C:Mine's a lab."], 'User', 'has a lab', 'keep'],
  ['N27', ['P:I have two kids.', 'C:Same, but I have three.'], 'User', 'has three kids', 'keep'],
  ['N28', ['P:Compass is my dog.', "C:No, that's MY dog. Compass is mine."], 'Compass', "user's dog", 'keep'],
  ['N29', ['P:Pepper is my dog.', 'C:no thats my dog pepper is mine'], 'Pepper', "user's dog", 'keep'],
  ['N30', ['P:I grew up in Ohio.', 'C:ohio same'], 'User', 'grew up in Ohio', 'keep'],
  ['N31', ['C:Do you have a dog? I do, a beagle named Pip.'], 'User', 'has a beagle named Pip', 'keep'],
  ['N32', ['C:are you a dog person got two labs'], 'User', 'has two labs', 'keep'],
  // Round 3: the persona owns a name and the caller's claim is in the next sentence; a persona
  // question ("my favourite pup") or mention owns nothing
  ['X1', ['P:My buddy Theo just got back from Peru.', 'C:Theo? He coaches the youth soccer team now.'], 'Theo', 'coaches youth soccer', 'keep'],
  ['X2', ["P:How's my favorite pup Pepper doing?", 'C:Oh, Pepper!'], 'User', 'has a dog named Pepper', 'keep'],
  ['X3', ["P:I hope Maya's recital went well!", 'C:Oh, Maya! Yes.'], 'Maya', 'had a recital', 'keep'],
  // The traced shapes, and the caller speaking of the persona's own
  ['S1', ['C:Who do you hang out with?', 'P:My buddies Theo and Wren, we go way back.', 'C:Theo and Wren.', 'P:Yep, those two are my people.'], 'User', 'Theo and Wren', 'sweep'],
  ['S2', ['C:Who are your friends?', 'P:My friends Lyle and Hollis, mostly.', 'C:Lyle and Hollis.', 'P:That is them.'], 'User', 'Lyle and Hollis', 'sweep'],
  ['D5', ['P:My buddies Theo and Wren, we go way back.', 'C:theo and wren'], 'User', 'Theo and Wren', 'sweep'],
  ['S3', ['C:Really? I thought you had a dog.', "P:Nope, I don't have a dog."], 'User', 'Does not have a dog', 'drop'],
  ['S4', ['C:Your dog is so cute.'], 'User', 'has a cute dog', 'drop'],
  ['D6', ["C:How's your friend Lyle?"], 'Lyle', 'friend', 'drop'],
]; // prettier-ignore

const factJson = (entityName: string, value: string): string =>
  JSON.stringify([{ entityName, value, key: 'k', factType: 'state', confidence: 0.9 }]);

async function sweepKept(lines: string[], entity: string, value: string, on: boolean) {
  return sweepAfterCall(
    {
      userId: 'u-recall',
      sessionId: 's-recall',
      startedAt: new Date('2026-11-02T18:00:00Z'),
      turns: lines.map((l) => ({
        role: l.startsWith('C:') ? 'user' : 'assistant',
        content: l.slice(2),
      })),
    },
    {
      env: { FACT_SWEEP: 'on', FACT_SUBJECT_GUARD: on ? 'on' : 'off' },
      llm: async () => factJson(entity, value),
      store: { facts: async () => [], add: async (_u, docs) => docs.length },
    }
  );
}

async function deepKept(lines: string[], entity: string, value: string, on: boolean) {
  vi.stubEnv('FACT_SUBJECT_GUARD', on ? 'on' : 'off');
  const worker = new DeepExtractionWorker({ batchTurns: 1 });
  const persisted: ExtractionResult[] = [];
  const reply = (prompt: string): string => {
    if (prompt.startsWith('You are an expert at identifying entities'))
      return JSON.stringify([{ name: 'thing', type: 'thing', attributes: {}, confidence: 0.9 }]);
    if (prompt.startsWith('You are extracting factual')) return factJson(entity, value);
    return prompt.startsWith('You are refining') ? '{}' : '[]';
  };
  Object.assign(worker, {
    getGeminiModel: async () => ({
      generateContent: async (p: string) => ({
        response: Promise.resolve({ text: () => reply(p) }),
      }),
    }),
    persistExtraction: async (_u: string, r: ExtractionResult) => void persisted.push(r),
  });
  const job: DeepExtractionJob = {
    jobId: 'j',
    userId: 'u-recall',
    sessionId: 's-recall',
    turnNumber: 1,
    transcript: lines
      .filter((l) => l.startsWith('C:'))
      .map((l) => l.slice(2))
      .join('\n'),
    timestamp: new Date('2026-11-02T18:00:00Z'),
    priority: 'normal',
    fastCaptureHints: {
      mentionedEntities: [],
      emotionSignals: [],
      topicHints: [],
      dateSignals: [],
      relationshipSignals: [],
    },
  };
  await worker['processJob'](job);
  vi.unstubAllEnvs();
  return persisted.flatMap((r) => r.facts).length;
}

describe('FACT_SUBJECT_GUARD: every probe, both extractors, flag off and on', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(ROWS)('%s', async (...row) => {
    const [, lines, entity, value, on] = row;
    // Flag off: stored as on main.
    expect(await sweepKept(lines, entity, value, false)).toBe(1);
    expect(await deepKept(lines, entity, value, false)).toBe(1);
    // Flag on: kept unless the persona positively owns it.
    expect(await sweepKept(lines, entity, value, true)).toBe(on === 'keep' ? 1 : 0);
    expect(await deepKept(lines, entity, value, true)).toBe(on === 'drop' ? 0 : 1);
  });
});
