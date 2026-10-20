/**
 * The goodbye exemption (crisis-lone-imminent.ts) and the transfer exemption
 * (crisis-transfer-request.ts, CRISIS_TRANSFER_EVERYDAY) live side by side in
 * the reply gate and the turn pipeline. With both on, on a call with only
 * benign lines before:
 *   - each still eases its own turn (the controls);
 *   - a turn that is both a goodbye and a transfer request is neither, and
 *     keeps full crisis handling;
 *   - classifier-only real risk (no pattern) keeps full crisis handling;
 *   - one eased turn is risk on the call, so the other exemption never eases
 *     a later turn.
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it } from 'vitest';
import { SOFT_CRISIS_CHECK } from '../../../services/safety/crisis-agreement.js';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { guardFromDetection } from '../../safety/crisis-guard.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { startCrisisGate, type CrisisGateDecision } from '../crisis-gate.js';

const ON = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_TRANSFER_EVERYDAY: 'on',
};
const IMMINENT = '{"risk":"imminent","subject":"self"}';
const CRISIS = '{"risk":"crisis","subject":"self"}';
const NONE = '{"risk":"none","subject":"self"}';

type Turn = [caller: string, ferni: string];
const BENIGN: Turn[] = [
  ['I went hiking this morning.', 'Oh nice, where did you go?'],
  ['Up the ridge trail with my brother.', 'That sounds beautiful. How were the views?'],
  ['The views were amazing.', 'I love that. What a way to spend a morning.'],
];

const COMBINED = 'Okay, bye. Pass me to Nayan.';
/** Classifier-only real risk: no pattern matches either line. */
const IMMINENT_RISK = 'just bought charcoal and tape for the bathroom';
const CRISIS_RISK = 'I gave my dog to my sister this morning.';

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
});

/** The classifier's reply for each caller line; none for any other. */
function classifier(reads: Record<string, string>): CrisisGenerateFn {
  return async (_prompt, content) => {
    const latest = (JSON.parse(content) as { latest: string }).latest;
    return reads[latest] ?? NONE;
  };
}

function request(turns: Turn[], latest: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const [caller, ferni] of turns) {
    ctx.addMessage({ role: 'user', content: caller });
    ctx.addMessage({ role: 'assistant', content: ferni });
  }
  ctx.addMessage({ role: 'user', content: latest });
  return ctx;
}

/** Every turn of a call through the reply gate, in order; what the caller gets on each. */
async function gateCall(
  session: string,
  lines: string[],
  generate: CrisisGenerateFn
): Promise<CrisisGateDecision[]> {
  const out: CrisisGateDecision[] = [];
  const turns: Turn[] = [...BENIGN];
  const said = [...BENIGN.map(([caller]) => caller), ...lines];
  for (let i = 0; i < said.length; i++) {
    const history = i < BENIGN.length ? BENIGN.slice(0, i) : turns;
    const gate = startCrisisGate(
      request(history, said[i]),
      { services: { sessionId: session } },
      {
        env: ON,
        generate,
      }
    );
    out.push((await gate?.escalation) ?? gate?.decision ?? { action: 'pass' });
    if (i >= BENIGN.length) turns.push([said[i], 'Okay.']);
  }
  return out.slice(BENIGN.length);
}

const soft: CrisisGateDecision = { action: 'guide', guidance: SOFT_CRISIS_CHECK };
const isScript = (d: CrisisGateDecision | undefined): boolean => d?.action === 'replace';
/** Crisis guidance or the script: never the soft check-in, never nothing. */
const isFull = (d: CrisisGateDecision | undefined): boolean =>
  d?.action === 'replace' || (d?.action === 'guide' && d.guidance !== SOFT_CRISIS_CHECK);

/** One turn through the turn pipeline, after the benign lines. */
function pipelineTurn(session: string, latest: string, generate: CrisisGenerateFn) {
  return startTurnCrisis(
    latest,
    {
      recentTranscripts: BENIGN.map(([caller]) => caller),
      lastAgentResponse: BENIGN.at(-1)?.[1],
    },
    { sessionId: session, env: ON, generate }
  );
}

