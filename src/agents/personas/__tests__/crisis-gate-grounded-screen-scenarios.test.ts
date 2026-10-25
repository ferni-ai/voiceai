/**
 * Independent verify of PR #2461 at 6e701d392. Each caller turn runs the way prod does:
 * the turn pipeline first (startTurnCrisis, lastAgentResponse as agent-reply-recorder sets
 * it: the last committed non-acknowledgement assistant line), then the reply gate
 * (gatedReply) once. The classifier reads ONLY the released line as imminent: it never
 * helps on the answer, so every outcome below is the screen's own.
 */
import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import {
  GROUNDED_RELEASE_CSSRS_PROMPT,
  resetGroundedRelease,
} from '../../../services/safety/crisis-grounded-release.js';
import { SCREEN_QUESTION } from '../../../services/safety/crisis-grounded-screen.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { isAcknowledgementOnly } from '../../voice-agent/agent-reply-recorder.js';
import { gatedReply } from '../crisis-gate.js';

const LIVE = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_GROUNDED_RELEASE: 'live',
};
const IMMINENT = '{"risk":"imminent","subject":"self"}';
const NONE = '{"risk":"none","subject":"self"}';
const EVERYDAY = '{"danger":"","about":"the dinner tonight","decision":"everyday"}';
const CSSRS_EVERYDAY =
  '{"wish_dead":"none","ideation":"none","method":"none","intent":"none","plan_time":"none","everyday":true}';
const OPENER = 'I forgot to invite David to dinner. Remind me next time.';
const REMINDER = "I've set that reminder for tomorrow morning.";
const DINNER = "Tomorrow's a little bit late. Dinner is tonight.";

const fooled = (): CrisisGenerateFn[] =>
  [0, 1].map(() =>
    vi.fn<CrisisGenerateFn>(async (p) =>
      p === GROUNDED_RELEASE_CSSRS_PROMPT ? CSSRS_EVERYDAY : EVERYDAY
    )
  );
const classifier: CrisisGenerateFn = async (_p, content) =>
  (JSON.parse(content) as { latest: string }).latest === DINNER ? IMMINENT : NONE;

type Item = { role: 'user' | 'assistant'; text: string } | { tool: string };

let n = 0;
beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetGroundedRelease();
});

function ctxOf(items: Item[]): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const it of items) {
    if ('tool' in it) {
      const callId = `c${++n}`;
      ctx.items.push(llm.FunctionCall.create({ callId, name: it.tool, args: '{}' }));
      ctx.items.push(
        llm.FunctionCallOutput.create({ callId, name: it.tool, output: 'ok', isError: false })
      );
    } else ctx.addMessage({ role: it.role, content: it.text });
  }
  return ctx;
}

/** agent-reply-recorder: the last committed assistant line that is not an acknowledgement. */
function lastAgentResponse(items: Item[]): string | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (
      'role' in it &&
      it.role === 'assistant' &&
      it.text.trim() &&
      !isAcknowledgementOnly(it.text.trim())
    )
      return it.text.trim();
  }
  return undefined;
}

type Guidance = 'crisis' | 'gentle' | 'light' | 'soft' | 'none';
const kind = (text: string): Guidance =>
  /CRITICAL - USER SAFETY|SAFETY OVERRIDE|988 Suicide/.test(text) && !/GENTLE OFFER/.test(text)
    ? 'crisis'
    : /GENTLE OFFER/.test(text)
      ? 'gentle'
      : /DIRECT CHECK/.test(text)
        ? 'light'
        : /SAFETY/.test(text)
          ? 'soft'
          : 'none';

/** One caller turn through both paths, pipeline first. */
async function turn(session: string, items: Item[], said: string, model: string | null = 'MODEL.') {
  const history = [...items, { role: 'user' as const, text: said }];
  const userTexts = items
    .filter((i): i is { role: 'user'; text: string } => 'role' in i && i.role === 'user')
    .map((i) => i.text);
  const pipe = await startTurnCrisis(
    said,
    { recentTranscripts: userTexts, lastAgentResponse: lastAgentResponse(items) },
    { sessionId: session, env: LIVE, generate: classifier, groundedReads: fooled() }
  ).summary();
  const prompts: string[] = [];
  const reply = await gatedReply(
    ctxOf(history),
    Object.assign(new EventEmitter(), { userData: { services: { sessionId: session } } }),
    (async (req: llm.ChatContext) => {
      prompts.push(
        JSON.stringify(req.items.map((i) => (i as { textContent?: string }).textContent ?? ''))
      );
      return model === null
        ? null
        : new ReadableStream<unknown>({
            start(c) {
              c.enqueue(model);
              c.close();
            },
          });
    }) as never,
    { wrap: (s: ReadableStream<unknown>) => s } as never,
    { env: LIVE, generate: classifier, groundedReads: fooled() }
  );
  const out: unknown[] = [];
  if (reply) for await (const chunk of reply as unknown as AsyncIterable<unknown>) out.push(chunk);
  const spoken = out.join('');
  // the gate's final guidance: the last model request it made
  const gateGuidance = kind(prompts.at(-1) ?? '');
  const pipeGuidance: Guidance = pipe.shouldOverrideLLM
    ? 'crisis'
    : pipe.isCrisis
      ? 'crisis'
      : pipe.softCheck
        ? kind(pipe.softGuidance ?? 'SAFETY')
        : 'none';
  return {
    spoken,
    gate: gateGuidance,
    pipe: pipeGuidance,
    asked: spoken.endsWith(SCREEN_QUESTION),
    pipeRaw: pipe,
  };
}

