/**
 * Seeds flag. Off by default (Seth, 2026-10-17: "cut seeds"; #1695).
 *
 * Seeds are gone from the menu, but the browser ledger still started at boot.
 * With the server ledger off it paid "+5 seeds" for the first call each day
 * and showed a notice for a currency nobody can see or spend. While off, the
 * seeds economy, ledger watch, balance display and toast never start
 * (app/seeds-boot.ts). Only a build with `VITE_SEEDS=true` starts them.
 */
export function isSeedsOn(): boolean {
  return import.meta.env.VITE_SEEDS === 'true';
}
