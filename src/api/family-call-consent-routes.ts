/**
 * The sponsor's "they're happy to hear from Ferni" switch for one family member.
 *
 * - GET    /api/sponsored-identities/:id/call-consent  → { agreed, source?, consentedAt? }
 * - POST   /api/sponsored-identities/:id/call-consent  → sponsor confirms they agreed
 * - DELETE /api/sponsored-identities/:id/call-consent  → withdraw (no more calls)
 *
 * Only the identity's own sponsor may read or change it. Seth chose (#1558)
 * that the sponsor's confirmation counts as the family member's yes; the
 * family member can still say stop on a call.
 *
 * @module api/family-call-consent-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../utils/safe-logger.js';
import { getSponsoredIdentity } from '../services/identity/sponsored-identity.js';
import type { FamilyConsentStore } from '../services/family/family-call-consent.js';
import { createFamilyConsentStore } from '../services/stores/family-call-consent-store.js';

const log = getLogger().child({ module: 'family-call-consent-routes' });

const ROUTE = /^\/([^/]+)\/call-consent$/;

type Send = (res: ServerResponse, status: number, data: unknown) => void;

/** Handles /:id/call-consent under /api/sponsored-identities. True when handled. */
export async function handleCallConsentRoute(
  req: IncomingMessage,
  res: ServerResponse,
  route: string,
  userId: string,
  send: Send,
  store: FamilyConsentStore = createFamilyConsentStore()
): Promise<boolean> {
  const match = route.match(ROUTE);
  if (!match || !['GET', 'POST', 'DELETE'].includes(req.method ?? '')) return false;
  const identityId = match[1];

  const identity = await getSponsoredIdentity(identityId);
  if (!identity || identity.sponsorUserId !== userId) {
    send(res, 404, { error: 'Identity not found or not authorized' });
    return true;
  }

  if (req.method === 'POST' || req.method === 'DELETE') {
    const now = new Date();
    const saved =
      req.method === 'POST'
        ? await store.record(identityId, 'sponsor_confirmed', now)
        : await store.withdraw(identityId, now);
    if (!saved) {
      send(res, 503, { error: 'Could not save, try again' });
      return true;
    }
    log.info({ identityId, userId, method: req.method }, 'Sponsor changed family call consent');
  }

  const consent = await store.get(identityId);
  const agreed = !!consent?.consentedAt && !consent.withdrawnAt;
  send(res, 200, {
    agreed,
    source: agreed ? consent?.source : undefined,
    consentedAt: agreed ? consent?.consentedAt : undefined,
  });
  return true;
}
