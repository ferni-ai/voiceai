/**
 * CRISIS_LEXICAL_V2 off is main, byte for byte. The golden was written by this test on
 * main (bf5d4e9b2) before the flag existed: for each fictional line, what the two legacy
 * word checks decide (performSafetyCheck, the human-transfer detector), the injections
 * they build, and whether a crisis_signals doc is written. Any drift with the flag off
 * fails here. Regenerate only on purpose, with the reason in the PR.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GOLDEN_LINES } from './fixtures/legacy-word-lines.js';

const fake = vi.hoisted(() => {
  const written: string[] = [];
  const chain = {
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    get: async () => ({ docs: [] }),
    add: async (doc: { signals?: { severity?: number } }) =>
      void written.push(`severity ${doc.signals?.severity}`),
  };
  const db = { collection: () => ({ doc: () => ({ collection: () => chain }) }) };
  return { db, written };
});

vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fake.db,
}));

const { buildSafetyInjections } = await import('../safety-coaching-builders.js');
const { buildHumanTransferInjections } = await import('../better-than-human-builders.js');
const { performSafetyCheck } = await import('../../../../services/safety/index.js');
const { humanTransfer } = await import('../../../../services/human-transfer/index.js');
type SafetyContext = Parameters<typeof buildSafetyInjections>[0];

const ctxFor = (userText: string): SafetyContext =>
  ({
    userText,
    services: { userId: 'uid-golden', sessionId: 'session-golden' },
    userData: { relationshipStage: 'friend' },
    persona: { id: 'ferni' },
  }) as never;

let n = 0;
async function decide(line: string) {
  n += 1;
  fake.written.length = 0;
  const check = performSafetyCheck(line, { userId: 'uid-golden', personaId: 'ferni' });
  const signals = humanTransfer.detectCrisisSignals(line);
  const transfer = await buildHumanTransferInjections(line, `uid-golden-${n}`, `session-${n}`, 1);
  await new Promise((resolve) => {
    setTimeout(resolve, 0); // the write is fire-and-forget
  });
  return {
    line,
    safetyCheck: {
      crisisDetected: check.crisisDetected,
      primary: check.detection.primary && {
        type: check.detection.primary.type,
        severity: check.detection.primary.severity,
      },
      level: check.escalation.level,
      shouldInterrupt: check.shouldInterrupt,
    },
    safetyInjections: await buildSafetyInjections(ctxFor(line)),
    transferSignals: signals,
    transferDecision: humanTransfer.evaluateTransferNeed(line).type,
    transferInjection: transfer,
    crisisSignalsWritten: [...fake.written],
  };
}

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-31T15:00:00Z'));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('CRISIS_LEXICAL_V2 off: the legacy word checks are main', () => {
  it('every golden line decides, injects and writes exactly as main', async () => {
    vi.stubEnv('CRISIS_LEXICAL_V2', 'off');
    const out = [];
    for (const line of new Set(GOLDEN_LINES)) out.push(await decide(line));
    await expect(`${JSON.stringify(out, null, 2)}\n`).toMatchFileSnapshot(
      './fixtures/legacy-word-checks-golden.json'
    );
  });
});
