/**
 * Creative You: the daily video and podcast picks load with auth.
 *
 * Before: they were fetched with plain fetch and ?userId=. In production the
 * server drops a ?userId= that has no token behind it, answered 400, and both
 * picks stayed empty.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet: (...a: unknown[]) => apiGet(...a) }));

const { getCreativeYouDashboard } = await import('../../src/ui/creative-you-dashboard.ui.js');

const VIDEO = {
  video: { id: 'v1', title: 'How seeds wake up', channelTitle: 'Garden Hour', thumbnailUrl: '', durationSeconds: 300 },
  reason: 'You mentioned gardening',
  discussionPrompts: [],
  mood: 'learn',
};
const PODCAST = {
  episode: { id: 'p1', title: 'Slow mornings', podcastTitle: 'Quiet Hours', duration: 1200 },
  reason: 'For your commute',
  estimatedListenTime: '20 min',
  mood: 'chill',
};

function respond(path: string): unknown {
  if (path === '/api/creative/videos/daily') return { ok: true, status: 200, data: { dailyPick: VIDEO } };
  if (path === '/api/creative/podcasts/daily') return { ok: true, status: 200, data: { dailyPick: PODCAST } };
  if (path === '/api/creative/tracks') return { ok: true, status: 200, data: { tracks: [] } };
  return { ok: true, status: 200, data: { dna: null } };
}

describe('Creative You daily picks', () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiGet.mockImplementation(async (path: string) => respond(path));
    document.body.replaceChildren();
    globalThis.fetch = vi.fn(async () => new Response('{"error":"Missing userId parameter"}', { status: 400 }));
  });

  it('requests both picks through the authenticated API helper, never plain fetch', async () => {
    await getCreativeYouDashboard('user-picks-1').initialize();

    expect(apiGet).toHaveBeenCalledWith('/api/creative/videos/daily', { userId: 'user-picks-1' });
    expect(apiGet).toHaveBeenCalledWith('/api/creative/podcasts/daily', { userId: 'user-picks-1' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('renders the picks the server returns', async () => {
    await getCreativeYouDashboard('user-picks-2').initialize();

    expect(document.querySelector('.video-pick h4')?.textContent).toBe('How seeds wake up');
    expect(document.querySelector('.podcast-pick')?.textContent).toContain('Slow mornings');
  });
});
