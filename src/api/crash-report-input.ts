/**
 * What a client may post to /api/crash-report and /api/disconnect-diagnostic.
 *
 * A crash can happen before sign-in, so posts carry no auth: every field is
 * typed here, text is cut to its cap (a long error message keeps the report),
 * null reads as absent (the web client sends userId: null before sign-in),
 * unknown fields are dropped, and the whole body is capped while it streams. Reading what was stored is admin-only
 * (crash-report-routes.ts).
 *
 * @module api/crash-report-input
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { z, type ZodSchema } from 'zod';
import { BodyTooLargeError } from './bounded-body.js';
import { parseBody, sendError } from './helpers.js';

/** Largest body either route reads; past it the request is answered 413. */
export const CRASH_REPORT_MAX_BODY_BYTES = 64 * 1024;
/** Largest `customData`, measured as JSON. */
export const CRASH_CUSTOM_DATA_MAX_CHARS = 4000;

const text = (max: number) => z.string().transform((s) => s.slice(0, max));
const optText = (max: number) =>
  text(max)
    .nullable()
    .transform((s) => s ?? undefined)
    .optional();
// JSON turns NaN into null, so a browser measurement may arrive as null.
const optNum = z.number().finite().nullish();
const count = z.number().int().min(0).max(1_000_000);

export const crashReportBodySchema = z.object({
  errorName: text(200),
  errorMessage: text(2000),
  errorStack: optText(16_000),
  sessionId: optText(200),
  roomName: optText(200),
  userId: optText(200),
  personaId: optText(100),
  connectionState: z.enum(['connecting', 'connected', 'reconnecting', 'disconnected']).optional(),
  lastActivity: optText(40),
  turnCount: count.optional(),
  lastUserMessage: optText(500),
  userAgent: optText(1000),
  url: optText(2000),
  timestamp: optText(40),
  connectionType: optText(40),
  effectiveType: optText(40),
  downlink: optNum,
  rtt: optNum,
  customData: z
    .record(z.string(), z.unknown())
    .refine((d) => JSON.stringify(d).length <= CRASH_CUSTOM_DATA_MAX_CHARS, {
      message: `must be at most ${CRASH_CUSTOM_DATA_MAX_CHARS} characters as JSON`,
    })
    .optional(),
});

export type FrontendCrashReport = z.infer<typeof crashReportBodySchema>;

export const disconnectDiagnosticBodySchema = z.object({
  timestamp: text(40),
  sessionDurationMs: z.number().finite().min(0),
  timeSinceLastActivityMs: z.number().finite(),
  livekitReason: optText(200),
  livekitRoomState: optText(40),
  livekitConnectionState: optText(40),
  wasGraceful: z.boolean(),
  iceConnectionState: optText(40),
  iceGatheringState: optText(40),
  signalingState: optText(40),
  rtcStats: z
    .object({
      packetsLost: optNum,
      packetsReceived: optNum,
      bytesReceived: optNum,
      jitter: optNum,
      roundTripTime: optNum,
      fractionLost: optNum,
    })
    .optional(),
  micEnabled: z.boolean().optional(),
  micTrackState: optText(40),
  audioOutputState: optText(40),
  audioContextState: optText(40),
  networkType: optText(40),
  effectiveType: optText(40),
  downlinkMbps: optNum,
  rttMs: optNum,
  isOnline: z.boolean(),
  wasOfflineRecently: z.boolean(),
  visibilityState: text(40),
  wasBackgroundedRecently: z.boolean(),
  backgroundDurationMs: optNum,
  isMuted: z.boolean(),
  personaId: optText(100),
  turnCount: count,
  userAgent: text(1000),
  platform: text(100),
  deviceMemory: optNum,
  hardwareConcurrency: optNum,
  lastError: optText(2000),
  errorStack: optText(16_000),
  sessionId: optText(200),
  roomName: optText(200),
  userId: optText(200),
  fromStorage: z.boolean().optional(),
});

export type DisconnectDiagnostic = z.infer<typeof disconnectDiagnosticBodySchema>;

/**
 * The validated body, or null once the request has been answered: 413 over the
 * byte cap, 400 for bad JSON or a body the schema refuses.
 */
export async function readValidatedBody<T>(
  req: IncomingMessage,
  res: ServerResponse,
  schema: ZodSchema<T>
): Promise<T | null> {
  let raw: unknown;
  try {
    raw = await parseBody(req, { maxBytes: CRASH_REPORT_MAX_BODY_BYTES });
  } catch (error) {
    if (!res.headersSent) {
      const tooLarge = error instanceof BodyTooLargeError;
      sendError(
        res,
        tooLarge ? 'Request body too large' : 'Invalid JSON body',
        tooLarge ? 413 : 400
      );
    }
    return null;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    sendError(res, `Invalid request body: ${issues.join('; ')}`, 400);
    return null;
  }
  return parsed.data;
}
