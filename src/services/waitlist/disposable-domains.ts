/**
 * Throwaway-inbox domains the waitlist refuses, so one person can't hold many
 * places or farm referral credit: a speed bump, not a wall (verification is).
 *
 * @module services/waitlist/disposable-domains
 */
export const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set(
  `10minutemail.com 20minutemail.com 33mail.com burnermail.io discard.email dispostable.com
  dropmail.me emailondeck.com fakeinbox.com getairmail.com getnada.com guerrillamail.biz
  guerrillamail.com guerrillamail.de guerrillamail.info guerrillamail.net guerrillamail.org
  guerrillamailblock.com harakirimail.com inboxkitten.com mail.tm maildrop.cc mailinator.com
  mailinator.net mailnesia.com mailsac.com mintemail.com moakt.com mohmal.com mytemp.email
  nada.email sharklasers.com spam4.me spamgourmet.com temp-mail.io temp-mail.org tempail.com
  tempmail.com tempmail.dev tempmailo.com tempr.email throwawaymail.com trashmail.com
  trashmail.de yopmail.com yopmail.fr yopmail.net`.split(/\s+/)
);

/** Forwarding inboxes: real people use them, so they may join, but one person can mint many. */
export const RELAY_DOMAINS: ReadonlySet<string> = new Set(
  'duck.com mozmail.com privaterelay.appleid.com addy.io anonaddy.me anonaddy.com'.split(' ')
);
