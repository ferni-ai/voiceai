/**
 * Someone close who went down (#3636): the grief rows and the 911-before-988 order rows read the
 * same through the real reply gate under every crisis gate flag state: the defaults, the
 * agreement gate on, and the gate on with the adjudicator in shadow, set to live (held as shadow)
 * and truly live (the test hook), and the scripted-turn read on (CRISIS_SCRIPT_IMMINENT_READ, off in
 * deploy). The PR's row files read the kernel alone; these lines are new and fictional.
 *
 * Every model the gate could call is a counting stub (classifier, adjudicator, grounded reads,
 * the reply model) and fetch throws, so no row can reach a real model; the counts are literals.
 * Each row resets the classifier's caches and uses its own call id, and the classifier stub
 * records the input it was given, so a row never runs on another row's cached read.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { allowCrisisAdjudicatorLiveForTests } from '../../../services/safety/crisis-adjudicator.js';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { gatedReply } from '../crisis-gate.js';
import { readTypedMessageForCrisis } from '../crisis-gate-text.js';

type Want = 'none' | '911 alone' | '911 then 988' | '988 then 911' | '988 alone';
/** [line, what the caller hears, the classifier verdicts it is read with] */
const ROWS: ReadonlyArray<readonly [string, Want, readonly string[]]> = [
  // Grief: the fall goes on to a death and then a date.
  ['my grandpa collapsed and passed away in april', 'none', ['none']],
  ['my aunt collapsed and died two years ago', 'none', ['none']],
  // Grief under deny by default: a long-ago opening never drops the 911.
  ['back when my uncle fainted in the kitchen', '911 alone', ['none', 'imminent']],
  // Grief beside the caller's own words: their own 988 script, no 911 for them.
  [
    'my sister collapsed and passed away in june and i want to die',
    '988 alone',
    ['none', 'crisis'],
  ],
  // Order: 911 for them alone; 911 then the caller's 988 line; 911 then the caller's own reply.
  ['my grandma just collapsed in the hallway', '911 alone', ['none', 'imminent']],
  ["my husband fainted, not that i'd ever hurt myself", '911 then 988', ['none', 'imminent']],
  ['my brother collapsed and i want to kill myself', '911 then 988', ['none', 'imminent']],
  ["i want to die. my mom fell and can't get up", '911 then 988', ['none', 'imminent']],
];

const D = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const G = { ...D, CRISIS_AGREEMENT_GATE: 'on' };
const STATES: ReadonlyArray<readonly [string, Record<string, string>, boolean]> = [
  ['defaults', D, false],
  ['agreement gate on', G, false],
  ['gate on, adjudicator shadow', { ...G, CRISIS_ADJUDICATOR: 'shadow' }, false],
  ['gate on, adjudicator live (held as shadow)', { ...G, CRISIS_ADJUDICATOR: 'live' }, false],
  ['gate on, adjudicator truly live', { ...G, CRISIS_ADJUDICATOR: 'live' }, true],
  ['scripted-turn read on', { ...D, CRISIS_SCRIPT_IMMINENT_READ: 'on' }, false],
];
/** The caller's own plain 988 script: the one script the scripted-turn read asks the classifier on. */
const OWN_988_SCRIPT = new Set(['my sister collapsed and passed away in june and i want to die']);

const heard = (reply: string): Want => {
  const at911 = reply.search(/\b911\b/);
  const at988 = reply.search(/\b988\b/);
  if (at911 < 0) return at988 < 0 ? 'none' : '988 alone';
  if (at988 < 0) return '911 alone';
  return at911 < at988 ? '911 then 988' : '988 then 911';
};

afterEach(() => {
  allowCrisisAdjudicatorLiveForTests(false);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

let call = 0;
async function readRow(line: string, env: Record<string, string>, risk: string) {
  // Per row, not per file: the classifier's shared run is keyed by the whole model input.
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  const counts = { generate: 0, adjudicate: 0, grounded: 0, model: 0, fetch: 0 };
  const inputs: string[] = [];
  vi.stubGlobal('fetch', async () => {
    counts.fetch++;
    throw new Error('no network in this test');
  });
  const generate: CrisisGenerateFn = async (_prompt, content) => {
    counts.generate++;
    inputs.push(String(content));
    return JSON.stringify({ risk, subject: 'third_party' });
  };
  const adjudicate: CrisisGenerateFn = async () => {
    counts.adjudicate++;
    return '{"caller_risk":"","decision":"escalate","confidence":"high"}';
  };
  const grounded: CrisisGenerateFn = async () => {
    counts.grounded++;
    return '{"explained":false}';
  };
  const options = { env, generate, adjudicate, groundedReads: [grounded, grounded] };

  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  ctx.addMessage({ role: 'user', content: line });
  vi.spyOn(Math, 'random').mockReturnValue(0.42);
  const model = async () => {
    counts.model++;
    return new ReadableStream<unknown>({
      start(controller) {
        controller.enqueue('Sounds good.');
        controller.close();
      },
    });
  };
  const opener = { wrap: (stream: ReadableStream<unknown>) => stream };
  const userData = { services: { sessionId: `close-down-flags-${++call}` } };
  const reply = await gatedReply(ctx, { userData }, model as never, opener as never, options);
  let spoken = '';
  if (reply) for await (const chunk of reply as unknown as AsyncIterable<string>) spoken += chunk;
  const typed = await readTypedMessageForCrisis(line, [], {
    ...options,
    env: { ...env },
  });
  return { spoken, typed, counts, inputs };
}

describe('someone close went down: the same reply under every crisis gate flag state', () => {
  for (const [state, env, trulyLive] of STATES)
    describe(state, () => {
      for (const [line, want, verdicts] of ROWS)
        for (const risk of verdicts)
          it(`classifier ${risk}: ${line}`, async () => {
            allowCrisisAdjudicatorLiveForTests(trulyLive);
            const { spoken, typed, counts, inputs } = await readRow(line, env, risk);
            expect(heard(spoken)).toBe(want);
            if (want === 'none') {
              expect(typed.action).not.toBe('replace');
              expect(spoken).toBe('Sounds good.');
            } else {
              expect(typed.action).toBe('replace');
              expect(typed.action === 'replace' && heard(typed.reply)).toBe(want);
            }
            for (const input of inputs) expect(input).toContain(line);
            // A replaced turn never asks the classifier (crisis-classifier.ts: a pattern block),
            // except the scripted-turn read on the caller's own 988 script, once, beside the gate.
            // A passed turn asks it once: the typed read sees the same model input as the voice
            // read in this row, so it shares that run.
            const scripted = env.CRISIS_SCRIPT_IMMINENT_READ === 'on' && OWN_988_SCRIPT.has(line);
            expect(counts.generate).toBe(want === 'none' || scripted ? 1 : 0);
            expect(counts.model).toBe(want === 'none' ? 1 : 0);
            expect(counts.adjudicate).toBe(0);
            expect(counts.grounded).toBe(0);
            expect(counts.fetch).toBe(0);
          });
    });
});
