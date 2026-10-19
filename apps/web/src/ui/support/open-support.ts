/**
 * One way in to "Support Ferni".
 *
 * With VITE_VENMO_CHIP_IN=true and VITE_VENMO_HANDLE set, it opens the Venmo
 * chip-in card (ask for a dollar, show the QR). Otherwise it opens the Stripe
 * Support Ferni modal, but only while the server has a paywall on
 * (services/paywall.service.ts). Stripe stays in the code for later.
 *
 * The Venmo card is a voluntary chip-in, so it stays reachable from voluntary
 * entry points (Ferni Fund, the support/tip link) even with the paywall off.
 * It is never the answer to an upgrade or limit prompt while the paywall is
 * off: showUpgradeModal returns before it gets here.
 *
 * @module ui/support/open-support
 */

import { getVenmoHandle, isVenmoChipInEnabled } from '../../config/venmo-chip-in.js';
import { isPaywallOn } from '../../services/paywall.service.js';

export { getVenmoHandle, isVenmoChipInEnabled };

/** Whether a voluntary support/tip entry point has anything to open. */
export function canOpenSupport(): boolean {
  return isVenmoChipInEnabled() || isPaywallOn();
}

export async function openSupport(): Promise<void> {
  const handle = isVenmoChipInEnabled() ? getVenmoHandle() : null;
  if (handle) {
    const { openVenmoChipIn } = await import('./venmo-chip-in.ui.js');
    openVenmoChipIn(handle);
    return;
  }
  if (!isPaywallOn()) return; // Ferni is free and Venmo is off: nothing to ask for
  const { supportFerniUI } = await import('../support-ferni.ui.js');
  await supportFerniUI.open();
}
