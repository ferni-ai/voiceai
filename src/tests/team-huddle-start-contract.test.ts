/**
 * POST /api/huddles/start returns everything the web team-huddle panel shows.
 *
 * The web's showTeamHuddle (apps/web/src/app/panel-methods.ts) had this call
 * commented out "until the backend exists" long after it did, so users only
 * ever got "Team huddle isn't ready yet". This runs the real handler (only
 * Firestore and the persistence service faked) and checks the body carries the
 * TeamHuddleData fields the panel renders.
 */

import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'http';
import type { TeamHuddleData } from '../../apps/web/src/ui/team-huddle.ui.js';

vi.mock('../services/engagement/engagement-store.js', () => ({
  getEngagementStore: async () => ({
    getProfile: async () => ({ stats: {} }),
    getAllStreaks: async () => [],
    getWeatherHistory: async () => [],
  }),
}));

vi.mock('../services/engagement/team-engagement.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/engagement/team-engagement.js')>()),
  getTeamEngagementService: () => ({ generateTeamHuddle: vi.fn(async () => null) }),
}));

const { handleTeamRoutes } = await import('../api/routes/team.js');

async function startHuddle(
  body: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  const out = { status: 0, body: {} as Record<string, unknown> };
  const req = Object.assign(Readable.from([JSON.stringify(body)]), {
    method: 'POST',
    url: '/api/huddles/start',
    headers: { host: 'localhost', 'x-firebase-uid': 'signed-in-user' },
  }) as unknown as IncomingMessage;
  const res = {
    setHeader: vi.fn(),
    writeHead(status: number) {
      out.status = status;
      return this;
    },
    end(chunk?: string) {
      if (chunk) out.body = JSON.parse(chunk);
    },
  } as unknown as ServerResponse;
  const handled = await handleTeamRoutes(
    req,
    res,
    '/api/huddles/start',
    new URL('http://localhost/api/huddles/start')
  );
  expect(handled).toBe(true);
  return out;
}

describe('POST /api/huddles/start → web team huddle panel', () => {
  it('returns a huddle with every field the panel renders', async () => {
    const { status, body } = await startHuddle({
      topic: 'Weekly check-in on your progress',
      type: 'weekly',
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    const huddle = body.huddle as TeamHuddleData;
    expect(typeof huddle.id).toBe('string');
    expect(huddle.title).toBe('Team Check-in');
    expect(huddle.intro.length).toBeGreaterThan(0);
    expect(huddle.outro.length).toBeGreaterThan(0);
    expect(huddle.type).toBe('weekly');
    expect(Number.isNaN(Date.parse(huddle.scheduledAt))).toBe(false);
    expect(huddle.participants.length).toBeGreaterThan(0);
    for (const p of huddle.participants) {
      expect(Object.keys(p).sort()).toEqual(
        ['avatarColor', 'comment', 'initials', 'name', 'personaId'].sort()
      );
      expect(p.comment.length).toBeGreaterThan(0);
    }
  });
});
