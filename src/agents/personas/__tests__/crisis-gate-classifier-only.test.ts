/**
 * 2026-10-22: the prod canary and two dev calls brought up 988 after "The
 * running, not so much. Once, maybe." and "I'm just so tired. like bone
 * tired." No pattern matched; two reads of the same classifier said crisis
 * (the reply gate's and the turn pipeline's), so the agreement gate let them
 * stand. Through the real reply gate and turn pipeline, with prod's crisis
 * flags:
 *   - CRISIS_CLASSIFIER_ONLY_CHECKIN off or shadow: the 988 guidance, as today;
 *   - live: the independent second read (the adjudicator) decides; its
 *     confident checkin gives the soft check-in in the gate and the pipeline,
 *     and escalate, a timeout or an error keep the 988 guidance;
 *   - every turn with independent support keeps exactly what it had, even
 *     when the second read would wrongly say checkin.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { allowCrisisAdjudicatorLiveForTests } from '../../../services/safety/crisis-adjudicator.js';
import { SOFT_CRISIS_CHECK } from '../../../services/safety/crisis-agreement.js';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  startCrisisClassifier,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { resetClassifierOnlyReads } from '../../../services/safety/crisis-classifier-only.js';
import { crisisSummary, startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { startCrisisGate } from '../crisis-gate.js';

/** Prod's crisis settings on 8981d4f03 (EFFECTIVE_SETTINGS, 2026-10-22). */
const PROD = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_AGREEMENT_GATE: 'on',
  CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
};
const CRISIS = '{"risk":"crisis","subject":"self"}';
const IMMINENT = '{"risk":"imminent","subject":"self"}';
const THIRD = '{"risk":"crisis","subject":"third_party"}';
const NONE = '{"risk":"none","subject":"self"}';
/** The adjudicator's replies. */
const CHECKIN = '{"caller_risk":"","decision":"checkin","confidence":"high"}';
const ESCALATE = '{"caller_risk":"so tired","decision":"escalate","confidence":"high"}';

interface Call {
  earlier: string[];
  companion: string;
  latest: string;
}

/** The three false alarms, as the eval calls had them. */
const PROD_FT: Call = {
  earlier: [
    "Hey Ferni, it's me.",
    'Not much, just a long week.',
    'Ah, yeah, I actually did send it Wednesday night. No reply yet though.',
  ],
  companion:
    "Well, Wednesday night is still fresh, so Dana's probably still sipping her morning coffee and getting through her inbox. Give it a bit of time. But listen, you mentioned it's been a long week. What's been going on?",
  latest: 'The running, not so much. Once. maybe.',
};
const DEV_FT: Call = {
  earlier: [
    "Hey Ferni, it's me.",
    'Not much, just a long week.',
    'Huh, yeah, I actually did send it. Wednesday night. No reply yet though.',
  ],
  companion:
    "Wednesday night is pretty good, getting it done early so you don't have to stare at it all day.",
  latest: 'The running, not so much. Once, maybe.',
};
const DEV_LONG_ARC: Call = {
  earlier: [
    'Hey Ferni, honestly, today was rough.',
    'My manager moved the big launch deadline up to Friday out of nowhere.',
    "I've been working late every night this week already.",
  ],
  companion:
    'That is just brutal, working late all week and then getting hit with an early deadline on top of it.',
  latest: "I'm just so tired. like bone tired.",
};
const FALSE_ALARMS = [
  ['prod follow-through', PROD_FT],
  ['dev follow-through', DEV_FT],
  ['dev long-arc', DEV_LONG_ARC],
] as const;

/** A line only the pipeline still holds, so its read is a separate model call, as in prod. */
const PIPELINE_ONLY = ['Morning.'];

let calls = 0;
beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetClassifierOnlyReads();
  // Live tests lift the adjudicator's hold explicitly; the hold tests put it back.
  allowCrisisAdjudicatorLiveForTests(true);
});
afterEach(() => allowCrisisAdjudicatorLiveForTests(false));

function request(call: Call): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const line of call.earlier) ctx.addMessage({ role: 'user', content: line });
  ctx.addMessage({ role: 'assistant', content: call.companion });
  ctx.addMessage({ role: 'user', content: call.latest });
  return ctx;
}

type Heard = 'replace' | 'guide-988' | 'soft' | 'pass';

