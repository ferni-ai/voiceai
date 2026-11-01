/**
 * CRISIS_LEXICAL_V2 on is main, line for line (#3267 redesign after the round-2 verify).
 *
 * Every line goes through both legacy word checks (buildSafetyInjections ->
 * performSafetyCheck, buildHumanTransferInjections -> the human-transfer detector and its
 * crisis_signals writer on a fake store) in six modes: CRISIS_GUARD_MODE live, shadow and
 * off, on the cascade and on a realtime voice path. With the flag on, the FULL output must
 * equal main's: every injection's text, every crisis_signals field, the transfer note,
 * every detector signal and the safety check. The only lines allowed to differ are listed:
 * - DEFERRED: only the transfer note, only on live + cascade, and only where the gate's own
 *   patterns guide or replace the line (transfer-need.ts);
 * - SIGHT_CUE: exactly what CRISIS_SIGHT_NEEDS_CUE=on gives main (the flag implies it).
 * A listed line that stops differing fails too, so the lists stay exact.
 *
 * Lines: the round-2 and round-3 verifiers' 233 real-risk and 80 benign lines, plus this PR's own.
 * All fictional.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VERIFIER from './fixtures/legacy-word-equivalence-lines.json' with { type: 'json' };
import { DEFERRED, SIGHT_CUE } from './fixtures/legacy-word-equivalence-expected.js';
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
const { startCrisisGate } = await import('../../../personas/crisis-gate.js');
const { performSafetyCheck } = await import('../../../../services/safety/index.js');
const { humanTransfer } = await import('../../../../services/human-transfer/index.js');
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

/** A turn hook's chat context: the SDK hands it over before it adds the caller's new message. */
function hookCtx(...turns: Array<['user' | 'assistant', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const [role, content] of turns) ctx.addMessage({ role, content });
  return ctx;
}

/** One caller turn through both word checks: everything they produce, in full. */
async function turn(line: string, uid: string) {
  fake.docs.delete(uid);
  const ctx: SafetyContext = {
    userText: line,
    services: { userId: uid, sessionId: `session-${uid}` },
    userData: { relationshipStage: 'friend' },
    persona: { id: 'ferni' },
  } as never;
  const safety = await buildSafetyInjections(ctx);
  const transfer = await buildHumanTransferInjections(line, uid, `session-${uid}`, 1, hookCtx());
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

function gatePatterns(line: string) {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  ctx.addMessage({ role: 'user', content: line });
  const env = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
  return startCrisisGate(ctx, undefined, { env })?.decision.action;
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

const deferredHere = (mode: Mode) => mode.gate === 'live' && mode.pipeline === 'cartesia-cascade';

describe('CRISIS_LEXICAL_V2 on: every line equals main, but for the listed lines', () => {
  it('the lists name lines that are in the set', () => {
    for (const line of [...DEFERRED, ...SIGHT_CUE]) expect(LINES).toContain(line);
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
        const deferred = DEFERRED.includes(line) && deferredHere(mode);
        if (SIGHT_CUE.includes(line)) {
          expect(on, line).not.toEqual(main);
          setMode(mode, MAIN_WITH_CUE);
          expect(on, line).toEqual(await turn(line, uid)); // eslint-disable-line no-await-in-loop
        } else if (deferred) {
          // Only the transfer note moves to the gate, which acts on this line by itself.
          expect(main.transfer?.category, line).toBe('crisis_transfer');
          expect(on.transfer, line).toBeNull();
          expect({ ...on, transfer: main.transfer }, line).toEqual(main);
          expect(gatePatterns(line), line).toMatch(/^(guide|replace)$/);
        } else {
          expect(on, line).toEqual(main);
        }
      }
    }, 300_000);
  });
});
