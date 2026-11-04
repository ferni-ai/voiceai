/**
 * FACT_SUBJECT_GUARD through deep extraction's real job path (processJob): the caller's
 * line about the persona ("I thought you had a dog") is never stored as the caller having no
 * dog, and the caller's own fact in the same job is. The model is a fake; everything
 * between its replies and the write is the production code. Fictional lines.
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

  it("on: the persona's no-dog is never the caller's; the caller's kitten is kept", async () => {
    vi.stubEnv('FACT_SUBJECT_GUARD', 'on');
    const { stored, factPrompt } = await run();
    expect(stored).toEqual(['getting a kitten next week']);
    expect(factPrompt).toContain('mean the AI friend, never the caller');
  });

  it('off: both facts are stored and the prompt is as on main', async () => {
    vi.stubEnv('FACT_SUBJECT_GUARD', 'off');
    const { stored, factPrompt } = await run();
    expect(stored).toEqual(['Does not have a dog', 'getting a kitten next week']);
    expect(factPrompt).not.toContain('mean the AI friend');
  });
});
