/**
 * ACTIVITY_LEDGER: Ferni keeps one record per thing it does or promises for its
 * owner (bogle_users/{uid}/activity, services/stores/activity-store.ts). Off by
 * default; nothing writes or reads the ledger while it is off. Seth first, then
 * the cohort (recall-ledger plan 2026-10-27, lane 1).
 *
 * @module config/activity-ledger-flag
 */
import { flagOn, type Env } from './env-flag.js';

export function activityLedgerEnabled(env: Env = process.env): boolean {
  return flagOn('ACTIVITY_LEDGER', env);
}
