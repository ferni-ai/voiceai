/**
 * The CRISIS_CLASSIFIER record's `classifier` and `agree` fields: the classifier maps its own
 * verdict onto the guard outcomes (verdictOutcome) and compares it with the pattern outcome.
 * Shadow mode, so the read still runs when the patterns block. Every line is invented.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[][]);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const logger = {
    debug: () => undefined,
    info: (...args: unknown[]) => logged.push(args),
    warn: () => undefined,
    error: () => undefined,
    child: () => logger,
  };
  return { ...actual, createLogger: () => logger };
});

import {
  resetCrisisClassifierCache,
  startCrisisClassifier,
  type CrisisGenerateFn,
} from '../crisis-classifier.js';

const SHADOW = { CRISIS_CLASSIFIER_MODE: 'shadow', CRISIS_CLASSIFIER_TIMEOUT_MS: '2000' };
const LINE = {
  latest: 'an invented line from Riley Test',
  earlier: [],
  companion: 'an invented reply',
};

/** The CRISIS_CLASSIFIER record of one shadow read answering `text` against `pattern`. */
async function record(text: string, pattern: 'none' | 'crisis' | 'block') {
  const generate = vi.fn<CrisisGenerateFn>(async () => text);
  await startCrisisClassifier(LINE, { pattern, generate, env: SHADOW })?.verdict;
  const records = logged.filter(([, m]) => m === 'CRISIS_CLASSIFIER').map(([f]) => f);
  expect(records).toHaveLength(1);
  return records[0] as { classifier: unknown; pattern: unknown; agree: unknown };
}

beforeEach(() => {
  resetCrisisClassifierCache();
  logged.length = 0;
});

describe('CRISIS_CLASSIFIER record: classifier and agree', () => {
  it("an imminent-for-self read against a 'block' pattern logs classifier 'block', agree true", async () => {
    expect(await record('{"risk":"imminent","subject":"self"}', 'block')).toMatchObject({
      classifier: 'block',
      pattern: 'block',
      agree: true,
    });
  });

  it("a third-party imminent read logs classifier 'crisis': agree false against 'block'", async () => {
    expect(await record('{"risk":"imminent","subject":"third_party"}', 'block')).toMatchObject({
      classifier: 'crisis',
      pattern: 'block',
      agree: false,
    });
  });
});
