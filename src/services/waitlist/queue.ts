/**
 * The waitlist queue (waves of 100, 2026-10-18): lane (vip, friends, standard), then join time
 * less 3 days per verified friend, at most 5. Only verified people are in line; derived fields
 * let one index (inQueue, laneRank, priorityKey) order and count it.
 * @module services/waitlist/queue
 */
import { randomInt } from 'crypto';
import { DISPOSABLE_DOMAINS, RELAY_DOMAINS } from './disposable-domains.js';

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

const inList = (list: ReadonlySet<string>, email: string): boolean => {
  const parts = (email.trim().toLowerCase().split('@').pop() ?? '').split('.');
  return parts.some((_, i) => list.has(parts.slice(i).join('.'))); // the domain or a subdomain
};
/** A throwaway inbox: refused. */
export const isDisposableEmail = (email: string): boolean => inList(DISPOSABLE_DOMAINS, email);
/** A forwarding relay (Hide My Email, Firefox Relay, ...): may join, earns no referral credit. */
export const isRelayEmail = (email: string): boolean => inList(RELAY_DOMAINS, email);

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
  const ts = value as { toDate?: () => Date } | null;
  if (value instanceof Date || typeof ts?.toDate === 'function') return value instanceof Date ? value : ts!.toDate!(); // prettier-ignore
  const d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : undefined;
  return d && !Number.isNaN(d.getTime()) ? d : undefined;
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
