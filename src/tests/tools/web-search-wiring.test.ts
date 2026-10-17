/**
 * WEB_SEARCH on the live path: the first agent's tools for every persona
 * (buildEssentialToolSet, capped like agent-setup.ts) hold searchWeb and
 * getNews with the flag on, and are exactly what they were without it when it
 * is off. A searchWeb call through the SDK's own dispatcher
 * (performToolExecutions, as agent_activity.js runs it) answers from grounded
 * search. Gemini is mocked.
 */
import { llm } from '@livekit/agents';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();
vi.mock('../../config/gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getGeminiClient: async () => ({ models: { generateContent } }),
}));

const profile = { subscription: { tier: 'free' } };

const PERSONAS = [
  'ferni',
  'peter-john',
  'maya-santos',
  'jordan-taylor',
  'alex-chen',
  'nayan-patel',
  'joel-dickson',
  'john-bogle',
  'peter-lynch',
];

/** The first agent's tools for a call to `personaId`, capped like agent-setup.ts. */
async function firstAgentTools(
  webSearch: string,
  personaId: string
): Promise<Record<string, unknown>> {
  vi.resetModules();
  vi.stubEnv('WEB_SEARCH', webSearch);
  const { buildEssentialToolSet } = await import('../../agents/multi-agent/essential-tool-set.js');
  const { resolveInitialToolLimit } = await import('../../agents/multi-agent/initial-tools.js');
  const { capToolsToLimit, getMaxTools } = await import('../../config/tool-config.js');
  const { tools } = await buildEssentialToolSet({
    personaId,
    userId: 'test-user',
    services: { userProfile: profile } as never,
  });
  return capToolsToLimit(tools, resolveInitialToolLimit(getMaxTools())) as Record<string, unknown>;
}

async function dispatch(
  session: object,
  toolCtx: Record<string, unknown>,
  args: Record<string, unknown>
): Promise<string> {
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
    session,
    speechHandle: { id: 'speech-1', numSteps: 1 },
    toolCtx,
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
  vi.resetModules();
  generateContent.mockReset();
});

describe('WEB_SEARCH on the live path', () => {
  it('leaves every persona’s first-agent tool ids as they were with the flag off', async () => {
    const ids: Record<string, string[]> = {};
    for (const persona of PERSONAS) {
      ids[persona] = Object.keys(await firstAgentTools('', persona)).sort();
    }
    expect(ids).toMatchSnapshot();
    for (const persona of PERSONAS) expect(ids[persona]).not.toContain('getNews');
  }, 180_000);

  it('offers searchWeb and getNews to every persona with WEB_SEARCH=on', async () => {
    for (const persona of PERSONAS) {
      const names = Object.keys(await firstAgentTools('on', persona));
      expect(names, persona).toContain('searchWeb');
      expect(names, persona).toContain('getNews');
    }
  }, 180_000);

  it('answers a searchWeb call from grounded search with the flag on', async () => {
    const tools = await firstAgentTools('on', 'jordan-taylor');
    generateContent.mockResolvedValue({
      text: 'The Fed held rates steady today — markets rose... See https://reuters.com/x.',
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: 'https://vertexaisearch.cloud.google.com/r/1', title: 'reuters.com' } },
            ],
            webSearchQueries: ['fed rates today'],
          },
        },
      ],
    });
    const { PersonaVoiceAgent } = await import('../../agents/personas/ferni-agent.js');
    const agent = new PersonaVoiceAgent('You are Jordan.', {
      tools: tools as unknown as llm.ToolContext,
      skipGreeting: true,
    });
    const session = { userData: { userId: `wiring-${Date.now()}` }, currentAgent: agent };
    const output = await dispatch(session, agent.toolCtx as unknown as Record<string, unknown>, {
      query: 'what did the fed do today',
    });

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(generateContent.mock.calls[0][0])).toContain('googleSearch');
    expect(output).toContain('The Fed held rates steady today, markets rose.');
    expect(output).toContain('Sources: reuters.');
    expect(output).not.toMatch(/https?:|—|\.\.\./);
  }, 60_000);
});
