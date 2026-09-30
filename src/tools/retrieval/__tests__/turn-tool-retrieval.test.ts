import { describe, expect, it, vi, afterEach } from 'vitest';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { DenseToolIndex } from '../dense-index.js';
import {
  ALL_TOOLS_LIMIT,
  TurnToolRetrieval,
  latestUserText,
  toolRetrievalMode,
} from '../turn-tool-retrieval.js';
import { fakeEmbedder } from './fake-embedder.js';
import type { IntentManual } from '../tool-retriever.js';

const manual: IntentManual = {
  tools: {
    setTimer: {
      domain: 'simple-utilities',
      description: 'countdown timer',
      queries: ['set a timer for ten minutes'],
    },
    getWeather: {
      domain: 'information',
      description: 'weather forecast',
      queries: ['will it rain today'],
    },
    handoffToMaya: {
      domain: 'handoff',
      description: 'switch to Maya',
      queries: ['can I talk to Maya'],
    },
    trackHabit: {
      domain: 'habits',
      description: 'log a habit',
      queries: ['I went for a run today'],
    },
  },
};
const fn = (name: string) =>
  llm.tool({ name, description: name, parameters: z.object({}), execute: async () => 'ok' });

async function setup() {
  const embedder = fakeEmbedder();
  const index = await DenseToolIndex.build(manual, embedder);
  const r = new TurnToolRetrieval({
    sessionId: 's',
    embedder,
    index: async () => index,
    domainOf: (t) => manual.tools[t]?.domain,
    k: 1,
  });
  const toolCtx = new llm.ToolContext(Object.keys(manual.tools).map(fn));
  return { r, embedder, toolCtx };
}

describe('TurnToolRetrieval', () => {
  afterEach(() => vi.useRealTimers());

  it('reuses the embedding computed while the user was talking', async () => {
    const { r, embedder } = await setup();
    const before = embedder.calls;
    r.onTranscript('set a timer for ten minutes', true);
    const pick = await r.pick('set a timer for ten minutes');
    expect(pick?.speculative).toBe('exact');
    expect(embedder.calls).toBe(before + 1);
    expect(pick?.tools[0].tool).toBe('setTimer');
  });

  it('sends the pick plus core tools, not everything', async () => {
    const { r, toolCtx } = await setup();
    const pick = (await r.pick('will it rain today'))!;
    const sent = Object.keys(r.select(toolCtx, pick).functionTools).sort();
    expect(sent).toEqual(['getWeather', 'handoffToMaya']);
  });

  it('fills its slots with the best tools the agent has, skipping ones it lacks', async () => {
    const { r } = await setup();
    // The agent has no setTimer (its domain isn't loaded), but has trackHabit.
    const agentTools = new llm.ToolContext(['getWeather', 'handoffToMaya', 'trackHabit'].map(fn));
    const pick = (await r.pick('set a timer for ten minutes'))!;
    expect(pick.tools[0].tool).toBe('setTimer'); // best match overall
    const sent = Object.keys(r.select(agentTools, pick).functionTools).sort();
    expect(sent).toHaveLength(2); // k = 1 retrieved + the core handoff
    expect(sent).toContain('handoffToMaya');
    expect(sent).not.toContain('setTimer');
  });

  it('makes sticky only the tools it sent, not every candidate', async () => {
    const { r, toolCtx } = await setup();
    const pick = (await r.pick('will it rain today'))!;
    r.select(toolCtx, pick);
    r.newTurn();
    const next = (await r.pick('I went for a run today'))!;
    const sent = Object.keys(r.select(toolCtx, next).functionTools).sort();
    // getWeather (sent last turn) stays; setTimer (a lower candidate) doesn't.
    expect(sent).toContain('getWeather');
    expect(sent).not.toContain('setTimer');
  });

  it('keeps recently used tools for a few turns, then drops them', async () => {
    const { r, toolCtx } = await setup();
    r.onToolsExecuted(['trackHabit']);
    const names = async (text: string) =>
      Object.keys(r.select(toolCtx, (await r.pick(text))!).functionTools);
    expect(await names('will it rain today')).toContain('trackHabit');
    r.newTurn();
    r.newTurn();
    r.newTurn();
    expect(await names('set a timer for ten minutes')).not.toContain('trackHabit');
  });

  it('reports whether each called tool was covered, and how', async () => {
    const { r, toolCtx } = await setup();
    r.onToolsExecuted(['setTimer']); // used earlier: now recent
    r.select(toolCtx, (await r.pick('will it rain today'))!);
    const coverage = r.onToolsExecuted(['getWeather', 'handoffToMaya', 'setTimer', 'trackHabit']);
    expect(coverage.map((c) => [c.tool, c.via, c.covered])).toEqual([
      ['getWeather', 'retrieved', true],
      ['handoffToMaya', 'core', true],
      ['setTimer', 'sticky', true],
      ['trackHabit', 'missed', false],
    ]);
  });
});

