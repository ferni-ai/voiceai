/**
 * CRISIS_LEXICAL_V2: the human-transfer note for a suicide or self-harm-only turn is left to
 * the crisis gate when the gate is sure to act on that line (live, cascade, its own pattern
 * guard reads crisis: transfer-need.ts). Runs the real builders (buildSafetyInjections ->
 * performSafetyCheck, buildHumanTransferInjections -> the human-transfer detector and its
 * crisis_signals writer on a fake store) and the real gate (startCrisisGate). Every line is
 * fictional. Full-output equality with main is legacy-word-checks-equivalence.test.ts.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HELD_OUT_STRONG,
  MIXED_RISK,
  MUST_KEEP,
  REAL_RISK,
  STILL_LOGGED,
} from './fixtures/legacy-word-lines.js';

const fake = vi.hoisted(() => {
  const writes = new Map<string, number[]>();
  const db = {
    collection: () => ({
      doc: (uid: string) => ({
        collection: () => ({
          where: () => db.collection().doc(uid).collection(),
          orderBy: () => db.collection().doc(uid).collection(),
          limit: () => db.collection().doc(uid).collection(),
          get: async () => ({ docs: [] }),
          add: async (doc: { signals?: { severity?: number } }) =>
            void writes.set(uid, [...(writes.get(uid) ?? []), doc.signals?.severity ?? -1]),
        }),
      }),
    }),
  };
  const logged: unknown[][] = [];
  return { db, writes, logged };
});

vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fake.db,
}));
vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (...args: Parameters<typeof real.createLogger>) => {
      const logger = real.createLogger(...args);
      return new Proxy(logger, {
        get: (target, prop, receiver) =>
          prop === 'info'
            ? (...a: unknown[]) => void fake.logged.push(a)
            : Reflect.get(target, prop, receiver),
      });
    },
  };
});

const { buildSafetyInjections } = await import('../safety-coaching-builders.js');
const { buildHumanTransferInjections } = await import('../better-than-human-builders.js');
const { startCrisisGate } = await import('../../../personas/crisis-gate.js');
const { resetCrisisClassifierCache } =
  await import('../../../../services/safety/crisis-classifier.js');
const { performSafetyCheck } = await import('../../../../services/safety/index.js');
type SafetyContext = Parameters<typeof buildSafetyInjections>[0];
type GateMode = 'live' | 'shadow' | 'off';
const GATE_MODES: GateMode[] = ['live', 'shadow', 'off'];

const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const CRISIS_CATEGORIES = ['safety', 'crisis_response', 'crisis_transfer'];

let n = 0;
/** One caller turn through both word checks: what they inject, and the crisis_signals written. */
async function turn(line: string) {
  n += 1;
  const uid = `uid-v2-${n}`;
  const ctx: SafetyContext = {
    userText: line,
    services: { userId: uid, sessionId: `session-v2-${n}` },
    userData: { relationshipStage: 'friend' },
    persona: { id: 'ferni' },
  } as never;
  const safety = await buildSafetyInjections(ctx);
  const transfer = await buildHumanTransferInjections(line, uid, `session-v2-${n}`, 1);
  await new Promise((resolve) => {
    setTimeout(resolve, 0); // the write is fire-and-forget
  });
  const injected = [...safety, ...(transfer ? [transfer] : [])];
  const check = performSafetyCheck(line, { userId: uid, personaId: 'ferni' });
  return {
    crisisInjections: injected.filter((i) => CRISIS_CATEGORIES.includes(i.category)),
    safety: safety.map((i) => i.category),
    types: check.detection.signals.map((sig) => sig.type),
    transfer,
    writes: fake.writes.get(uid) ?? [],
  };
}

function gateFor(line: string, env: Record<string, string>, risk?: 'imminent') {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  ctx.addMessage({ role: 'user', content: line });
  const generate = async () => JSON.stringify({ risk, subject: 'self' });
  return startCrisisGate(ctx, undefined, { env, generate });
}
const gateDecision = (line: string, env: Record<string, string>) =>
  gateFor(line, env)?.decision.action;

/** The gate's whole decision: its patterns, else its classifier (a stubbed imminent verdict). */
async function gateCatches(line: string, lexicalV2: 'on' | 'off') {
  const env = {
    CRISIS_GUARD_MODE: 'live',
    CRISIS_CLASSIFIER_MODE: 'live',
    CRISIS_LEXICAL_V2: lexicalV2,
  };
  const gate = gateFor(line, env, 'imminent');
  if (gate?.decision.action !== 'pass') return gate?.decision.action;
  return (await gate.escalation)?.action ?? 'pass';
}

const v2 = (on: boolean, gate: GateMode = 'live') => {
  vi.stubEnv('CRISIS_LEXICAL_V2', on ? 'on' : 'off');
  vi.stubEnv('CRISIS_GUARD_MODE', gate);
};

beforeEach(() => {
  fake.logged.length = 0;
  vi.stubEnv('CRISIS_SIGHT_NEEDS_CUE', 'off'); // main, whatever the run's env says
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetCrisisClassifierCache();
});

/**
 * Flag on gives this line at least what main gave it in this gate mode: the same
 * crisis_signals write, every performSafetyCheck note and signal, and the transfer note.
 * The note may be left to the gate only with the gate live and its own patterns acting.
 */
