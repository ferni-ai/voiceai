/**
 * Starts the seeds modules, only while VITE_SEEDS is on (config/seeds-flag.ts).
 */

import { isSeedsOn } from '../config/seeds-flag.js';
import { initSeedsEconomy } from '../services/seeds-economy.service.js';
import { watchServerSeeds } from '../services/seeds-ledger.service.js';
import { initSeedsDisplay } from '../ui/seeds-display.ui.js';
import { initSeedsToast } from '../ui/seeds-toast.ui.js';

type SafeInit = (name: string, init: () => void) => void;

export function initSeeds(safeInit: SafeInit): void {
  if (!isSeedsOn()) return;
  // Earn seeds through natural engagement; the server ledger, once it keeps seeds
  safeInit('SeedsEconomy', () => initSeedsEconomy());
  safeInit('SeedsLedger', () => watchServerSeeds());
  // Balance display and toast notifications
  safeInit('SeedsDisplay', () => initSeedsDisplay());
  safeInit('SeedsToast', () => initSeedsToast());
}
