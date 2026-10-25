/**
 * #2587 failed review: with the second read on, 98 of 11,712 turns heard less than with it off,
 * the gate's guidance about someone else replaced by the pipeline's 988 script for the caller.
 * Each path decided whether v3 may fill from its own lines, and the pipeline's lines can be a
 * shorter window, empty (#2615), or stale. Here every shape runs through the real gate and the
 * real turn pipeline, in both orders, with the flag off and on: on is never weaker.
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { buildCrisisGuidance } from '../../../services/safety/crisis-guard.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { startCrisisGate, type CrisisGateDecision } from '../crisis-gate.js';

const OFF = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
  CRISIS_AGREEMENT_GATE: 'on',
  CRISIS_CLASSIFIER_TIMEOUT_MS: '60',
};
const ON = { ...OFF, CRISIS_CLASSIFIER_SECOND_READ: 'on' };
const V3 = /Quiet preparation is often said as plain logistics/;
const j = (risk: string, subject = 'self') => JSON.stringify({ risk, subject });

type Turn = [caller: string, ferni: string];
const FRIEND = 'my friend keeps saying she wants to kill herself';
const SCARY = 'That sounds really scary. You can call or text 988 on her behalf. How are you?';
const PUNS: Turn[] = [
  ['Tell me a pun.', 'What do you call a fake noodle? An impasta.'],
  ['He was outstanding in his field.', 'Ha! That one got me.'],
];
// The worry six caller lines back at the end of the turn: in the gate's window, not the pipeline's.
const WINDOW: Turn[] = [
  [FRIEND, SCARY],
  ['I am okay I guess.', 'I am glad you told me.'],
  ['We had pizza earlier.', 'Nice.'],
  ['The game was on.', 'Who won?'],
  ['The home team.', 'Good for them.'],
];

interface Shape {
  name: string;
  turns: Turn[];
  /** The turn's caller lines before Ferni replies: the gate reads them joined. */
  burst: string[];
  /** What the pipeline's recentTranscripts holds when it reads the turn's last line. */
  history: 'full' | 'empty' | 'stale';
  /** Base reads find risk only where this is in what they read (a model that needs context). */
  ctx?: string;
  /** Lines only the pipeline's history holds (a chat context trimmed shorter). */
  pipeExtra?: string[];
  /** #2666 round 1: another call with the same gate view, without pipeExtra, reads first. */
  twin?: boolean;
}

const SHAPES: Shape[] = [];
for (const ctx of [undefined, 'kill herself']) {
  const at = ctx ? '~ctx' : '';
  SHAPES.push(
    {
      name: `window${at}`,
      turns: WINDOW,
      burst: ['anyway.', 'should i drive over tonight'],
      history: 'full',
      ctx,
    },
    {
      name: `window1${at}`,
      turns: WINDOW,
      burst: ['should i drive over tonight'],
      history: 'full',
      ctx,
    },
    {
      name: `empty${at}`,
      turns: PUNS,
      burst: [`${FRIEND}.`, 'what do i even do'],
      history: 'empty',
      ctx,
    },
    {
      name: `empty-followup${at}`,
      turns: [...PUNS, [FRIEND, SCARY]],
      burst: ['what do i even do'],
      history: 'empty',
      ctx,
    },
    {
      name: `stale${at}`,
      turns: PUNS,
      burst: [`${FRIEND}.`, 'what do i even do'],
      history: 'stale',
      ctx,
    },
    {
      name: `stale-tonight${at}`,
      turns: PUNS,
      burst: [`${FRIEND}.`, 'tonight'],
      history: 'stale',
      ctx,
    }
  );
}
// #2666 round 1. A turn whose words end like an earlier turn's, after the same Ferni line, within
// 30 s: the earlier turn's fill decision must not carry over. And a call whose gate view matches
// another call's must not reuse that call's run, nor its decision about its own pipeline.
const CHECK = 'Are you okay?';
const BROTHER = 'my brother says he wants to end his life.';
const NEW_SHAPES: Shape[] = [];
for (const [said, last] of [
  ['yeah ok', 'ok'],
  ['yeah', 'yeah'],
  ['no', 'no'],
]) {
  for (const history of ['empty', 'stale', 'full'] as const) {
    const turns: Turn[] = [
      ['hey', CHECK],
      [said, 'Good to hear. What are you up to?'],
      ['not much', CHECK],
    ];
    NEW_SHAPES.push({
      name: `stale-turn ${said}/${last} ${history}`,
      turns,
      burst: [BROTHER, last],
      history,
    });
  }
}
NEW_SHAPES.push({
  name: 'cross-call',
  turns: PUNS,
  burst: ['should i drive over tonight'],
  history: 'full',
  ctx: 'kill herself',
  pipeExtra: [FRIEND],
  twin: true,
});

