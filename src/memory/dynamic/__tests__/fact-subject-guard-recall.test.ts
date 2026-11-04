/**
 * FACT_SUBJECT_GUARD never costs the caller a fact of their own: every row is a caller fact
 * the guard must keep, run end to end through both extractors with the flag on (the after-call
 * sweep sees both sides; deep extraction sees the caller's lines only). The traced shapes
 * still drop. Fictional lines; common first names that are also persona canon names
 * (Owen, Daniel, Diane, Sam, Marty, Lyle) are used on purpose.
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

/** id, the call ("C:" caller, "P:" persona), and the fact the model returns. */
type Row = [id: string, lines: string[], entityName: string, value: string];

const KEEP: Row[] = [
  // Common first names that are also canon names; filler "you"
  ['C1', ['P:My partner Sam is a great cook.', 'C:Ha, my sister is also called Sam.'], 'Sam', 'sister'],
  ['C2', ['P:I have a dog named Compass.', "C:No way, my dog's name is Compass too."], 'User', 'has a dog named Compass'],
  ['C3', ['C:Sam is coming to visit on Saturday.'], 'Sam', 'coming to visit on Saturday'],
  ['C4', ['C:What do you think, should Owen take the job in Denver?'], 'Owen', 'has a job offer in Denver'],
  ['C5', ['C:Daniel just got promoted, you know, at the bank.'], 'Daniel', 'got promoted at the bank'],
  ['C6', ['C:Thanks to you Daniel and I are engaged now.'], 'User', 'engaged to Daniel'],
  ['C7', ['C:My brother, the one who lives in Austin with the two cats, Marty, is getting married.'], 'Marty', 'getting married'],
  ['C8', ['P:My friend Lyle is visiting.', 'C:Funny, my coworker is Lyle too.'], 'Lyle', 'coworker'],
  ['C9', ['C:Should I text Marty back tonight?'], 'Marty', 'texted the user'],
  ['C10', ["C:Diane, you'd love her, she's my aunt."], 'Diane', 'aunt'],
  // Agreeing with the persona: same / me too / mine too / so do I / a bare repeat
  ['M1', ["P:I've got a golden retriever.", 'C:Me too, a golden retriever named Rex.'], 'User', 'has a golden retriever named Rex'],
  ['M2', ['P:I have two kids.', 'C:Same, two boys.'], 'User', 'has two boys'],
  ['M3', ['P:I have two kids.', 'C:Same. Two kids.'], 'User', 'has two kids'],
  ['M4', ['P:My birthday is in March.', 'C:Mine too, March.'], 'User', 'March'],
  ['M5', ['P:I grew up in Ohio.', 'C:Same! Ohio.'], 'User', 'grew up in Ohio'],
  ['M6', ['P:I love jazz.', 'C:Love jazz.'], 'User', 'loves jazz'],
  ['M7', ['P:I love jazz.', 'C:So do I, jazz is everything.'], 'User', 'loves jazz'],
  ['M8', ['P:I grew up in Ohio.', 'C:Yeah. Ohio.'], 'User', 'grew up in Ohio'],
  // Corrections
  ['K1', ['P:Pepper is my dog, right?', "C:No, that's MY dog. Pepper is mine."], 'Pepper', "user's dog"],
  ['K2', ['P:How is my pup Pepper?', 'C:No, Pepper is MY dog.'], 'Pepper', "user's dog"],
  // Third person
  ['T1', ['C:My son Eli starts college in the fall.'], 'Eli', 'starts college in the fall'],
  ['T2', ['C:Rachel just got promoted at the bank.'], 'Rachel', 'got promoted at the bank'],
  ['T3', ['C:Rachel just got promoted, you know, at the bank.'], 'Rachel', 'got promoted at the bank'],
  ['T4', ['C:What do you think, should Rachel take the job in Denver?'], 'Rachel', 'has a job offer in Denver'],
  ['T5', ['P:My sister loves hiking.', 'C:My sister Nora hates hiking.'], 'Nora', 'hates hiking'],
  // No pronoun (speech to text drops them), and filler "you"
  ['A1', ['C:got a new puppy last week'], 'User', 'got a new puppy last week'],
  ['A2', ['C:got a new puppy last week you know'], 'User', 'got a new puppy last week'],
  ['A3', ['C:you know what got a new puppy last week'], 'User', 'got a new puppy last week'],
  ['A4', ['C:thank you got a new job at the hospital'], 'User', 'new job at the hospital'],
  ['A5', ["C:Running at six every morning, you'd hate it."], 'User', 'running at six every morning'],
  ['A6', ['C:moving to Tampa', 'C:in June'], 'User', 'moving to Tampa in June'],
  // The persona's words repeated, the caller's own added
  ['R1', ['P:I have a dog named Compass.', 'C:You have a dog? I have two.'], 'User', 'has two dogs'],
  ['R2', ['P:I have a dog.', 'C:You have a dog? Got two labs.'], 'User', 'has two labs'],
  ['R3', ['P:I have a dog.', 'C:You have a dog? I have two dogs.'], 'User', 'has dogs'],
  ['R4', ['P:My dog loves the beach.', 'C:Your dog sounds like my dog, she loves the beach too.'], 'User', 'dog loves the beach'],
  ['R5', ['P:I love Italy.', 'C:You love Italy? I lived in Rome for two years.'], 'User', 'lived in Rome for two years'],
  ['R6', ['C:Your tip about sleep helped, sleeping eight hours now.'], 'User', 'sleeping eight hours now'],
  // A question that says "you have" still holds the caller's own news
  ['Q1', ['C:Do you have any tips for when the twins start school on Monday?'], 'User', 'twins start school on Monday'],
]; // prettier-ignore

