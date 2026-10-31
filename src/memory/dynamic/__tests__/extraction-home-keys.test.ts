/**
 * Home kept apart from where they are right now (right-moment memory §5.3, prompt keys).
 * With CALLER_CARD on, the fact prompt asks for `home` and `current location` as separate
 * keys on the caller, so FACT_SUPERSESSION replaces home only with a newer home. Off, the
 * prompt is byte-identical to main's (the golden below was taken from origin/main before
 * the prompts moved). The flag is read as the caller's call had it (envForCaller through
 * config/person-flag.ts), never from process.env, which may hold the next caller's flags.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', () => {
  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  return { createLogger: () => logger, getLogger: () => logger };
});
vi.mock('../async-events-config.js', () => ({ safeOnEvent: () => () => undefined }));
vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => null,
  cleanForFirestore: <T>(o: T) => o,
}));

import { usePersonFlagLookup } from '../../../config/person-flag.js';
import { callerFlag } from '../../../services/platform/caller-flag.js';
import {
  applyFlags,
  forgetAgentValues,
  forgetFlagCache,
  type CohortStore,
} from '../../../services/platform/cohort-flags.js';
import { factExtractionPrompt } from '../deep-extraction-prompts.js';
import { DeepExtractionWorker, type DeepExtractionJob } from '../deep-extraction-worker.js';

// FACT_EXTRACTION_PROMPT on origin/main f6f48e476, sha256 ab16f1c2...aecd5 (538 chars).
const GOLDEN = [
  'You are extracting factual information that should be remembered about entities.',
  '',
  'Given entities and transcript, extract NEW FACTS learned about each entity.',
  '',
  'Fact types:',
  '- attribute: A property (birthday, job, location)',
  '- event: Something that happened or will happen',
  '- relationship: How entities relate',
  '- state: Current situation',
  '- preference: Likes, dislikes, preferences',
  '',
  'Only extract facts explicitly stated or strongly implied. Be conservative.',
  '',
  'Return JSON array with: entityName, factType, key, value, confidence, temporalContext.',
].join('\n');
const HOME =
  '- Where the speaker lives: entityName "User", key "home", value a city or neighbourhood, never a street address.';
const NOW = '- Where the speaker is right now: entityName "User", key "current location".';

describe('factExtractionPrompt', () => {
  it('flag off: byte-identical to the prompt on main', () => {
    expect(factExtractionPrompt(false)).toBe(GOLDEN);
  });

  it('flag on: appends exactly the home and current-location lines', () => {
    const on = factExtractionPrompt(true);
    expect(on).toBe(`${GOLDEN}\n${HOME}\n${NOW}`);
    expect(on).toContain('key "home"');
    expect(on).toContain('key "current location"');
  });
});

// The worker, end to end, with a model that records each prompt it is sent.
const RILEY = 'riley-test-1';
const job = (userId: string): DeepExtractionJob => ({
  jobId: `job-${userId}`,
  userId,
  sessionId: `call-${userId}`,
  turnNumber: 1,
  transcript: 'I moved to Maplewood last spring, I am at the airport right now.',
  timestamp: new Date('2026-10-30T12:00:00Z'),
  priority: 'normal',
  fastCaptureHints: {
    mentionedEntities: [],
    emotionSignals: [],
    topicHints: [],
    dateSignals: [],
    relationshipSignals: [],
  },
});
async function factPromptFor(userId: string): Promise<string> {
  const prompts: string[] = [];
  const worker = new DeepExtractionWorker({ batchTurns: 1 });
  const model = {
    generateContent: async (prompt: string) => {
      prompts.push(prompt);
      const text = '[{"name":"User","type":"person","attributes":{},"confidence":0.9}]';
      return { response: Promise.resolve({ text: () => text }) };
    },
  };
  worker['getGeminiModel'] = async () => model;
  await worker['processJob'](job(userId));
  const fact = prompts.find((p) => p.startsWith(GOLDEN.split('\n')[0]));
  if (!fact) throw new Error('no fact prompt sent');
  return fact;
}
const cohorts = (onFor: string[]): CohortStore => ({
  cohortsFor: async (u) =>
    onFor.includes(u) ? [{ id: 'owner', enabled: true, flags: { CALLER_CARD: 'on' } }] : [],
  overridesFor: async () => ({}),
});
// The agent process as it is after the call: COHORT_FLAGS on, the next caller's flags applied.
function wireCallerEnv(store: CohortStore, nextCallerFlags: Record<string, string>): void {
  const env: NodeJS.ProcessEnv = { COHORT_FLAGS: 'on' };
  applyFlags(nextCallerFlags, env);
  usePersonFlagLookup((uid, flag) => callerFlag(uid, flag, { store, env }));
}

afterEach(() => {
  vi.unstubAllEnvs();
  usePersonFlagLookup(async () => undefined);
  forgetAgentValues();
  forgetFlagCache();
});

describe('deep extraction reads CALLER_CARD as the caller had it (envForCaller)', () => {
  it("on for the caller's cohort, off in process.env: the home lines are sent", async () => {
    vi.stubEnv('CALLER_CARD', 'off');
    wireCallerEnv(cohorts([RILEY]), {});
    const prompt = await factPromptFor(RILEY);
    expect(prompt.startsWith(`${GOLDEN}\n${HOME}\n${NOW}\n`)).toBe(true);
  });

  it("on for the next caller only (in process.env): this caller's prompt is unchanged", async () => {
    vi.stubEnv('CALLER_CARD', 'on');
    wireCallerEnv(cohorts([]), { CALLER_CARD: 'on' });
    const prompt = await factPromptFor(RILEY);
    expect(prompt.startsWith(`${GOLDEN}\n`)).toBe(true);
    expect(prompt).not.toContain('key "home"');
  });
});
