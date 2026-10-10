/**
 * Panel methods talk to the real API.
 *
 * These screens had their fetches commented out "until the backend exists"
 * long after it did, so every real user (demo data off) saw an error screen
 * for Conversation History and "What I've Learned", all-zero analytics, and
 * a delete-memory button that did nothing. They must use the authenticated
 * api helpers and never send a client-chosen user id.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiDelete = vi.fn();
vi.mock('../src/utils/api.js', () => ({ apiGet, apiDelete }));

const toast = { success: vi.fn(), error: vi.fn() };
vi.mock('../src/ui/whisper.ui.js', () => ({ toast }));

const historyUI = { showLoading: vi.fn(), show: vi.fn(), showError: vi.fn() };
vi.mock('../src/ui/conversation-history.ui.js', () => ({ getConversationHistoryUI: () => historyUI }));

const analyticsUI = { showLoading: vi.fn(), show: vi.fn() };
vi.mock('../src/ui/analytics-dashboard.ui.js', () => ({ getAnalyticsDashboardUI: () => analyticsUI }));

const insightsUI = { setCallbacks: vi.fn(), showLoading: vi.fn(), show: vi.fn(), showError: vi.fn() };
vi.mock('../src/ui/cognitive-insights.ui.js', () => ({ getCognitiveInsightsUI: () => insightsUI }));

vi.mock('../src/services/engagement-demo-data.js', () => ({
  isDemoDataEnabled: () => false,
  getDemoTeamHuddle: vi.fn(),
}));

const panels = await import('../src/app/panel-methods.js');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('panel methods use the authenticated API', () => {
  it('shows real conversation history instead of an error screen', async () => {
    const history = { sessions: [], totalSessions: 4, totalMinutes: 61, insightCount: 2 };
    apiGet.mockResolvedValueOnce({ ok: true, status: 200, data: history });

    await panels.showConversationHistory();

    expect(apiGet).toHaveBeenCalledWith('/api/conversations');
    expect(historyUI.show).toHaveBeenCalledWith(history);
    expect(historyUI.showError).not.toHaveBeenCalled();
  });

  it('still offers retry when the history request fails', async () => {
    apiGet.mockResolvedValueOnce({ ok: false, status: 500, error: 'boom' });

    await panels.showConversationHistory();

    expect(historyUI.showError).toHaveBeenCalledTimes(1);
  });

  it('requests analytics without a client-supplied userId', async () => {
    localStorage.setItem('ferni_user_id', 'someone-else');
    const stats = { totalDays: 9, totalRituals: 3 };
    apiGet.mockResolvedValueOnce({ ok: true, status: 200, data: stats });

    await panels.showAnalyticsDashboard();

    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet.mock.calls[0]).toEqual(['/api/analytics/user']);
    expect(analyticsUI.show).toHaveBeenCalledWith(stats);
  });

  it('shows real memories', async () => {
    apiGet.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { memories: [{ id: 'm1' }], patterns: [], totalInteractions: 7, knowledgeScore: 40 },
    });

    await panels.showCognitiveInsights();

    expect(apiGet).toHaveBeenCalledWith('/api/cognitive/memories');
    expect(insightsUI.show).toHaveBeenCalledWith({
      memories: [{ id: 'm1' }],
      patterns: [],
      totalInteractions: 7,
      knowledgeScore: 40,
    });
  });

  it('deletes a memory on the server, confirms, and refreshes the list', async () => {
    apiDelete.mockResolvedValueOnce({ ok: true, status: 200 });
    apiGet.mockResolvedValueOnce({ ok: true, status: 200, data: { memories: [] } });

    await panels.deleteMemory('mem/1 x');

    expect(apiDelete).toHaveBeenCalledWith('/api/cognitive/memories/mem%2F1%20x');
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(apiGet).toHaveBeenCalledWith('/api/cognitive/memories');
  });

  it('tells the user when a memory delete fails', async () => {
    apiDelete.mockResolvedValueOnce({ ok: false, status: 403, error: 'forbidden' });
    apiGet.mockResolvedValueOnce({ ok: true, status: 200, data: { memories: [{ id: 'm1' }] } });

    await panels.deleteMemory('m1');

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('says the memory could not be found when the server has no such memory', async () => {
    apiDelete.mockResolvedValueOnce({ ok: false, status: 404, error: 'Memory not found' });
    apiGet.mockResolvedValueOnce({ ok: true, status: 200, data: { memories: [] } });

    await panels.deleteMemory('gone-1');

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/find that memory/i));
    expect(apiGet).toHaveBeenCalledWith('/api/cognitive/memories');
  });
});