/** The traced shapes and "your dog", and on which path the guard can see them. */
const DROP: Array<[...Row, sweep: boolean, deep: boolean]> = [
  ['S1', ['C:Who do you hang out with?', 'P:My buddies Theo and Wren, we go way back.', 'C:Theo and Wren.', 'P:Yep, those two are my people.'], 'User', 'Theo and Wren', true, false],
  ['S2', ['C:Who are your friends?', 'P:My friends Lyle and Hollis, mostly.', 'C:Lyle and Hollis.', 'P:That is them.'], 'User', 'Lyle and Hollis', true, false],
  ['S3', ['C:Really? I thought you had a dog.', "P:Nope, I don't have a dog."], 'User', 'Does not have a dog', true, true],
  ['S4', ['C:Your dog is so cute.'], 'User', 'has a cute dog', true, true],
]; // prettier-ignore

const factJson = (entityName: string, value: string): string =>
  JSON.stringify([{ entityName, value, key: 'k', factType: 'state', confidence: 0.9 }]);

async function sweepKept(lines: string[], entityName: string, value: string): Promise<number> {
  const turns = lines.map((l) => ({
    role: l.startsWith('C:') ? 'user' : 'assistant',
    content: l.slice(2),
  }));
  return sweepAfterCall(
    {
      userId: 'u-recall',
      sessionId: 's-recall',
      startedAt: new Date('2026-11-02T18:00:00Z'),
      turns,
    },
    {
      env: { FACT_SWEEP: 'on', FACT_SUBJECT_GUARD: 'on' },
      llm: async () => factJson(entityName, value),
      store: { facts: async () => [], add: async (_u, docs) => docs.length },
    }
  );
}

async function deepKept(lines: string[], entityName: string, value: string): Promise<number> {
  vi.stubEnv('FACT_SUBJECT_GUARD', 'on');
  const worker = new DeepExtractionWorker({ batchTurns: 1 });
  const persisted: ExtractionResult[] = [];
  const reply = (prompt: string): string => {
    if (prompt.startsWith('You are an expert at identifying entities'))
      return JSON.stringify([{ name: 'thing', type: 'thing', attributes: {}, confidence: 0.9 }]);
    if (prompt.startsWith('You are extracting factual')) return factJson(entityName, value);
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
  return persisted.flatMap((r) => r.facts).length;
}

describe('FACT_SUBJECT_GUARD on keeps every caller fact of their own', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(KEEP)('%s: kept by the after-call sweep', async (_id, lines, entity, value) => {
    expect(await sweepKept(lines, entity, value)).toBe(1);
  });

  it.each(KEEP)('%s: kept by deep extraction', async (_id, lines, entity, value) => {
    expect(await deepKept(lines, entity, value)).toBe(1);
  });
});

describe('FACT_SUBJECT_GUARD on still drops the traced shapes', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(DROP)('%s', async (...row) => {
    const [, lines, entity, value, sweep, deep] = row;
    expect(await sweepKept(lines, entity, value)).toBe(sweep ? 0 : 1);
    expect(await deepKept(lines, entity, value)).toBe(deep ? 0 : 1);
  });
});
