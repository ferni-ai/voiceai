/**
 * POST /api/reports: report one of Ferni's replies from inside the app (Google
 * Play AI-generated content policy, Apple guideline 1.2). Called by the web app,
 * the Android TWA and the iPhone app. Any verified Firebase user, anonymous
 * included. Stored text comes from the server transcript only; reports go to
 * admin-only `reply_reports`; logs never carry text. Limits: 5/min per person
 * per instance, 20/day per person across instances.
 *
 * @module api/reply-reports/reply-report-routes
 */
import type { IncomingMessage, ServerResponse } from 'http';
import type { Firestore } from '@google-cloud/firestore';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { rateLimit, requireAuth } from '../auth-middleware.js';
import {
  handleCorsPreflightIfNeeded,
  parseBodyWithSchema,
  sendError,
  sendJSON,
} from '../helpers.js';
import { replyReportBodySchema, toEpochMs, type ReplyReportBody } from './reply-report-input.js';
import { findReportedReply, type ReportedReply } from './reply-report-lookup.js';
import { takeReplyReportQuota } from './reply-report-quota.js';

const log = createLogger({ module: 'ReplyReports' });

export const REPLY_REPORTS_PATH = '/api/reports';
export const REPLY_REPORTS_COLLECTION = 'reply_reports';

export interface ReplyReportCaller {
  userId: string;
  isAnonymous?: boolean;
}

export interface ReplyReportDeps {
  /** Verify the caller, or answer 401 and return null. */
  authenticate: (req: IncomingMessage, res: ServerResponse) => Promise<ReplyReportCaller | null>;
  getDb: () => Firestore | null;
  now: () => number;
}

const defaultDeps: ReplyReportDeps = {
  authenticate: requireAuth,
  getDb: getFirestoreDb,
  now: Date.now,
};

function serverVersion(): string | null {
  return process.env.BUILD_SHA?.trim() || process.env.K_REVISION?.trim() || null;
}

/** The stored report: the reply's text comes only from `reply` (the server's transcript). */
function reportRecord(
  caller: ReplyReportCaller,
  body: ReplyReportBody,
  messageAt: number | null,
  reply: ReportedReply | null,
  now: number
): Record<string, unknown> {
  return {
    uid: caller.userId,
    isAnonymous: caller.isAnonymous === true,
    reason: body.reason,
    note: body.note || null, // an all-blank note is no note
    sessionId: body.sessionId,
    requestedTurnId: body.turnId ?? null,
    messageAt: messageAt === null ? null : new Date(messageAt),
    matched: reply !== null,
    matchedBy: reply?.matchedBy ?? null,
    conversationId: reply?.conversationId ?? null,
    turnId: reply?.turnId ?? null,
    replyText: reply?.replyText ?? null,
    userTurnText: reply?.userTurnText ?? null,
    replyAt: reply?.replyAt == null ? null : new Date(reply.replyAt),
    personaId: reply?.personaId ?? null,
    appVersion: body.appVersion ?? null,
    platform: body.platform ?? null,
    serverVersion: serverVersion(),
    status: 'open',
    createdAt: new Date(now),
  };
}

export async function handleReplyReportRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  deps: ReplyReportDeps = defaultDeps
): Promise<boolean> {
  if (pathname !== REPLY_REPORTS_PATH) return false;
  if (handleCorsPreflightIfNeeded(req, res)) return true;
  if (req.method !== 'POST') {
    sendError(res, 'Method not allowed', 405);
    return true;
  }
  const caller = await deps.authenticate(req, res);
  if (!caller) return true;
  const perPerson = { keyPrefix: 'reply-report', keyGenerator: () => `user:${caller.userId}` };
  if (rateLimit(req, res, { maxRequests: 5, windowMs: 60_000, ...perPerson })) return true;

  const parsed = await parseBodyWithSchema(req, replyReportBodySchema);
  if (!parsed.success) {
    sendError(res, parsed.error, 400);
    return true;
  }
  const body = parsed.data;
  const db = deps.getDb();
  if (!db) {
    sendError(res, 'Reporting is unavailable right now', 503);
    return true;
  }

  try {
    const now = deps.now();
    if (!(await takeReplyReportQuota(db, caller.userId, now))) {
      sendError(res, "You've sent a lot of reports today. Try again tomorrow.", 429);
      return true;
    }
    const messageAt = toEpochMs(body.messageAt);
    const reply = await findReportedReply(db, caller.userId, {
      sessionId: body.sessionId,
      turnId: body.turnId,
      messageAt,
      textHint: body.textHint,
    });
    const ref = db.collection(REPLY_REPORTS_COLLECTION).doc();
    await ref.set(reportRecord(caller, body, messageAt, reply, now));
    log.info(
      {
        reportId: ref.id,
        reason: body.reason,
        matched: reply !== null,
        matchedBy: reply?.matchedBy,
      },
      'Reply reported'
    );
    sendJSON(res, { ok: true, reportId: ref.id, matched: reply !== null }, 201);
  } catch (error) {
    log.error({ error: String(error) }, 'Could not store a reply report');
    sendError(res, 'Could not send the report', 500);
  }
  return true;
}
