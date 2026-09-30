/**
 * Outreach API route types. Extracted from outreach.routes.ts.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { AuthContext } from '../auth-middleware.js';

/** Request context shared by the authenticated outreach sub-handlers */
export interface OutreachRouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  method: string;
  route: string;
  auth: AuthContext;
  authenticatedUserId: string;
  fromScheduler: boolean;
}

/** Context for Twilio call callbacks (signed by Twilio, before user auth) */
export interface TwilioCallbackContext {
  res: ServerResponse;
  method: string;
  route: string;
  twilioParams: Record<string, string>;
}