// A clean turn the base read misses: the fill must still reach the caller.
const DOG: Shape = {
  name: 'dog',
  turns: PUNS,
  burst: ["my neighbor's taking the dog from now on, he deserves better"],
  history: 'full',
};

const BASES = [j('none'), 'not json', j('crisis', 'third_party'), j('imminent', 'third_party')];
const V3S = [j('imminent'), j('crisis'), j('imminent', 'third_party')];

function request(turns: Turn[], latest: string[]): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const [caller, ferni] of turns) {
    ctx.addMessage({ role: 'user', content: caller });
    ctx.addMessage({ role: 'assistant', content: ferni });
  }
  for (const line of latest) ctx.addMessage({ role: 'user', content: line });
  return ctx;
}

interface Heard {
  /** 3 a script, 2 crisis guidance, 1 a soft check, 0 nothing. */
  rank: number;
  marks: Set<string>;
  label: string;
}

const marksOf = (text: string): Set<string> => {
  const marks = new Set<string>();
  if (text.includes('988')) marks.add('988');
  if (text.includes('911')) marks.add('911');
  if (/someone they know is at risk|on their behalf|on the person's behalf/.test(text)) {
    marks.add('third_party');
  }
  return marks;
};

let calls = 0;

/** What the caller hears on the turn's last line: the gate's decision with the pipeline's. */
async function heard(
  env: Record<string, string>,
  shape: Shape,
  base: string,
  v3: string,
  gateFirst: boolean
): Promise<Heard> {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  // Risk only in the turn's own words: its lines, or any run of them joined.
  const finals = new Set<string>();
  for (let a = 0; a < shape.burst.length; a++) {
    for (let b = a + 1; b <= shape.burst.length; b++) finals.add(shape.burst.slice(a, b).join(' '));
  }
  const generate: CrisisGenerateFn = async (prompt, content) => {
    const seen = JSON.parse(content) as { latest: string; earlier: string[] };
    if (!finals.has(seen.latest)) return j('none');
    if (V3.test(prompt)) return v3;
    const visible = [seen.latest, ...seen.earlier].join(' ');
    return shape.ctx && !visible.includes(shape.ctx) ? j('none') : base;
  };
  if (shape.twin) await call({ ...shape, pipeExtra: undefined }, env, generate, gateFirst);
  return call(shape, env, generate, gateFirst);
}

/**
 * One call through to the turn's last line. Each caller line is one pipeline run, so one
 * secondReadTurn (nextSecondReadTurn): the gate reads the latest from the session user data.
 */
async function call(
  shape: Shape,
  env: Record<string, string>,
  generate: CrisisGenerateFn,
  gateFirst: boolean
): Promise<Heard> {
  const sessionId = `shape-${++calls}`;
  const userData = { services: { sessionId }, secondReadTurn: 0 };
  const prior = shape.turns.map(([caller]) => caller);
  const extra = shape.pipeExtra ?? [];
  for (let i = 0; i < shape.turns.length; i++) {
    userData.secondReadTurn = i + 1;
    const gate = startCrisisGate(request(shape.turns.slice(0, i), [prior[i]]), userData, {
      env,
      generate,
    });
    const recent = shape.history === 'empty' ? [] : prior.slice(0, i + 1);
    const lastAgentResponse = shape.turns[i - 1]?.[1];
    const pipe = startTurnCrisis(
      prior[i],
      { recentTranscripts: recent, lastAgentResponse, secondReadTurn: i + 1 },
      { sessionId, env, generate }
    );
    await Promise.all([gate?.escalation, pipe.summary()]);
  }
  userData.secondReadTurn = prior.length + shape.burst.length;
  const secondReadTurn = userData.secondReadTurn;
  const last = shape.burst.at(-1) ?? '';
  const recentTranscripts =
    shape.history === 'empty'
      ? []
      : shape.history === 'stale'
        ? [...prior, ...extra, last]
        : [...prior, ...extra, ...shape.burst];
  const lastAgentResponse = shape.turns.at(-1)?.[1];
  const runGate = () =>
    startCrisisGate(request(shape.turns, shape.burst), userData, { env, generate });
  const runPipe = () =>
    startTurnCrisis(
      last,
      { recentTranscripts, lastAgentResponse, secondReadTurn },
      { sessionId, env, generate }
    );
  let gate: ReturnType<typeof runGate>;
  let pipe: ReturnType<typeof runPipe>;
  if (gateFirst) {
    gate = runGate();
    pipe = runPipe();
  } else {
    pipe = runPipe();
    gate = runGate();
  }
  const decision: CrisisGateDecision = (await gate?.escalation) ??
    gate?.decision ?? { action: 'pass' };
  const s = await pipe.summary();
  if (decision.action === 'replace')
    return { rank: 3, marks: marksOf(decision.script), label: 'gate-script' };
  if (s.shouldOverrideLLM)
    return { rank: 3, marks: marksOf(s.suggestedResponse ?? ''), label: 'pipe-script' };
  const texts: string[] = [];
  if (decision.action === 'guide') texts.push(decision.guidance);
  if (s.isCrisis && !s.softCheck) texts.push(buildCrisisGuidance(s as never));
  else if (s.softCheck) texts.push(s.softGuidance ?? '[SAFETY - SOFT CHECK]');
  if (!texts.length) return { rank: 0, marks: new Set(), label: 'nothing' };
  const full = texts.join('\n');
  const soft = texts.every((t) => !t.startsWith('[CRITICAL'));
  return { rank: soft ? 1 : 2, marks: marksOf(full), label: soft ? 'soft' : 'guide' };
}

