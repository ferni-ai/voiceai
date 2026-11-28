/**
 * CRISIS_CONFIRMED_CALL_RISK counts READERS, not reads: two classifier runs that saw the same
 * input with the same prompt and model are one reader (crisis-one-reader.ts). Through the real
 * reply gate and turn pipeline, with a stubbed classifier and fictional lines. The patterns and
 * the after-check still confirm on their own, and a crash in the count confirms (fails closed).
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const broken = vi.hoisted(() => ({ on: false }));
vi.mock('../../../services/safety/crisis-one-reader.js', async (load) => {
  const real = await load<typeof import('../../../services/safety/crisis-one-reader.js')>();
  return {
    ...real,
    readerTally: (...args: Parameters<typeof real.readerTally>) => {
      if (broken.on) throw new Error('count failed');
      return real.readerTally(...args);
    },
  };
});
const warn = vi.hoisted(() => vi.fn());
const info = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', async (load) => {
  const real = await load<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (bindings: { module?: string }) => {
      const base = real.createLogger(bindings as never);
      return bindings?.module === 'CrisisConfirmedRisk' ? { ...base, info, warn } : base;
    },
  };
});

import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  parseClassifierReply,
  resetCrisisClassifierCache,
  startCrisisClassifier,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import {
  AFTER_CHECK_GUIDANCE,
  AFTER_CHECK_PROMPT,
  afterCheckLoneRead,
  readersAgree,
  resetConfirmedCallRisk,
} from '../../../services/safety/crisis-confirmed-risk.js';
import { detectCrisis } from '../../../services/safety/crisis-guard.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { markReader, readerKey, readerTally } from '../../../services/safety/crisis-one-reader.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { startCrisisGate, type CrisisGateDecision } from '../crisis-gate.js';

const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const ON = { ...LIVE, CRISIS_AGREEMENT_GATE: 'on', CRISIS_CONFIRMED_CALL_RISK: 'on' };
/** Another deadline: a separate run (the shared-run key differs) of the same input. */
const LATER_DEADLINE = { ...ON, CRISIS_CLASSIFIER_TIMEOUT_MS: '1500' };
const NONE = '{"risk":"none","subject":"self"}';
const CRISIS = '{"risk":"crisis","subject":"self"}';
const IMMINENT = '{"risk":"imminent","subject":"self"}';
const FERNI: Record<CrisisGateDecision['action'], string> = {
  pass: 'Oh nice, tell me more.',
  guide: 'That sounds heavy. Are you safe right now? You can call or text 988 any time.',
  replace: 'If you are in danger, please call 911 or 988 now.',
};
const ALARM = 'Dinner is tonight at six.';
const BENIGN = ['I made pasta today.', 'My sister is coming over.', ALARM];
const AGREE = 'It has been a really rough week.';
const PATTERN = 'Some days I want to die.';

/** The classifier's read per caller line, and the after-check's, with its calls counted. */
function stub(reads: Record<string, string>, after: Record<string, string> = {}) {
  const afterCalls: string[] = [];
  const readCalls: string[] = [];
  const fn: CrisisGenerateFn = async (prompt, content) => {
    const { latest } = JSON.parse(content) as { latest: string };
    if (prompt !== AFTER_CHECK_PROMPT) {
      readCalls.push(latest);
      return reads[latest] ?? NONE;
    }
    afterCalls.push(latest);
    return after[latest] ?? CRISIS;
  };
  return Object.assign(fn, { afterCalls, readCalls });
}

let calls = 0;
beforeEach(() => {
  broken.on = false;
  warn.mockReset();
  info.mockReset();
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetConfirmedCallRisk();
});

/** A call through the gate: the benign lines (a lone alarm), then `agree` with the pipeline. */
async function agreeTurn(generate: CrisisGenerateFn, pipelineFerni: string, pipelineEnv = ON) {
  const session = `call-${++calls}`;
  const userData = { services: { sessionId: session } };
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  const gateTurn = async (line: string): Promise<CrisisGateDecision> => {
    ctx.addMessage({ role: 'user', content: line });
    const gate = startCrisisGate(ctx.copy(), userData, { env: ON, generate });
    const decision = (await gate?.escalation) ?? gate?.decision ?? { action: 'pass' };
    ctx.addMessage({ role: 'assistant', content: FERNI[decision.action] });
    return decision;
  };
  for (const line of BENIGN) await gateTurn(line);
  const heard = { recentTranscripts: [...BENIGN, AGREE], lastAgentResponse: pipelineFerni };
  const opts = { sessionId: session, env: pipelineEnv, generate };
  const pipeline = startTurnCrisis(AGREE, heard, opts);
  const decision = await gateTurn(AGREE);
  await pipeline.summary();
  return { decision, session };
}

/** The confirm's reader counts, as logged. */
const tallies = (): Array<Record<string, unknown>> =>
  info.mock.calls.filter((c) => c[1] === 'CRISIS_READERS').map((c) => c[0]);

