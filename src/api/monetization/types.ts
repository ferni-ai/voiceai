/**
 * Monetization API route types. Extracted from monetization-routes.ts.
 */

export interface RequestContext {
  method: string;
  pathname: string;
  query: Record<string, string>;
  body?: unknown;
  /** Raw request body (needed to verify Stripe webhook signatures) */
  rawBody?: string;
  headers: Record<string, string | string[] | undefined>;
  /**
   * Authenticated user ID from Firebase auth (SECURITY: use this instead of query params)
   * Only populated after proper authentication via requireAuth middleware.
   */
  authUserId?: string;
  /** Whether the authenticated user is an admin */
  isAdmin?: boolean;
}

export interface ResponseContext {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export type RouteHandler = (ctx: RequestContext) => Promise<ResponseContext>;
