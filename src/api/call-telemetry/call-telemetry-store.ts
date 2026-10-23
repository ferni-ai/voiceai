/**
 * Where call telemetry goes, and whether it is taken at all.
 *
 * CALL_TELEMETRY (off by default): `off` stores nothing (the route answers 404),
 * `reports` takes "That felt off" reports only, `on` takes summaries too.
 * Felt-off reports go to the admin-only Firestore collection `call_felt_off`
 * (firestore.rules denies every client read and write by default), with a daily
 * per-person quota in `call_felt_off_quota`. Both are in the account-deletion
 * list (services/platform/user-stores.ts).
 *
 * @module api/call-telemetry/call-telemetry-store
 */
import type { FeltOffBody } from './call-telemetry-input.js';

export type CallTelemetryMode = 'off' | 'reports' | 'on';

export const FELT_OFF_COLLECTION = 'call_felt_off';
export const FELT_OFF_QUOTA_COLLECTION = 'call_felt_off_quota';
export const FELT_OFF_PER_DAY = 20;
/** Raw felt-off records are kept 30 days (the TTL sweep that enforces it is a later PR). */
export const FELT_OFF_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

export function callTelemetryMode(env: NodeJS.ProcessEnv = process.env): CallTelemetryMode {
  const mode = env.CALL_TELEMETRY?.trim().toLowerCase();
  return mode === 'on' || mode === 'reports' ? mode : 'off';
}

function serverVersion(): string | null {
  return process.env.BUILD_SHA?.trim() || process.env.K_REVISION?.trim() || null;
}

/**
 * The stored felt-off record: the validated body's numbers and enums, the
 * caller's uid from the verified token, and the note only when it says something.
 * The raw room names stay so triage can find the call in Cloud Logging.
 */
export function feltOffRecord(
  uid: string,
  body: FeltOffBody,
  roomVerified: boolean,
  now: number
): Record<string, unknown> {
  const note = body.note?.trim();
  return {
    uid,
    rooms: body.rooms,
    roomVerified,
    tapAt: body.tapAt,
    ...(body.sinceLiveMs === undefined ? {} : { sinceLiveMs: body.sinceLiveMs }),
    ...(body.tapAgainMs === undefined ? {} : { tapAgainMs: body.tapAgainMs }),
    ring: body.ring,
    summarySoFar: body.summarySoFar,
    ...(note ? { note } : {}),
    appBuild: body.summarySoFar.build.appBuild,
    serverVersion: serverVersion(),
    status: 'open',
    createdAt: new Date(now),
    expiresAt: new Date(now + FELT_OFF_KEEP_MS),
  };
}