/**
 * One caller turn through both paths on one call, as prod runs them: the reply
 * gate and the turn pipeline, each with its own classifier read (their inputs
 * differ, so the two reads are separate model calls, both counted for the turn).
 * `reads` gives the gate's read and the pipeline's read.
 */
async function turn(
  call: Call,
  mode: string | undefined,
  reads: [gate: string, pipeline: string] = [CRISIS, CRISIS],
  opts: {
    session?: string | null;
    earlierRisk?: boolean;
    adjudicate?: CrisisGenerateFn;
    env?: Record<string, string>;
    gate?: false;
  } = {}
): Promise<{ gate: Heard; pipeline: Heard; modelCalls: number }> {
  // Unless a test says otherwise, the second read says checkin: the worst case for a must-not.
  const adjudicate = opts.adjudicate ?? (async () => CHECKIN);
  const base = opts.env ?? PROD;
  const env = mode === undefined ? base : { ...base, CRISIS_CLASSIFIER_ONLY_CHECKIN: mode };
  const session = opts.session === null ? undefined : (opts.session ?? `call-${++calls}`);
  let modelCalls = 0;
  const generate =
    (read: string): CrisisGenerateFn =>
    async () => {
      modelCalls++;
      return read;
    };
  if (opts.earlierRisk && session) {
    // An earlier turn on this call only the classifier flagged.
    const before = { ...call, latest: 'I gave my dog to my sister this morning.' };
    const gate = startCrisisGate(
      request(before),
      { services: { sessionId: session } },
      {
        env,
        generate: generate(CRISIS),
        adjudicate,
      }
    );
    await gate?.escalation;
  }
  const userData = session ? { services: { sessionId: session } } : {};
  const gate =
    opts.gate === false
      ? null
      : startCrisisGate(request(call), userData, { env, generate: generate(reads[0]), adjudicate });
  const pipeline = startTurnCrisis(
    call.latest,
    // The pipeline keeps the last ten caller lines, this one included (transcript-handler.ts).
    {
      recentTranscripts: [...PIPELINE_ONLY, ...call.earlier, call.latest],
      lastAgentResponse: call.companion,
    },
    { sessionId: session, env, generate: generate(reads[1]), adjudicate }
  );
  const [decision, crisis, soft] = await Promise.all([
    gate?.escalation ? gate.escalation.then((d) => d ?? gate.decision) : gate?.decision,
    pipeline.resolve(),
    pipeline.softCheck(),
  ]);
  const summary = crisisSummary(crisis, soft);
  const gateHeard: Heard =
    !decision || decision.action === 'pass'
      ? 'pass'
      : decision.action === 'replace'
        ? 'replace'
        : decision.guidance === SOFT_CRISIS_CHECK
          ? 'soft'
          : decision.guidance.includes('988')
            ? 'guide-988'
            : 'pass';
  const pipelineHeard: Heard = summary.shouldOverrideLLM
    ? 'replace'
    : summary.isCrisis
      ? 'guide-988'
      : summary.softCheck
        ? 'soft'
        : 'pass';
  return { gate: gateHeard, pipeline: pipelineHeard, modelCalls };
}

describe('the 2026-10-22 false alarms', () => {
  it.each(FALSE_ALARMS)(
    '%s: two crisis reads bring the 988 guidance with the flag off',
    async (_n, call) => {
      const heard = await turn(call, undefined);
      expect(heard).toEqual({ gate: 'guide-988', pipeline: 'guide-988', modelCalls: 2 });
    }
  );

  it.each(FALSE_ALARMS)('%s: shadow changes nothing', async (_n, call) => {
    expect(await turn(call, 'shadow')).toEqual({
      gate: 'guide-988',
      pipeline: 'guide-988',
      modelCalls: 2,
    });
  });

  it.each(FALSE_ALARMS)(
    '%s: live, the second read says checkin: the soft check-in in both paths',
    async (_n, call) => {
      expect(await turn(call, 'live')).toEqual({ gate: 'soft', pipeline: 'soft', modelCalls: 2 });
    }
  );

  it.each(FALSE_ALARMS)(
    '%s: live, the second read says escalate: the 988 guidance stays',
    async (_n, call) => {
      const heard = await turn(call, 'live', [CRISIS, CRISIS], {
        adjudicate: async () => ESCALATE,
      });
      expect(heard).toEqual({ gate: 'guide-988', pipeline: 'guide-988', modelCalls: 2 });
    }
  );

  it('live, the second read fails or never answers: the 988 guidance stays', async () => {
    const failing: CrisisGenerateFn = async () => {
      throw new Error('vertex down');
    };
    expect(await turn(PROD_FT, 'live', [CRISIS, CRISIS], { adjudicate: failing })).toMatchObject({
      gate: 'guide-988',
      pipeline: 'guide-988',
    });
    resetClassifierOnlyReads();
    // Never answers: the adjudicator's own timeout (1.2 s by default) escalates.
    const hanging: CrisisGenerateFn = () =>
      new Promise<string>(() => {
        // never settles
      });
    const heard = await turn(DEV_LONG_ARC, 'live', [CRISIS, CRISIS], { adjudicate: hanging });
    expect(heard).toMatchObject({ gate: 'guide-988', pipeline: 'guide-988' });
  });
});