/** Why `on` is weaker than `off`: a lower rank, or a mark (988, 911, someone else) lost. */
function weaker(off: Heard, on: Heard): string[] {
  const why: string[] = [];
  if (on.rank < off.rank) why.push(`rank ${off.label} > ${on.label}`);
  for (const mark of off.marks) if (!on.marks.has(mark)) why.push(`lost ${mark}`);
  return why;
}

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
});

describe('the second read is never weaker than off, in any shape or order', () => {
  for (const shape of [...SHAPES, ...NEW_SHAPES]) {
    for (const gateFirst of [true, false]) {
      const order = gateFirst ? 'gate then pipeline' : 'pipeline then gate';
      it(`${shape.name}, ${order}`, async () => {
        const found: string[] = [];
        for (const base of BASES) {
          for (const v3 of V3S) {
            const off = await heard(OFF, shape, base, v3, gateFirst);
            const on = await heard(ON, shape, base, v3, gateFirst);
            const why = weaker(off, on);
            if (why.length)
              found.push(`${base} + ${v3}: ${off.label} -> ${on.label} (${why.join(', ')})`);
          }
        }
        expect(found).toEqual([]);
      });
    }
  }

  // The FAIL's own rows: the friend line still in the gate's view, not in the pipeline's.
  it('keeps the third-party guidance where the pipeline would have filled from its own lines', async () => {
    for (const shape of SHAPES.filter((s) => s.ctx)) {
      for (const gateFirst of [true, false]) {
        const on = await heard(ON, shape, j('crisis', 'third_party'), j('imminent'), gateFirst);
        expect(on.marks.has('third_party'), `${shape.name} ${gateFirst}`).toBe(true);
        expect(on.label, `${shape.name} ${gateFirst}`).not.toBe('pipe-script');
      }
    }
  });
});

// Every shape above has the worry in the lines the gate read, so the gate decides no fill and
// neither path fills: on hears exactly what off hears, the pipeline's own lines notwithstanding.
describe("the gate's decision is the turn's, on both paths", () => {
  for (const gateFirst of [true, false]) {
    it(gateFirst ? 'gate then pipeline' : 'pipeline then gate', async () => {
      const changed: string[] = [];
      for (const shape of SHAPES) {
        for (const base of [j('none'), 'not json']) {
          for (const v3 of V3S) {
            const off = await heard(OFF, shape, base, v3, gateFirst);
            const on = await heard(ON, shape, base, v3, gateFirst);
            if (on.label !== off.label || on.rank !== off.rank) {
              changed.push(`${shape.name} ${base} + ${v3}: ${off.label} -> ${on.label}`);
            }
          }
        }
      }
      expect(changed).toEqual([]);
    });
  }
});

describe('where the base read misses a clean turn, the fill still reaches the caller', () => {
  for (const gateFirst of [true, false]) {
    it(gateFirst ? 'gate then pipeline' : 'pipeline then gate', async () => {
      for (const v3 of [j('crisis'), j('imminent')]) {
        const off = await heard(OFF, DOG, j('none'), v3, gateFirst);
        const on = await heard(ON, DOG, j('none'), v3, gateFirst);
        expect(off.rank).toBe(0);
        expect(on.rank, v3).toBeGreaterThan(0);
        expect(on.marks.has('988'), v3).toBe(true);
      }
    });
  }
});
