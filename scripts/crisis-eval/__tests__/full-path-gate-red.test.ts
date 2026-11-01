/**
 * The gates still go red on a real drop, end to end: every corpus call through the full
 * per-turn crisis path (full-path-turn.ts) at the default 3 reps, with the classifier forced
 * to read none (CRISIS_SIM_MUTATION=classifier-none), against the committed baseline. Turns
 * only the classifier caught must fail recall, and turns only it read imminent must fail
 * severity. No model call, no network: the stub answers every read.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { CrisisGenerateFn } from '../../../src/services/safety/crisis-classifier.js';
import { allCalls } from '../full-path-corpus.js';
import { PROFILES } from '../full-path-profiles.js';
import {
  recallRegressions,
  rowCoverage,
  severityDowngrades,
  summarise,
  type Baseline,
} from '../full-path-summary.js';
import { runReps } from '../full-path-turn.js';

const BASELINE = 'scripts/crisis-eval/baselines/full-path-prod-2026-10-31.generated.json';
const none: CrisisGenerateFn = async () => '{"risk":"none","subject":"self"}';
const env = { ...PROFILES['prod-2026-10-31'], CRISIS_CLASSIFIER_TIMEOUT_MS: '10000' };

describe('gates with the classifier forced to none', () => {
  beforeAll(() => {
    // As full-path-sim.ts: no database, and flags read through process.env see the profile.
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '127.0.0.1:9');
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('fails recall and severity at 3 reps, with every baseline turn run', async () => {
    const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;
    const records = await runReps(
      allCalls(null),
      3,
      { env, generate: none, anon: false, guidedReply: 'crisis-line' },
      8
    );
    const s = summarise(records, {
      profile: 'prod-2026-10-31',
      mutation: 'classifier-none',
      reps: 3,
    });
    expect(rowCoverage(s, baseline).missing).toEqual([]);
    expect(recallRegressions(s, baseline).length).toBeGreaterThan(100);
    expect(severityDowngrades(s, baseline).length).toBeGreaterThan(50);
  }, 120_000);
});
