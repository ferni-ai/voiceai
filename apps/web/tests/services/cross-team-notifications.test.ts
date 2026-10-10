/**
 * Cross-team notifications read what GET /api/team-insights actually sends.
 *
 * Before: the service expected sourcePersona/message/timestamp and priorities
 * high|medium, but the server sends source/category/summary/createdAt with
 * priorities critical|high|normal|low. getPersonaDisplayName(undefined) threw,
 * so no team insight was ever shown, and nothing was acknowledged.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeamInsight } from '../../src/ui/team-insights.ui.js';

const apiGet = vi.fn();
const apiPost = vi.fn();
const showOutreach = vi.fn();

vi.mock('../../src/utils/api.js', () => ({
  apiGet: (...a: unknown[]) => apiGet(...a),
  apiPost: (...a: unknown[]) => apiPost(...a),
}));
vi.mock('../../src/ui/proactive-outreach.ui.js', () => ({
  showOutreach: (...a: unknown[]) => showOutreach(...a),
}));
vi.mock('../../src/services/authed-websocket.service.js', () => ({ openAuthedWebSocket: vi.fn() }));

const service = await import('../../src/services/cross-team-notifications.service.js');

function serverInsight(overrides: Partial<TeamInsight> = {}): TeamInsight {
  return {
    id: 'ins-1',
    source: 'maya',
    category: 'habit_pattern',
    summary: 'Your morning walks are on a nine day streak',
    content: 'Your morning walks are on a nine day streak, the longest yet.',
    priority: 'critical',
    createdAt: Date.now(),
    isNew: true,
    ...overrides,
  };
}

describe('cross-team notifications polling', () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    showOutreach.mockReset();
    apiPost.mockResolvedValue({ ok: true, status: 200, data: { success: true } });
    service.setEnabled(true);
    service.resetSession();
  });

  afterEach(() => {
    service.stopInsightsPolling();
  });

  it('shows a server insight with the persona name and summary', async () => {
    apiGet.mockResolvedValue({ ok: true, status: 200, data: { insights: [serverInsight()] } });

    await service.startInsightsPolling('user-1');

    expect(showOutreach).toHaveBeenCalledTimes(1);
    const shown = showOutreach.mock.calls[0]?.[0] as { id: string; personaName: string; message: string };
    expect(shown.id).toBe('ins-1');
    expect(shown.personaName).toBe('Maya');
    expect(shown.message).toContain('nine day streak');
  });

  it('acknowledges the insight it showed', async () => {
    apiGet.mockResolvedValue({ ok: true, status: 200, data: { insights: [serverInsight({ id: 'ins/2' })] } });

    await service.startInsightsPolling('user-2');

    expect(apiPost).toHaveBeenCalledWith('/api/team-insights/acknowledge/ins%2F2');
  });

  it('leaves low priority insights quiet and unacknowledged', async () => {
    apiGet.mockResolvedValue({ ok: true, status: 200, data: { insights: [serverInsight({ priority: 'low' })] } });

    await service.startInsightsPolling('user-3');

    expect(showOutreach).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });
});