describe('turns with independent support keep exactly what they had (live === off)', () => {
  const MUST_NOT: Array<
    [string, Call, [string, string], { session?: null; earlierRisk?: boolean }?]
  > = [
    ['an imminent read', DEV_LONG_ARC, [IMMINENT, IMMINENT]],
    ['an imminent read beside a crisis read', PROD_FT, [CRISIS, IMMINENT]],
    ['"I have the pills here"', { ...PROD_FT, latest: 'I have the pills here.' }, [CRISIS, CRISIS]],
    [
      '"tonight\'s the night, bye" read crisis',
      { ...PROD_FT, latest: "Tonight's the night. Bye." },
      [CRISIS, CRISIS],
    ],
    [
      '"tonight\'s the night, bye" read imminent',
      { ...PROD_FT, latest: "Tonight's the night. Bye." },
      [IMMINENT, IMMINENT],
    ],
    [
      'a pattern hit',
      { ...PROD_FT, latest: "Honestly I don't want to be alive anymore." },
      [CRISIS, CRISIS],
    ],
    ['risk earlier on the call', PROD_FT, [CRISIS, CRISIS], { earlierRisk: true }],
    [
      'Ferni had asked if they are okay',
      { ...DEV_LONG_ARC, companion: 'Long day. Are you doing okay?' },
      [CRISIS, CRISIS],
    ],
    ['a read about someone else', PROD_FT, [THIRD, THIRD]],
    ['agreeing with Ferni', { ...DEV_LONG_ARC, latest: 'Yeah, same. Honestly.' }, [CRISIS, CRISIS]],
    ['an early read', { ...PROD_FT, earlier: PROD_FT.earlier.slice(0, 1) }, [CRISIS, CRISIS]],
    ['an unknown call', PROD_FT, [CRISIS, CRISIS], { session: null }],
    [
      'passive ideation in other words',
      { ...PROD_FT, latest: "It'd be easier for everyone if I was gone." },
      [CRISIS, CRISIS],
    ],
  ];

  it.each(MUST_NOT)('%s', async (_name, call, reads, opts) => {
    const off = await turn(call, undefined, reads, opts);
    resetCrisisClassifierCache();
    resetCrisisCallRisk();
    resetCallRiskSnapshots();
    const live = await turn(call, 'live', reads, opts);
    // Non-vacuous: the gate escalated with the flag off, and live is the same.
    expect(['guide-988', 'replace']).toContain(off.gate);
    expect(live.gate).toBe(off.gate);
    expect(live.pipeline).toBe(off.pipeline);
    expect(live.gate).not.toBe('soft');
  });

  it('a read that times out keeps the 988 guidance', async () => {
    const env = {
      ...PROD,
      CRISIS_CLASSIFIER_ONLY_CHECKIN: 'live',
      CRISIS_CLASSIFIER_TIMEOUT_MS: '30',
    };
    const session = `call-${++calls}`;
    const slow: CrisisGenerateFn = () =>
      new Promise((r) => {
        setTimeout(() => r(CRISIS), 200);
      });
    const fast: CrisisGenerateFn = async () => CRISIS;
    const gate = startCrisisGate(
      request(PROD_FT),
      { services: { sessionId: session } },
      { env, generate: fast, adjudicate: async () => CHECKIN }
    );
    startTurnCrisis(
      PROD_FT.latest,
      {
        recentTranscripts: [...PIPELINE_ONLY, ...PROD_FT.earlier],
        lastAgentResponse: PROD_FT.companion,
      },
      { sessionId: session, env, generate: slow, adjudicate: async () => CHECKIN }
    );
    const decision = await gate?.escalation;
    expect(decision?.action).toBe('guide');
    expect(decision?.action === 'guide' && decision.guidance).not.toBe(SOFT_CRISIS_CHECK);
  });

  it('a turn the classifier reads none stays a plain pass', async () => {
    expect(await turn(PROD_FT, 'live', [NONE, NONE])).toMatchObject({
      gate: 'pass',
      pipeline: 'pass',
    });
  });
});