const eased = (d: CrisisGateDecision) =>
  d.action === 'guide' && d.guidance === AFTER_CHECK_GUIDANCE;

describe('CRISIS_CONFIRMED_CALL_RISK: same-input classifier runs are one reader', () => {
  it('gate + pipeline on the same words: two runs, one reader, no confirm', async () => {
    const generate = stub({ [ALARM]: IMMINENT, [AGREE]: CRISIS }, { [AGREE]: NONE });
    // The pipeline hears the same Ferni line and earlier lines, with another deadline.
    const { decision } = await agreeTurn(generate, FERNI.replace, LATER_DEADLINE);
    expect(generate.readCalls.filter((l) => l === AGREE)).toHaveLength(2); // two model calls
    // Not confirmed, so the after-check read the turn and, finding no risk, eased it.
    expect(generate.afterCalls).toContain(AGREE);
    expect(eased(decision)).toBe(true);
    // Checkable in the logs: two risk reads, one reader, a shared reader.
    expect(tallies()).toContainEqual({
      riskReads: 2,
      readers: 1,
      sharedReader: true,
      source: 'gate',
    });
    expect(tallies().every((t) => t.readers === 1)).toBe(true);
  });

  it('the pipeline on its own: another run of the same input is not a second reader', async () => {
    const generate = stub({ [ALARM]: IMMINENT, [AGREE]: CRISIS }, { [AGREE]: NONE });
    const session = `call-${++calls}`;
    const userData = { services: { sessionId: session } };
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
    for (const line of BENIGN) {
      ctx.addMessage({ role: 'user', content: line });
      const gate = startCrisisGate(ctx.copy(), userData, { env: ON, generate });
      const decision = (await gate?.escalation) ?? gate?.decision ?? { action: 'pass' };
      ctx.addMessage({ role: 'assistant', content: FERNI[decision.action] });
    }
    const heard = { recentTranscripts: [...BENIGN, AGREE], lastAgentResponse: FERNI.replace };
    const same = { latest: AGREE, earlier: heard.recentTranscripts, companion: FERNI.replace };
    const at = { pattern: 'none', generate, env: LATER_DEADLINE, scope: session } as const;
    await startCrisisClassifier(same, at)?.verdict;
    const turn = startTurnCrisis(AGREE, heard, { sessionId: session, env: ON, generate });
    expect(await turn.softCheck()).toBe(true); // eased by the after-check
    expect(generate.readCalls.filter((l) => l === AGREE)).toHaveLength(2);
    expect(generate.afterCalls).toEqual([AGREE]);
  });

  it('gate + pipeline on different Ferni lines: two readers, the call is confirmed', async () => {
    const generate = stub({ [ALARM]: IMMINENT, [AGREE]: CRISIS }, { [AGREE]: NONE });
    const { decision } = await agreeTurn(generate, 'Sounds lovely.');
    expect(generate.afterCalls).toEqual([]);
    expect(eased(decision)).toBe(false);
    expect(decision.action).not.toBe('pass');
    expect(tallies()).toContainEqual({
      riskReads: 2,
      readers: 2,
      sharedReader: false,
      source: 'gate',
    });
  });

  it('the logged counts carry nothing derived from the words: counts and booleans', async () => {
    const generate = stub({ [ALARM]: IMMINENT, [AGREE]: CRISIS }, { [AGREE]: NONE });
    await agreeTurn(generate, FERNI.replace, LATER_DEADLINE);
    await agreeTurn(generate, 'Sounds lovely.');
    const logged = tallies();
    expect(logged.length).toBeGreaterThan(1);
    const sources = ['gate', 'pipeline', 'kept'];
    for (const fields of logged) {
      for (const [field, value] of Object.entries(fields)) {
        if (field === 'source') expect(sources).toContain(value);
        else expect(['number', 'boolean']).toContain(typeof value);
      }
      const text = JSON.stringify(fields);
      for (const line of [AGREE, ...BENIGN, FERNI.replace]) expect(text).not.toContain(line);
    }
  });

  it('a pattern and the classifier on one turn still confirm the call', async () => {
    expect(detectCrisis(PATTERN).isCrisis || detectCrisis(PATTERN).severity !== 0).toBe(true);
    const later = 'Anyway, what were we saying?';
    const reads = { [ALARM]: IMMINENT, [PATTERN]: CRISIS, [later]: CRISIS };
    const generate = stub(reads, { [later]: NONE });
    const session = `call-${++calls}`;
    const userData = { services: { sessionId: session } };
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
    let last: CrisisGateDecision = { action: 'pass' };
    for (const line of [...BENIGN, PATTERN, later]) {
      ctx.addMessage({ role: 'user', content: line });
      const gate = startCrisisGate(ctx.copy(), userData, { env: ON, generate });
      last = (await gate?.escalation) ?? gate?.decision ?? { action: 'pass' };
      ctx.addMessage({ role: 'assistant', content: FERNI[last.action] });
    }
    expect(generate.afterCalls).toEqual([]);
    expect(eased(last)).toBe(false);
  });

  it('an after-check that finds risk still confirms the call', async () => {
    const next = 'Anyway, what were we saying?';
    const generate = stub(
      { [ALARM]: IMMINENT, [AGREE]: CRISIS, [next]: CRISIS },
      { [AGREE]: CRISIS, [next]: NONE }
    );
    const { session } = await agreeTurn(generate, FERNI.replace, LATER_DEADLINE);
    expect(generate.afterCalls).toEqual([AGREE]); // read, found risk: confirmed
    const input = { latest: next, earlier: [...BENIGN, AGREE], companion: FERNI.guide };
    const lone = { call: session, input, verdict: parseClassifierReply(CRISIS) } as const;
    const rest = { detection: detectCrisis(next), pattern: 'none', env: ON, generate } as const;
    expect(await afterCheckLoneRead({ ...lone, ...rest, source: 'gate' })).toBeNull();
    expect(generate.afterCalls).toEqual([AGREE]);
  });
});

