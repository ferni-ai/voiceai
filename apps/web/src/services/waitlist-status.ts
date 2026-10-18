/**
 * Waitlist status: where a signed-in person stands in line.
 *
 * The shape is the shared waitlist contract (GET /api/waitlist/me, and the
 * body of a 403 { code: 'WAITLISTED' } from /token when the gate is on), so
 * the waiting screen can show position, waves away and the invite link from
 * either answer without asking twice.
 */

import { apiGet } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('WaitlistStatus');

export interface WaitlistStatus {
  status: 'waiting' | 'admitted' | 'expired' | 'not_joined';
  position: number | null;
  wavesAway: number | null;
  nextWaveAt: string | null;
  referralUrl: string | null;
  referrals: { verified: number; creditedDays: number; max: number };
  admittedAt: string | null;
  seatExpiresAt: string | null;
  foundingMember: boolean;
  foundingWave: number | null;
}

const STATUSES = new Set(['waiting', 'admitted', 'expired', 'not_joined']);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** Read a contract body defensively; null when it isn't one. */
export function parseWaitlistStatus(body: unknown): WaitlistStatus | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b['status'] !== 'string' || !STATUSES.has(b['status'])) return null;
  const r = (b['referrals'] ?? {}) as Record<string, unknown>;
  const referralUrl = str(b['referralUrl']);
  return {
    status: b['status'] as WaitlistStatus['status'],
    position: num(b['position']),
    wavesAway: num(b['wavesAway']),
    nextWaveAt: str(b['nextWaveAt']),
    // Only https links go on a share button
    referralUrl: referralUrl && /^https:\/\//.test(referralUrl) ? referralUrl : null,
    referrals: {
      verified: num(r['verified']) ?? 0,
      creditedDays: num(r['creditedDays']) ?? 0,
      max: num(r['max']) ?? 5,
    },
    admittedAt: str(b['admittedAt']),
    seatExpiresAt: str(b['seatExpiresAt']),
    foundingMember: b['foundingMember'] === true,
    foundingWave: num(b['foundingWave']),
  };
}

/** A /token refusal that means "not yet, you're in line" (status 403, code WAITLISTED). */
export function waitlistFromRefusal(status: number, bodyText: string): WaitlistStatus | null {
  if (status !== 403) return null;
  try {
    const body = JSON.parse(bodyText) as Record<string, unknown>;
    return body['code'] === 'WAITLISTED' ? parseWaitlistStatus(body) : null;
  } catch {
    return null;
  }
}

/** GET /api/waitlist/me; null when it can't be read (the gate keeps its plain notice). */
export async function fetchWaitlistStatus(): Promise<WaitlistStatus | null> {
  const response = await apiGet<unknown>('/api/waitlist/me', undefined, { maxRetries: 1 });
  if (!response.ok) {
    log.warn('Waitlist status unavailable', { status: response.status });
    return null;
  }
  return parseWaitlistStatus(response.data);
}
