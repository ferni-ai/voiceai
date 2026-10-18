/**
 * How speech-to-text mishears Ferni's name. One list for the transcript fix
 * (agents/personas/name-mishear.ts) and the outbound confirm gate's yes check
 * (tools/domains/communication/outreach/outreach-confirm.ts).
 *
 * @module utils/ferni-name-mishears
 */

/** Heard on prod calls for "Ferni" (2026-10-12: "How are you doing, Freddy?", "Hey, Fern."). */
export const FERNI_NAME_MISHEARS = ['freddy', 'fernie', 'ferny', 'furny', 'fern'] as const;

/**
 * Also heard for "Ferni" inside a yes (prod 2026-10-18: "Uh, go ahead, Fred."
 * placed no call). Only the yes check uses these: alone in a yes they can only
 * be the name, but in other speech "Fred" is as likely a real person.
 */
export const FERNI_YES_MISHEARS = [...FERNI_NAME_MISHEARS, 'fred', 'freddie'] as const;