describe('embedding while the user talks', () => {
  it('uses the embedding of a slightly earlier interim when the final adds a word or two', async () => {
    const { r, embedder } = await setup();
    r.onTranscript('remind me to call my mom tomorrow at noon', false);
    await new Promise((res) => setTimeout(res, 0));
    const before = embedder.calls;
    const pick = await r.pick('Remind me to call my mom tomorrow at noon, please.');
    expect(pick?.speculative).toBe('near');
    expect(embedder.calls).toBe(before);
  });

  it('does not reuse an unrelated earlier embedding', async () => {
    const { r } = await setup();
    r.onTranscript('will it rain today', false);
    await new Promise((res) => setTimeout(res, 0));
    const pick = await r.pick('set a timer for ten minutes');
    expect(pick?.speculative).toBe('none');
  });

  it('throttles: one call in flight, then only the newest pending text', async () => {
    let release: (() => void) | null = null;
    const texts: string[] = [];
    const slow = {
      model: 'slow',
      embed: (t: string[]) => {
        texts.push(t[0]);
        return new Promise<Float32Array[]>((res) => {
          release = () => res([new Float32Array(4)]);
        });
      },
    };
    const r = new TurnToolRetrieval({
      sessionId: 's',
      embedder: slow,
      index: async () => {
        throw new Error('unused');
      },
      domainOf: () => undefined,
    });
    r.onTranscript('remind', false);
    r.onTranscript('remind me', false);
    r.onTranscript('remind me to call', false);
    expect(texts).toEqual(['remind']);
    release!();
    await new Promise((res) => setTimeout(res, 0));
    expect(texts).toEqual(['remind', 'remind me to call']);
  });
});

describe('live mode', () => {
  /** Embeds instantly, except texts containing `slow`, which never finish. */
  async function setupSlow(slow: string) {
    const inner = fakeEmbedder();
    const embedder = {
      model: 'fake',
      embed: (t: string[]) =>
        t[0].toLowerCase().includes(slow) ? new Promise<Float32Array[]>(() => {}) : inner.embed(t),
    };
    const index = await DenseToolIndex.build(manual, inner);
    const r = new TurnToolRetrieval({
      sessionId: 's',
      embedder,
      index: async () => index,
      domainOf: (t) => manual.tools[t]?.domain,
      k: 1,
    });
    const toolCtx = new llm.ToolContext(Object.keys(manual.tools).map(fn));
    return { r, toolCtx };
  }
  const tick = () => new Promise((res) => setTimeout(res, 0));

  it('uses the pick for these words when it is ready in time', async () => {
    const { r } = await setup();
    r.onTranscript('will it rain today', true);
    await tick();
    const choice = await r.pickLive('will it rain today', 50);
    expect(choice.source).toBe('fresh');
    expect(choice.pick?.tools[0].tool).toBe('getWeather');
  });

  it("falls back to an earlier interim of the same utterance while the final's embedding is late", async () => {
    const { r, toolCtx } = await setupSlow('noon');
    r.onTranscript('set a timer for ten minutes', false);
    await tick();
    // The final adds words; its own embedding never arrives in time.
    const text = 'set a timer for ten minutes before noon please';
    const choice = await r.pickLive(text, 20);
    expect(choice.source).toBe('fallback');
    expect(choice.pick?.text).toBe('set a timer for ten minutes');
    const sent = Object.keys((await r.selectLive(text, toolCtx, 20)).functionTools).sort();
    expect(sent).toEqual(['handoffToMaya', 'setTimer']);
  });

  it('sends every tool when nothing from this utterance is ready', async () => {
    const { r, toolCtx } = await setupSlow('noon');
    r.onTranscript('set a timer for ten minutes', false);
    await tick();
    r.newTurn(); // that interim was the previous turn's
    const text = 'set a timer for ten minutes before noon please';
    expect((await r.pickLive(text, 20)).source).toBe('all');
    const sent = await r.selectLive(text, toolCtx, 20);
    expect(Object.keys(sent.functionTools)).toHaveLength(Object.keys(manual.tools).length);
  });

  it('does not fall back to a too-short or unrelated interim', async () => {
    const { r } = await setupSlow('noon');
    r.onTranscript('so um', false);
    r.onTranscript('will it rain today', false);
    await tick();
    const choice = await r.pickLive('so um I need a timer set for noon please thanks', 20);
    expect(choice.source).toBe('all');
  });
});

