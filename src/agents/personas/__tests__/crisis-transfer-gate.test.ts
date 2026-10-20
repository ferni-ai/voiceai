/**
 * The 2026-10-18 prod call, through the live reply gate and the turn pipeline:
 * "Can you pass me to 9?" (STT for Nayan) with a classifier-only crisis read.
 * With CRISIS_TRANSFER_EVERYDAY on, the caller gets the soft check-in (never
 * nothing); off, crisis guidance as in prod. Risky lines, imminent reads,
 * agreeing reads and a live adjudicator keep full crisis guidance; the shadow
 * adjudicator still sees eased turns; and no router bypass skips the soft
 * check-in.
 */
import { readFileSync } from 'node:fs';
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SOFT_CRISIS_CHECK } from '../../../services/safety/crisis-agreement.js';
import {
  crisisRiskThisCall,
  resetCrisisCallRisk,
} from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { checkSemanticShortCircuit } from '../../processors/semantic-short-circuit.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { startCrisisGate, type CrisisGateDecision } from '../crisis-gate.js';

const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const ON = { ...LIVE, CRISIS_TRANSFER_EVERYDAY: 'on' };
const read =
  (risk: string, subject = 'self'): CrisisGenerateFn =>
  async () =>
    `{"risk":"${risk}","subject":"${subject}"}`;
const crisisRead = read('crisis');

function request(...turns: Array<['user' | 'assistant', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Alex.' });
  for (const [role, content] of turns) ctx.addMessage({ role, content });
  return ctx;
}

const userData = (sessionId: string) => ({ services: { sessionId } });

/** What the caller ends up with: the patterns' decision, or the classifier's stronger one. */
async function effective(
  ctx: llm.ChatContext,
  sessionId: string,
  env: Record<string, string>,
  generate: CrisisGenerateFn = crisisRead,
  adjudicate?: CrisisGenerateFn
): Promise<CrisisGateDecision> {
  const gate = startCrisisGate(ctx, userData(sessionId), { env, generate, adjudicate });
  if (!gate) throw new Error('gate off');
  return (await gate.escalation) ?? gate.decision;
}

const soft = { action: 'guide', guidance: SOFT_CRISIS_CHECK };
/** Crisis guidance, not the soft check-in. */
const full = (d: CrisisGateDecision): boolean =>
  d.action === 'replace' || (d.action === 'guide' && d.guidance !== SOFT_CRISIS_CHECK);

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
});

const COMPANION = 'Two meetings, and a call with Mindy at four. Want me to text her?';
const PROD = request(
  ['user', 'What do I have today?'],
  ['assistant', COMPANION],
  ['user', 'Can you pass me to 9?']
);

