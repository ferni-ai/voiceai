/**
 * GET /api/team-insights leaves out insights the user already acknowledged.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { describe, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => ({ body: undefined as unknown }));

vi.mock('../../../services/cross-persona-insights.js', () => ({
  buildInsightBriefingForHandoff: vi.fn(async () => ({
    incomingInsights: [
      {
        id: 'seen',
        source: 'maya',
        content: 'Seen',
        priority: 'high',
        category: 'habits',
        createdAt: 1,
        oneTime: true,
        metadata: { hiddenFromUserAt: 5 },
      },
      {
        id: 'new',
        source: 'maya',
        content: 'New',
        priority: 'high',
        category: 'habits',
        createdAt: 2,
        oneTime: true,
      },
    ],
    proactiveDiscoveries: [],
  })),
  generateTeamStatus: vi.fn(async () => ({})),
  acknowledgeInsight: vi.fn(),
  scanForCrossPersonaInsights: vi.fn(),
}));
vi.mock('../../../intelligence/context-builders/superhuman/superhuman-integration.js', () => ({
  getPerformanceStats: vi.fn(),
  clearPerformanceLog: vi.fn(),
  clearAllSuperhumanCache: vi.fn(),
}));
vi.mock('../../helpers.js', () => ({
  getUserId: vi.fn(() => 'uid-a'),
  sendJSON: vi.fn((_res: unknown, body: unknown) => {
    sent.body = body;
  }),
  sendError: vi.fn(),
  handleCorsPreflightIfNeeded: vi.fn(() => false),
}));

const { handleTeamInsightsRoutes } = await import('../team-insights.js');

describe('GET /api/team-insights', () => {
  it('returns only insights the user has not acknowledged', async () => {
    const req = { method: 'GET', headers: {} } as IncomingMessage;
    await handleTeamInsightsRoutes(req, {} as ServerResponse, '/api/team-insights');

    const body = sent.body as { insights: Array<{ id: string }> };
    expect(body.insights.map((i) => i.id)).toEqual(['new']);
  });
});