describe('helpers', () => {
  it("takes the user's whole turn: every user message since the agent spoke", () => {
    const ctx = new llm.ChatContext();
    ctx.addMessage({ role: 'user', content: 'first' });
    ctx.addMessage({ role: 'assistant', content: 'reply' });
    ctx.addMessage({ role: 'user', content: "What's the weather tomorrow?" });
    ctx.addMessage({ role: 'user', content: "I'm thinking of going for a hike." });
    expect(latestUserText(ctx)).toBe(
      "What's the weather tomorrow? I'm thinking of going for a hike."
    );
  });

  it('matches an interim transcript to its final despite punctuation and casing', async () => {
    const { r, embedder } = await setup();
    r.onTranscript('whats the weathers supposed to be like tomorrow', true);
    const before = embedder.calls;
    const pick = await r.pick("What's the weather's supposed to be like tomorrow?");
    expect(pick?.speculative).toBe('exact');
    expect(embedder.calls).toBe(before);
  });

  it('always keeps the date/time/location context tool', async () => {
    const { r } = await setup();
    expect(r.isCore('getCurrentContext')).toBe(true);
  });

  it('is off unless TOOL_RETRIEVAL says shadow or live', () => {
    expect(toolRetrievalMode({})).toBe('off');
    expect(toolRetrievalMode({ TOOL_RETRIEVAL: 'shadow' })).toBe('shadow');
    expect(toolRetrievalMode({ TOOL_RETRIEVAL: 'yes' })).toBe('off');
  });

  it('findTools pins the best matches the agent has for the next request', async () => {
    const { r, toolCtx } = await setup();
    // A request retrieval ranked elsewhere: the model asks for a timer by name.
    const pick = (await r.pick('will it rain today'))!;
    expect(Object.keys(r.select(toolCtx, pick).functionTools)).not.toContain('setTimer');

    const found = await r.find('set a timer for ten minutes', 1);
    expect(found.map((f) => f.name)).toEqual(['setTimer']);
    expect(found[0].description).toBe('setTimer');

    // The model's next step in the same reply carries it.
    expect(Object.keys(r.select(toolCtx, pick).functionTools)).toContain('setTimer');
  });

  it('findTools offers only tools the agent has', async () => {
    const { r } = await setup();
    const partial = new llm.ToolContext([fn('getWeather'), fn('handoffToMaya')]);
    r.select(partial, (await r.pick('will it rain today'))!);
    const found = await r.find('set a timer for ten minutes', 3);
    expect(found.map((f) => f.name)).not.toContain('setTimer');
  });

  it('without a pick, sends a small set whole but only core and recent tools from the catalog', async () => {
    const { r, toolCtx } = await setup();
    expect(Object.keys(r.withoutPick(toolCtx).functionTools).sort()).toEqual(
      Object.keys(toolCtx.functionTools).sort()
    );
    const catalog = new llm.ToolContext([
      ...Object.keys(manual.tools).map(fn),
      ...Array.from({ length: ALL_TOOLS_LIMIT }, (_, i) => fn(`extraTool${i}`)),
    ]);
    const sent = Object.keys(r.withoutPick(catalog).functionTools);
    expect(sent).toContain('handoffToMaya'); // core domain
    expect(sent).not.toContain('extraTool0');
    expect(sent.length).toBeLessThan(10);
  });
});

