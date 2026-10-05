/**
 * GET /api/contacts/insights sends exactly what the web Relationship Insights
 * dashboard reads.
 *
 * Before: the route sent `{ insights: ContactInsight[], needsAttention,
 * overdueFrequent }`, the dashboard read `stats`, `strengthDistribution`,
 * `recentActivity` and `{ id, type, title, description }` insights. Rendering
 * the real body threw, and the dashboard's catch showed made-up people
 * ("Reconnect with Sarah") to everyone. This runs the real route and the real
 * contact service (Firestore unavailable, so contacts live in memory).
 */

import { describe, it, expect, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import type { RelationshipInsightsData } from '../../apps/web/src/ui/relationship-insights.ui.js';

vi.mock('@google-cloud/firestore', () => {
  throw new Error('Firestore unavailable in this test');
});
vi.mock('../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'insights-user', isAdmin: false })),
  rateLimit: vi.fn(() => false),
}));

const { handleContactsRoutes } = await import('../api/contacts-routes.js');
const { upsertContact } = await import('../services/contacts/contact-relationship-service.js');

const DAY = 24 * 60 * 60 * 1000;

async function getInsights(): Promise<{ status: number; body: RelationshipInsightsData }> {
  const out = { status: 0, body: {} as RelationshipInsightsData };
  const req = {
    method: 'GET',
    url: '/api/contacts/insights',
    headers: { host: 'localhost', 'x-firebase-uid': 'insights-user' },
  } as unknown as IncomingMessage;
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
  const url = new URL('http://localhost/api/contacts/insights');
  await handleContactsRoutes(req, res, url.pathname, url);
  return out;
}

describe('GET /api/contacts/insights → Relationship Insights dashboard', () => {
  it("describes the user's real contacts in the dashboard's shape", async () => {
    const now = Date.now();
    const inTenDays = new Date(now + 10 * DAY);
    const mmdd = `${String(inTenDays.getUTCMonth() + 1).padStart(2, '0')}-${String(inTenDays.getUTCDate()).padStart(2, '0')}`;
    await upsertContact('insights-user', {
      contactId: 'dana@example.com',
      name: 'Dana',
      relationship: 'family',
      strengthScore: 80,
      lastInteraction: new Date(now - 40 * DAY),
      importantDates: [{ date: mmdd, type: 'birthday' }],
    });
    await upsertContact('insights-user', {
      contactId: 'lee@example.com',
      name: 'Lee',
      relationship: 'colleague',
      strengthScore: 30,
      lastInteraction: new Date(now - 1 * DAY),
    });

    const { status, body } = await getInsights();

    expect(status).toBe(200);
    expect(body.stats).toEqual({
      totalPeople: 2,
      familyCount: 1,
      friendCount: 0,
      colleagueCount: 1,
      averageStrength: 55,
      upcomingDates: 1,
      needsAttention: 1, // Dana: 40 days without contact
    });
    expect(body.strengthDistribution.map((d) => [d.label, d.value])).toEqual([
      ['Strong', 50],
      ['Good', 0],
      ['Needs work', 50],
    ]);
    expect(body.recentActivity).toHaveLength(28);
    expect(body.recentActivity[1]?.count).toBe(1); // Lee, yesterday
    expect(body.insights.length).toBeGreaterThan(0);
    for (const insight of body.insights) {
      expect(insight.contactName).toBe('Dana');
      expect(insight.title).toBe('Dana');
      expect(['nudge', 'pattern', 'milestone', 'warning']).toContain(insight.type);
      expect(insight.description).toContain('Dana');
    }
  });
});
