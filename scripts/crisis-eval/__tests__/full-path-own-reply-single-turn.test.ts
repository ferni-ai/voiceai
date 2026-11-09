/**
 * CRISIS_OWN_SCRIPT_NOT_EVIDENCE cannot change a single-turn labelled case: its
 * Ferni lines come in as context (addContext), never from a crisis path, so the
 * classifier reads the same bytes with the flag off and on. A severity change on
 * such a case between the two arms is the model's own variance, not the flag.
 * Stub classifier that records every request, no network.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../src/services/safety/crisis-classifier.js';
import { resetCrisisCallRisk } from '../../../src/services/safety/crisis-call-risk.js';
import { resetCallRiskSnapshots } from '../../../src/services/safety/crisis-lone-imminent.js';
import { callOfCase } from '../full-path-corpus.js';
import { PROFILES } from '../full-path-profiles.js';
import { addContext, newCall, simulateTurn } from '../full-path-turn.js';
import { labelledCases } from '../labelled-cases.js';

const PROD = { ...PROFILES['prod-2026-11-01'] };
const ARMS = {
  off: PROD,
  on: { ...PROD, CRISIS_OWN_SCRIPT_NOT_EVIDENCE: 'on' },
};

/** Every classifier request (prompt and input) the case's turn sends, in order. */
async function requestsOf(
  id: string,
  env: Record<string, string>,
  control?: { companion: string; latest: string }
): Promise<string[]> {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  const sent: string[] = [];
  const generate: CrisisGenerateFn = async (prompt, content) => {
    sent.push(`${prompt}\n---\n${content}`);
    return '{"risk":"imminent","subject":"self"}';
  };
  const call = newCall(`own-reply-single-${id}`, false);
  if (control) {
    addContext(call, 'ferni', control.companion);
    call.lastAgentResponseCrisisHelp = true; // as if a crisis path had produced it
    await simulateTurn(call, control.latest, { env, generate });
    return sent;
  }
  const spec = callOfCase(labelledCases().find((c) => c.id === id)!);
  for (const line of spec.opening) addContext(call, line.who, line.text);
  await simulateTurn(call, spec.turns[0].text, { env, generate });
  return sent;
}

const digestOf = (sent: string[]): string =>
  createHash('sha256').update(sent.join('\n===\n')).digest('hex');

describe('single-turn labelled cases read the same bytes with the flag off and on', () => {
  for (const id of ['blind-63', 'gloomy-76']) {
    it(`${id}: classifier requests are byte-identical`, async () => {
      const off = await requestsOf(id, ARMS.off);
      const on = await requestsOf(id, ARMS.on);
      expect(off.length).toBeGreaterThan(0); // not a vacuous match: the classifier was asked
      expect(on).toEqual(off);
      expect(digestOf(on)).toBe(digestOf(off));
    });
  }

  it("control: the same harness sees the marker when the line is Ferni's own crisis reply", async () => {
    const control = {
      companion:
        "I'm glad you told me, Sam. You can call or text 988 any time. I'm right here with you.",
      latest: 'Thanks, talk later.',
    };
    const off = await requestsOf('control', ARMS.off, control);
    const on = await requestsOf('control', ARMS.on, control);
    expect(off.length).toBeGreaterThan(0);
    expect(digestOf(on)).not.toBe(digestOf(off));
  });
});
