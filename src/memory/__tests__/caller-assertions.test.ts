/**
 * Seth's prod call, 2026-10-12: "What contracts?" became the entity
 * "Contracts", "How are you doing, Freddy?" became "Freddy (person)". These
 * are his real lines from that call.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../knowledge-graph/services/knowledge-capture.js', () => ({
  captureTurn: vi.fn(async () => ({})),
}));

import { CALLER_ASSERTION_RULE, withoutQuestions } from '../caller-assertions.js';
import type { TurnCaptureInput } from '../knowledge-graph/services/knowledge-capture.js';
import { createKnowledgeCaptureQueue } from '../knowledge-graph/services/knowledge-capture-batch.js';
import { createDeepExtractionBatcher } from '../dynamic/deep-extraction-batch.js';
import type { DeepExtractionJob } from '../dynamic/deep-extraction-worker.js';
import { summarizeWithLLM } from '../operations/summarizer.js';

const SETH = [
  'How are you doing, Freddy?',
  'What contracts?',
  'I was working late on some AI.',
  'Do you know where I live?',
];

const noTimers = { setTimer: () => 0, clearTimer: () => undefined };

function turn(turnNumber: number, transcript: string): TurnCaptureInput {
  return { userId: 'u1', sessionId: 's1', turnNumber, transcript };
}

function job(turnNumber: number, transcript: string): DeepExtractionJob {
  return {
    jobId: `job-${turnNumber}`,
    userId: 'u1',
    sessionId: 's1',
    turnNumber,
    transcript,
    timestamp: new Date(turnNumber * 1000),
    priority: 'normal',
    fastCaptureHints: {
      mentionedEntities: [],
      emotionSignals: [],
      topicHints: [],
      dateSignals: [],
      relationshipSignals: [],
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('withoutQuestions', () => {
  it('drops the question sentences of a line and keeps what the caller asserts', () => {
    expect(withoutQuestions('What contracts?')).toBe('');
    expect(withoutQuestions('I did. What contracts?')).toBe('I did.');
    expect(withoutQuestions('I was working late on some AI.')).toBe(
      'I was working late on some AI.'
    );
  });
});

describe('entity capture reads only what the caller asserts', () => {
  async function captured(): Promise<string> {
    const capture = vi.fn(async (_input: TurnCaptureInput) => ({}));
    const q = createKnowledgeCaptureQueue({ capture, ...noTimers });
    SETH.forEach((line, i) => q.queue(turn(i + 1, line)));
    expect(capture).toHaveBeenCalledTimes(1);
    return capture.mock.calls[0][0].transcript;
  }

  it('flag on: "What contracts?" and "…Freddy?" never reach the extractor', async () => {
    vi.stubEnv('CALLER_ASSERTED_MEMORY', 'on');
    expect(await captured()).toBe('I was working late on some AI.');
  });

  it('flag off: the extractor reads every line, as before', async () => {
    vi.stubEnv('CALLER_ASSERTED_MEMORY', 'off');
    expect(await captured()).toBe(SETH.join('\n'));
  });
});

describe('deep extraction reads only what the caller asserts', () => {
  it('flag on: a batch of questions only is not extracted at all', () => {
    vi.stubEnv('CALLER_ASSERTED_MEMORY', 'on');
    const run = vi.fn();
    const b = createDeepExtractionBatcher(run, noTimers);
    ['How are you doing, Freddy?', 'What contracts?', 'Anything new?', 'What is today?'].forEach(
      (line, i) => b.add(job(i + 1, line))
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('flag on: a mixed batch keeps the assertion only', () => {
    vi.stubEnv('CALLER_ASSERTED_MEMORY', 'on');
    const run = vi.fn();
    const b = createDeepExtractionBatcher(run, noTimers);
    SETH.forEach((line, i) => b.add(job(i + 1, line)));
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0].transcript).toBe('I was working late on some AI.');
  });

  it('flag off: a job with an empty transcript still runs, as before', () => {
    vi.stubEnv('CALLER_ASSERTED_MEMORY', 'off');
    const run = vi.fn();
    const b = createDeepExtractionBatcher(run, { ...noTimers, batchTurns: 1 });
    b.add(job(1, ''));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('flag off: the merged transcript is unchanged', () => {
    const run = vi.fn();
    const b = createDeepExtractionBatcher(run, noTimers);
    SETH.forEach((line, i) => b.add(job(i + 1, line)));
    expect(run.mock.calls[0][0].transcript).toBe(SETH.join('\n'));
  });
});

describe('after-call summary is told to drop what the caller questioned or denied', () => {
  async function promptFor(): Promise<string> {
    let prompt = '';
    await summarizeWithLLM(
      's1',
      [
        { role: 'assistant', content: 'How did those contracts end up looking last night?' },
        { role: 'user', content: 'What contracts?' },
        { role: 'user', content: 'I was working late on some AI.' },
      ],
      async (p) => {
        prompt = p;
        return '{}';
      },
      { generateEmbedding: false }
    );
    return prompt;
  }

  it('flag on: the prompt carries the rule', async () => {
    vi.stubEnv('CALLER_ASSERTED_MEMORY', 'on');
    expect(await promptFor()).toContain(CALLER_ASSERTION_RULE);
  });

  it('flag off: the prompt is as before', async () => {
    vi.stubEnv('CALLER_ASSERTED_MEMORY', 'off');
    expect(await promptFor()).not.toContain(CALLER_ASSERTION_RULE);
  });
});
