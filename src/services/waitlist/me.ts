/**
 * What a person sees of their own place in line: the shape GET /api/waitlist/me
 * and POST /api/waitlist/join return, agreed with the waiting screens
 * (2026-10-18). Never a total, never anyone else's place.
 *
 * @module services/waitlist/me
 */
import { findEntry, positionOf } from './join.js';
import {
  ADMITTED_STATUSES,
  MAX_CREDITED_REFERRALS,
  REFERRAL_BOOST_DAYS,
  referralUrl,
  type QueueEntry,
} from './queue.js';
import { nextWaveAt, type WaitlistSettings } from './settings.js';
import type { WaitlistStore } from './store.js';

/** The waiting-screen contract: field names and nulls are load-bearing. */
export interface WaitlistMe {
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

export function meView(
  e: QueueEntry | null,
  position: number | null,
  settings: WaitlistSettings,
  now: Date
): WaitlistMe {
  const admitted = !!e && ADMITTED_STATUSES.has(e.status);
  const status = !e ? 'not_joined' : admitted ? 'admitted' : e.status === 'lapsed' ? 'expired' : 'waiting'; // prettier-ignore
  const verified = e?.verifiedReferrals ?? 0;
  const place = admitted ? null : position;
  return {
    status,
    position: place,
    wavesAway: place === null ? null : Math.ceil(place / settings.waveSize),
    nextWaveAt: admitted ? null : nextWaveAt(settings.cadence, now).toISOString(),
    referralUrl: e?.inviteCode ? referralUrl(e.inviteCode) : null,
    referrals: {
      verified,
      creditedDays: Math.min(verified, MAX_CREDITED_REFERRALS) * REFERRAL_BOOST_DAYS,
      max: MAX_CREDITED_REFERRALS,
    },
    admittedAt: admitted ? (e.admittedAt?.toISOString() ?? null) : null,
    seatExpiresAt: e?.status === 'admitted' ? (e.seatExpiresAt?.toISOString() ?? null) : null,
    foundingMember: admitted,
    foundingWave: admitted ? (e.foundingWave ?? null) : null,
  };
}

export async function meFor(
  store: WaitlistStore,
  email: string,
  now: Date,
  uid?: string
): Promise<WaitlistMe> {
  // prettier-ignore
  const entry = await findEntry(store, email, uid);
  const position = entry ? await positionOf(store, entry) : null;
  return meView(entry, position, await store.settings(), now);
}