/** The released turn; returns the session and the history so far. */
async function release(): Promise<{ session: string; items: Item[]; ferni: string }> {
  const session = `v2461-${++n}`;
  const items: Item[] = [
    { role: 'user', text: OPENER },
    { role: 'assistant', text: REMINDER },
  ];
  const r = await turn(session, items, DINNER, 'Oh, tonight, got it.');
  expect(r.asked, 'released reply ends with the question').toBe(true);
  expect(r.gate).toBe('light');
  return { session, items: [...items, { role: 'user', text: DINNER }], ferni: r.spoken };
}

const helps = (g: Guidance) => g === 'crisis';

describe('prior HIGH: tool follow-up after the appended question', () => {
  it('question -> tool -> plain follow-up -> "Yes." gets crisis guidance, no re-ask', async () => {
    const { session, items, ferni } = await release();
    const h: Item[] = [
      ...items,
      { role: 'assistant', text: ferni },
      { tool: 'set_reminder' },
      { role: 'assistant', text: 'Done, I moved the reminder to three.' },
    ];
    const r = await turn(session, h, 'Yes.');
    expect(r.asked).toBe(false);
    expect(helps(r.gate) || helps(r.pipe)).toBe(true);
    expect(r.gate).toBe('crisis');
  });

  it('the tool follow-up generation itself never re-runs the gate on the released line', async () => {
    const { session, items, ferni } = await release();
    // llmNode after tools: no new caller words since the reply
    const prompts: string[] = [];
    const reply = await gatedReply(
      ctxOf([...items, { role: 'assistant', text: ferni }, { tool: 'set_reminder' }]),
      Object.assign(new EventEmitter(), { userData: { services: { sessionId: session } } }),
      (async () => {
        prompts.push('x');
        return new ReadableStream<unknown>({
          start(c) {
            c.enqueue('Done.');
            c.close();
          },
        });
      }) as never,
      { wrap: (s: ReadableStream<unknown>) => s } as never,
      { env: LIVE, generate: classifier, groundedReads: fooled() }
    );
    const out: unknown[] = [];
    for await (const c of reply as unknown as AsyncIterable<unknown>) out.push(c);
    expect(out.join('')).toBe('Done.');
  });

  it('question -> tool -> follow-up that asks its own question -> "Yes."', async () => {
    const { session, items, ferni } = await release();
    const h: Item[] = [
      ...items,
      { role: 'assistant', text: ferni },
      { tool: 'set_reminder' },
      { role: 'assistant', text: 'Done! Want me to text you a reminder too?' },
    ];
    const r = await turn(session, h, 'Yes.');
    // record, not assert: a spoken re-ask is not a release
    expect(r.gate === 'crisis' || r.asked).toBe(true);
  });

  it('question -> tool -> acknowledgement follow-up ("Got it.") -> "Yes."', async () => {
    const { session, items, ferni } = await release();
    const h: Item[] = [
      ...items,
      { role: 'assistant', text: ferni },
      { tool: 'set_reminder' },
      { role: 'assistant', text: 'Got it.' },
    ];
    const r = await turn(session, h, 'Yes.');
    expect(helps(r.gate) || helps(r.pipe)).toBe(true);
  });
});