describe('a transfer request through the crisis gate', () => {
  it('gets the soft check-in, not crisis guidance, with CRISIS_TRANSFER_EVERYDAY on', async () => {
    expect(await effective(PROD, 'prod-on', ON)).toEqual(soft);
    expect(crisisRiskThisCall('prod-on')).toBe(true); // a soft check-in is risk on the call
  });

  it('gets crisis guidance with the flag off, as the prod call did', async () => {
    expect(full(await effective(PROD, 'prod-off', LIVE))).toBe(true);
  });

  it('never softens an imminent read, about the caller or about someone else', async () => {
    expect((await effective(PROD, 'imminent', ON, read('imminent'))).action).toBe('replace');
    resetCrisisClassifierCache();
    expect(full(await effective(PROD, 'imminent-3p', ON, read('imminent', 'third_party')))).toBe(
      true
    );
  });

  it.each([
    "pass me to someone, I can't do this anymore",
    'transfer me to 9, I took pills',
    'can I talk to Maya, I want to die',
    'pass me to 988',
    'pass me to nine. one one',
  ])('keeps crisis guidance for "%s"', async (line) => {
    const ctx = request(['assistant', 'What can I do for you?'], ['user', line]);
    expect(full(await effective(ctx, `neg ${line}`, ON))).toBe(true);
  });

  it.each([
    'let me talk to Maya one last time',
    "put Ferni on, I'm done",
    'transfer me to Nayan, I just want to say goodbye to everyone',
  ])('keeps crisis guidance for "%s", which no pattern matches', async (line) => {
    const ctx = request(['assistant', 'What can I do for you?'], ['user', line]);
    const gate = startCrisisGate(ctx, userData(`guard ${line}`), { env: ON, generate: crisisRead });
    expect(gate?.decision.action).toBe('pass'); // the exemption's own guards are what is tested
    const stronger = await gate?.escalation;
    expect(stronger && full(stronger)).toBe(true);
  });

  it.each([
    "I gave my dog to my sister, she'll take better care of him",
    'I wont be a problem much longer',
  ])(
    'after "%s" (not on the risk list, not read as risk) a transfer gets the soft check-in, never nothing',
    async (earlier) => {
      const ctx = request(
        ['user', earlier],
        ['assistant', 'Oh, okay.'],
        ['user', 'Can you pass me to Maya?']
      );
      expect(await effective(ctx, `earlier ${earlier}`, ON)).toEqual(soft);
    }
  );

  it('after a turn read as risk on the same call, a transfer gets crisis guidance', async () => {
    const said = "I gave my dog to my sister, she'll take better care of him";
    await effective(request(['user', said]), 'read-risk', ON);
    const ctx = request(['user', said], ['assistant', 'Oh, okay.'], ['user', 'Put Maya on.']);
    expect(full(await effective(ctx, 'read-risk', ON))).toBe(true);
  });
});

describe('with CRISIS_AGREEMENT_GATE on too', () => {
  const BOTH = { ...ON, CRISIS_AGREEMENT_GATE: 'on' };

  it('a lone crisis read the agreement gate escalates still gets only the soft check-in', async () => {
    expect(await effective(PROD, 'both-lone', BOTH)).toEqual(soft);
  });

  it('two reads of the turn agreeing on crisis keep crisis guidance', async () => {
    // The turn pipeline read the same words with other context: a second, agreeing crisis read.
    const pipeline = startTurnCrisis(
      'Can you pass me to 9?',
      { recentTranscripts: ['Morning.'], lastAgentResponse: 'Hey, what is up?' },
      { sessionId: 'both-agree', env: BOTH, generate: crisisRead }
    );
    expect(full(await effective(PROD, 'both-agree', BOTH))).toBe(true);
    expect(await pipeline.softCheck()).toBe(false);
  });

  it('with the transfer flag off, the agreement gate escalates as before', async () => {
    const env = { ...LIVE, CRISIS_AGREEMENT_GATE: 'on' };
    expect(full(await effective(PROD, 'agree-only', env))).toBe(true);
  });
});

describe('adjudicators', () => {
  it('the shadow adjudicator still reads an eased turn (eval data)', async () => {
    const adjudicate = vi.fn<CrisisGenerateFn>(async () => '{"decision":"checkin"}');
    const env = { ...ON, CRISIS_ADJUDICATOR: 'shadow' };
    expect(await effective(PROD, 'shadow', env, crisisRead, adjudicate)).toEqual(soft);
    await vi.waitFor(() => expect(adjudicate).toHaveBeenCalled());
  });

  it('the turn pipeline also hands an eased turn to the shadow adjudicator', async () => {
    const adjudicate = vi.fn<CrisisGenerateFn>(async () => '{"decision":"checkin"}');
    const turn = startTurnCrisis(
      'Can you pass me to 9?',
      { recentTranscripts: ['What do I have today?'], lastAgentResponse: COMPANION },
      {
        sessionId: 'shadow-pipe',
        env: { ...ON, CRISIS_ADJUDICATOR: 'shadow' },
        generate: crisisRead,
        adjudicate,
      }
    );
    expect(await turn.softCheck()).toBe(true);
    await vi.waitFor(() => expect(adjudicate).toHaveBeenCalled());
  });
});

