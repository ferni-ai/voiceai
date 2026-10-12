/**
 * A team insight toast once read "Ferni: {Summary}": /ws/insights sent the raw
 * server insight, which has no `summary`, and t() left the placeholder in.
 * Malformed insights are now dropped at the boundary, and a toast with no
 * summary is never shown.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const info = vi.fn();
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast: { show: info, info: vi.fn(), success: vi.fn() } }));
vi.mock('../../src/utils/api-helpers.js', () => ({
  getApiHeadersAsync: vi.fn(async () => ({})),
  getUserId: vi.fn(() => 'user-1'),
}));

const { parseTeamInsights } = await import('../../src/services/cross-team-insight-mapper.js');
const ui = await import('../../src/ui/team-insights.ui.js');

const valid = {
  id: 'i-1',
  source: 'maya',
  category: 'habit-momentum',
  summary: 'Three habits are sticking.',
  content: 'Three habits are sticking. Consistency is building.',
  priority: 'high',
  createdAt: 1_700_000_000_000,
  isNew: true,
};
// What /ws/insights used to push: the raw server insight, no summary.
const raw = { ...valid, id: 'i-2', summary: undefined, target: 'ferni', expiresAt: 1, proactive: true, oneTime: true };

function serve(insights: unknown[]): void {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ insights, teamStatus: {} }) })) as never;
}

describe('team insight boundary', () => {
  beforeEach(() => {
    info.mockClear();
  });

  it('keeps well-formed insights and drops ones missing a field the UI reads', () => {
    expect(parseTeamInsights([valid, raw, { id: 'i-3' }, null], 'test').map((i) => i.id)).toEqual(['i-1']);
    expect(parseTeamInsights({ not: 'a list' }, 'test')).toEqual([]);
    expect(parseTeamInsights([{ ...valid, summary: '   ' }], 'test')).toEqual([]);
  });

  it('a polled insight without a summary never reaches a toast', async () => {
    serve([raw]);
    await ui.checkForNewInsights();
    expect(info).not.toHaveBeenCalled();
  });

  it('a polled high-priority insight is toasted with its summary', async () => {
    serve([valid]);
    await ui.checkForNewInsights();
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]?.[0]).toEqual({ message: 'Maya: Three habits are sticking.', type: 'info', defer: true });
  });

  it('showInsightNotification skips the toast when the summary is blank', () => {
    ui.showInsightNotification({ ...valid, id: 'i-4', summary: '' });
    expect(info).not.toHaveBeenCalled();
  });
});
