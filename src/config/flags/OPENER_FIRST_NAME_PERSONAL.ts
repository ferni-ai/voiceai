import type { FlagSpec } from '../flag-spec.js';

// On: a personal or family call Ferni places for a user names them by first name, "it's Ferni, Sam's AI friend", not the full stored name; the name dispatched is the preferred name when one is set (utils/ferni-intro.ts openerSponsorName). A call that isn't personal (business, healthcare, restaurant, emergency, or no type) keeps the full name. Off (the kill switch): main's opener, byte for byte. Default on since 2026-11-07 (Seth: "Personal: first name").
export const OPENER_FIRST_NAME_PERSONAL = {
  default: 'on',
  owner: 'outreach',
  kind: 'kill-switch',
  issue: 'TBD',
  context:
    'Kill-switch: personal calls say less of the user name than before, never more; remove after a prod soak with no complaint.',
} as const satisfies FlagSpec;
