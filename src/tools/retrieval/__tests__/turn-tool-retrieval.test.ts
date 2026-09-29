import { describe, expect, it, vi, afterEach } from 'vitest';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { DenseToolIndex } from '../dense-index.js';
import { TurnToolRetrieval, latestUserText, toolRetrievalMode } from '../turn-tool-retrieval.js';
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
    const { r } = await setup();
    r.onToolsExecuted(['setTimer']); // used earlier: now recent
    await r.pick('will it rain today');
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

  it('is off unless TOOL_RETRIEVAL says shadow or live', () => {
    expect(toolRetrievalMode({})).toBe('off');
    expect(toolRetrievalMode({ TOOL_RETRIEVAL: 'shadow' })).toBe('shadow');
    expect(toolRetrievalMode({ TOOL_RETRIEVAL: 'yes' })).toBe('off');
  });
});
