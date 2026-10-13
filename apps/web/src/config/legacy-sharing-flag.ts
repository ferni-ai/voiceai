/**
 * Family sharing for a Legacy friend. Off by default.
 *
 * Nothing backs it yet: no endpoint sends an invite, nothing stores who a
 * Legacy friend is shared with, and the /legacy/invite/<id> link the modal
 * builds has no route. The modal used to log the invitee's email and then say
 * "Invite sent". While off, the Share button is not drawn and openLegacyShare
 * opens nothing. Turn it on with `VITE_LEGACY_SHARING=true` once invites are
 * really sent.
 */
export function isLegacySharingOn(): boolean {
  return import.meta.env.VITE_LEGACY_SHARING === 'true';
}
