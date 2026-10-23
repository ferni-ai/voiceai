/**
 * #2548 round 1: through the real reply gate, the second read (CRISIS_CLASSIFIER_SECOND_READ) never
 * changes what the caller hears when the base read found risk. A base crisis read lifted to
 * imminent on a plain goodbye took the 988 line away (the lone-goodbye soft check); a mixed
 * verdict dropped third-party guidance. And where the base read found nothing, the lift reaches
 * the caller. Every turn runs through the turn pipeline too, as on a call: the gate's fill about
 * the caller waits for the pipeline's read of the turn (#2587 redesign).
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
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { startCrisisGate, type CrisisGateDecision } from '../crisis-gate.js';

const GATE = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
  CRISIS_AGREEMENT_GATE: 'on',
};
const ON = { ...GATE, CRISIS_CLASSIFIER_SECOND_READ: 'on' };
const V3 = /Quiet preparation is often said as plain logistics/;
const j = (risk: string, subject = 'self') => JSON.stringify({ risk, subject });

type Turn = [caller: string, ferni: string];
const PUNS_CALL: Turn[] = [
  ['Tell me a pun.', 'What do you call a fake noodle? An impasta.'],
  ['Haha, okay, my turn. Why did the scarecrow win an award?', 'Why?'],
  ['He was outstanding in his field.', 'Ha! That one got me.'],
];

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
});

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

/** The last line reads `base` with the base prompt and `v3` with prompt v3; every other line none. */
function reads(last: string, base: string, v3: string): CrisisGenerateFn {
  return async (prompt, content) => {
    if ((JSON.parse(content) as { latest: string }).latest !== last) return j('none');
    return V3.test(prompt) ? v3 : base;
  };
}

let calls = 0;
async function heard(
  env: Record<string, string>,
  last: string,
  generate: CrisisGenerateFn
): Promise<CrisisGateDecision> {
  const userData = { services: { sessionId: `second-read-${++calls}` } };
  const lines = [...PUNS_CALL.map(([caller]) => caller), last];
  let decision: CrisisGateDecision = { action: 'pass' } as CrisisGateDecision;
  for (let i = 0; i < lines.length; i++) {
    const gate = startCrisisGate(request(PUNS_CALL.slice(0, i), lines[i]), userData, {
      env,
      generate,
    });
    const turn = startTurnCrisis(
      lines[i],
      { recentTranscripts: lines.slice(0, i + 1), lastAgentResponse: PUNS_CALL[i - 1]?.[1] },
      { sessionId: userData.services.sessionId, env, generate }
    );
    decision = (await gate?.escalation) ?? gate?.decision ?? decision;
    await turn.summary();
  }
  return decision;
}

async function offAndOn(last: string, base: string, v3: string) {
  const off = await heard(GATE, last, reads(last, base, v3));
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  const on = await heard(ON, last, reads(last, base, v3));
  return { off, on };
}