describe('the answer scenarios', () => {
  const answered = async (answer: string) => {
    const { session, items, ferni } = await release();
    return turn(session, [...items, { role: 'assistant', text: ferni }], answer);
  };

  it('"No." after a re-ask is released (screen closes)', async () => {
    const { session, items } = await release();
    // caller interrupted before the question: only the start played
    const cut: Item[] = [...items, { role: 'assistant', text: 'Oh, tonight, got it.' }];
    const r1 = await turn(session, cut, 'Sorry, got distracted.');
    expect(r1.asked, 're-ask spoken').toBe(true);
    const r2 = await turn(
      session,
      [
        ...cut,
        { role: 'user', text: 'Sorry, got distracted.' },
        { role: 'assistant', text: r1.spoken },
      ],
      'No.'
    );
    expect(r2.gate).toBe('none');
    expect(r2.pipe).toBe('none');
    expect(r2.asked).toBe(false);
  });

  for (const [answer, want] of [
    ['no... actually yes', 'crisis'],
    ['No… actually, yes.', 'crisis'],
    ['yeah I guess', 'crisis'],
    ['Yeah, I guess.', 'crisis'],
    ['Haha.', 'gentle'],
    ['[laughter]', 'crisis'],
    ['Anyway, what time does the game start on Sunday?', 'crisis'],
    ['Yes.', 'crisis'],
    ['Uh-huh.', 'crisis'],
    ['Uh huh.', 'crisis'],
    ['Mm-hmm.', 'crisis'],
    ['Um, I guess.', 'crisis'],
    ['Hmm, I guess.', 'crisis'],
    ["I don't know, I guess.", 'crisis'],
    ['Ha, I guess.', 'crisis'],
    ['Oh no.', 'gentle-or-crisis'],
  ] as const) {
    it(`answer ${JSON.stringify(answer)} -> ${want}`, async () => {
      const r = await answered(answer);
      if (want === 'gentle-or-crisis') expect(['gentle', 'crisis']).toContain(r.gate);
      else expect(r.gate).toBe(want);
    });
  }

  it('caller says nothing and hangs up: the released reply already carried the question', async () => {
    const { ferni } = await release();
    expect(ferni.endsWith(SCREEN_QUESTION)).toBe(true);
  });
});

describe('fail-safe paths around the release', () => {
  it('model returns null on the released turn: still asks', async () => {
    const session = `v2461-${++n}`;
    const items: Item[] = [
      { role: 'user', text: OPENER },
      { role: 'assistant', text: REMINDER },
    ];
    const r = await turn(session, items, DINNER, null);
    expect(r.asked).toBe(true);
  });

  it('released reply never committed (TTS failed): next turns still get the question, then screen', async () => {
    const session = `v2461-${++n}`;
    const items: Item[] = [
      { role: 'user', text: OPENER },
      { role: 'assistant', text: REMINDER },
    ];
    const r0 = await turn(session, items, DINNER, 'Oh, tonight.');
    expect(r0.asked).toBe(true);
    // nothing committed: the history has two caller lines in a row
    const h: Item[] = [...items, { role: 'user', text: DINNER }];
    const r1 = await turn(session, h, 'Hello? You there?');
    const h2: Item[] = [
      ...h,
      { role: 'user', text: 'Hello? You there?' },
      { role: 'assistant', text: r1.spoken },
    ];
    const r2 = await turn(session, h2, 'Yes.');
    expect(r1.asked || helps(r1.gate) || r2.asked || helps(r2.gate)).toBe(true);
  });

  it('barge-in twice before the question: positive, never released', async () => {
    const { session, items } = await release();
    const cut1: Item[] = [...items, { role: 'assistant', text: 'Oh, tonight' }];
    const r1 = await turn(session, cut1, 'Yeah so anyway');
    expect(r1.asked).toBe(true);
    const cut2: Item[] = [
      ...cut1,
      { role: 'user', text: 'Yeah so anyway' },
      { role: 'assistant', text: 'MODEL. Can I ask you' },
    ];
    const r2 = await turn(session, cut2, 'Pie, obviously.');
    expect(r2.gate).toBe('crisis');
  });

  it('handoff hello after the question: the answer is not released', async () => {
    const { session, items, ferni } = await release();
    const h: Item[] = [
      ...items,
      { role: 'assistant', text: ferni },
      { tool: 'transfer_to_persona' },
      { role: 'assistant', text: "Hey, it's Alex. Ferni filled me in on the dinner." },
    ];
    const r = await turn(session, h, 'Yeah.');
    expect(helps(r.gate) || helps(r.pipe) || r.asked).toBe(true);
  });
});

