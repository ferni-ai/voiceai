/**
 * Where guests' invites are kept, under their token's SHA-256, used at most once.
 *
 * @module services/messaging/guest-consent/ports/guest-invite-store
 */
import type { GuestInvite } from '../domain/guest-invite.js';

export interface GuestInviteStore {
  /** Put back an invite just taken, unless the owner's account is gone or being erased. */
  putUnlessErased: (key: string, invite: GuestInvite) => Promise<boolean>;
  get: (key: string) => Promise<GuestInvite | null>;
  /** Read and delete in one transaction, so of two answers racing only one gets the invite. */
  take: (key: string) => Promise<GuestInvite | null>;
}
