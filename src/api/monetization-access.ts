/**
 * Who a monetization request may act for, and who may read an organization.
 *
 * The monetization router only runs optional auth, and the request-identity
 * door rewrites the query and headers but not the body. So a write acts for
 * the verified caller alone: without a token it answers 401, and a body that
 * names someone else is refused with 403 rather than quietly re-attributed, so
 * a confused client fails loudly. Nobody, admins included, pays or records
 * activity as another user. A few writes name no subject but still need a
 * verified caller, because they move shared state (partner quality scores) or
 * answer about a payment, so an anonymous request can't drive them.
 *
 * @module api/monetization-access
 */
import { b2bLicensing } from '../services/monetization/b2b-licensing.js';

interface Ctx {
  method: string;
  pathname: string;
  query: Record<string, string>;
  body?: unknown;
  authUserId?: string;
  isAdmin?: boolean;
}

interface Answer {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

const json = (status: number, body: unknown): Answer => ({
  status,
  headers: { 'Content-Type': 'application/json' },
  body,
});

/** POST routes that act for one user, and the body field that used to name them */
const SUBJECT_FIELD: Record<string, string> = {
  '/api/monetization/tip': 'userId',
  '/api/monetization/value/detect': 'userId',
  '/api/monetization/value/contribute': 'userId',
  '/api/monetization/fund/contribute': 'userId',
  '/api/monetization/partners/click': 'userId',
  '/api/monetization/journey/companion': 'userId',
  '/api/monetization/journey/record': 'userId',
  '/api/monetization/journey/celebrate': 'userId',
  '/api/monetization/b2b/invite': 'invitedBy',
  '/api/monetization/b2b/organization': 'adminUserId',
};

/** POST routes that name no subject but still need a verified caller */
const CALLER_REQUIRED = new Set([
  '/api/monetization/tip/complete',
  '/api/monetization/partners/recommend',
  '/api/monetization/partners/feedback',
]);

/**
 * The refusal for a write that has no verified caller, or whose body names
 * someone other than the caller; null when the handler may act for
 * `ctx.authUserId`.
 */
export function refuseUnverifiedWrite(ctx: Ctx): Answer | null {
  if (ctx.method !== 'POST') return null;
  if (CALLER_REQUIRED.has(ctx.pathname)) {
    return ctx.authUserId ? null : json(401, { error: 'Authentication required' });
  }
  if (!Object.hasOwn(SUBJECT_FIELD, ctx.pathname)) return null;
  if (!ctx.authUserId) return json(401, { error: 'Authentication required' });
  const field = SUBJECT_FIELD[ctx.pathname] as string;
  const named =
    ctx.body !== null && typeof ctx.body === 'object'
      ? (ctx.body as Record<string, unknown>)[field]
      : undefined;
  if (named !== undefined && named !== null && named !== '' && named !== ctx.authUserId) {
    return json(403, { error: 'You can only act for yourself' });
  }
  return null;
}

/**
 * GET /api/monetization/b2b/organization?orgId=
 *
 * Members and platform admins only. An org the caller can't see answers
 * exactly like one that doesn't exist, so the 404 reveals nothing.
 */
export async function getOrganization(ctx: Ctx): Promise<Answer> {
  const userId = ctx.authUserId;
  if (!userId) return json(401, { error: 'Authentication required' });

  const { orgId } = ctx.query;
  if (!orgId) return json(400, { error: 'orgId is required' });

  const org = b2bLicensing.getOrganization(orgId);
  if (!org || !(ctx.isAdmin || org.memberUserIds.includes(userId))) {
    return json(404, { error: 'Organization not found' });
  }

  return json(200, {
    organization: org,
    isAdmin: b2bLicensing.isOrgAdmin(userId, orgId),
    usageStats: b2bLicensing.getOrgUsageStats(orgId),
    roiEstimate: b2bLicensing.getROIEstimate(org),
    onboardingChecklist: b2bLicensing.getOnboardingChecklist(org),
  });
}
