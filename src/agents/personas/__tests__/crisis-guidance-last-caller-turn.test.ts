/**
 * On a crisis-guided turn the crisis guidance is the last thing the model reads, through the
 * real PersonaVoiceAgent.llmNode: gatedReply puts it on the caller's turn, and withCallerTurn
 * (caller-turn.ts, CALLER_TURN_NOTE on by default) must not add its note after it when the
 * request ends on the model's turn. The SDK's own llmNode is stubbed to record each request.
 */
import { llm, voice } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The classifier's read, scripted: llmNode passes gatedReply no model of its own for it.
const verdict = vi.hoisted(() => ({ text: undefined as string | undefined }));
const scripted = vi.hoisted(
  () => (text: string | undefined) => (text === undefined ? undefined : async () => text)
);
vi.mock('../../../services/safety/crisis-classifier.js', async (load) => {
  const real = await load<typeof import('../../../services/safety/crisis-classifier.js')>();
  return {
    ...real,
    startCrisisClassifier: (...[said, options]: Parameters<typeof real.startCrisisClassifier>) =>
      real.startCrisisClassifier(said, {
        ...options,
        generate: options?.generate ?? scripted(verdict.text),
      }),
  };
});

import { resetCrisisClassifierCache } from '../../../services/safety/crisis-classifier.js';
import { buildCrisisGuidance, detectCrisis } from '../../safety/crisis-guard.js';
import { NO_NEW_WORDS_NOTE } from '../caller-turn.js';
import { PersonaVoiceAgent } from '../ferni-agent.js';
import { OpenerGate } from '../opener-gate.js';

const WORDS = "I hope I don't wake up tomorrow"; // the patterns guide these
const CALM = 'long day at work'; // only the classifier finds a crisis here
const GUIDANCE = buildCrisisGuidance(detectCrisis(WORDS));

/** The caller's turn, then the model's: an assistant line or a tool call not yet answered. */
function request(endsOn: 'assistant' | 'function_call', words = WORDS): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  ctx.addMessage({ role: 'user', content: words });
  if (endsOn === 'assistant') ctx.addMessage({ role: 'assistant', content: 'I am here.' });
  else ctx.insert(llm.FunctionCall.create({ callId: 'c1', name: 'lookup', args: '{}' }));
  return ctx;
}

/** Every request the model gets from the real llmNode, in order. */
async function sent(ctx: llm.ChatContext): Promise<llm.ChatContext[]> {
  const seen: llm.ChatContext[] = [];
  vi.spyOn(voice.Agent.prototype, 'llmNode').mockImplementation(async (c: llm.ChatContext) => {
    seen.push(c);
    return new ReadableStream({ start: (s) => (s.enqueue('ok'), s.close()) }) as never;
  });
  const session = { userData: { personaId: 'ferni', services: { sessionId: 'guidance-last' } } };
  const agent: Record<string, unknown> = { session, toolCtx: { functionTools: {} } };
  agent.turnTools = { loggedLockedHandoffs: false, agent };
  agent.openerGate = new OpenerGate().forSession(() => session as never);
  const out = await PersonaVoiceAgent.prototype.llmNode.call(
    agent as never,
    ctx,
    { functionTools: {} } as never,
    {} as never
  );
  if (out) for await (const _ of out as unknown as AsyncIterable<unknown>) void _;
  return seen;
}

/** Every model-facing string, in the order the model reads it. */
function readOrder(ctx: llm.ChatContext | undefined): string[] {
  return (ctx?.items ?? []).flatMap((item) => {
    if (item.type === 'message')
      return item.content.filter((part): part is string => typeof part === 'string');
    if (item.type === 'function_call') return [`${item.name}(${item.args})`];
    return [];
  });
}

describe('the crisis guidance is the last thing the model reads (llmNode, withCallerTurn)', () => {
  beforeEach(() => {
    resetCrisisClassifierCache();
    verdict.text = undefined;
    vi.stubEnv('CRISIS_GUARD_MODE', 'live');
    vi.stubEnv('CRISIS_CLASSIFIER_MODE', 'off'); // the patterns guide this turn
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('when the request ends on an unanswered tool call', async () => {
    const requests = await sent(request('function_call'));
    expect(requests).toHaveLength(1);
    const read = readOrder(requests[0]);
    // The turn is guided, and the caller-turn note is still sent, once.
    expect(read.some((text) => text.includes(GUIDANCE))).toBe(true);
    expect(read.filter((text) => text === NO_NEW_WORDS_NOTE)).toHaveLength(1);
    expect(read.at(-1)).toBe(`\n\n(${GUIDANCE})`);
  });

  it('when the classifier finds the crisis and the reply is asked again after a tool call', async () => {
    vi.stubEnv('CRISIS_CLASSIFIER_MODE', 'live');
    verdict.text = '{"risk":"crisis","subject":"self"}';
    const requests = await sent(request('function_call', CALM));
    // The first reply is held and asked again with the classifier's guidance (crisis-gate.ts).
    expect(requests).toHaveLength(2);
    const first = readOrder(requests[0]);
    const again = readOrder(requests[1]);
    expect(first.at(-1)).toBe(NO_NEW_WORDS_NOTE);
    expect(again.filter((text) => text === NO_NEW_WORDS_NOTE)).toHaveLength(1);
    expect(again.at(-2)).toBe(NO_NEW_WORDS_NOTE);
    expect(again.at(-1)).toMatch(/^\n\n\(\[CRITICAL - USER SAFETY\]/);
  });

  it('when the request ends on an assistant line, nothing follows any guidance it carries', async () => {
    // The gate reads no new words after Ferni's line (crisis-gate-words.ts callerWords), so on
    // main this turn carries no guidance; the note is sent, and guidance, if any, must be last.
    const requests = await sent(request('assistant'));
    expect(requests).toHaveLength(1);
    const read = readOrder(requests[0]);
    expect(read).toContain(NO_NEW_WORDS_NOTE);
    const at = read.findIndex((text) => text.includes(GUIDANCE));
    expect(at === -1 || at === read.length - 1).toBe(true);
  });
});