describe('reads of the turn that arrive while the second read is out', () => {
  it('a read still in flight when the reads are collected again keeps the 988 guidance', async () => {
    // Gate read at once; the second read checks in at 100 ms; a pipeline read (crisis, 300 ms)
    // starts at 20 ms; a late duplicate read starts at 150 ms, after the second collection
    // began, and is still out when it ends.
    const env = {
      ...PROD,
      CRISIS_CLASSIFIER_ONLY_CHECKIN: 'live',
      CRISIS_CLASSIFIER_TIMEOUT_MS: '3000',
    };
    const session = `inflight-${++calls}`;
    const wait = (ms: number) =>
      new Promise<void>((r) => {
        setTimeout(r, ms);
      });
    const slow =
      (ms: number): CrisisGenerateFn =>
      async () => {
        await wait(ms);
        return CRISIS;
      };
    const gate = startCrisisGate(
      request(PROD_FT),
      { services: { sessionId: session } },
      {
        env,
        generate: async () => CRISIS,
        adjudicate: async () => {
          await wait(100);
          return CHECKIN;
        },
      }
    );
    await wait(20);
    startTurnCrisis(
      PROD_FT.latest,
      {
        recentTranscripts: [...PIPELINE_ONLY, ...PROD_FT.earlier, PROD_FT.latest],
        lastAgentResponse: PROD_FT.companion,
      },
      { sessionId: session, env, generate: slow(300) }
    );
    await wait(130);
    startCrisisClassifier(
      {
        latest: PROD_FT.latest,
        earlier: ['Late.', ...PROD_FT.earlier],
        companion: PROD_FT.companion,
      },
      { pattern: 'none', env, generate: slow(1500), scope: session, call: session }
    );
    const decision = await gate?.escalation;
    expect(decision?.action).toBe('guide');
    expect(decision?.action === 'guide' && decision.guidance).not.toBe(SOFT_CRISIS_CHECK);
  });
});

describe('after a check-in, the next crisis read on the call escalates', () => {
  it('holds once, then brings the 988 guidance', async () => {
    const session = `call-${++calls}`;
    expect((await turn(PROD_FT, 'live', [CRISIS, CRISIS], { session })).gate).toBe('soft');
    const next: Call = {
      earlier: [...PROD_FT.earlier, PROD_FT.latest],
      companion: 'Once is a start. What else is new this week?',
      latest: 'I mean, it is what it is.',
    };
    expect((await turn(next, 'live', [CRISIS, CRISIS], { session })).gate).toBe('guide-988');
  });
});

