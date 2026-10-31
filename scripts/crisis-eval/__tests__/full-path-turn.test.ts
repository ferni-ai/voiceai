/**
 * What one simulated turn folds back into the call (full-path-turn.ts): the
 * guard's script when the reply is replaced, the guard's guided-level 988 text
 * when the turn is guided (the default), the neutral stub line when guided
 * replies are neutral or nothing fired. Stub classifier, no network.
 */
import { describe, expect, it } from 'vitest';

import type { CrisisGenerateFn } from '../../../src/services/safety/crisis-classifier.js';
import { NEUTRAL_REPLIES } from '../full-path-corpus.js';
import { PROFILES } from '../full-path-profiles.js';
import { addContext, newCall, simulateTurn } from '../full-path-turn.js';

const env = { ...PROFILES['prod-2026-10-31'] };
const verdicts: Record<string, string> = {
  'Yes.': '{"risk":"crisis","subject":"self"}',
  'Yeah.': '{"risk":"imminent","subject":"self"}',
};
const generate: CrisisGenerateFn = async (_prompt, content) =>
  verdicts[(JSON.parse(content) as { latest: string }).latest] ??
  '{"risk":"none","subject":"self"}';

let n = 0;
async function after(said: string, guidedReply?: 'crisis-line' | 'neutral') {
  const call = newCall(`turn-test-${++n}`, false);
  addContext(call, 'caller', 'Can you help me plan dinner?');
  addContext(call, 'ferni', NEUTRAL_REPLIES[0]);
  const outcome = await simulateTurn(call, said, { env, generate, guidedReply });
  return { outcome, ferni: call.lastAgentResponse ?? '' };
}

describe('simulateTurn', () => {
  it('carries the guard 988 text after a guided turn by default', async () => {
    const { outcome, ferni } = await after('Yes.');
    expect(outcome.activated).toBe(true);
    expect(outcome.replaced).toBe(false);
    expect(ferni).toMatch(/988/);
    expect(NEUTRAL_REPLIES as readonly string[]).not.toContain(ferni);
  });

  it('carries the neutral line after a guided turn with neutral guided replies', async () => {
    const { outcome, ferni } = await after('Yes.', 'neutral');
    expect(outcome.activated).toBe(true);
    expect(NEUTRAL_REPLIES as readonly string[]).toContain(ferni);
  });

  it('carries the 911/988 script after a replaced turn, whatever the guided setting', async () => {
    for (const mode of ['crisis-line', 'neutral'] as const) {
      const { outcome, ferni } = await after('Yeah.', mode);
      expect(outcome.replaced).toBe(true);
      expect(ferni).toMatch(/911/);
    }
  });

  it('carries the neutral line when nothing fired', async () => {
    const { outcome, ferni } = await after('Pasta sounds good.');
    expect(outcome.activated).toBe(false);
    expect(NEUTRAL_REPLIES as readonly string[]).toContain(ferni);
  });
});
