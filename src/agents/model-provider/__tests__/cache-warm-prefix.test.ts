/**
 * The cache warm only helps if its request starts like the caller's turns:
 * same tools, same instructions. Requests go through the real cascade LLM
 * (CartesiaCascadeProvider with the fast lane -> the Google plugin; only its
 * streaming call is stubbed). A turn's request is built the way
 * PersonaVoiceAgent.llmNode builds it: toolsForTurn + the turn reminder.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_API_CONNECT_OPTIONS, llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { toolsForTurn, withTurnReminder } from '../../personas/turn-request.js';
import { armPromptCacheWarm } from '../cache-warm.js';
import { CartesiaCascadeProvider } from '../cartesia-cascade.js';

interface CapturedRequest {
  model: string;
  config: { systemInstruction?: unknown; tools?: unknown };
}

const pluginEntry = createRequire(import.meta.url).resolve('@livekit/agents-plugin-google');
const genaiEntry = join(dirname(createRequire(pluginEntry).resolve('@google/genai')), 'index.mjs');
const { Models } = (await import(pathToFileURL(genaiEntry).href)) as {
  Models: { prototype: { generateContentStreamInternal: (p: CapturedRequest) => unknown } };
};

let captured: CapturedRequest[] = [];
const saved = { ...process.env };
const ON = { CASCADE_CACHE_WARM: 'on' };
const SETTLE_MS = 30;
const sleep = (ms: number) =>
  new Promise((r) => {
    setTimeout(r, ms);
  });
// A warm runs in the background, and the first one in a file pays for loading
// the Google plugin's request path, which is slow on a loaded CI runner. Wait
// for the requests themselves rather than a fixed time.
const warmsLanded = (n: number) =>
  vi.waitFor(
    () => {
      expect(captured).toHaveLength(n);
    },
    { timeout: 10_000, interval: 10 }
  );

beforeEach(() => {
  captured = [];
  process.env.GOOGLE_CLOUD_PROJECT ||= 'test-project';
  process.env.CASCADE_FAST_LANE = 'on';
  vi.spyOn(Models.prototype, 'generateContentStreamInternal').mockImplementation(
    async (params: CapturedRequest) => {
      captured.push(params);
      return (async function* () {
        yield {
          candidates: [
            { content: { role: 'model', parts: [{ text: 'Sure.' }] }, finishReason: 'STOP' },
          ],
        };
      })();
    }
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...saved };
});

const tool = (name: string) =>
  llm.tool({
    description: `${name}: does what its name says.`,
    parameters: z.object({ query: z.string() }),
    execute: async () => 'ok',
  });
const toolSet = (names: string[]) => Object.fromEntries(names.map((n) => [n, tool(n)]));

// The prod call (2026-10-10): 65 tools at the greeting, 88 sixteen ms later.
// handoffToMaya is in the agent's tools, but a free caller's turns leave it out.
const GREETING = ['getWeather', 'handoffToMaya', 'playMusic', 'recallNote', 'setReminder'];
const EXPANDED = [...GREETING, 'checkAvailability', 'findFreeTime', 'getDailyBriefing'];
const PLAY = [...EXPANDED, 'becomeSilly', 'noticeJoy'];

function fakeSession(model: llm.LLM) {
  const chatCtx = llm.ChatContext.empty();
  chatCtx.addMessage({ role: 'system', content: 'You are Ferni. '.repeat(200) });
  const agent = {
    chatCtx,
    toolCtx: new llm.ToolContext(toolSet(GREETING)),
    async updateTools(tools: Record<string, unknown>) {
      this.toolCtx = new llm.ToolContext(tools as never);
    },
  };
  return { llm: model, userData: {}, currentAgent: agent };
}

type Session = ReturnType<typeof fakeSession>;

/** A caller's turn, as PersonaVoiceAgent.llmNode sends it. */
async function turn(session: Session, said: string): Promise<CapturedRequest> {
  const ctx = session.currentAgent.chatCtx.copy();
  ctx.addMessage({ role: 'user', content: said });
  const tools = await toolsForTurn(session, ctx, session.currentAgent.toolCtx, {
    loggedLockedHandoffs: true,
  });
  const stream = session.llm.chat({
    chatCtx: withTurnReminder(ctx, session),
    toolCtx: tools,
    connOptions: DEFAULT_API_CONNECT_OPTIONS,
  });
  for await (const _chunk of stream) {
    // drain
  }
  return captured[captured.length - 1];
}

const prefix = (r: CapturedRequest) => ({
  tools: JSON.stringify(r.config.tools),
  systemInstruction: JSON.stringify(r.config.systemInstruction),
});

async function cascadeSession(): Promise<Session> {
  const model = (await new CartesiaCascadeProvider().createLLMModel({
    model: 'ignored',
    instructions: 'x',
  })) as llm.LLM;
  return fakeSession(model);
}

describe('prompt cache warm', () => {
  it('waits for the post-greeting tool expansion, then warms each model with the tools turns send', async () => {
    const session = await cascadeSession();
    armPromptCacheWarm(session, ON, SETTLE_MS);
    await sleep(5);
    await session.currentAgent.updateTools(toolSet(EXPANDED)); // the expansion, after the greeting
    await warmsLanded(2);
    await sleep(SETTLE_MS * 4); // no third warm follows
    const warms = [...captured];

    expect(warms.map((r) => r.model).sort()).toEqual(['gemini-3.5-flash', 'gemini-3.5-flash-lite']);
    const chat = await turn(session, 'Hey, how was your week?'); // fast lane
    const request = await turn(session, 'What is the weather tomorrow?'); // main model
    for (const real of [chat, request]) {
      const warm = warms.find((w) => w.model === real.model);
      expect(warm && prefix(warm)).toEqual(prefix(real));
    }
    expect(prefix(chat).tools).not.toContain('handoffToMaya');
  });

  it('warms again once when the tools change mid-call, and not for the same tools', async () => {
    const session = await cascadeSession();
    armPromptCacheWarm(session, ON, SETTLE_MS);
    await warmsLanded(2); // the warm at arm time
    captured = [];

    // A domain load mid-call (tool-updater.ts), applied twice in quick succession.
    await session.currentAgent.updateTools(toolSet(PLAY));
    await session.currentAgent.updateTools(toolSet(PLAY));
    await warmsLanded(2);
    const rewarms = [...captured];
    await session.currentAgent.updateTools(toolSet(PLAY)); // no change
    await sleep(SETTLE_MS * 4);

    expect(rewarms).toHaveLength(2); // one per model
    expect(captured).toHaveLength(2);
    const real = await turn(session, 'Hey, how was your week?');
    const warm = rewarms.find((w) => w.model === real.model);
    expect(warm && prefix(warm)).toEqual(prefix(real));
  });

  it('does nothing unless CASCADE_CACHE_WARM=on', async () => {
    const session = await cascadeSession();
    armPromptCacheWarm(session, {}, SETTLE_MS);
    await session.currentAgent.updateTools(toolSet(PLAY));
    await sleep(SETTLE_MS * 4);
    expect(captured).toHaveLength(0);
  });
});
