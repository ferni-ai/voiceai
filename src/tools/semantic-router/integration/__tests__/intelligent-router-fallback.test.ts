/**
 * #4116: startIntelligentRouting falls back to standard semantic routing when intelligent routing
 * fails. It returned the converter's promise from inside its try without awaiting it, so a
 * converter that rejected skipped the catch and the turn's routing failed instead of falling back.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => vi.fn());
vi.mock('../../advanced/intelligent/index.js', () => ({
  initializeIntelligentOrchestrator: () => ({ initialize: async () => undefined, route }),
  getIntelligentOrchestrator: vi.fn(),
  createGeminiProvider: vi.fn(),
  createOpenAIProvider: vi.fn(),
}));
vi.mock('../../registry.js', () => ({
  getToolRegistry: () => ({ getAll: () => [], get: () => undefined }),
}));
const FALLBACK = { attempted: false, executed: false, routingPath: 'standard_fallback' };
const startSemanticRouting = vi.hoisted(() => vi.fn());
vi.mock('../turn-processor-integration.js', () => ({ startSemanticRouting }));

import {
  initializeIntelligentRouter,
  startIntelligentRouting,
} from '../intelligent-router-integration.js';

const context = {
  userId: 'riley-test',
  sessionId: 's-4116',
  personaId: 'ferni',
  conversationHistory: [],
  recentTools: [],
};
const decision = {
  action: 'conversation',
  decidedBy: 'semantic',
  toolId: null,
  confidence: 0.2,
  args: {},
  rawResults: {},
  timing: { total: 1 },
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('startIntelligentRouting falls back on any failure (#4116)', () => {
  it('a failed route (a rejection before conversion) falls back to semantic routing', async () => {
    await initializeIntelligentRouter();
    startSemanticRouting.mockResolvedValueOnce(FALLBACK);
    route.mockRejectedValueOnce(new Error('route failed'));
    await expect(startIntelligentRouting('play something calm', context)).resolves.toBe(FALLBACK);
    expect(startSemanticRouting).toHaveBeenCalledWith('play something calm', context);
  });

  it('a converter that rejects is caught the same way, not passed up to the turn', async () => {
    await initializeIntelligentRouter();
    startSemanticRouting.mockResolvedValueOnce(FALLBACK);
    // No rawResults: building the route result throws inside the async converter, so it rejects.
    route.mockResolvedValueOnce({ ...decision, rawResults: undefined });
    await expect(startIntelligentRouting('play something calm', context)).resolves.toBe(FALLBACK);
    expect(startSemanticRouting).toHaveBeenCalledWith('play something calm', context);
  });

  it('a converter that resolves returns its own result and never falls back', async () => {
    await initializeIntelligentRouter();
    route.mockResolvedValueOnce(decision);
    const result = await startIntelligentRouting('play something calm', context);
    expect(result).toMatchObject({ routingPath: 'semantic_conversation', executed: false });
    expect(startSemanticRouting).not.toHaveBeenCalled();
  });
});
