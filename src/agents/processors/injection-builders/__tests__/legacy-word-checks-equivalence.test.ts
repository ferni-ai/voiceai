/**
 * CRISIS_LEXICAL_V2 on is main, line for line, but for the sight cue it implies (#3267).
 *
 * Every line goes through both legacy word checks (buildSafetyInjections ->
 * performSafetyCheck, buildHumanTransferInjections -> the human-transfer detector and its
 * crisis_signals writer on a fake store) in six modes: CRISIS_GUARD_MODE live, shadow and
 * off, on the cascade and on a realtime voice path. With the flag on, the FULL output must
 * equal main's: every injection's text, every crisis_signals field, the transfer note,
 * every detector signal and the safety check. The only lines allowed to differ are SIGHT_CUE,
 * and each must equal exactly what CRISIS_SIGHT_NEEDS_CUE=on gives main (the flag implies
 * it). A listed line that stops differing fails too, so the list stays exact. Each line is
 * the caller's whole turn (withCallerWords, as the context pusher reads it).
 *
 * Lines: the round-2 and round-3 verifiers' 233 real-risk and 80 benign lines, plus this PR's own.
 * All fictional.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VERIFIER from './fixtures/legacy-word-equivalence-lines.json' with { type: 'json' };
import { SIGHT_CUE } from './fixtures/legacy-word-equivalence-expected.js';
import {
  GOLDEN_LINES,
  HELD_OUT_STRONG,
  MIXED_RISK,
  MUST_KEEP,
} from './fixtures/legacy-word-lines.js';

const fake = vi.hoisted(() => {
  const docs = new Map<string, unknown[]>();
  const db = {
    collection: () => ({
      doc: (uid: string) => ({
        collection: () => ({
          where: () => db.collection().doc(uid).collection(),
          orderBy: () => db.collection().doc(uid).collection(),
          limit: () => db.collection().doc(uid).collection(),
          get: async () => ({ docs: [] }),
          add: async (doc: unknown) => void docs.set(uid, [...(docs.get(uid) ?? []), doc]),
        }),
      }),
    }),
  };
  return { db, docs };
});

vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fake.db,
}));

const { buildSafetyInjections } = await import('../safety-coaching-builders.js');
const { buildHumanTransferInjections } = await import('../better-than-human-builders.js');
const { performSafetyCheck } = await import('../../../../services/safety/index.js');
const { humanTransfer } = await import('../../../../services/human-transfer/index.js');
const { withCallerWords } = await import('../../../../services/human-transfer/sight-emergency.js');
type SafetyContext = Parameters<typeof buildSafetyInjections>[0];

const LINES = [
  ...new Set<string>([
    ...VERIFIER.risk,
    ...MUST_KEEP,
    ...MIXED_RISK,
    ...HELD_OUT_STRONG,
    ...GOLDEN_LINES,
    ...VERIFIER.benign,
  ]),
];
const MODES = ['live', 'shadow', 'off'].flatMap((gate) =>
  ['cartesia-cascade', 'openai-realtime'].map((pipeline) => ({ gate, pipeline }))
);
type Mode = (typeof MODES)[number];

/** One caller turn through both word checks: everything they produce, in full. */
const turn = (line: string, uid: string) => withCallerWords(line, () => turnChecks(line, uid));

async function turnChecks(line: string, uid: string) {
  fake.docs.delete(uid);
  const ctx: SafetyContext = {
    userText: line,
    services: { userId: uid, sessionId: `session-${uid}` },
    userData: { relationshipStage: 'friend' },
    persona: { id: 'ferni' },
  } as never;
  const safety = await buildSafetyInjections(ctx);
  const transfer = await buildHumanTransferInjections(line, uid, `session-${uid}`, 1);
  await new Promise((resolve) => {
    setTimeout(resolve, 0); // the write is fire-and-forget
  });
  const check = performSafetyCheck(line, { userId: uid, personaId: 'ferni' });
  const { metadata: _when, ...detection } = check.detection;
  return {
    safety,
    transfer,
    signals: humanTransfer.detectCrisisSignals(line),
    check: { ...check, detection },
    crisisSignals: fake.docs.get(uid) ?? [],
  };
}

function setMode(mode: Mode, env: Record<string, string>) {
  vi.unstubAllEnvs();
  vi.stubEnv('CRISIS_GUARD_MODE', mode.gate);
  vi.stubEnv('VOICE_PIPELINE', mode.pipeline);
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
}

const MAIN = { CRISIS_LEXICAL_V2: 'off', CRISIS_SIGHT_NEEDS_CUE: 'off' };
const MAIN_WITH_CUE = { CRISIS_LEXICAL_V2: 'off', CRISIS_SIGHT_NEEDS_CUE: 'on' };
const FLAG_ON = { CRISIS_LEXICAL_V2: 'on', CRISIS_SIGHT_NEEDS_CUE: 'off' };

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

describe('CRISIS_LEXICAL_V2 on: every line equals main, but for the sight-cue lines', () => {
  it('the list names lines that are in the set', () => {
    for (const line of SIGHT_CUE) expect(LINES).toContain(line);
    expect(LINES.length).toBe(324); // 233 + 80 from the verifies (rounds 2 and 3), the rest this PR's own
  });

  describe.each(MODES)('gate $gate, $pipeline', (mode) => {
    it('full output', async () => {
      let i = 0;
      for (const line of LINES) {
        i += 1;
        const uid = `uid-eq-${i}`;
        setMode(mode, MAIN);
        const main = await turn(line, uid); // eslint-disable-line no-await-in-loop
        setMode(mode, FLAG_ON);
        const on = await turn(line, uid); // eslint-disable-line no-await-in-loop
        if (SIGHT_CUE.includes(line)) {
          expect(on, line).not.toEqual(main);
          setMode(mode, MAIN_WITH_CUE);
          expect(on, line).toEqual(await turn(line, uid)); // eslint-disable-line no-await-in-loop
        } else {
          expect(on, line).toEqual(main);
        }
      }
    }, 300_000);
  });
});
