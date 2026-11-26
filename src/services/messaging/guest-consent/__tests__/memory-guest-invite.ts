/**
 * Guest invites on in-memory stores, for tests: the invite store (records by key,
 * as guest_invites/{sha256(token)}), the consent store, a clock and owner names.
 *
 * Minting is the invite tool's (task 9c), so tests store an invite the way it
 * will: a random 32-byte token, kept only as its SHA-256, with the guest's
 * number as its keyed hash, good for 7 days.
 */
import { randomBytes } from 'node:crypto';
import { phoneHash, type Env } from '../../../outreach/checkin-replies.js';
import { sha256Hex } from '../../../stores/single-use-records.js';
import type { GuestInvite } from '../domain/guest-invite.js';
import type { GuestInviteStore } from '../ports/guest-invite-store.js';
import type { GuestInviteDeps } from '../use-cases/guest-invite.js';
import { memoryGuestConsentStore } from './memory-guest-consent-store.js';

export const OWNER = 'u-fictional-owner';
export const GUEST = '+15555550123'; // fictional (555-01xx)
export const HASH_KEY = 'test-only-key';
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** A new invite's token and the record stored under sha256(token), as task 9c will make them. */
export function newInvite(
  ownerUid: string,
  e164: string,
  env: Env,
  now: number
): { token: string; key: string; invite: GuestInvite } {
  const hash = phoneHash(e164, env);
  if (!hash) throw new Error('setup: the number could not be keyed');
  const token = randomBytes(32).toString('base64url');
  const invite = {
    uid: ownerUid,
    phoneHash: hash,
    createdAt: now,
    expiresAt: now + INVITE_TTL_MS,
  };
  return { token, key: sha256Hex(token), invite };
}

export interface MemoryGuestInvites {
  invites: Map<string, GuestInvite>;
  consent: ReturnType<typeof memoryGuestConsentStore>;
  /** The time every store and use case sees, in ms; tests move it. */
  clock: { now: number };
  deps: GuestInviteDeps;
  /** Store a new invite for `e164` from `ownerUid` (OWNER, GUEST); its token. */
  mint: (ownerUid?: string, e164?: string) => string;
}

export function memoryGuestInvites(
  names: Record<string, unknown> = { [OWNER]: 'Rowan Ellery' }
): MemoryGuestInvites {
  const invites = new Map<string, GuestInvite>();
  const consent = memoryGuestConsentStore();
  const clock = { now: Date.parse('2026-11-17T09:00:00Z') };
  const env = { LOG_HASH_SECRET: HASH_KEY };
  const store: GuestInviteStore = {
    async putUnlessErased(key, invite) {
      invites.set(key, structuredClone(invite));
      return Promise.resolve(true);
    },
    async get(key) {
      return Promise.resolve(structuredClone(invites.get(key) ?? null));
    },
    async take(key) {
      const invite = invites.get(key) ?? null;
      invites.delete(key);
      return Promise.resolve(invite);
    },
  };
  const deps: GuestInviteDeps = {
    invites: store,
    consent: { store: consent.store, env, now: () => new Date(clock.now) },
    ownerName: async (uid) => Promise.resolve(names[uid]),
    now: () => new Date(clock.now),
  };
  const mint = (ownerUid = OWNER, e164 = GUEST): string => {
    const { token, key, invite } = newInvite(ownerUid, e164, env, clock.now);
    invites.set(key, invite);
    return token;
  };
  return { invites, consent, clock, deps, mint };
}
