/**
 * A guest's answer to an invite to be called into someone's calls. Public: the
 * only credential is the invite's token, texted to her.
 *
 * - POST /api/guest-invite        { token } → { ownerFirstName, wording, wordingVersion }
 * - POST /api/guest-invite/yes    { token } → { ok: true }: her consent, stamped by us
 * - POST /api/guest-invite/no     { token } → { ok: true }: records nothing
 * - POST /api/guest-invite/forget { token } → { ok: true }: deletes her consent
 *
 * The token rides in the body, as connect invites' does (oauth-start.ts): paths
 * are logged (Cloud Run, the rate limiter). Other body fields are ignored. Every
 * token that can't be used gets one 404, so no reply says which tokens exist.
 *
 * @module api/guest-invite-routes
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { z } from 'zod';
import {
  answerGuestInvite,
  viewGuestInvite,
  type GuestInviteAnswer,
  type GuestInviteView,
} from '../services/messaging/guest-consent/index.js';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit } from './auth-middleware.js';
import {
  handleCorsPreflightIfNeeded,
  parseBodyWithSchema,
  sendError,
  sendJSON,
} from './helpers.js';

const log = createLogger({ module: 'GuestInviteRoutes' });

const GUEST_INVITE_PATH = '/api/guest-invite';
/** The one refusal for every token that can't be used. */
const INVITE_NOT_VALID = "This link isn't valid any more.";

const ANSWERS: ReadonlyMap<string, GuestInviteAnswer> = new Map([
  [`${GUEST_INVITE_PATH}/yes`, 'yes'],
  [`${GUEST_INVITE_PATH}/no`, 'no'],
  [`${GUEST_INVITE_PATH}/forget`, 'forget'],
]);

const bodySchema = z.object({ token: z.string().max(100) });

export interface GuestInviteRouteDeps {
  view: (token: unknown) => Promise<GuestInviteView | null>;
  answer: (token: unknown, answer: GuestInviteAnswer) => Promise<boolean>;
}

const defaultDeps: GuestInviteRouteDeps = { view: viewGuestInvite, answer: answerGuestInvite };

export async function handleGuestInviteRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  deps: GuestInviteRouteDeps = defaultDeps
): Promise<boolean> {
  const answer = ANSWERS.get(pathname);
  if (pathname !== GUEST_INVITE_PATH && !answer) return false;
  if (handleCorsPreflightIfNeeded(req, res)) return true;
  if (rateLimit(req, res, { maxRequests: 20, windowMs: 60_000, keyPrefix: 'guest-invite' })) {
    return true;
  }
  if (req.method !== 'POST') {
    sendError(res, 'Method not allowed', 405);
    return true;
  }
  const parsed = await parseBodyWithSchema(req, bodySchema);
  const token = parsed.success ? parsed.data.token : undefined;
  try {
    const reply = answer
      ? (await deps.answer(token, answer)) && { ok: true }
      : await deps.view(token);
    if (reply !== false && reply !== null) sendJSON(res, reply);
    else sendError(res, INVITE_NOT_VALID, 404);
  } catch (error) {
    log.error({ error: String(error), answer: answer ?? 'view' }, 'Guest invite not handled');
    sendError(res, "That didn't save. Please try again.", 503);
  }
  return true;
}
