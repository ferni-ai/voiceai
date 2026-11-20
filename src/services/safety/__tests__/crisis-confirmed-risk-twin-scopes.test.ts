/**
 * Twin scopes in the confirmed-risk ledger (crisis-confirmed-risk.ts, twin-crisis-scope.ts):
 * a flood of typed twin scopes never costs a call its entry, the ledger keeps at most
 * TWIN_SCOPES_MAX twin scopes, oldest first, and calls alone go oldest first past
 * MAX_CALLS as before. An entry is seen through the after-check: a confirmed call is never
 * re-read, so a later turn asks nothing; a lost entry re-reads (and eases) on its second
 * classifier-only turn. Synthetic lines; the classifier is stubbed.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { CrisisGenerateFn } from '../crisis-classifier.js';
import {
  afterCheckLoneRead,
  noteConfirmedRisk,
  resetConfirmedCallRisk,
} from '../crisis-confirmed-risk.js';
import { detectCrisis } from '../crisis-guard.js';

const ON = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_AGREEMENT_GATE: 'on',
  CRISIS_CONFIRMED_CALL_RISK: 'on',
};
const MAX_CALLS = 2000; // crisis-confirmed-risk.ts
const TWIN_SCOPE_PREFIX = 'twin-crisis:'; // twin-crisis-scope.ts
const TWIN_SCOPES_MAX = 1000; // twin-crisis-scope.ts
const twin = (i: number): string => `${TWIN_SCOPE_PREFIX}riley-test-${i}`;
const callId = (i: number): string => `twin-ledger-call-${i}`;

afterEach(() => resetConfirmedCallRisk());

/** Whether the ledger still holds this scope's confirmed entry (it then reads nothing more). */
async function stillConfirmed(call: string): Promise<boolean> {
  let reads = 0;
  const generate: CrisisGenerateFn = async () => {
    reads++;
    return '{"risk":"none","subject":"self"}';
  };
  const turn = async (latest: string): Promise<unknown> =>
    afterCheckLoneRead({
      call,
      input: { latest, earlier: [] },
      verdict: { risk: 'crisis', subject: 'self' },
      detection: detectCrisis(latest),
      pattern: 'none',
      source: 'gate',
      env: ON,
      generate,
    });
  await turn('Riley Test missed the bus.');
  await turn('Riley Test made soup tonight.');
  return reads === 0;
}

describe('twin scopes in the confirmed-risk ledger', () => {
  it("a twin flood past the cap leaves every call's entry", async () => {
    for (let i = 0; i < 1500; i++) noteConfirmedRisk(callId(i), ON);
    for (let i = 0; i < 3 * TWIN_SCOPES_MAX; i++) noteConfirmedRisk(twin(i), ON);
    expect(await stillConfirmed(callId(0))).toBe(true);
    expect(await stillConfirmed(callId(1499))).toBe(true);
  });

  it('keeps at most TWIN_SCOPES_MAX twin scopes, oldest first', async () => {
    for (let i = 0; i < TWIN_SCOPES_MAX + 500; i++) noteConfirmedRisk(twin(i), ON);
    expect(await stillConfirmed(twin(500))).toBe(true);
    expect(await stillConfirmed(twin(499))).toBe(false);
  });

  it('calls alone: past MAX_CALLS the oldest call goes, as before', async () => {
    for (let i = 0; i <= MAX_CALLS; i++) noteConfirmedRisk(callId(i), ON);
    expect(await stillConfirmed(callId(1))).toBe(true);
    expect(await stillConfirmed(callId(0))).toBe(false);
  });
});
