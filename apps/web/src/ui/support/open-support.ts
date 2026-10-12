/**
 * One way in to "Support Ferni".
 *
 * With VITE_VENMO_CHIP_IN=true and VITE_VENMO_HANDLE set, it opens the Venmo
 * chip-in card (ask for a dollar, show the QR). Otherwise it opens the Stripe
 * Support Ferni modal exactly as before. Stripe stays in the code for later.
 *
 * @module ui/support/open-support
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

export async function openSupport(): Promise<void> {
  const handle = isVenmoChipInEnabled() ? getVenmoHandle() : null;
  if (handle) {
    const { openVenmoChipIn } = await import('./venmo-chip-in.ui.js');
    openVenmoChipIn(handle);
    return;
  }
  const { supportFerniUI } = await import('../support-ferni.ui.js');
  await supportFerniUI.open();
}
