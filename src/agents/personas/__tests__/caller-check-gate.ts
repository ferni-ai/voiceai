/**
 * Test helper: one first turn through gatedReply (the reply path PersonaVoiceAgent.llmNode uses)
 * with a model that never complies ("ok, sounds tough"), so a test sees what reaches the caller
 * when the reply rests on the model, and counts the model calls.
 *
 * The three reply paths: the patterns alone (classifier off), the classifier reading none, and the
 * classifier reading a crisis about someone else. All lines a test passes are fictional.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { resetGroundedRelease } from '../../../services/safety/crisis-grounded-release.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { gatedReply } from '../crisis-gate.js';

export const NON_COMPLIANT = 'ok, sounds tough';

/** Someone else at risk, the caller's own ending words set aside: a caller check in a distressed
 * voice. The last one is down and not getting up. */
export const FLIP_SHAPES = [
  "my son said he wants to die. not me, i'd never kill myself",
  'my brother keeps talking about killing himself. I would never kill myself',
  "my roommate says she wants to die. i'm not going to kill myself, i just don't know what to do",
  'my girlfriend keeps saying she wants to end it all. i would never end my life',
  "a kid in my class said he's going to kill himself. i'm fine, i'd never kill myself",
  "my wife told me she wants to die. i used to want to die but i'm in recovery now",
  "my coworker said he wants to kill himself. lol i'd never kill myself",
  "my mom texted that she is going to kill herself tonight. i'm not going to end my life",
  'my uncle said he wants to kill himself. i would never want to kill myself',
  "my dad collapsed and he isn't getting up. i'd never kill myself",
];

const verdict =
  (json: string): CrisisGenerateFn =>
  async () =>
    json;
export const PATHS: Record<string, { env: Record<string, string>; generate?: CrisisGenerateFn }> = {
  patterns: { env: { CRISIS_CLASSIFIER_MODE: 'off' } },
  'classifier none': {
    env: { CRISIS_CLASSIFIER_MODE: 'live' },
    generate: verdict('{"risk":"none","subject":"self"}'),
  },
  'classifier third party': {
    env: { CRISIS_CLASSIFIER_MODE: 'live' },
    generate: verdict('{"risk":"crisis","subject":"third_party"}'),
  },
};

let n = 0;
/** The reply gatedReply streams for a line, said in a voice, on one path (gateEnv: more options.env). */
export async function stubbedGateReply(
  line: string,
  voice: { primary: string; confidence: number; stressLevel?: number } | undefined,
  path: keyof typeof PATHS,
  gateEnv: Record<string, string> = {}
): Promise<{ text: string; modelCalls: number }> {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetGroundedRelease();
  const userData = {
    personaId: 'ferni',
    services: { sessionId: `caller-check-gate-${++n}` },
    ...(voice ? { voiceEmotion: voice } : {}),
  };
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  ctx.addMessage({ role: 'user', content: line });
  let modelCalls = 0;
  const model = async (): Promise<ReadableStream<unknown>> => {
    modelCalls++;
    return new ReadableStream<unknown>({
      start: (c) => {
        c.enqueue(NON_COMPLIANT);
        c.close();
      },
    });
  };
  const { env, generate } = PATHS[path];
  const stream = await gatedReply(
    ctx,
    { userData },
    model as never,
    { wrap: (s: unknown) => s } as never,
    {
      env: { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_TIMEOUT_MS: '25', ...env, ...gateEnv },
      ...(generate ? { generate } : {}),
    }
  );
  let text = '';
  if (stream) {
    for await (const chunk of stream as unknown as AsyncIterable<unknown>) {
      text +=
        typeof chunk === 'string'
          ? chunk
          : ((chunk as { delta?: { content?: string } }).delta?.content ?? '');
    }
  }
  return { text, modelCalls };
}
