/**
 * FACT_SUBJECT_GUARD through deep extraction's real job path (processJob): with the flag on,
 * the fact prompt says whose "you" is ("I thought you had a dog" is about the AI friend), and
 * every fact the model returns is still stored: nothing is dropped after the model. The model
 * is a fake; everything between its replies and the write is the production code. Fictional
 * lines.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', () => {
  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  return { createLogger: () => logger, getLogger: () => logger };
});
vi.mock('../async-events-config.js', () => ({ safeOnEvent: () => () => undefined }));

import {
  DeepExtractionWorker,
  type DeepExtractionJob,
  type ExtractionResult,
} from '../deep-extraction-worker.js';
import { factExtractionPrompt } from '../deep-extraction-prompts.js';
import { FACT_SUBJECT_RULE } from '../fact-subject.js';

const FACTS = [
  {
    entityName: 'User',
    factType: 'state',
    key: 'pets',
    value: 'Does not have a dog',
    confidence: 0.85,
  },
  {
    entityName: 'User',
    factType: 'event',
    key: 'plans',
    value: 'getting a kitten next week',
    confidence: 0.9,
  },
];

/** A model that answers each extraction step the way Gemini's SDK does. */
function fakeModel(prompts: string[]) {
  const reply = (prompt: string): string => {
    if (prompt.startsWith('You are an expert at identifying entities'))
      return JSON.stringify([{ name: 'kitten', type: 'thing', attributes: {}, confidence: 0.9 }]);
    if (prompt.startsWith('You are extracting factual information')) return JSON.stringify(FACTS);
    return prompt.startsWith('You are refining') ? '{}' : '[]';
  };
  return {
    generateContent: async (prompt: string) => (
      prompts.push(prompt),
      { response: Promise.resolve({ text: () => reply(prompt) }) }
    ),
  };
}

const job: DeepExtractionJob = {
  jobId: 'job-1',
  userId: 'u-subject',
  sessionId: 's-subject',
  turnNumber: 3,
  transcript: "Really? I thought you had a dog.\nI'm getting a kitten next week.",
  timestamp: new Date('2026-11-02T22:10:00Z'),
  priority: 'normal',
  fastCaptureHints: {
    mentionedEntities: [],
    emotionSignals: [],
    topicHints: [],
    dateSignals: [],
    relationshipSignals: [],
  },
};

async function run(): Promise<{ stored: string[]; factPrompt: string }> {
  const worker = new DeepExtractionWorker({ batchTurns: 1 });
  const prompts: string[] = [];
  const persisted: ExtractionResult[] = [];
  Object.assign(worker, {
    getGeminiModel: async () => fakeModel(prompts),
    persistExtraction: async (_u: string, result: ExtractionResult) => void persisted.push(result),
  });
  await worker['processJob'](job);
  const factPrompt = prompts.find((p) => p.startsWith('You are extracting factual')) ?? '';
  return { stored: persisted.flatMap((r) => r.facts.map((f) => f.value)), factPrompt };
}

describe('deep extraction with FACT_SUBJECT_GUARD', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('on: the model is told whose "you" it is, and what it returns is all stored', async () => {
    vi.stubEnv('FACT_SUBJECT_GUARD', 'on');
    const { stored, factPrompt } = await run();
    expect(stored).toEqual(['Does not have a dog', 'getting a kitten next week']);
    expect(factPrompt).toContain(FACT_SUBJECT_RULE);
  });

  it('off: both facts are stored and the prompt is as on main', async () => {
    vi.stubEnv('FACT_SUBJECT_GUARD', 'off');
    const { stored, factPrompt } = await run();
    expect(stored).toEqual(['Does not have a dog', 'getting a kitten next week']);
    expect(factPrompt).not.toContain(FACT_SUBJECT_RULE);
  });

  it('the rule rides on the fact prompt with or without CALLER_CARD, and only when on', () => {
    expect(factExtractionPrompt(false, true)).toContain(FACT_SUBJECT_RULE);
    expect(factExtractionPrompt(true, true)).toContain(FACT_SUBJECT_RULE);
    expect(factExtractionPrompt(false)).not.toContain(FACT_SUBJECT_RULE);
    expect(factExtractionPrompt(true)).not.toContain(FACT_SUBJECT_RULE);
  });
});
