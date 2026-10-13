/**
 * One way in to "Support Ferni".
 *
 * With VITE_VENMO_CHIP_IN=true and VITE_VENMO_HANDLE set, it opens the Venmo
 * chip-in card (ask for a dollar, show the QR). Otherwise it opens the Stripe
 * Support Ferni modal exactly as before. Stripe stays in the code for later.
 *
 * @module ui/support/open-support
 */

import { getVenmoHandle, isVenmoChipInEnabled } from '../../config/venmo-chip-in.js';

export { getVenmoHandle, isVenmoChipInEnabled };

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