describe('shadow is inert', () => {
  for (const guard of [undefined, '', 'shadow', 'off', 'LIVE ', 'true', 'on']) {
    it(`CRISIS_GUARD_MODE=${JSON.stringify(guard)} with CRISIS_GROUNDED_RELEASE=live`, async () => {
      const env: Record<string, string> = {
        CRISIS_CLASSIFIER_MODE: 'live',
        CRISIS_GROUNDED_RELEASE: 'live',
      };
      if (guard !== undefined) env.CRISIS_GUARD_MODE = guard;
      const session = `shadow-${++n}`;
      const prompts: string[] = [];
      const reply = await gatedReply(
        ctxOf([
          { role: 'user', text: OPENER },
          { role: 'assistant', text: REMINDER },
          { role: 'user', text: DINNER },
        ]),
        Object.assign(new EventEmitter(), { userData: { services: { sessionId: session } } }),
        (async (req: llm.ChatContext) => {
          prompts.push(
            JSON.stringify(req.items.map((i) => (i as { textContent?: string }).textContent ?? ''))
          );
          return new ReadableStream<unknown>({
            start(c) {
              c.enqueue('Oh, tonight.');
              c.close();
            },
          });
        }) as never,
        { wrap: (s: ReadableStream<unknown>) => s } as never,
        { env, generate: classifier, groundedReads: fooled() }
      );
      const out: unknown[] = [];
      if (reply) for await (const c of reply as unknown as AsyncIterable<unknown>) out.push(c);
      const spoken = out.join('');
      const pipe = await startTurnCrisis(
        DINNER,
        { recentTranscripts: [OPENER], lastAgentResponse: REMINDER },
        { sessionId: session, env, generate: classifier, groundedReads: fooled() }
      ).summary();
      expect(spoken.includes(SCREEN_QUESTION)).toBe(false);
      expect(prompts.some((p) => /DIRECT CHECK/.test(p))).toBe(false);
      expect(pipe.softGuidance).toBeUndefined();
    });
  }
});

describe('pipeline consumes the screen, gate sees a different last line', () => {
  /** Pipeline starts (screenAnswer runs synchronously) but its result never reaches the reply (hard timeout). */
  async function lostPipeline(session: string, items: Item[], said: string) {
    const userTexts = items
      .filter((i): i is { role: 'user'; text: string } => 'role' in i && i.role === 'user')
      .map((i) => i.text);
    startTurnCrisis(
      said,
      { recentTranscripts: userTexts, lastAgentResponse: lastAgentResponse(items) },
      { sessionId: session, env: LIVE, generate: classifier, groundedReads: fooled() }
    );
    const prompts: string[] = [];
    const reply = await gatedReply(
      ctxOf([...items, { role: 'user', text: said }]),
      Object.assign(new EventEmitter(), { userData: { services: { sessionId: session } } }),
      (async (req: llm.ChatContext) => {
        prompts.push(
          JSON.stringify(req.items.map((i) => (i as { textContent?: string }).textContent ?? ''))
        );
        return new ReadableStream<unknown>({
          start(c) {
            c.enqueue('MODEL.');
            c.close();
          },
        });
      }) as never,
      { wrap: (s: ReadableStream<unknown>) => s } as never,
      { env: LIVE, generate: classifier, groundedReads: fooled() }
    );
    const out: unknown[] = [];
    if (reply) for await (const c of reply as unknown as AsyncIterable<unknown>) out.push(c);
    return { gate: kind(prompts.at(-1) ?? ''), spoken: out.join('') };
  }
  for (const follow of ['Got it.', 'Okay.', 'Mm-hm.', '']) {
    it(`question -> tool -> ${JSON.stringify(follow)} -> "Yes." with the pipeline result lost`, async () => {
      const { session, items, ferni } = await release();
      const h: Item[] = [
        ...items,
        { role: 'assistant', text: ferni },
        { tool: 'set_reminder' },
        { role: 'assistant', text: follow },
      ];
      const r = await lostPipeline(session, h, 'Yes.');
      expect(r.gate).toBe('crisis');
    });
  }
  it('control: the gate alone (pipeline never ran) gives crisis guidance', async () => {
    const { session, items, ferni } = await release();
    const h: Item[] = [
      ...items,
      { role: 'assistant', text: ferni },
      { tool: 'set_reminder' },
      { role: 'assistant', text: 'Got it.' },
    ];
    const prompts: string[] = [];
    const reply = await gatedReply(
      ctxOf([...h, { role: 'user', text: 'Yes.' }]),
      Object.assign(new EventEmitter(), { userData: { services: { sessionId: session } } }),
      (async (req: llm.ChatContext) => {
        prompts.push(
          JSON.stringify(req.items.map((i) => (i as { textContent?: string }).textContent ?? ''))
        );
        return new ReadableStream<unknown>({
          start(c) {
            c.enqueue('MODEL.');
            c.close();
          },
        });
      }) as never,
      { wrap: (s: ReadableStream<unknown>) => s } as never,
      { env: LIVE, generate: classifier, groundedReads: fooled() }
    );
    for await (const _ of reply as unknown as AsyncIterable<unknown>) void _;
    expect(kind(prompts.at(-1) ?? '')).toBe('crisis');
  });
});
