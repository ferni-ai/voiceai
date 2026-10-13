/**
 * The Venmo chip-in switch (#1014, #1031): while Ferni is free, every ask for
 * money becomes "chip in on Venmo" and there are no paid plans to offer.
 *
 * On with VITE_VENMO_CHIP_IN=true and a valid VITE_VENMO_HANDLE. Lives in
 * config so services (team unlock hints) and UI read the same switch.
 *
 * @module config/venmo-chip-in
 */

/** Venmo usernames: letters, digits, hyphens and underscores. */
const HANDLE_PATTERN = /^[A-Za-z0-9_-]{1,30}$/;

/** The configured Venmo handle without the @, or null when unset or malformed. */
export function getVenmoHandle(): string | null {
  const raw = String(import.meta.env.VITE_VENMO_HANDLE ?? '')
    .trim()
    .replace(/^@/, '');
  return HANDLE_PATTERN.test(raw) ? raw : null;
}

export function isVenmoChipInEnabled(): boolean {
  return import.meta.env.VITE_VENMO_CHIP_IN === 'true' && getVenmoHandle() !== null;
}
