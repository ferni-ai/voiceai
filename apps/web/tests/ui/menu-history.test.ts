/**
 * "When We've Talked" (history): what the panel shows for each answer
 * GET /api/conversations gives. A phone call carries only the agent's summary
 * of the call (no web hang-up insights), and the panel used to show "no
 * insights" for it instead of what was talked about.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockApiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet: mockApiGet, apiDelete: vi.fn() }));
vi.mock('../../src/services/engagement-demo-data.js', () => ({
  isDemoDataEnabled: () => false,
  getDemoTeamHuddle: vi.fn(),
}));

/** Fresh modules per test: the panel is a singleton and setup.ts empties the body. */
async function showConversationHistory(): Promise<void> {
  vi.resetModules();
  const panels = await import('../../src/app/panel-methods.js');
  await panels.showConversationHistory();
}

const PHONE_CALL = {
  id: 'conv_1',
  date: new Date().toISOString(),
  personaId: 'ferni',
  personaName: 'Ferni',
  duration: 14,
  messageCount: 22,
  insights: [],
  highlights: ['Talked through the move to Denver'],
  topicsDiscussed: [],
};

function panel(): HTMLElement {
  const el = document.querySelector<HTMLElement>('.history');
  if (!el) throw new Error('history panel not rendered');
  return el;
}

beforeEach(() => {
  mockApiGet.mockReset();
});

describe("When We've Talked panel", () => {
  it("shows a phone call with the agent's summary of it", async () => {
    mockApiGet.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { sessions: [PHONE_CALL], totalSessions: 1, totalMinutes: 14, insightCount: 0 },
    });

    await showConversationHistory();

    const sessions = panel().querySelectorAll('.history__session');
    expect(sessions).toHaveLength(1);
    expect(panel().querySelector('.history__session-insight')?.textContent).toBe(
      '"Talked through the move to Denver"'
    );
  });

  it('a server error shows the error state, never the empty state', async () => {
    mockApiGet.mockResolvedValueOnce({ ok: false, status: 500, error: 'boom' });

    await showConversationHistory();

    expect(panel().querySelector('.history__error')).not.toBeNull();
    expect(panel().querySelector('.history__session')).toBeNull();
    expect(panel().querySelector('.ferni-empty-state')).toBeNull();
  });
});
