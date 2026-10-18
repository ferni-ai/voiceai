/**
 * The waitlist queue: one line, on the existing `waitlist` collection, that
 * waves let in 100 at a time (decided 2026-10-18).
 *
 * Order is lane first (vip, then friends, then standard), then the effective
 * join time: joinedAt minus 3 days for each friend who joined and verified,
 * counting at most 5. A time boost is stable and explainable; "N places" would
 * reshuffle everyone. Only verified people are in the line: a wave can't let in
 * an address nobody has proven they own.
 *
 * Each doc carries three derived fields so Firestore can order and count it
 * with one index (inQueue, laneRank, priorityKey): see queueFields().
 *
 * @module services/waitlist/queue
 */
import { randomInt } from 'crypto';
import { DISPOSABLE_DOMAINS } from './disposable-domains.js';

export type Lane = 'vip' | 'friends' | 'standard';
export const LANE_RANK: Readonly<Record<Lane, number>> = { vip: 0, friends: 1, standard: 2 };
export const REFERRAL_BOOST_DAYS = 3;
export const MAX_CREDITED_REFERRALS = 5;
const DAY_MS = 86_400_000;

/** Waiting for a seat: new, or back in line after a seat lapsed. No status = a legacy pending doc. */
export const WAITING_STATUSES: ReadonlySet<string> = new Set(['pending', 'lapsed', '']);
/** In: approved before waves, admitted by a wave, or admitted and signed in. */
export const ADMITTED_STATUSES: ReadonlySet<string> = new Set(['approved', 'admitted', 'joined']);

const GMAIL = new Set(['gmail.com', 'googlemail.com']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' && email.length <= 254 && EMAIL.test(email.trim());
}

/**
 * One address per person: lowercased, a `+tag` dropped, and for Gmail the
 * dots too (j.doe+x@gmail.com and jdoe@googlemail.com are the same inbox).
 */
export function canonicalEmail(email: string): string {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf('@');
  const domain = lower.slice(at + 1);
  const local = lower.slice(0, at).split('+')[0] ?? '';
  return GMAIL.has(domain) ? `${local.replace(/\./g, '')}@gmail.com` : `${local}@${domain}`;
}

/** A throwaway inbox (the domain or any subdomain of one on the static list). */
export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@').pop() ?? '';
  const parts = domain.split('.');
  return parts.some((_, i) => DISPOSABLE_DOMAINS.has(parts.slice(i).join('.')));
}

/** Effective join time in ms: earlier for each verified friend, at most MAX_CREDITED_REFERRALS. */
export function priorityKey(joinedAtMs: number, verifiedReferrals: number): number {
  const credited = Math.min(Math.max(verifiedReferrals, 0), MAX_CREDITED_REFERRALS);
  return joinedAtMs - credited * REFERRAL_BOOST_DAYS * DAY_MS;
}

/** A waitlist doc as the queue sees it; tolerant of docs written before waves. */
export interface QueueEntry {
  id: string;
  email: string;
  emailCanonical: string;
  status: string;
  lane: Lane;
  joinedAtMs: number;
  verified: boolean;
  inviteCode?: string;
  referredBy?: string;
  verifiedReferrals: number;
  referralCredited: boolean;
  admittedAt?: Date;
  seatExpiresAt?: Date;
  foundingWave?: number;
}

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  const ts = value as { toDate?: () => Date } | null;
  if (typeof ts?.toDate === 'function') return ts.toDate();
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

export function readEntry(id: string, data: Record<string, unknown>): QueueEntry {
  const email = str(data.email) ?? '';
  const lane = (['vip', 'friends', 'standard'] as const).find((l) => l === data.lane) ?? 'standard';
  const joined = toDate(data.joinedAt) ?? toDate(data.createdAt) ?? toDate(data.timestamp);
  return {
    id,
    email,
    emailCanonical: str(data.emailCanonical) ?? canonicalEmail(email),
    status: str(data.status) ?? '',
    lane,
    joinedAtMs: joined?.getTime() ?? 0,
    verified: toDate(data.verifiedAt) !== undefined,
    inviteCode: str(data.inviteCode),
    referredBy: str(data.referredBy) ?? str(data.referralCode), // referralCode: kept for seeds (waitlist-record.ts)
    verifiedReferrals: typeof data.verifiedReferrals === 'number' ? data.verifiedReferrals : 0,
    referralCredited: data.referralCredited === true,
    admittedAt: toDate(data.admittedAt),
    seatExpiresAt: toDate(data.seatExpiresAt),
    foundingWave: typeof data.foundingWave === 'number' ? data.foundingWave : undefined,
  };
}

/** The derived fields that place a doc in the line. Write them with every queue change. */
export function queueFields(
  e: Pick<QueueEntry, 'status' | 'lane' | 'joinedAtMs' | 'verified' | 'verifiedReferrals'>
): { inQueue: boolean; laneRank: number; priorityKey: number } {
  // prettier-ignore
  return {
    inQueue: e.verified && WAITING_STATUSES.has(e.status),
    laneRank: LANE_RANK[e.lane],
    priorityKey: priorityKey(e.joinedAtMs, e.verifiedReferrals),
  };
}

const INVITE_WORDS = ['sunrise', 'garden', 'bloom', 'river', 'forest', 'meadow', 'willow', 'cedar', 'fern', 'grove']; // prettier-ignore
const CODE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** `k3j9x2-meadow`: the pattern the /grow/ links and REFERRAL_CODE_PATTERN already accept. */
export function newInviteCode(): string {
  const prefix = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
  return `${prefix}-${INVITE_WORDS[randomInt(INVITE_WORDS.length)]}`;
}

export const INVITE_CODE_PATTERN = /^[a-z0-9]{6}-[a-z]+$/;

export function referralUrl(code: string): string {
  return `https://ferni.ai/?ref=${code}`;
}
