/**
 * Places text search with includedType 'restaurant' returns only restaurants:
 * on 2026-10-17 "dentist near St. Petersburg FL" returned 0 places with it and
 * 20 without (16 dentists). Only restaurant tools may send that type; general
 * local search sends none.
 *
 * Real tool definitions and the real Places client; only fetch is faked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// services/google-places.ts reads its key when the module loads.
vi.hoisted(() => {
  process.env.GOOGLE_PLACES_API_KEY = 'test-places-key';
});

vi.mock('../../../../utils/safe-logger.js', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    getLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
    createLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
    safeLog: () => logger,
  };
});
vi.mock('@livekit/agents', () => ({
  llm: { tool: vi.fn((config) => config) },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { definitions } from '../index.js';
import { createPlacesTools } from '../../../scheduling/places-tools.js';
import type { ToolContext } from '../../../registry/types.js';

type Executable = { execute: (args: Record<string, unknown>, opts?: unknown) => Promise<string> };

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify({ places: [] }), {
        headers: { 'Content-Type': 'application/json' },
      })
  );
  vi.stubGlobal('fetch', fetchMock);
});

function tool(id: string): Executable {
  const def = definitions.find((d) => d.id === id);
  if (!def) throw new Error(`no tool ${id}`);
  return def.create({ userId: 'u1' } as ToolContext) as unknown as Executable;
}

/** The searchText body of every Places call made. */
function sentBodies(): Array<Record<string, unknown>> {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).endsWith('/places:searchText'))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>);
}

describe('Places includedType by tool', () => {
  it('searchLocalBusinesses ("dentist") sends no place type', async () => {
    await tool('searchLocalBusinesses').execute({
      query: 'dentist',
      location: 'St. Petersburg FL',
    });

    const bodies = sentBodies();
    expect(bodies).toHaveLength(1);
    expect(bodies[0].textQuery).toBe('dentist near St. Petersburg FL');
    expect(bodies[0]).not.toHaveProperty('includedType');
  });

  it('searchLocalBusinesses "on google" (explicit source) sends no place type', async () => {
    await tool('searchLocalBusinesses').execute({ query: 'gym on google', location: 'Tampa' });

    expect(sentBodies()).toHaveLength(1);
    expect(sentBodies()[0]).not.toHaveProperty('includedType');
  });

  it('findRestaurants still restricts to restaurants', async () => {
    await tool('findRestaurants').execute({ cuisine: 'Thai', location: 'Tampa' });

    expect(sentBodies()).toHaveLength(1);
    expect(sentBodies()[0]).toMatchObject({
      textQuery: 'Thai restaurant near Tampa',
      includedType: 'restaurant',
    });
  });

  it('the places tools look up any business without a place type', async () => {
    const places = createPlacesTools() as unknown as Record<string, Executable>;

    await places.searchBusinesses.execute({ query: 'gym', location: 'Tampa', openNow: false });
    await places.getBusinessDetails.execute({ businessName: 'Bayfront Dental', location: 'Tampa' });

    const bodies = sentBodies();
    expect(bodies).toHaveLength(2);
    for (const body of bodies) expect(body).not.toHaveProperty('includedType');
  });
});
