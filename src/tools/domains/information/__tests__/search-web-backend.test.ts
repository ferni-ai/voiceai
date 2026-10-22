/**
 * The searchWeb tool itself, called through the SDK's own dispatcher
 * (performToolExecutions, as agent_activity.js runs it): DuckDuckGo with
 * WEB_SEARCH off, Google Search grounding with it on, and the same tools
 * either way. Gemini and the network are mocked.
 */
import { llm } from '@livekit/agents';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();
vi.mock('../../../../config/gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getGeminiClient: async () => ({ models: { generateContent } }),
}));

import { createSearchTools } from '../search.js';

async function dispatch(tool: unknown, args: Record<string, unknown>): Promise<string> {
  const dist = dirname(createRequire(import.meta.url).resolve('@livekit/agents'));
  const { performToolExecutions } = (await import(
    pathToFileURL(join(dist, 'voice', 'generation.js')).href
  )) as {
    performToolExecutions: (
      opts: unknown
    ) => [{ result: Promise<unknown> }, { output: Array<{ toolCallOutput?: { output: string } }> }];
  };
  const call = llm.FunctionCall.create({
    callId: `call-${Math.random()}`,
    name: 'searchWeb',
    args: JSON.stringify(args),
  });
  const [task, out] = performToolExecutions({
    session: { userData: { userId: `backend-${Date.now()}` } },
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
  const result = out.output[0]?.toolCallOutput?.output;
  if (result === undefined) throw new Error('the dispatcher produced no output');
  return result;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  generateContent.mockReset();
});

describe('searchWeb backend', () => {
  it('keeps DuckDuckGo with WEB_SEARCH off', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      json: async () => ({ AbstractText: 'An instant answer.', AbstractSource: 'Wikipedia' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await dispatch(createSearchTools().searchWeb, { query: 'eagles score' });
    expect(out).toContain('An instant answer.');
    expect(String(fetchMock.mock.calls[0][0])).toContain('api.duckduckgo.com');
    expect(generateContent).not.toHaveBeenCalled();
  }, 30_000);

  it('answers from Google Search grounding with WEB_SEARCH=on', async () => {
    vi.stubEnv('WEB_SEARCH', 'on');
    const fetchMock = vi.fn(async (_url: string) => ({
      headers: new globalThis.Headers({ location: 'https://www.reuters.com/markets/fed' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    generateContent.mockResolvedValue({
      text: 'The Fed held rates steady today — markets rose... See https://reuters.com/x.',
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              {
                web: {
                  uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/1',
                  title: 'reuters.com',
                },
              },
            ],
            webSearchQueries: ['fed rates today'],
          },
        },
      ],
    });
    const out = await dispatch(createSearchTools().searchWeb, {
      query: 'what did the fed do today',
    });
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(generateContent.mock.calls[0][0])).toContain('googleSearch');
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('duckduckgo'))).toBe(false);
    const text = JSON.parse(out) as string;
    const line = text.split('\n').find((l) => l.startsWith('web_data: ')) ?? '';
    expect(JSON.parse(line.slice('web_data: '.length))).toMatchObject({
      result: 'The Fed held rates steady today, markets rose.',
      sources: ['Reuters'],
    });
    expect(out).not.toMatch(/https?:|—|\.\.\./);
  }, 30_000);

  it('offers the same tools with the flag on and off', () => {
    const off = Object.keys(createSearchTools());
    vi.stubEnv('WEB_SEARCH', 'on');
    expect(Object.keys(createSearchTools())).toEqual(off);
  });
});
