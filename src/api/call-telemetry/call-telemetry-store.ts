/**
 * CALL_TELEMETRY (off by default: off | reports | on) and the felt-off record,
 * kept in admin-only `call_felt_off` with its quota in `call_felt_off_quota`;
 * both are erased with the account (services/platform/user-stores.ts).
 *
 * @module api/call-telemetry/call-telemetry-store
 */
import type { FeltOffBody } from './call-telemetry-input.js';

export type CallTelemetryMode = 'off' | 'reports' | 'on';

export const COLLECTION = 'call_felt_off';
export const QUOTA_COLLECTION = 'call_felt_off_quota';
export const PER_DAY = 20;
/** Raw reports are kept 30 days (the TTL sweep that enforces it is a later PR). */
export const FELT_OFF_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

export function callTelemetryMode(env: NodeJS.ProcessEnv = process.env): CallTelemetryMode {
  const mode = env.CALL_TELEMETRY?.trim().toLowerCase();
  return mode === 'on' || mode === 'reports' ? mode : 'off';
}

/**
 * The validated body's numbers and enums, the uid from the verified token, and
 * the note only when it says something. Raw room names stay so triage can find
 * the call in Cloud Logging.
 */
export function feltOffRecord(
  uid: string,
  body: FeltOffBody,
  roomVerified: boolean,
  now: number
): Record<string, unknown> {
  const { kind: _kind, schema: _schema, note, ...measured } = body;
  return {
    uid,
    ...measured,
    roomVerified,
    ...(note?.trim() ? { note: note.trim() } : {}),
    appBuild: body.summarySoFar.build.appBuild,
    serverVersion: process.env.BUILD_SHA?.trim() || process.env.K_REVISION?.trim() || null,
    status: 'open',
    createdAt: new Date(now),
    expiresAt: new Date(now + FELT_OFF_KEEP_MS),
  };
}
