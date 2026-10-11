/**
 * The app learns TEAM_BY_NEED from GET /api/relationship/team-unlocks (teamByNeed), and
 * shows the whole team with no locks when it's on (apps/web team-unlock.service.ts).
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => [] as unknown[]);

vi.mock('../../helpers.js', () => ({
  parseBody: vi.fn(),
  requireUserId: () => 'u1',
  sendJSON: (_res: unknown, body: unknown) => sent.push(body),
  sendJSONCached: (_res: unknown, body: unknown) => sent.push(body),
}));
// A brand-new free user, whichever store the route reads the profile from
const newUser = { id: 'u1', totalConversations: 0, createdAt: new Date().toISOString() };
vi.mock('../../../services/engagement/engagement-store.js', () => ({
  getEngagementStore: async () => ({ getProfile: async () => newUser }),
}));
vi.mock('../../../services/stores/conversation-history.js', () => ({
  getConversationHistoryService: () => ({ getHistory: async () => ({ totalSessions: 0 }) }),
}));
vi.mock('../../../memory/storage/store-factory.js', () => ({
  getStore: async () => ({ getProfile: async () => newUser }),
}));

import { handleGetTeamUnlocks } from '../relationship.js';

async function teamUnlocks(): Promise<Record<string, unknown>> {
  sent.length = 0;
  const url = new URL('http://local/api/relationship/team-unlocks?userId=u1');
  await handleGetTeamUnlocks({} as IncomingMessage, {} as ServerResponse, url);
  return sent[0] as Record<string, unknown>;
}

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/relationship/team-unlocks: teamByNeed', () => {
  it('is true while TEAM_BY_NEED is on', async () => {
    vi.stubEnv('TEAM_BY_NEED', 'on');
    expect((await teamUnlocks()).teamByNeed).toBe(true);
  });

  it('is false while it is off', async () => {
    vi.stubEnv('TEAM_BY_NEED', '');
    expect((await teamUnlocks()).teamByNeed).toBe(false);
  });
});
