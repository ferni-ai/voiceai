/**
 * What a client sends to report one of Ferni's replies (POST /api/reports).
 *
 * The client names the reply (the call it is in, plus the reply's turn id or
 * the time it was shown) but never supplies the text that gets stored: the
 * server copies that from its own transcript (reply-report-lookup.ts). An
 * optional `textHint` (the words on screen) only helps pick between replies
 * close together in time; it is never stored or logged.
 *
 * @module api/reply-reports/reply-report-input
 */
import { z } from 'zod';

export const REPLY_REPORT_REASONS = ['harmful', 'wrong', 'inappropriate', 'other'] as const;
export type ReplyReportReason = (typeof REPLY_REPORT_REASONS)[number];

export const REPLY_REPORT_NOTE_MAX = 500;

const id = z.string().trim().min(1).max(200);

export const replyReportBodySchema = z
  .object({
    /** The call the reply is from: the LiveKit room name, or a stored conversation id. */
    sessionId: id,
    /** A stored turn id (bogle_users/{uid}/conversations/{id}/turns/{turnId}), when known. */
    turnId: id.optional(),
    /** When the reply was shown, epoch ms or ISO 8601. */
    messageAt: z.union([z.number(), z.string().max(40)]).optional(),
    reason: z.enum(REPLY_REPORT_REASONS),
    note: z.string().trim().max(REPLY_REPORT_NOTE_MAX).optional(),
    /** Words on screen, to tell nearby replies apart. Not stored. */
    textHint: z.string().max(400).optional(),
    appVersion: z.string().trim().max(40).optional(),
    platform: z.enum(['web', 'android', 'ios']).optional(),
  })
  .refine((b) => b.turnId !== undefined || b.messageAt !== undefined, {
    message: 'turnId or messageAt is required',
    path: ['messageAt'],
  });

export type ReplyReportBody = z.infer<typeof replyReportBodySchema>;

/** epoch ms from a number or ISO string; null when it isn't a real time. */
export function toEpochMs(value: number | string | undefined): number | null {
  if (value === undefined) return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}