describe('the second read through the reply gate', () => {
  for (const bye of ['Bye.', 'Okay, bye.', 'Yeah. it was great. Okay, bye.']) {
    it(`keeps 988 on "${bye}" when the base reads crisis and v3 imminent`, async () => {
      const { off, on } = await offAndOn(bye, j('crisis'), j('imminent'));
      expect(off.action).toBe('guide');
      expect(on).toEqual(off);
      expect(on.action === 'guide' && on.guidance).not.toBe(SOFT_CRISIS_CHECK);
      expect(on.action === 'guide' && on.guidance).toMatch(/988/);
    });
  }

  it('keeps third-party guidance when the base reads someone else imminent and v3 the caller', async () => {
    const line = 'my brother just texted me from the bridge saying goodbye';
    const { off, on } = await offAndOn(line, j('imminent', 'third_party'), j('crisis'));
    expect(on).toEqual(off);
  });

  it('reaches the caller where the base read found nothing', async () => {
    const line = "my neighbor's taking the dog from now on, he deserves better";
    const { off, on } = await offAndOn(line, j('none'), j('crisis'));
    expect(off.action).toBe('pass');
    expect(on.action).toBe('guide');
  });

  it("keeps the patterns' third-party guidance where the base read found nothing and v3 reads the caller", async () => {
    const line = 'my friend keeps saying she wants to kill herself';
    for (const v3 of [j('imminent'), j('crisis')]) {
      for (const base of [j('none'), 'not json']) {
        const { off, on } = await offAndOn(line, base, v3);
        expect(on, `${base} + ${v3}`).toEqual(off);
        expect(off.action).toBe('guide');
      }
    }
  });

  it('keeps the third-party subject in the turn pipeline too', async () => {
    const line = 'my friend keeps saying she wants to kill herself';
    for (const env of [GATE, ON]) {
      resetCrisisClassifierCache();
      const turn = startTurnCrisis(
        line,
        { recentTranscripts: [] },
        {
          sessionId: `second-read-${++calls}`,
          env,
          generate: reads(line, j('none'), j('imminent')),
        }
      );
      expect((await turn.resolve()).subject, JSON.stringify(env)).toBe('third_party');
    }
  });

  // #2587 round 1: two caller lines before Ferni replies. The gate reads them joined, the
  // pipeline only the last; the second read must decide the same way on both.
  const BURSTS: Array<[first: string, last: string]> = [
    ['everything is too much right now.', 'my friend keeps saying she wants to kill herself'],
    ['my friend keeps saying she wants to kill herself.', 'what do i even do'],
  ];

  function burstRequest(first: string, last: string): llm.ChatContext {
    const ctx = request(PUNS_CALL, first);
    ctx.addMessage({ role: 'user', content: last });
    return ctx;
  }

  /** Every line reads `base` with the base prompt and `v3` with prompt v3. */
  function everyLine(base: string, v3: string): CrisisGenerateFn {
    return async (prompt) => (V3.test(prompt) ? v3 : base);
  }

  async function burstHeard(
    env: Record<string, string>,
    [first, last]: [string, string],
    generate: CrisisGenerateFn,
    gateFirst: boolean
  ) {
    resetCrisisClassifierCache();
    resetCrisisCallRisk();
    resetCallRiskSnapshots();
    const sessionId = `burst-${++calls}`;
    const runGate = async () => {
      const gate = startCrisisGate(
        burstRequest(first, last),
        { services: { sessionId } },
        {
          env,
          generate,
        }
      );
      return (await gate?.escalation) ?? gate?.decision ?? { action: 'pass' };
    };
    const runTurn = async () => {
      const turn = startTurnCrisis(
        last,
        {
          recentTranscripts: [...PUNS_CALL.map(([caller]) => caller), first],
          lastAgentResponse: PUNS_CALL.at(-1)?.[1],
        },
        { sessionId, env, generate }
      );
      const crisis = await turn.resolve();
      return {
        subject: crisis.subject,
        severity: crisis.severity,
        guidance: crisis.suggestedResponse,
      };
    };
    if (gateFirst) {
      const gate = await runGate();
      return { gate, turn: await runTurn() };
    }
    const turn = await runTurn();
    return { gate: await runGate(), turn };
  }

  for (const burst of BURSTS) {
    for (const gateFirst of [true, false]) {
      it(`a burst decides the same on both paths: "${burst[1]}", ${gateFirst ? 'gate' : 'pipeline'} first`, async () => {
        for (const v3 of [j('imminent'), j('imminent', 'third_party'), j('crisis')]) {
          for (const base of [j('none'), 'not json']) {
            const off = await burstHeard(GATE, burst, everyLine(base, v3), gateFirst);
            const on = await burstHeard(ON, burst, everyLine(base, v3), gateFirst);
            expect(on, `${base} + ${v3}`).toEqual(off);
          }
        }
      });
    }
  }
});