describe('CRISIS_CONFIRMED_CALL_RISK: a failed reader count confirms (fails closed)', () => {
  it('the gate: the count throws, the call is confirmed and nothing eases', async () => {
    broken.on = true;
    const generate = stub({ [ALARM]: IMMINENT, [AGREE]: CRISIS }, { [AGREE]: NONE });
    const { decision } = await agreeTurn(generate, FERNI.replace, LATER_DEADLINE);
    expect(generate.afterCalls).toEqual([]);
    expect(eased(decision)).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      { outcome: 'confirmed', why: 'readers_failed', source: 'gate' },
      'CRISIS_CONFIRMED'
    );
  });

  it('the after-check alone: the count throws, the turn is not eased', async () => {
    const generate = stub({ [AGREE]: CRISIS }, { [AGREE]: NONE });
    const call = `call-${++calls}`;
    const lone = (latest: string, reply: string) =>
      ({
        call,
        input: { latest, earlier: [], companion: 'Sounds lovely.' },
        verdict: parseClassifierReply(reply),
        detection: detectCrisis(latest),
        pattern: 'none',
        source: 'pipeline',
        env: ON,
        generate,
      }) as const;
    expect(await afterCheckLoneRead(lone(ALARM, IMMINENT))).toBeNull(); // the alarm
    await startCrisisClassifier(lone(AGREE, CRISIS).input, {
      pattern: 'none',
      generate,
      env: LIVE,
      scope: call,
    })?.verdict;
    broken.on = true;
    expect(await afterCheckLoneRead(lone(AGREE, CRISIS))).toBeNull();
    expect(generate.afterCalls).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      { outcome: 'confirmed', why: 'readers_failed', source: 'pipeline' },
      'CRISIS_CONFIRMED'
    );
  });

  it('the reply path does not wait on the count: it is plain and synchronous', () => {
    const agree = readersAgree(
      [parseClassifierReply(CRISIS), parseClassifierReply(CRISIS)],
      'gate'
    );
    expect(typeof agree).toBe('boolean');
    expect(agree).toBe(true); // two unmarked reads: two readers, as before this change
  });
});

describe('readerTally and readerKey', () => {
  const seen = { latest: AGREE, earlier: BENIGN, companion: FERNI.pass };
  const key = readerKey(seen, 'prompt', {});
  const read = () => parseClassifierReply(CRISIS);

  it('two runs of the same input, prompt and model are one reader', () => {
    const tally = readerTally([markReader(read(), key), markReader(read(), key)]);
    expect(tally).toEqual({ riskReads: 2, readers: 1, sharedReader: true });
  });

  it('a different input, prompt or model is another reader', () => {
    const others = [
      readerKey({ ...seen, latest: 'It has been a rough week.' }, 'prompt', {}),
      readerKey({ ...seen, earlier: BENIGN.slice(1) }, 'prompt', {}),
      readerKey({ ...seen, companion: FERNI.guide }, 'prompt', {}),
      readerKey(seen, 'another prompt', {}),
      readerKey(seen, 'prompt', { CRISIS_CLASSIFIER_MODEL: 'another-model' }),
    ];
    for (const other of others) {
      expect(other).not.toBe(key);
      const tally = readerTally([markReader(read(), key), markReader(read(), other)]);
      expect(tally).toEqual({ riskReads: 2, readers: 2, sharedReader: false });
    }
  });

  it('only risk reads count, and an unmarked read counts alone', () => {
    const none = parseClassifierReply(NONE); // unmarked: it would count alone
    const one = { riskReads: 1, readers: 1, sharedReader: false };
    expect(readerTally([markReader(read(), key), none, null])).toEqual(one);
    expect(readerTally([read(), read()])).toEqual({ ...one, riskReads: 2, readers: 2 });
    const imminent = markReader(parseClassifierReply(IMMINENT), key);
    expect(readerTally([imminent, read()]).readers).toBe(2);
  });

  it('the key keeps no caller words', () => {
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});