async function keepsMain(line: string, mode: GateMode) {
  v2(false, mode);
  const main = await turn(line);
  v2(true, mode);
  const on = await turn(line);
  expect(on.writes).toEqual(main.writes);
  expect(on.safety).toEqual(expect.arrayContaining(main.safety));
  expect(on.types).toEqual(expect.arrayContaining(main.types));
  if (main.transfer && on.transfer?.content !== main.transfer.content) {
    expect(mode).toBe('live');
    expect(gateDecision(line, PATTERNS_ONLY)).toMatch(/^(guide|replace)$/);
    expect(on.transfer).toBeNull();
  }
  return main;
}
const gaveSomething = (main: Awaited<ReturnType<typeof turn>>) =>
  main.writes.length + main.safety.length + (main.transfer ? 1 : 0);

describe('no line gets less than main gave it, in every gate mode', () => {
  describe.each(GATE_MODES)('gate %s', (mode) => {
    it.each([...MUST_KEEP, ...HELD_OUT_STRONG])('%s', async (line) => {
      expect(gaveSomething(await keepsMain(line, mode))).toBeGreaterThan(0);
    });

    it.each(MIXED_RISK)(
      'suicide plus what the gate does not read keeps its note: %s',
      async (line) => {
        v2(false, mode);
        const main = await turn(line);
        v2(true, mode);
        expect(main.transfer?.category).toBe('crisis_transfer');
        expect((await turn(line)).transfer).toEqual(main.transfer);
      }
    );
  });
});

describe('real risk still reaches the gate and is caught end to end', () => {
  it.each(REAL_RISK)('%s', async (line) => {
    // The gate itself is unchanged: its pattern read and its whole decision, flag off or on.
    const patterns = gateDecision(line, { ...PATTERNS_ONLY, CRISIS_LEXICAL_V2: 'off' });
    expect(gateDecision(line, { ...PATTERNS_ONLY, CRISIS_LEXICAL_V2: 'on' })).toBe(patterns);
    const caught = await gateCatches(line, 'on');
    expect(caught).toMatch(/^(guide|replace)$/);
    expect(await gateCatches(line, 'off')).toBe(caught);
    // And the word checks give it at least main's guidance and write in every gate mode.
    for (const mode of GATE_MODES) await keepsMain(line, mode); // eslint-disable-line no-await-in-loop
  });

  it('a negation trap ("can\'t stop thinking about killing myself") is caught by the gate', () => {
    const line = "I can't stop thinking about killing myself";
    expect(gateDecision(line, { ...PATTERNS_ONLY, CRISIS_LEXICAL_V2: 'on' })).toBe('replace');
  });

  it('a deferred hit is a counted event with a reason code and no words', async () => {
    v2(true);
    await turn('I want to kill myself');
    const events = fake.logged.filter((a) => a[1] === 'CRISIS_LEXICAL');
    expect(events.map((a) => (a[0] as { reason: string }).reason)).toContain('deferred_to_gate');
    expect(JSON.stringify(events)).not.toMatch(/kill|myself/i);
  });

  it('on a realtime model the gate never runs, so the transfer note stays', async () => {
    v2(true);
    vi.stubEnv('VOICE_PIPELINE', 'gemini-live');
    const out = await turn('I want to kill myself');
    expect(out.transfer?.category).toBe('crisis_transfer');
  });

  it("with the gate not live, the word checks keep main's crisis guidance (fail safe)", async () => {
    v2(true, 'shadow');
    const out = await turn('I want to kill myself');
    expect(out.crisisInjections.map((i) => i.category)).toEqual(
      expect.arrayContaining(['safety', 'crisis_transfer'])
    );
  });
});

describe('real risk the word checks catch on main still writes crisis_signals, same severity', () => {
  it.each(STILL_LOGGED)('%s', async (line) => {
    v2(false);
    const main = (await turn(line)).writes;
    v2(true);
    expect(main.length).toBe(1);
    expect((await turn(line)).writes).toEqual(main);
  });
});

describe('paths the gate does not read keep their guidance with the flag on', () => {
  it.each(["I'm having chest pain", "I'm bleeding a lot and it won't stop"])(
    'a medical emergency: %s',
    async (line) => {
      v2(true);
      const { transfer } = await turn(line);
      expect(transfer?.category).toBe('crisis_transfer');
      expect(transfer?.content).toContain('Medical emergency');
    }
  );

  it('domestic violence', async () => {
    v2(true);
    const { crisisInjections } = await turn('my husband hits me');
    expect(crisisInjections.map((i) => i.category)).toEqual([
      'safety',
      'crisis_response',
      'crisis_transfer',
    ]);
  });
});

describe('MINOR_CARE is unchanged', () => {
  const minor = "I'm 15 and I want to kill myself";
  it('a caller who says they are under 18: the same gate decision and write, flag on or off', async () => {
    vi.stubEnv('MINOR_CARE', 'on');
    const env = { ...PATTERNS_ONLY, MINOR_CARE: 'on' };
    const off = gateDecision(minor, { ...env, CRISIS_LEXICAL_V2: 'off' });
    expect(off).toBe('replace');
    expect(gateDecision(minor, { ...env, CRISIS_LEXICAL_V2: 'on' })).toBe(off);
    expect(await gateCatches(minor, 'on')).toBe('replace');
    v2(false);
    const main = (await turn(minor)).writes;
    v2(true);
    expect((await turn(minor)).writes).toEqual(main);
  });
});