describe('the 2026-10-22 safety review probes', () => {
  const LINE = 'The running, not so much.';
  const CALL: Call = { ...PROD_FT, latest: LINE };
  const SLOW =
    (read: string, ms: number): CrisisGenerateFn =>
    async () => {
      await new Promise<void>((r) => {
        setTimeout(r, ms);
      });
      return read;
    };

  it("P1: shadow never holds the reply, even for the other path's read", async () => {
    // Agreement gate off, adjudicator shadow: nothing holds the gate for the pipeline's read.
    const env = { ...PROD, CRISIS_AGREEMENT_GATE: 'off', CRISIS_ADJUDICATOR: 'shadow' };
    const timed = async (mode: string) => {
      resetCrisisClassifierCache();
      resetCrisisCallRisk();
      resetCallRiskSnapshots();
      resetClassifierOnlyReads();
      const session = `p1-${mode}-${++calls}`;
      const t0 = Date.now();
      const gate = startCrisisGate(
        request(CALL),
        { services: { sessionId: session } },
        {
          env: { ...env, CRISIS_CLASSIFIER_ONLY_CHECKIN: mode },
          generate: async () => CRISIS,
          adjudicate: async () => CHECKIN,
        }
      );
      const pipe = startTurnCrisis(
        LINE,
        {
          recentTranscripts: [...PIPELINE_ONLY, ...CALL.earlier, LINE],
          lastAgentResponse: CALL.companion,
        },
        {
          sessionId: session,
          env: { ...env, CRISIS_CLASSIFIER_ONLY_CHECKIN: mode },
          generate: SLOW(CRISIS, 600),
          adjudicate: async () => CHECKIN,
        }
      );
      const decision = await gate?.escalation;
      const ms = Date.now() - t0;
      await pipe.resolve();
      return { ms, decision };
    };
    const off = await timed('off');
    const shadow = await timed('shadow');
    expect(off.ms).toBeLessThan(300);
    expect(shadow.ms).toBeLessThan(off.ms + 150);
    expect(shadow.decision).toEqual(off.decision);
  });

  it("P2: one second read per turn, from the reply gate's fuller transcript, shared with the pipeline", async () => {
    const seen: string[] = [];
    // The pipeline alone holds "Morning."; a read built from its transcript would escalate.
    const adjudicate: CrisisGenerateFn = async (_p, content) => {
      seen.push(content);
      return content.includes('Morning.') ? ESCALATE : CHECKIN;
    };
    const heard = await turn(CALL, 'live', [CRISIS, CRISIS], { adjudicate });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain(CALL.companion);
    expect(seen[0]).not.toContain('Morning.');
    expect(heard).toMatchObject({ gate: 'soft', pipeline: 'soft' });
  });

  it("P2: the pipeline never eases without the gate's shared read (crisis_response stays)", async () => {
    const env = {
      ...PROD,
      CRISIS_CLASSIFIER_ONLY_TIMEOUT_MS: '20',
      CRISIS_CLASSIFIER_TIMEOUT_MS: '20',
    };
    const heard = await turn(CALL, 'live', [CRISIS, CRISIS], { env, gate: false });
    expect(heard.pipeline).toBe('guide-988');
  });

  it('P3: CRISIS_ADJUDICATOR=live is held, and the new flag cannot route around the hold', async () => {
    allowCrisisAdjudicatorLiveForTests(false);
    const env = { ...PROD, CRISIS_ADJUDICATOR: 'live' };
    expect(await turn(CALL, 'live', [CRISIS, CRISIS], { env })).toMatchObject({
      gate: 'guide-988',
      pipeline: 'guide-988',
    });
    expect(await turn(CALL, 'live', [CRISIS, CRISIS])).toMatchObject({
      gate: 'guide-988',
      pipeline: 'guide-988',
    });
  });

  it("P6: agreement gate off, the pipeline's imminent read keeps the gate from easing", async () => {
    const env = { ...PROD, CRISIS_AGREEMENT_GATE: 'off' };
    const off = await turn(CALL, undefined, [CRISIS, IMMINENT], { env });
    const live = await turn(CALL, 'live', [CRISIS, IMMINENT], { env });
    expect(off.gate).toBe('guide-988');
    expect(live.gate).toBe('guide-988');
  });

  it('P6: with no call to gather reads under, live keeps the 988 guidance', async () => {
    expect((await turn(CALL, 'live', [CRISIS, CRISIS], { session: null })).gate).toBe('guide-988');
  });

  it('live starts the second read early, overlapping the wait for the other read', async () => {
    // Gate read at once, pipeline read 600 ms, second read 500 ms: in sequence ~1100 ms.
    const session = `early-${++calls}`;
    const t0 = Date.now();
    const gate = startCrisisGate(
      request(CALL),
      { services: { sessionId: session } },
      {
        env: { ...PROD, CRISIS_CLASSIFIER_ONLY_CHECKIN: 'live' },
        generate: async () => CRISIS,
        adjudicate: SLOW(CHECKIN, 500),
      }
    );
    startTurnCrisis(
      LINE,
      {
        recentTranscripts: [...PIPELINE_ONLY, ...CALL.earlier, LINE],
        lastAgentResponse: CALL.companion,
      },
      {
        sessionId: session,
        env: { ...PROD, CRISIS_CLASSIFIER_ONLY_CHECKIN: 'live' },
        generate: SLOW(CRISIS, 600),
      }
    );
    expect(await gate?.escalation).toEqual({ action: 'guide', guidance: SOFT_CRISIS_CHECK });
    expect(Date.now() - t0).toBeLessThan(900);
  });
});