describe('controls: both exemptions are live together', () => {
  it('a bare goodbye read imminent gets the soft check-in (gate)', async () => {
    const out = await gateCall('ctl-bye', ['Bye.'], classifier({ 'Bye.': IMMINENT }));
    expect(out).toEqual([soft]);
  });

  it('a bare transfer request read crisis gets the soft check-in (gate)', async () => {
    const line = 'Can you pass me to 9?';
    const out = await gateCall('ctl-transfer', [line], classifier({ [line]: CRISIS }));
    expect(out).toEqual([soft]);
  });

  it('both ease in the turn pipeline too', async () => {
    const bye = pipelineTurn('ctl-pipe-bye', 'Bye.', classifier({ 'Bye.': IMMINENT }));
    expect(await bye.softCheck()).toBe(true);
    const line = 'Can you pass me to 9?';
    const transfer = pipelineTurn('ctl-pipe-transfer', line, classifier({ [line]: CRISIS }));
    expect(await transfer.softCheck()).toBe(true);
  });
});

describe('a turn that is both a goodbye and a transfer request is neither', () => {
  it('read imminent: the script (gate)', async () => {
    const out = await gateCall('both-imm', [COMBINED], classifier({ [COMBINED]: IMMINENT }));
    expect(isScript(out[0])).toBe(true);
  });

  it('read crisis: crisis guidance, not the soft check-in (gate)', async () => {
    const out = await gateCall('both-crisis', [COMBINED], classifier({ [COMBINED]: CRISIS }));
    expect(isFull(out[0])).toBe(true);
  });

  it('read imminent or crisis: full crisis handling (turn pipeline)', async () => {
    const imm = pipelineTurn('both-pipe-imm', COMBINED, classifier({ [COMBINED]: IMMINENT }));
    expect(await imm.softCheck()).toBe(false);
    expect(guardFromDetection(await imm.resolve()).shouldBlock).toBe(true);
    resetCrisisClassifierCache();
    const cri = pipelineTurn('both-pipe-crisis', COMBINED, classifier({ [COMBINED]: CRISIS }));
    expect(await cri.softCheck()).toBe(false);
    expect((await cri.resolve()).isCrisis).toBe(true);
  });
});

describe('classifier-only real risk keeps the full crisis path with both exemptions on', () => {
  it('an imminent line gets the script (gate)', async () => {
    const out = await gateCall(
      'risk-imm',
      [IMMINENT_RISK],
      classifier({ [IMMINENT_RISK]: IMMINENT })
    );
    expect(isScript(out[0])).toBe(true);
  });

  it('a crisis line gets crisis guidance (gate)', async () => {
    const out = await gateCall('risk-crisis', [CRISIS_RISK], classifier({ [CRISIS_RISK]: CRISIS }));
    expect(isFull(out[0])).toBe(true);
  });

  it('both get full crisis handling in the turn pipeline', async () => {
    const imm = pipelineTurn(
      'risk-pipe-imm',
      IMMINENT_RISK,
      classifier({ [IMMINENT_RISK]: IMMINENT })
    );
    expect(await imm.softCheck()).toBe(false);
    expect(await imm.bypassAllowed()).toBe(false);
    expect(guardFromDetection(await imm.resolve()).shouldBlock).toBe(true);
    const cri = pipelineTurn(
      'risk-pipe-crisis',
      CRISIS_RISK,
      classifier({ [CRISIS_RISK]: CRISIS })
    );
    expect(await cri.softCheck()).toBe(false);
    expect(await cri.bypassAllowed()).toBe(false);
    expect((await cri.resolve()).isCrisis).toBe(true);
  });
});

describe('one eased turn never lets the other exemption ease a later one', () => {
  it('after an eased goodbye, a transfer request read crisis gets crisis guidance', async () => {
    const line = 'Can you pass me to 9?';
    const out = await gateCall(
      'chain-bye-first',
      ['Bye.', line],
      classifier({ 'Bye.': IMMINENT, [line]: CRISIS })
    );
    expect(out[0]).toEqual(soft);
    expect(isFull(out[1])).toBe(true);
  });

  it('after an eased transfer request, a goodbye read imminent gets the script', async () => {
    const line = 'Can you pass me to 9?';
    const out = await gateCall(
      'chain-transfer-first',
      [line, 'Bye.'],
      classifier({ [line]: CRISIS, 'Bye.': IMMINENT })
    );
    expect(out[0]).toEqual(soft);
    expect(isScript(out[1])).toBe(true);
  });
});
