/**
 * Live retrieval (TOOL_RETRIEVAL=live) sends the intent tool for a places,
 * flight or package request, but only when the agent holds that tool.
 */

import { describe, expect, it, vi } from 'vitest';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { DenseToolIndex } from '../dense-index.js';
import { TurnToolRetrieval } from '../turn-tool-retrieval.js';
import { fakeEmbedder } from './fake-embedder.js';
import type { IntentManual } from '../tool-retriever.js';

vi.mock('../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/safe-logger.js')>()),
  createLogger: () => {
    const rec = () => undefined;
    return { info: rec, warn: rec, error: rec, debug: rec };
  },
}));

const manual: IntentManual = {
  tools: {
    searchFlights: {
      domain: 'travel',
      description: 'search flights between two cities on a date',
      queries: ['flights Boston to Denver next Friday'],
    },
    findRestaurants: {
      domain: 'local-search',
      description: 'find restaurants nearby',
      queries: ['coffee shop near me open now'],
    },
    trackPackage: {
      domain: 'productivity',
      description: 'track a package by tracking number',
      queries: ['check this tracking number'],
    },
    getWeather: {
      domain: 'information',
      description: 'weather forecast',
      queries: ['will it rain today'],
    },
  },
};

const fn = (name: string) =>
  llm.tool({ name, description: name, parameters: z.object({}), execute: async () => 'ok' });

async function setup(held: string[]) {
  const embedder = fakeEmbedder();
  const index = await DenseToolIndex.build(manual, embedder);
  const retrieval = new TurnToolRetrieval({
    sessionId: 's',
    embedder,
    index: async () => index,
    domainOf: (t) => manual.tools[t]?.domain,
    k: 1,
  });
  return { retrieval, toolCtx: new llm.ToolContext(held.map(fn)) };
}

describe('live retrieval sends the intent tools', () => {
  it.each([
    ['flights Boston to Denver next Friday', 'searchFlights'],
    ['coffee shop near me open now', 'findRestaurants'],
    ['check this tracking number', 'trackPackage'],
  ])('"%s" sends %s when the agent holds it', async (text, tool) => {
    const { retrieval, toolCtx } = await setup(Object.keys(manual.tools));
    const sent = await retrieval.selectLive(text, toolCtx, 150);
    expect(Object.keys(sent.functionTools)).toContain(tool);
  });

  it('cannot send a tool the agent does not hold', async () => {
    const { retrieval, toolCtx } = await setup(['getWeather']);
    const sent = await retrieval.selectLive('flights Boston to Denver next Friday', toolCtx, 150);
    expect(Object.keys(sent.functionTools)).not.toContain('searchFlights');
  });
});
