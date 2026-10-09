/**
 * Contract: GET /api/contacts/nudges → Your People panel.
 *
 * The route answers `{ nudges: [...], summary, ... }`; the web panel used to
 * store that whole object as its nudge list and then call .filter/.slice on it.
 * Feed the route's real output into the web's real parser.
 */

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { parseNudgesResponse } from '../../apps/web/src/ui/your-people-nudges.js';

vi.mock('../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'u1', isAdmin: false })),
  rateLimit: vi.fn(() => false),
}));

vi.mock('../services/contacts/contact-relationship-service.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const lastInteraction = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  return {
    ...actual,
    getContacts: vi.fn(async () => []),
    getContactsNeedingAttention: vi.fn(async () => [
      { id: 'c1', name: 'Marcus', relationship: 'friend', lastInteraction },
    ]),
  };
});

vi.mock('../services/contacts/contact-groups.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getGroups: vi.fn(async () => []) };
});

import { handleContactsRoutes } from '../api/contacts-routes.js';

describe('contacts nudges contract', () => {
  it("the web parser reads the route's real response as a nudge list", async () => {
    const req = new EventEmitter() as IncomingMessage;
    req.method = 'GET';
    req.headers = { 'x-firebase-uid': 'u1' }; // the caller, as the door binds it
    let body = '';
    const res = {
      writeHead: vi.fn(),
      setHeader: vi.fn(),
      end: vi.fn((data?: string) => {
        body = data ?? '';
      }),
    } as unknown as ServerResponse;
    const url = new URL('http://localhost/api/contacts/nudges?userId=u1');

    await handleContactsRoutes(req, res, '/api/contacts/nudges', url);

    const raw = JSON.parse(body) as unknown;
    expect(Array.isArray(raw)).toBe(false); // an envelope, not a bare list

    const nudges = parseNudgesResponse(raw);
    expect(nudges).toHaveLength(1);
    expect(nudges[0].contactName).toBe('Marcus');
    expect(nudges[0].reason).toContain('45 days');
    // What the panel does with them must not throw.
    expect(nudges.filter((n) => n.reason.includes('Marcus')).slice(0, 3)).toHaveLength(1);
  });

  it('yields no nudges, rather than crashing, for anything that is not a nudge list', () => {
    expect(parseNudgesResponse({ error: 'Failed' })).toEqual([]);
    expect(parseNudgesResponse(null)).toEqual([]);
  });
});
