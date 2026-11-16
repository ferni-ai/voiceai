/**
 * POST /api/team-insights/toasted/:id: a note the app showed as a toast stays in the team
 * panel with TEAM_NOTES_STAY_AFTER_TOAST on, and is hidden as before with it off (issue 3945).
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CrossPersonaInsight } from '../../../services/cross-persona-insights.js';

const sent = vi.hoisted(() => ({ body: undefined as unknown }));

vi.mock('../../../services/cross-persona-insights.js', () => ({
  buildInsightBriefingForHandoff: vi.fn(),
  generateTeamStatus: vi.fn(async () => ({})),
  acknowledgeInsight: vi.fn(),
  markInsightToasted: vi.fn(),
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

const insights = await import('../../../services/cross-persona-insights.js');
const { handleTeamInsightsRoutes } = await import('../team-insights.js');

const post = (path: string) =>
  handleTeamInsightsRoutes(
    { method: 'POST', headers: {} } as IncomingMessage,
    {} as ServerResponse,
    path
  );

function note(id: string, metadata?: Record<string, unknown>): CrossPersonaInsight {
  return {
    id,
    source: 'maya',
    target: 'ferni',
    priority: 'high',
    content: 'Your morning walks are on a nine day streak.',
    category: 'habits',
    createdAt: 1,
    expiresAt: Number.MAX_SAFE_INTEGER,
    proactive: true,
    oneTime: true,
    metadata,
  };
}

describe('POST /api/team-insights/toasted/:id', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it('with the flag on, marks the note toasted and leaves it in the panel', async () => {
    vi.stubEnv('TEAM_NOTES_STAY_AFTER_TOAST', 'on');

    expect(await post('/api/team-insights/toasted/n1')).toBe(true);

    expect(insights.acknowledgeInsight).not.toHaveBeenCalled();
    expect(insights.markInsightToasted).toHaveBeenCalledWith('uid-a', 'n1');
  });

  it('with the flag off, hides the note exactly as acknowledging does', async () => {
    vi.stubEnv('TEAM_NOTES_STAY_AFTER_TOAST', 'off');

    await post('/api/team-insights/toasted/n1');

    expect(insights.acknowledgeInsight).toHaveBeenCalledWith('uid-a', 'n1', 'ferni');
    expect(insights.markInsightToasted).not.toHaveBeenCalled();
  });

  it('acknowledge still hides the note with the flag on', async () => {
    vi.stubEnv('TEAM_NOTES_STAY_AFTER_TOAST', 'on');

    await post('/api/team-insights/acknowledge/n1');

    expect(insights.acknowledgeInsight).toHaveBeenCalledWith('uid-a', 'n1', 'ferni');
    expect(insights.markInsightToasted).not.toHaveBeenCalled();
  });
});

describe('GET /api/team-insights after a toast', () => {
  it('keeps a toasted note in the panel and says it was toasted', async () => {
    vi.mocked(insights.buildInsightBriefingForHandoff).mockResolvedValueOnce({
      incomingInsights: [
        note('toasted', { toastedAt: 5 }),
        note('hidden', { hiddenFromUserAt: 5 }),
      ],
      proactiveDiscoveries: [],
      proactiveNotes: [],
    } as never);

    await handleTeamInsightsRoutes(
      { method: 'GET', headers: {} } as IncomingMessage,
      {} as ServerResponse,
      '/api/team-insights'
    );

    const body = sent.body as { insights: Array<{ id: string; toasted: boolean }> };
    expect(body.insights).toEqual([expect.objectContaining({ id: 'toasted', toasted: true })]);
  });
});
