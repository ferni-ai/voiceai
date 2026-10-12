/**
 * GET /api/relationship/team-unlocks answers from the profile and rule the voice agent
 * refuses handoffs with, so the app never offers a teammate the agent will refuse.
 *
 * It read engagement-store metrics and a streak field nothing writes, so on dev
 * 2026-10-11 the app and the agent disagreed about who was unlocked.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { describe, expect, it, vi } from 'vitest';

const DAY_MS = 24 * 60 * 60 * 1000;
const run = (count: number, endAgo: number): string[] =>
  Array.from({ length: count }, (_, i) =>
    new Date(Date.now() - (endAgo + count - 1 - i) * DAY_MS).toISOString().slice(0, 10)
  );

const profile = {
  id: 'owner',
  totalConversations: 647,
  firstContact: new Date(Date.now() - 281 * DAY_MS),
  // A 12-day run and the last two days, as the agent's profile carries them
  conversationSummaries: [...run(12, 30), ...run(2, 0)].map((day) => ({
    timestamp: `${day}T12:00:00.000Z`,
  })),
  subscription: { tier: 'free' },
};

vi.mock('../../../memory/storage/store-factory.js', () => ({
  getStore: async () => ({ getProfile: async () => profile }),
}));
// If the route still read the engagement store, it would see nobody
vi.mock('../../../services/engagement/engagement-store.js', () => ({
  getEngagementStore: async () => ({ getProfile: async () => ({}) }),
}));

import { handleGetTeamUnlocks } from '../relationship.js';

async function get(): Promise<Record<string, unknown>> {
  let body = '';
  const res = {
    writeHead: vi.fn(),
    setHeader: vi.fn(),
    end: (chunk: string) => {
      body = chunk;
    },
  } as unknown as ServerResponse;
  const req = { headers: { 'x-firebase-uid': 'owner' } } as unknown as IncomingMessage;
  await handleGetTeamUnlocks(req, res, new URL('http://x/api/relationship/team-unlocks'));
  return JSON.parse(body) as Record<string, unknown>;
}

describe('GET /api/relationship/team-unlocks', () => {
  it("unlocks by the agent's rule: the owner's real days put him at established", async () => {
    const data = await get();
    expect(data.stage).toBe('established');
    expect(data.unlockedMembers).toEqual(
      expect.arrayContaining(['ferni', 'maya-santos', 'peter-john', 'alex-chen', 'jordan-taylor'])
    );
    expect(data.unlockedMembers).not.toContain('nayan-patel');
    expect(data.tier).toBe('free');
  });

  it("gives each locked teammate the server's reason", async () => {
    const data = await get();
    const nayan = (data.members as Array<{ id: string; teaserMessage: string | null }>).find(
      (m) => m.id === 'nayan-patel'
    );
    expect(nayan?.teaserMessage).toBeTruthy();
  });
});
