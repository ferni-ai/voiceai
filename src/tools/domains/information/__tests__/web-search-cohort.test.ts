/**
 * WEB_SEARCH per cohort: a member's call searches with Google Search grounding,
 * everyone else's keeps DuckDuckGo, and a caller known only by phone still gets
 * no searchWeb at all.
 *
 * WEB_SEARCH is read only inside searchWeb's execute (search.ts), so a cohort's
 * value, applied by applyCallerFlags at call start, is what the tool sees. Each
 * case runs the real applyCallerFlags and the real searchWeb tool through the
 * SDK's own dispatcher; Gemini, the network and the cohort store are mocked.
 */
import { llm } from '@livekit/agents';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const generateContent = vi.fn();
vi.mock('../../../../config/gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getGeminiClient: async () => ({ models: { generateContent } }),
}));

import { PersonaVoiceAgent } from '../../../../agents/personas/ferni-agent.js';
import { toolsForTurn } from '../../../../agents/personas/turn-request.js';
import { rememberCallerRecognition } from '../../../../agents/voice-agent-entry/caller-recognition.js';
import {
  applyCallerFlags,
  forgetAgentValues,
  type CohortStore,
} from '../../../../services/platform/cohort-flags.js';
import { createSearchTools } from '../search.js';

/** Seth's own cohort turns WEB_SEARCH on; nobody else is in it. */
const cohorts: CohortStore = {
  cohortsFor: async (u) =>
    u === 'seth' ? [{ id: 'seth-own', enabled: true, flags: { WEB_SEARCH: 'on' } }] : [],
  overridesFor: async () => ({}),
};

async function dispatch(tool: unknown, userId: string): Promise<void> {
  const dist = dirname(createRequire(import.meta.url).resolve('@livekit/agents'));
  const { performToolExecutions } = (await import(
    pathToFileURL(join(dist, 'voice', 'generation.js')).href
  )) as {
    performToolExecutions: (opts: unknown) => [{ result: Promise<unknown> }, unknown];
  };
  const call = llm.FunctionCall.create({
    callId: `call-${Math.random()}`,
    name: 'searchWeb',
    args: JSON.stringify({ query: 'eagles score' }),
  });
  const [task] = performToolExecutions({
    session: { userData: { userId } },
    speechHandle: { id: 'speech-1', numSteps: 1 },
    toolCtx: new llm.ToolContext({ searchWeb: tool } as never),
    toolChoice: 'auto',
    toolCallStream: new ReadableStream({
      start(controller) {
        controller.enqueue(call);
        controller.close();
      },
    }),
    controller: new globalThis.AbortController(),
  });
  await task.result;
}

/** Which backend searchWeb used on this caller's call. */
async function backendFor(userId: string): Promise<'grounded' | 'duckduckgo'> {
  await applyCallerFlags(userId, { store: cohorts });
  generateContent.mockClear();
  fetchMock.mockClear();
  await dispatch(createSearchTools().searchWeb, userId);
  if (generateContent.mock.calls.length > 0) return 'grounded';
  expect(fetchMock.mock.calls.some(([u]) => String(u).includes('duckduckgo'))).toBe(true);
  return 'duckduckgo';
}

const fetchMock = vi.fn(async (_url: string) => ({
  ok: true,
  headers: new globalThis.Headers(),
  json: async () => ({ AbstractText: 'An instant answer.', AbstractSource: 'Wikipedia' }),
}));

beforeEach(() => {
  vi.stubEnv('COHORT_FLAGS', 'on');
  vi.stubEnv('AGENT_MAX_JOBS_PER_WORKER', '1');
  vi.stubGlobal('fetch', fetchMock);
  generateContent.mockResolvedValue({ text: 'The Eagles won 24 to 17.', candidates: [] });
});
afterEach(() => {
  delete process.env.WEB_SEARCH; // applyCallerFlags writes process.env itself
  forgetAgentValues();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  generateContent.mockReset();
});

describe('WEB_SEARCH per cohort', () => {
  it("a member's call searches with Google grounding; the next caller's goes back to DuckDuckGo", async () => {
    expect(await backendFor('seth')).toBe('grounded');
    expect(await backendFor('someone-else')).toBe('duckduckgo');
    expect(await backendFor('seth')).toBe('grounded');
  }, 30_000);

  it('a caller known only by phone gets no searchWeb, even in the cohort', async () => {
    await applyCallerFlags('seth', { store: cohorts });
    expect(process.env.WEB_SEARCH).toBe('on');

    rememberCallerRecognition('s-seth-phone', {
      status: 'known',
      attestation: 'A',
      userId: 'seth',
    });
    const weather = llm.tool({
      description: 'weather',
      parameters: z.object({}),
      execute: async () => 'sunny',
    });
    const agent = new PersonaVoiceAgent('You are Ferni.', {
      tools: new llm.ToolContext({
        searchWeb: createSearchTools().searchWeb,
        getWeather: weather,
      } as never) as unknown as llm.ToolContext,
      skipGreeting: true,
    });
    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'user', content: 'Can you look up the Eagles score?' });
    const ask = async (sessionId: string): Promise<string[]> =>
      Object.keys(
        (
          await toolsForTurn(
            { userData: { services: { sessionId } } },
            chat,
            agent.toolCtx as unknown as llm.ToolContext,
            { loggedLockedHandoffs: false, agent }
          )
        ).functionTools
      );

    expect(await ask('s-seth-app')).toContain('searchWeb'); // signed in: theirs
    expect(await ask('s-seth-phone')).toEqual(['getWeather']);
    expect(Object.keys(agent.toolCtx.functionTools)).not.toContain('searchWeb');
  }, 30_000);
});
