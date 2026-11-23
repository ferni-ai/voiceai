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
    proactiveNotes: [],
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

  it('sends the proactive notes as panel cards, one per wording', async () => {
    const { buildInsightBriefingForHandoff } =
      await import('../../../services/cross-persona-insights.js');
    const copy = (id: string, createdAt: number) => ({
      id,
      source: 'ferni',
      target: 'all',
      content: 'You mentioned something you wanted to do. Just checking in - no pressure.',
      priority: 'high',
      category: 'commitment-followup',
      createdAt,
      expiresAt: createdAt + 1,
      proactive: true,
      oneTime: true,
    });
    vi.mocked(buildInsightBriefingForHandoff).mockResolvedValueOnce({
      incomingInsights: [],
      proactiveDiscoveries: ['From ferni: x', 'From ferni: x'],
      proactiveNotes: [copy('a', 1), copy('b', 2), copy('c', 3)],
    } as never);

    const req = { method: 'GET', headers: {} } as IncomingMessage;
    await handleTeamInsightsRoutes(req, {} as ServerResponse, '/api/team-insights');

    const body = sent.body as { discoveries: Array<{ id: string; content: string }> };
    expect(body.discoveries.map((d) => d.id)).toEqual(['c']);
    expect(body.discoveries[0].content).toBe(
      'You mentioned something you wanted to do. Just checking in, no pressure.'
    );
  });

  it('never sends a note the user hid as a discovery', async () => {
    const { buildInsightBriefingForHandoff } =
      await import('../../../services/cross-persona-insights.js');
    const note = (id: string, content: string, createdAt: number) => ({
      id,
      source: 'ferni',
      target: 'all',
      content,
      priority: 'high',
      category: 'commitment-followup',
      createdAt,
      expiresAt: createdAt + 1,
      proactive: true,
      oneTime: true,
    });
    vi.mocked(buildInsightBriefingForHandoff).mockResolvedValueOnce({
      incomingInsights: [],
      proactiveDiscoveries: [],
      proactiveNotes: [
        { ...note('hidden', 'A note the user put away.', 2), metadata: { hiddenFromUserAt: 5 } },
        note('toasted', 'A note the user only saw as a toast.', 1),
      ],
    } as never);

    const req = { method: 'GET', headers: {} } as IncomingMessage;
    await handleTeamInsightsRoutes(req, {} as ServerResponse, '/api/team-insights');

    const body = sent.body as { discoveries: Array<{ id: string }> };
    expect(body.discoveries.map((d) => d.id)).toEqual(['toasted']);
  });
});