describe('a transfer request through the turn pipeline (startTurnCrisis)', () => {
  const userTurn = {
    recentTranscripts: ['What do I have today?'],
    lastAgentResponse: 'Want me to text her?',
  };
  const opts = (sessionId: string, env: Record<string, string>, generate = crisisRead) => ({
    sessionId,
    env,
    generate,
  });

  it('gives the soft check-in with the flag on', async () => {
    const turn = startTurnCrisis('Can you pass me to 9?', userTurn, opts('pipe-on', ON));
    expect(await turn.softCheck()).toBe(true);
    expect((await turn.resolve()).isCrisis).toBe(false);
  });

  it('gives crisis handling with the flag off, for a risky line, and for an imminent read', async () => {
    const off = startTurnCrisis('Can you pass me to 9?', userTurn, opts('pipe-off', LIVE));
    expect(await off.softCheck()).toBe(false);
    expect((await off.resolve()).isCrisis).toBe(true);
    resetCrisisClassifierCache();
    const risky = startTurnCrisis(
      'let me talk to Maya one last time',
      userTurn,
      opts('pipe-risk', ON)
    );
    expect(await risky.softCheck()).toBe(false);
    expect((await risky.resolve()).isCrisis).toBe(true);
    resetCrisisClassifierCache();
    const thirdParty = startTurnCrisis(
      'Can you pass me to 9?',
      userTurn,
      opts('pipe-3p', ON, read('imminent', 'third_party'))
    );
    expect(await thirdParty.softCheck()).toBe(false);
    expect((await thirdParty.resolve()).isCrisis).toBe(true);
  });
});

describe('router bypasses never skip the soft check-in', () => {
  const userTurn = { recentTranscripts: ['What do I have today?'], lastAgentResponse: COMPANION };
  const turnFor = (sessionId: string, generate: CrisisGenerateFn) =>
    startTurnCrisis('Can you pass me to 9?', userTurn, { sessionId, env: ON, generate });

  it('bypassAllowed is false for an eased turn and true for a turn read as none', async () => {
    expect(await turnFor('bypass-soft', crisisRead).bypassAllowed()).toBe(false);
    resetCrisisClassifierCache();
    expect(await turnFor('bypass-none', read('none')).bypassAllowed()).toBe(true);
  });

  it('the semantic short-circuit declines an eased turn as it does a crisis', async () => {
    const shortCircuit = async (sessionId: string, generate: CrisisGenerateFn) => {
      const turn = turnFor(sessionId, generate);
      const routed = await turn.resolve();
      return checkSemanticShortCircuit(
        new Promise((_resolve) => {
          void _resolve;
        }),
        {
          // As process-turn.ts passes it.
          crisisDetected: !(await turn.bypassAllowed()),
          crisisSeverity: routed.severity,
          analysisResult: {} as Parameters<typeof checkSemanticShortCircuit>[1]['analysisResult'],
          ctx: {} as Parameters<typeof checkSemanticShortCircuit>[1]['ctx'],
        }
      );
    };
    const eased = await shortCircuit('sc-soft', crisisRead);
    expect(eased.shortCircuited).toBe(false);
    expect(eased.reason).toMatch(/^Crisis detected/);
    resetCrisisClassifierCache();
    const plain = await shortCircuit('sc-none', read('none'));
    expect(plain.reason).not.toMatch(/^Crisis detected/); // it went on to wait for routing
  });

  it('process-turn.ts asks bypassAllowed before FTIS direct execution and the short-circuit', () => {
    const source = readFileSync(
      new URL('../../processors/turn-processor/process-turn.ts', import.meta.url),
      'utf8'
    );
    const start = source.indexOf('// FTIS DIRECT EXECUTION');
    const ftis = source.slice(start, source.indexOf('return {', start));
    expect(ftis).toMatch(
      /ftisResult\.bypassLLM &&\s+ftisResult\.toolResult &&\s+\(await turnCrisis\.bypassAllowed\(\)\)/
    );
    expect(source).toMatch(/crisisDetected: !\(await turnCrisis\.bypassAllowed\(\)\)/);
  });
});
